import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBaseDeDatos } from '../src/db.js';
import { crearServidor } from '../src/server.js';

const ANA = { email: 'ana@ejemplo.com', password: 'secreto123', nombre: 'Ana' };
const CLIENTE = { email: 'cliente@ejemplo.com', password: 'secreto123', nombre: 'Cliente' };
const COMERCIO = { nombre: 'Café Ñandú', rubro: 'gastronomia', direccion: 'Av. Siempre Viva 742' };
const SERVICIO = { nombre: 'Corte', duracion_min: 30, precio_centavos: 500000 };
const PLAZA = { nombre: 'Sillon 1', capacidad: 1 };

function fechaFutura(dias = 3) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

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

async function registrarUsuario(app, usuario) {
  const respuesta = await registrar(app, usuario);
  assert.equal(respuesta.statusCode, 201);
  return cookieSesion(respuesta);
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

async function crearRecurso(app, url, cookie, payload) {
  const respuesta = await app.inject({ method: 'POST', url, headers: { cookie }, payload });
  assert.equal(respuesta.statusCode, 201);
  return respuesta.json();
}

async function prepararComercio(app) {
  const { cookie, comercio } = await registrarConComercio(app, ANA);
  const clienteCookie = await registrarUsuario(app, CLIENTE);
  const servicio = await crearRecurso(app, '/api/servicios', cookie, SERVICIO);
  const plaza = await crearRecurso(app, '/api/plazas', cookie, PLAZA);
  for (let dia = 0; dia <= 6; dia += 1) {
    await crearRecurso(app, '/api/horarios', cookie, { dia_semana: dia, apertura: '09:00', cierre: '11:00' });
  }
  return { cookie, clienteCookie, comercio, servicio, plaza };
}

function disponibilidad(app, slug, { servicioId, fecha, personas }) {
  const params = new URLSearchParams({ servicio_id: String(servicioId), fecha });
  if (personas != null) params.set('personas', String(personas));
  return app.inject({ method: 'GET', url: `/api/comercios/${slug}/disponibilidad?${params}` });
}

function reservar(app, slug, { servicioId, inicio, personas, cookie }) {
  return app.inject({
    method: 'POST',
    url: `/api/comercios/${slug}/turnos`,
    headers: cookie ? { cookie } : {},
    payload: { servicio_id: servicioId, inicio, personas, cliente_nombre: 'Ana' },
  });
}

describe('turnos', () => {
  it('devuelve franjas desde las 09:00 y la última no pasa de las 10:30', async (t) => {
    const app = await iniciarApp(t);
    const { comercio, servicio } = await prepararComercio(app);
    const fecha = fechaFutura();

    const respuesta = await disponibilidad(app, comercio.slug, { servicioId: servicio.id, fecha });

    assert.equal(respuesta.statusCode, 200);
    const franjas = respuesta.json();
    assert.ok(franjas.length > 0, 'debe haber franjas disponibles');
    assert.equal(franjas[0].inicio, `${fecha}T09:00`);
    assert.ok(franjas.at(-1).inicio.slice(11) <= '10:30');
  });

  it('rechaza reservar sin sesión con 401 no_autenticado', async (t) => {
    const app = await iniciarApp(t);
    const { comercio, servicio } = await prepararComercio(app);
    const fecha = fechaFutura();

    const respuesta = await reservar(app, comercio.slug, { servicioId: servicio.id, inicio: `${fecha}T09:00` });

    assert.equal(respuesta.statusCode, 401);
    assert.equal(respuesta.json().error.code, 'no_autenticado');
  });

  it('reserva un turno con un código de 6 caracteres', async (t) => {
    const app = await iniciarApp(t);
    const { comercio, servicio, clienteCookie } = await prepararComercio(app);
    const fecha = fechaFutura();

    const respuesta = await reservar(app, comercio.slug, {
      servicioId: servicio.id, inicio: `${fecha}T09:00`, cookie: clienteCookie,
    });

    assert.equal(respuesta.statusCode, 201);
    assert.equal(respuesta.json().codigo.length, 6);
  });

  it('rechaza reservar la misma franja con 409 sin_disponibilidad', async (t) => {
    const app = await iniciarApp(t);
    const { comercio, servicio, clienteCookie } = await prepararComercio(app);
    const fecha = fechaFutura();
    const inicio = `${fecha}T09:00`;
    await reservar(app, comercio.slug, { servicioId: servicio.id, inicio, cookie: clienteCookie });

    const respuesta = await reservar(app, comercio.slug, { servicioId: servicio.id, inicio, cookie: clienteCookie });

    assert.equal(respuesta.statusCode, 409);
    assert.equal(respuesta.json().error.code, 'sin_disponibilidad');
  });

  it('rechaza una franja solapada con 409 sin_disponibilidad', async (t) => {
    const app = await iniciarApp(t);
    const { comercio, servicio, clienteCookie } = await prepararComercio(app);
    const fecha = fechaFutura();
    await reservar(app, comercio.slug, { servicioId: servicio.id, inicio: `${fecha}T09:00`, cookie: clienteCookie });

    const respuesta = await reservar(app, comercio.slug, {
      servicioId: servicio.id, inicio: `${fecha}T09:15`, cookie: clienteCookie,
    });

    assert.equal(respuesta.statusCode, 409);
    assert.equal(respuesta.json().error.code, 'sin_disponibilidad');
  });

  it('libera la franja al cancelar el turno', async (t) => {
    const app = await iniciarApp(t);
    const { cookie, clienteCookie, comercio, servicio } = await prepararComercio(app);
    const fecha = fechaFutura();
    const inicio = `${fecha}T09:00`;
    const turno = (await reservar(app, comercio.slug, { servicioId: servicio.id, inicio, cookie: clienteCookie })).json();
    const ocupada = await disponibilidad(app, comercio.slug, { servicioId: servicio.id, fecha });
    assert.ok(!ocupada.json().some(({ inicio: franja }) => franja === inicio));

    const cancelado = await app.inject({
      method: 'PATCH',
      url: `/api/turnos/${turno.id}`,
      headers: { cookie },
      payload: { estado: 'cancelado' },
    });
    assert.equal(cancelado.statusCode, 200);

    const libre = await disponibilidad(app, comercio.slug, { servicioId: servicio.id, fecha });
    assert.ok(libre.json().some(({ inicio: franja }) => franja === inicio));
  });

  it('devuelve los turnos del cliente con comercio, plaza y dirección', async (t) => {
    const app = await iniciarApp(t);
    const { comercio, servicio, clienteCookie } = await prepararComercio(app);
    const fecha = fechaFutura();
    const inicio = `${fecha}T09:00`;
    await reservar(app, comercio.slug, { servicioId: servicio.id, inicio, cookie: clienteCookie });

    const respuesta = await app.inject({
      method: 'GET',
      url: '/api/mis-turnos',
      headers: { cookie: clienteCookie },
    });

    assert.equal(respuesta.statusCode, 200);
    const [turno] = respuesta.json();
    assert.equal(turno.inicio, inicio);
    assert.equal(turno.comercio, COMERCIO.nombre);
    assert.equal(turno.plaza, PLAZA.nombre);
    assert.equal(turno.direccion, COMERCIO.direccion);
  });

  it('cancela un turno propio y la segunda vez responde 409 no_cancelable', async (t) => {
    const app = await iniciarApp(t);
    const { comercio, servicio, clienteCookie } = await prepararComercio(app);
    const fecha = fechaFutura();
    const turno = (await reservar(app, comercio.slug, {
      servicioId: servicio.id, inicio: `${fecha}T09:00`, cookie: clienteCookie,
    })).json();

    const cancelado = await app.inject({
      method: 'POST',
      url: `/api/mis-turnos/${turno.id}/cancelar`,
      headers: { cookie: clienteCookie },
    });
    assert.equal(cancelado.statusCode, 200);
    assert.equal(cancelado.json().estado, 'cancelado');

    const otraVez = await app.inject({
      method: 'POST',
      url: `/api/mis-turnos/${turno.id}/cancelar`,
      headers: { cookie: clienteCookie },
    });
    assert.equal(otraVez.statusCode, 409);
    assert.equal(otraVez.json().error.code, 'no_cancelable');
  });

  it('no deja cancelar el turno de otro usuario y responde 404', async (t) => {
    const app = await iniciarApp(t);
    const { comercio, servicio, clienteCookie } = await prepararComercio(app);
    const fecha = fechaFutura();
    const turno = (await reservar(app, comercio.slug, {
      servicioId: servicio.id, inicio: `${fecha}T09:00`, cookie: clienteCookie,
    })).json();
    const otroCookie = await registrarUsuario(app, { email: 'otro@ejemplo.com', password: 'secreto123', nombre: 'Otro' });

    const respuesta = await app.inject({
      method: 'POST',
      url: `/api/mis-turnos/${turno.id}/cancelar`,
      headers: { cookie: otroCookie },
    });

    assert.equal(respuesta.statusCode, 404);
  });

  it('rechaza la fecha "mañana" con 400 fecha_invalida', async (t) => {
    const app = await iniciarApp(t);
    const { comercio, servicio } = await prepararComercio(app);

    const respuesta = await disponibilidad(app, comercio.slug, { servicioId: servicio.id, fecha: 'mañana' });

    assert.equal(respuesta.statusCode, 400);
    assert.equal(respuesta.json().error.code, 'fecha_invalida');
  });

  it('no devuelve franjas si las personas superan la capacidad', async (t) => {
    const app = await iniciarApp(t);
    const { comercio, servicio } = await prepararComercio(app);
    const fecha = fechaFutura();

    const respuesta = await disponibilidad(app, comercio.slug, { servicioId: servicio.id, fecha, personas: 2 });

    assert.equal(respuesta.statusCode, 200);
    assert.deepEqual(respuesta.json(), []);
  });
});
