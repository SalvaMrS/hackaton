import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBaseDeDatos } from '../src/db.js';
import { crearServidor } from '../src/server.js';

const CREDENCIALES = { email: 'ana@ejemplo.com', password: 'secreto123', nombre: 'Ana' };

async function iniciarApp(t) {
  const app = crearServidor({ db: abrirBaseDeDatos(':memory:') });
  t.after(() => app.close());
  await app.ready();
  return app;
}

function cookieSesion(respuesta) {
  const cookie = respuesta.cookies.find(({ name }) => name === 'sesion');
  assert.ok(cookie, 'la respuesta debe incluir la cookie sesion');
  return `sesion=${cookie.value}`;
}

async function registrar(app, payload = CREDENCIALES) {
  return app.inject({ method: 'POST', url: '/api/auth/registro', payload });
}

describe('autenticación', () => {
  it('registra un usuario con 201 y devuelve la cookie sesion', async (t) => {
    const app = await iniciarApp(t);

    const respuesta = await registrar(app);

    assert.equal(respuesta.statusCode, 201);
    assert.match(cookieSesion(respuesta), /^sesion=/);
  });

  it('rechaza un registro duplicado con 409', async (t) => {
    const app = await iniciarApp(t);
    await registrar(app);

    const respuesta = await registrar(app);

    assert.equal(respuesta.statusCode, 409);
  });

  it('inicia sesión con las credenciales correctas con 200', async (t) => {
    const app = await iniciarApp(t);
    await registrar(app);

    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: CREDENCIALES.email, password: CREDENCIALES.password },
    });

    assert.equal(respuesta.statusCode, 200);
    assert.match(cookieSesion(respuesta), /^sesion=/);
  });

  it('rechaza el login con password incorrecta con 401 y error estructurado', async (t) => {
    const app = await iniciarApp(t);
    await registrar(app);

    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: CREDENCIALES.email, password: 'incorrecta123' },
    });

    assert.equal(respuesta.statusCode, 401);
    const { error } = respuesta.json();
    assert.equal(typeof error.code, 'string');
    assert.equal(typeof error.message, 'string');
  });

  it('devuelve el usuario en GET /api/yo con la cookie de sesión', async (t) => {
    const app = await iniciarApp(t);
    const registro = await registrar(app);

    const respuesta = await app.inject({
      method: 'GET',
      url: '/api/yo',
      headers: { cookie: cookieSesion(registro) },
    });

    assert.equal(respuesta.statusCode, 200);
    assert.equal(respuesta.json().usuario.email, CREDENCIALES.email);
  });
});
