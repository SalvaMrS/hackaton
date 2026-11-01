import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBaseDeDatos } from '../src/db.js';
import { crearServidor } from '../src/server.js';
import { estadoDelSalon, buscarEnRecepcion, situacionDelTurno } from '../src/salon.js';

const ANA = { email: 'ana@ejemplo.com', password: 'secreto123', nombre: 'Ana' };
const COMERCIO = { nombre: 'Café Ñandú', rubro: 'gastronomia' };
const PLAZA = { nombre: 'Sillon 1', capacidad: 1 };
const UMBRALES = { tolerancia_min: 10, ausente_min: 30 };
const INICIO = '2026-11-03T21:00';

function prepararBaseDeDatos() {
  const db = abrirBaseDeDatos(':memory:');
  const { lastInsertRowid: comercioId } = db.prepare(
    'INSERT INTO comercios (slug, nombre, rubro, aviso_min, tolerancia_min, ausente_min) VALUES (?, ?, ?, ?, ?, ?)',
  ).run('cafe-nandu', 'Café Ñandú', 'gastronomia', 30, 10, 30);
  const comercio = db.prepare('SELECT * FROM comercios WHERE id = ?').get(comercioId);
  const { lastInsertRowid: servicioId } = db.prepare(
    'INSERT INTO servicios (comercio_id, nombre, duracion_min) VALUES (?, ?, ?)',
  ).run(comercioId, 'Corte', 30);
  const { lastInsertRowid: plazaId } = db.prepare(
    'INSERT INTO plazas (comercio_id, nombre) VALUES (?, ?)',
  ).run(comercioId, 'Sillon 1');
  const insertarTurno = db.prepare(
    `INSERT INTO turnos (comercio_id, servicio_id, plaza_id, inicio, fin, cliente_nombre, codigo, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insertarTurno.run(comercioId, servicioId, plazaId, INICIO, '2026-11-03T21:30', 'Juan Pérez', 'ABC123', 'confirmado');
  insertarTurno.run(comercioId, servicioId, plazaId, '2026-11-03T21:30', '2026-11-03T22:00', 'Pedro Gómez', 'XYZ789', 'cancelado');
  return { db, comercio, plazaId };
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

describe('situacionDelTurno', () => {
  it('a las 20:45 el turno de las 21:00 está próximo con 15 minutos', () => {
    const resultado = situacionDelTurno({ inicio: INICIO, estado: 'confirmado' }, UMBRALES, '2026-11-03T20:45');

    assert.deepEqual(resultado, { situacion: 'proximo', minutos: 15 });
  });

  it('a las 21:05 el turno está en hora', () => {
    const resultado = situacionDelTurno({ inicio: INICIO, estado: 'confirmado' }, UMBRALES, '2026-11-03T21:05');

    assert.equal(resultado.situacion, 'en_hora');
  });

  it('a las 21:10 el turno está demorado con 10 minutos', () => {
    const resultado = situacionDelTurno({ inicio: INICIO, estado: 'confirmado' }, UMBRALES, '2026-11-03T21:10');

    assert.deepEqual(resultado, { situacion: 'demorado', minutos: 10 });
  });

  it('a las 21:30 el turno está ausente', () => {
    const resultado = situacionDelTurno({ inicio: INICIO, estado: 'confirmado' }, UMBRALES, '2026-11-03T21:30');

    assert.equal(resultado.situacion, 'ausente');
  });

  it('devuelve en_curso sin importar la hora', () => {
    const resultado = situacionDelTurno({ inicio: INICIO, estado: 'en_curso' }, UMBRALES, '2026-11-03T21:05');

    assert.equal(resultado.situacion, 'en_curso');
  });
});

describe('salon', () => {
  it('marca la plaza como próximo a las 20:45', (t) => {
    const { db, comercio, plazaId } = prepararBaseDeDatos();
    t.after(() => db.close());

    const [plaza] = estadoDelSalon(db, comercio, '2026-11-03T20:45');

    assert.equal(plaza.id, plazaId);
    assert.equal(plaza.estado, 'proximo');
    assert.equal(plaza.turno.cliente_nombre, 'Juan Pérez');
  });

  it('deja la plaza libre a las 19:00 porque está fuera del aviso', (t) => {
    const { db, comercio, plazaId } = prepararBaseDeDatos();
    t.after(() => db.close());

    const [plaza] = estadoDelSalon(db, comercio, '2026-11-03T19:00');

    assert.equal(plaza.id, plazaId);
    assert.equal(plaza.estado, 'libre');
    assert.equal(plaza.turno, null);
  });
});

describe('recepcion', () => {
  it('encuentra por nombre parcial sin distinguir mayúsculas', (t) => {
    const { db, comercio } = prepararBaseDeDatos();
    t.after(() => db.close());

    const resultados = buscarEnRecepcion(db, comercio, 'JUAN', '2026-11-03T20:45');

    assert.equal(resultados.length, 1);
    assert.equal(resultados[0].cliente_nombre, 'Juan Pérez');
  });

  it('encuentra por código exacto', (t) => {
    const { db, comercio } = prepararBaseDeDatos();
    t.after(() => db.close());

    const resultados = buscarEnRecepcion(db, comercio, 'ABC123', '2026-11-03T20:45');

    assert.equal(resultados.length, 1);
    assert.equal(resultados[0].codigo, 'ABC123');
  });

  it('no devuelve un turno cancelado', (t) => {
    const { db, comercio } = prepararBaseDeDatos();
    t.after(() => db.close());

    assert.deepEqual(buscarEnRecepcion(db, comercio, 'Pedro', '2026-11-03T20:45'), []);
    assert.deepEqual(buscarEnRecepcion(db, comercio, 'XYZ789', '2026-11-03T20:45'), []);
  });
});

describe('posicion de plazas', () => {
  it('guarda x e y con PATCH y GET /api/salon los devuelve', async (t) => {
    const app = await iniciarApp(t);
    const { cookie } = await registrarConComercio(app, ANA);
    const plaza = await crearRecurso(app, '/api/plazas', cookie, PLAZA);

    const actualizado = await app.inject({
      method: 'PATCH',
      url: `/api/plazas/${plaza.id}/posicion`,
      headers: { cookie },
      payload: { x: 42, y: 73 },
    });
    assert.equal(actualizado.statusCode, 200);
    assert.deepEqual(actualizado.json(), { id: plaza.id, x: 42, y: 73 });

    const salon = await app.inject({ method: 'GET', url: '/api/salon', headers: { cookie } });
    assert.equal(salon.statusCode, 200);
    const [enSalon] = salon.json();
    assert.equal(enSalon.id, plaza.id);
    assert.equal(enSalon.x, 42);
    assert.equal(enSalon.y, 73);
  });
});
