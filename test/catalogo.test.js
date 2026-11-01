import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { abrirBaseDeDatos } from '../src/db.js';

process.env.UPLOAD_DIR = path.join(os.tmpdir(), 'turnos-demo-uploads-catalogo');

const ANA = { email: 'ana@ejemplo.com', password: 'secreto123', nombre: 'Ana' };
const BETO = { email: 'beto@ejemplo.com', password: 'secreto456', nombre: 'Beto' };
const COMERCIO = { nombre: 'Café Ñandú', rubro: 'gastronomia' };
const SERVICIO = { nombre: 'Corte', duracion_min: 30, precio_centavos: 500000 };
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function fechaFutura(dias = 3) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

async function iniciarApp(t) {
  const { crearServidor } = await import('../src/server.js');
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

async function registrar(app, payload = ANA) {
  return app.inject({ method: 'POST', url: '/api/auth/registro', payload });
}

async function registrarConComercio(app, usuario, comercio = COMERCIO) {
  const registro = await registrar(app, usuario);
  const cookie = cookieSesion(registro);
  const respuesta = await app.inject({
    method: 'POST',
    url: '/api/comercio',
    headers: { cookie },
    payload: comercio,
  });
  assert.equal(respuesta.statusCode, 201);
  return { cookie, comercio: respuesta.json() };
}

async function crearRecurso(app, url, cookie, payload) {
  const respuesta = await app.inject({ method: 'POST', url, headers: { cookie }, payload });
  assert.equal(respuesta.statusCode, 201);
  return respuesta.json();
}

function disponibilidad(app, slug, { servicioId, fecha, personas }) {
  const params = new URLSearchParams({ servicio_id: String(servicioId), fecha });
  if (personas != null) params.set('personas', String(personas));
  return app.inject({ method: 'GET', url: `/api/comercios/${slug}/disponibilidad?${params}` });
}

function nombresDePlazas(franjas) {
  return [...new Set(franjas.flatMap(({ plazas }) => plazas.map(({ nombre }) => nombre)))].sort();
}

describe('tipo de plaza', () => {
  it('solo ofrece plazas del tipo del servicio, y todas si el servicio no define tipo', async (t) => {
    const app = await iniciarApp(t);
    const { cookie, comercio } = await registrarConComercio(app, ANA);
    await crearRecurso(app, '/api/plazas', cookie, { nombre: 'Cancha 1', tipo: 'Cancha', capacidad: 10 });
    await crearRecurso(app, '/api/plazas', cookie, { nombre: 'Mesa buffet', tipo: 'Buffet', capacidad: 2 });
    const conTipo = await crearRecurso(app, '/api/servicios', cookie, { ...SERVICIO, nombre: 'Alquiler', tipo_plaza: 'Cancha' });
    const sinTipo = await crearRecurso(app, '/api/servicios', cookie, { ...SERVICIO, nombre: 'Libre', tipo_plaza: '' });
    for (let dia = 0; dia <= 6; dia += 1) {
      await crearRecurso(app, '/api/horarios', cookie, { dia_semana: dia, apertura: '10:00', cierre: '12:00' });
    }
    const fecha = fechaFutura();

    const soloCancha = await disponibilidad(app, comercio.slug, { servicioId: conTipo.id, fecha, personas: 1 });

    assert.equal(soloCancha.statusCode, 200);
    const franjas = soloCancha.json();
    assert.ok(franjas.length > 0, 'debe haber franjas disponibles');
    assert.deepEqual(nombresDePlazas(franjas), ['Cancha 1']);

    const todas = await disponibilidad(app, comercio.slug, { servicioId: sinTipo.id, fecha, personas: 1 });

    assert.equal(todas.statusCode, 200);
    assert.deepEqual(nombresDePlazas(todas.json()), ['Cancha 1', 'Mesa buffet']);
  });
});

describe('imagenes', () => {
  it('rechaza sin sesión, acepta un PNG y rechaza texto que no es data URL', async (t) => {
    const app = await iniciarApp(t);
    const { cookie } = await registrarConComercio(app, ANA);

    const sinSesion = await app.inject({ method: 'POST', url: '/api/imagenes', payload: { imagen: PNG } });
    assert.equal(sinSesion.statusCode, 401);

    const subida = await app.inject({
      method: 'POST',
      url: '/api/imagenes',
      headers: { cookie },
      payload: { imagen: PNG },
    });
    assert.equal(subida.statusCode, 201);
    assert.ok(subida.json().url.startsWith('/uploads/'), 'la url debe apuntar a /uploads/');

    const invalida = await app.inject({
      method: 'POST',
      url: '/api/imagenes',
      headers: { cookie },
      payload: { imagen: 'esto no es una imagen' },
    });
    assert.equal(invalida.statusCode, 400);
    assert.equal(invalida.json().error.code, 'imagen_invalida');
  });
});

describe('servicios con oferta', () => {
  it('valida el precio de oferta y lista primero los servicios en oferta', async (t) => {
    const app = await iniciarApp(t);
    const { cookie, comercio } = await registrarConComercio(app, ANA);
    const oferta = { ...SERVICIO, nombre: 'Zeta', oferta: 1, precio_oferta_centavos: 400000 };

    for (const precioOferta of [SERVICIO.precio_centavos, SERVICIO.precio_centavos + 1]) {
      const rechazada = await app.inject({
        method: 'POST',
        url: '/api/servicios',
        headers: { cookie },
        payload: { ...oferta, precio_oferta_centavos: precioOferta },
      });
      assert.equal(rechazada.statusCode, 400);
      assert.equal(rechazada.json().error.code, 'campo_invalido');
    }

    const conOferta = await crearRecurso(app, '/api/servicios', cookie, oferta);
    await crearRecurso(app, '/api/servicios', cookie, { ...SERVICIO, nombre: 'Corte' });

    const listado = await app.inject({ method: 'GET', url: `/api/comercios/${comercio.slug}` });
    assert.equal(listado.statusCode, 200);
    assert.deepEqual(listado.json().servicios.map(({ nombre }) => nombre), ['Zeta', 'Corte']);

    const rechazadaPut = await app.inject({
      method: 'PUT',
      url: `/api/servicios/${conOferta.id}`,
      headers: { cookie },
      payload: { ...oferta, precio_oferta_centavos: oferta.precio_centavos },
    });
    assert.equal(rechazadaPut.statusCode, 400);
    assert.equal(rechazadaPut.json().error.code, 'campo_invalido');

    const actualizada = await app.inject({
      method: 'PUT',
      url: `/api/servicios/${conOferta.id}`,
      headers: { cookie },
      payload: { ...oferta, precio_oferta_centavos: 100000 },
    });
    assert.equal(actualizada.statusCode, 200);
    assert.equal(actualizada.json().precio_oferta_centavos, 100000);
  });
});

describe('rubros y busqueda', () => {
  it('agrupa rubros sin distinguir mayúsculas y busca sin tildes ni mayúsculas', async (t) => {
    const app = await iniciarApp(t);
    const conMayusculas = await registrarConComercio(app, ANA, { nombre: 'Peluquería Uno', rubro: 'Peluquería' });
    const conMinusculas = await registrarConComercio(app, BETO, { nombre: 'Peluquería Dos', rubro: 'peluquería' });

    const rubros = await app.inject({ method: 'GET', url: '/api/rubros' });
    assert.equal(rubros.statusCode, 200);
    assert.equal(rubros.json().length, 1);

    const busqueda = await app.inject({ method: 'GET', url: '/api/comercios?q=peluqueria' });
    assert.equal(busqueda.statusCode, 200);
    assert.deepEqual(
      busqueda.json().map(({ slug }) => slug).sort(),
      [conMayusculas.comercio.slug, conMinusculas.comercio.slug].sort(),
    );
  });
});

describe('plazas', () => {
  it('valida ancho y color, y guarda la forma rectangular con sus medidas', async (t) => {
    const app = await iniciarApp(t);
    const { cookie } = await registrarConComercio(app, ANA);

    const anchoInvalido = await app.inject({
      method: 'POST',
      url: '/api/plazas',
      headers: { cookie },
      payload: { nombre: 'Mesa 1', ancho: 200 },
    });
    assert.equal(anchoInvalido.statusCode, 400);
    assert.equal(anchoInvalido.json().error.code, 'campo_invalido');

    const colorInvalido = await app.inject({
      method: 'POST',
      url: '/api/plazas',
      headers: { cookie },
      payload: { nombre: 'Mesa 1', color: 'rojo' },
    });
    assert.equal(colorInvalido.statusCode, 400);
    assert.equal(colorInvalido.json().error.code, 'campo_invalido');

    const plaza = await crearRecurso(app, '/api/plazas', cookie, {
      nombre: 'Mesa 1', forma: 'rectangulo', ancho: 24, alto: 14, color: '#16a34a',
    });
    assert.equal(plaza.forma, 'rectangulo');

    const salon = await app.inject({ method: 'GET', url: '/api/salon', headers: { cookie } });
    assert.equal(salon.statusCode, 200);
    const enSalon = salon.json().find(({ id }) => id === plaza.id);
    assert.ok(enSalon, 'la plaza debe estar en el salón');
    assert.equal(enSalon.forma, 'rectangulo');
    assert.equal(enSalon.ancho, 24);
    assert.equal(enSalon.alto, 14);
    assert.equal(enSalon.color, '#16a34a');
  });
});
