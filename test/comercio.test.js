import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBaseDeDatos } from '../src/db.js';
import { crearServidor } from '../src/server.js';

const ANA = { email: 'ana@ejemplo.com', password: 'secreto123', nombre: 'Ana' };
const BETO = { email: 'beto@ejemplo.com', password: 'secreto456', nombre: 'Beto' };
const COMERCIO = { nombre: 'Café Ñandú', rubro: 'gastronomia' };
const SERVICIO = { nombre: 'Corte de pelo', duracion_min: 30, precio_centavos: 500000 };

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

async function registrar(app, payload = ANA) {
  return app.inject({ method: 'POST', url: '/api/auth/registro', payload });
}

async function registrarConComercio(app, usuario) {
  const registro = await registrar(app, usuario);
  const cookie = cookieSesion(registro);
  const respuesta = await app.inject({
    method: 'POST',
    url: '/api/comercio',
    headers: { cookie },
    payload: COMERCIO,
  });
  assert.equal(respuesta.statusCode, 201);
  return { cookie, comercio: respuesta.json() };
}

describe('comercio', () => {
  it('rechaza GET /api/servicios sin sesión con 401', async (t) => {
    const app = await iniciarApp(t);

    const respuesta = await app.inject({ method: 'GET', url: '/api/servicios' });

    assert.equal(respuesta.statusCode, 401);
    assert.equal(respuesta.json().error.code, 'no_autenticado');
  });

  it('rechaza GET /api/servicios sin comercio con 403 sin_comercio', async (t) => {
    const app = await iniciarApp(t);
    const registro = await registrar(app);

    const respuesta = await app.inject({
      method: 'GET',
      url: '/api/servicios',
      headers: { cookie: cookieSesion(registro) },
    });

    assert.equal(respuesta.statusCode, 403);
    assert.equal(respuesta.json().error.code, 'sin_comercio');
  });

  it('crea el comercio con un slug sin tildes', async (t) => {
    const app = await iniciarApp(t);

    const { comercio } = await registrarConComercio(app, ANA);

    assert.equal(comercio.slug, 'cafe-nandu');
  });

  it('permite crear, listar, actualizar y borrar servicios', async (t) => {
    const app = await iniciarApp(t);
    const { cookie } = await registrarConComercio(app, ANA);

    const creado = await app.inject({
      method: 'POST',
      url: '/api/servicios',
      headers: { cookie },
      payload: SERVICIO,
    });
    assert.equal(creado.statusCode, 201);
    const { id } = creado.json();

    const listado = await app.inject({ method: 'GET', url: '/api/servicios', headers: { cookie } });
    assert.equal(listado.statusCode, 200);
    assert.deepEqual(listado.json().map(({ id: idListado }) => idListado), [id]);

    const actualizado = await app.inject({
      method: 'PUT',
      url: `/api/servicios/${id}`,
      headers: { cookie },
      payload: { ...SERVICIO, nombre: 'Corte y barba' },
    });
    assert.equal(actualizado.statusCode, 200);
    assert.equal(actualizado.json().nombre, 'Corte y barba');

    const borrado = await app.inject({
      method: 'DELETE',
      url: `/api/servicios/${id}`,
      headers: { cookie },
    });
    assert.equal(borrado.statusCode, 204);
  });

  it('no deja que un segundo usuario vea ni modifique servicios ajenos', async (t) => {
    const app = await iniciarApp(t);
    const { cookie: cookieAna } = await registrarConComercio(app, ANA);
    const { cookie: cookieBeto } = await registrarConComercio(app, BETO);
    const creado = await app.inject({
      method: 'POST',
      url: '/api/servicios',
      headers: { cookie: cookieAna },
      payload: SERVICIO,
    });
    const { id } = creado.json();

    const listado = await app.inject({ method: 'GET', url: '/api/servicios', headers: { cookie: cookieBeto } });
    assert.equal(listado.statusCode, 200);
    assert.deepEqual(listado.json(), []);

    const actualizado = await app.inject({
      method: 'PUT',
      url: `/api/servicios/${id}`,
      headers: { cookie: cookieBeto },
      payload: SERVICIO,
    });
    assert.equal(actualizado.statusCode, 404);

    const borrado = await app.inject({
      method: 'DELETE',
      url: `/api/servicios/${id}`,
      headers: { cookie: cookieBeto },
    });
    assert.equal(borrado.statusCode, 404);
  });

  it('rechaza duracion_min menor a 5 con 400 campo_invalido', async (t) => {
    const app = await iniciarApp(t);
    const { cookie } = await registrarConComercio(app, ANA);

    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/servicios',
      headers: { cookie },
      payload: { ...SERVICIO, duracion_min: 1 },
    });

    assert.equal(respuesta.statusCode, 400);
    assert.equal(respuesta.json().error.code, 'campo_invalido');
  });
});
