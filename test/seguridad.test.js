import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBaseDeDatos } from '../src/db.js';
import { crearServidor } from '../src/server.js';

const TOKEN = 'token-de-prueba-del-monitor';

async function iniciarApp(t, { proxy = false } = {}) {
  process.env.MONITOR_TOKEN = TOKEN;
  process.env.TRUST_PROXY = proxy ? '1' : '0';
  const app = crearServidor({ db: abrirBaseDeDatos(':memory:') });
  t.after(() => app.close());
  await app.ready();
  return app;
}

describe('cabeceras de seguridad', () => {
  it('envía CSP estricta, nosniff, anti-framing y permite geolocalización solo del propio sitio', async (t) => {
    const app = await iniciarApp(t);
    const { headers } = await app.inject({ url: '/' });

    assert.match(headers['content-security-policy'], /script-src 'self'(;|$)/);
    assert.match(headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.equal(headers['x-content-type-options'], 'nosniff');
    assert.equal(headers['x-frame-options'], 'DENY');
    assert.match(headers['permissions-policy'], /geolocation=\(self\)/);
  });

  it('agrega HSTS solo cuando la conexión llegó por HTTPS', async (t) => {
    const app = await iniciarApp(t, { proxy: true });

    const http = await app.inject({ url: '/api/salud' });
    const https = await app.inject({ url: '/api/salud', headers: { 'x-forwarded-proto': 'https' } });

    assert.equal(http.headers['strict-transport-security'], undefined);
    assert.match(https.headers['strict-transport-security'], /max-age=\d+/);
  });

  it('marca la cookie de sesión como Secure detrás de HTTPS y HttpOnly siempre', async (t) => {
    const app = await iniciarApp(t, { proxy: true });
    const payload = { email: 'ana@ejemplo.com', password: 'secreto123', nombre: 'Ana' };

    const respuesta = await app.inject({ method: 'POST', url: '/api/auth/registro', payload, headers: { 'x-forwarded-proto': 'https' } });
    const cookie = respuesta.cookies.find(({ name }) => name === 'sesion');

    assert.equal(cookie.secure, true);
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.sameSite, 'Lax');
  });

  it('no cachea las respuestas de la API', async (t) => {
    const app = await iniciarApp(t);
    const { headers } = await app.inject({ url: '/api/comercios' });
    assert.equal(headers['cache-control'], 'no-store');
  });
});

describe('autenticación y autorización', () => {
  it('rechaza una cookie de sesión falsificada', async (t) => {
    const app = await iniciarApp(t);
    const respuesta = await app.inject({ url: '/api/mis-turnos', headers: { cookie: 'sesion=1' } });
    assert.ok([401, 403].includes(respuesta.statusCode));
  });

  it('exige sesión en las rutas del comercio', async (t) => {
    const app = await iniciarApp(t);
    for (const [method, url] of [['GET', '/api/turnos'], ['POST', '/api/turnos'], ['GET', '/api/mis-turnos'], ['POST', '/api/mis-turnos/1/cancelar']]) {
      const respuesta = await app.inject({ method, url, payload: method === 'POST' ? {} : undefined });
      assert.ok([401, 403].includes(respuesta.statusCode), `${method} ${url} respondió ${respuesta.statusCode}`);
    }
  });

  it('limita los intentos de login contra fuerza bruta', async (t) => {
    const app = await iniciarApp(t);
    const estados = [];
    for (let i = 0; i < 15; i += 1) {
      const respuesta = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'x@ejemplo.com', password: `clave-incorrecta-${i}` } });
      estados.push(respuesta.statusCode);
    }
    assert.ok(estados.includes(429), `estados: ${estados.join(',')}`);
  });

  it('no revela si el email existe al fallar el login', async (t) => {
    const app = await iniciarApp(t);
    await app.inject({ method: 'POST', url: '/api/auth/registro', payload: { email: 'ana@ejemplo.com', password: 'secreto123', nombre: 'Ana' } });

    const existente = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'ana@ejemplo.com', password: 'incorrecta1' } });
    const inexistente = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'nadie@ejemplo.com', password: 'incorrecta1' } });

    assert.equal(existente.statusCode, inexistente.statusCode);
    assert.equal(existente.json().error.message, inexistente.json().error.message);
  });
});

describe('entradas maliciosas', () => {
  it('trata una inyección SQL en la búsqueda como texto', async (t) => {
    const app = await iniciarApp(t);
    const q = encodeURIComponent("' OR 1=1; DROP TABLE comercios; --");

    const respuesta = await app.inject({ url: `/api/comercios?q=${q}` });
    const despues = await app.inject({ url: '/api/comercios' });

    assert.equal(respuesta.statusCode, 200);
    assert.equal(despues.statusCode, 200);
  });

  it('no permite salir del directorio público con path traversal', async (t) => {
    const app = await iniciarApp(t);
    for (const ruta of ['/../package.json', '/%2e%2e/package.json', '/..%2f..%2fetc/passwd', '/uploads/../../package.json']) {
      const respuesta = await app.inject({ url: ruta });
      assert.notEqual(respuesta.statusCode, 200, ruta);
      assert.doesNotMatch(respuesta.body, /"dependencies"|root:/);
    }
  });

  it('no sirve archivos sensibles', async (t) => {
    const app = await iniciarApp(t);
    for (const ruta of ['/.env', '/.git/config', '/turnos.db', '/src/server.js']) {
      const respuesta = await app.inject({ url: ruta });
      assert.equal(respuesta.statusCode, 404, ruta);
    }
  });

  it('rechaza cuerpos que superan el límite', async (t) => {
    const app = await iniciarApp(t);
    const respuesta = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'a@b.com', password: 'x'.repeat(5 * 1024 * 1024) } });
    assert.equal(respuesta.statusCode, 413);
  });

  it('devuelve JSON malformado como 400 sin filtrar la traza', async (t) => {
    const app = await iniciarApp(t);
    const respuesta = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { 'content-type': 'application/json' }, payload: '{no es json' });
    assert.equal(respuesta.statusCode, 400);
    assert.doesNotMatch(respuesta.body, /at .*\.js|node_modules/);
  });

  it('rechaza coordenadas fuera de rango', async (t) => {
    const app = await iniciarApp(t);
    const respuesta = await app.inject({ url: '/api/comercios?lat=999&lng=0' });
    assert.equal(respuesta.statusCode, 400);
  });
});

describe('monitor de tráfico', () => {
  it('oculta el monitor sin token o con token incorrecto', async (t) => {
    const app = await iniciarApp(t);
    const sin = await app.inject({ url: '/api/monitor/resumen' });
    const mal = await app.inject({ url: '/api/monitor/resumen', headers: { 'x-monitor-token': 'incorrecto' } });
    assert.equal(sin.statusCode, 404);
    assert.equal(mal.statusCode, 404);
  });

  it('registra las búsquedas y muestra qué se busca, sin guardar la IP real', async (t) => {
    const app = await iniciarApp(t);
    await app.inject({ url: '/api/comercios?q=cancha&rubro=cancha', remoteAddress: '203.0.113.7' });
    await app.inject({ url: '/api/comercios?q=cancha', remoteAddress: '203.0.113.7' });

    const respuesta = await app.inject({ url: '/api/monitor/resumen', headers: { 'x-monitor-token': TOKEN } });
    const resumen = respuesta.json();

    assert.equal(respuesta.statusCode, 200);
    assert.deepEqual(resumen.busquedas[0], { busqueda: 'cancha', veces: 2 });
    assert.equal(resumen.totales.visitantes, 1);
    const guardado = JSON.stringify(app.db.prepare('SELECT * FROM trafico').all());
    assert.doesNotMatch(guardado, /203\.0\.113\.7/);
  });

  it('marca como sospechoso a quien acumula rechazos', async (t) => {
    const app = await iniciarApp(t);
    for (let i = 0; i < 6; i += 1) await app.inject({ url: '/api/mis-turnos', remoteAddress: '198.51.100.9' });

    const { sospechosos } = (await app.inject({ url: '/api/monitor/resumen', headers: { 'x-monitor-token': TOKEN } })).json();

    assert.equal(sospechosos.length, 1);
    assert.ok(sospechosos[0].rechazos >= 5);
  });
});
