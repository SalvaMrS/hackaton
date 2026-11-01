import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBaseDeDatos } from '../src/db.js';
import { responderChat } from '../src/chat.js';

const dias = (cantidad) => new Date(Date.now() + cantidad * 86_400_000).toISOString().slice(0, 10);
const FECHA = dias(2);

function prepararBase() {
  const db = abrirBaseDeDatos(':memory:');
  db.exec(`INSERT INTO comercios (id, slug, nombre, rubro, direccion, telefono, lat, lng) VALUES (1, 'cancha-test', 'Cancha Test', 'cancha', 'Calle 1', '341 555', -32.95, -60.64);
    INSERT INTO servicios (id, comercio_id, nombre, duracion_min, precio_centavos) VALUES (1, 1, 'Alquiler 1 hora', 60, 2000000), (2, 1, 'Alquiler 1 hora y media', 90, 2800000);
    INSERT INTO plazas (id, comercio_id, nombre, capacidad) VALUES (1, 1, 'Cancha 1', 10);
    INSERT INTO usuarios (id, email, nombre) VALUES (1, 'ana@ejemplo.com', 'Ana'), (2, 'beto@ejemplo.com', 'Beto');`);
  for (let dia = 0; dia < 7; dia += 1) db.prepare('INSERT INTO horarios (comercio_id, dia_semana, apertura, cierre) VALUES (1, ?, ?, ?)').run(dia, '10:00', '23:00');
  return db;
}

function llamadaA(nombre, argumentos) {
  return { role: 'assistant', content: null, tool_calls: [{ id: '1', type: 'function', function: { name: nombre, arguments: JSON.stringify(argumentos) } }] };
}

async function ejecutar(db, herramienta, argumentos, contexto = {}, opciones = {}) {
  let resultado;
  const modelo = async ({ messages }) => {
    const respuestaHerramienta = messages.find(({ role }) => role === 'tool');
    if (!respuestaHerramienta) return { choices: [{ message: llamadaA(herramienta, argumentos) }] };
    resultado = JSON.parse(respuestaHerramienta.content);
    return { choices: [{ message: { role: 'assistant', content: 'listo' } }] };
  };
  const { respuesta } = await responderChat(db, { mensajes: [{ role: 'user', content: 'hola' }], contexto, ...opciones }, modelo);
  assert.equal(respuesta, 'listo');
  return resultado;
}

const reservaBase = { slug: 'cancha-test', servicio: 'Alquiler 1 hora', inicio: `${FECHA}T21:00`, personas: 4, cliente_nombre: 'Ana' };
const cantidadDeTurnos = (db) => db.prepare('SELECT COUNT(*) AS total FROM turnos').get().total;

describe('asistente', () => {
  it('informa los precios como texto con $ y no en centavos', async () => {
    const comercio = await ejecutar(prepararBase(), 'ver_comercio', { slug: 'cancha-test' });
    assert.match(comercio.servicios[0].precio_a_pagar, /\$\s?20\.000/);
    assert.ok(!JSON.stringify(comercio).includes('2000000'));
  });

  it('busca turnos cercanos con distancia y horarios libres', async () => {
    const cercanos = await ejecutar(prepararBase(), 'buscar_turnos_cercanos', { texto: 'cancha', fecha: FECHA }, { lat: -32.95, lng: -60.65 });
    assert.equal(cercanos[0].slug, 'cancha-test');
    assert.ok(cercanos[0].distancia_km !== null);
    assert.ok(cercanos[0].servicios[0].horarios_libres.length > 0);
  });

  it('reserva por nombre exacto del servicio a nombre del usuario con sesión', async () => {
    const db = prepararBase();
    const turno = await ejecutar(db, 'reservar', reservaBase, { usuarioId: 1 });
    assert.equal(turno.plaza, 'Cancha 1');
    const guardado = db.prepare('SELECT servicio_id, usuario_id FROM turnos').get();
    assert.deepEqual({ ...guardado }, { servicio_id: 1, usuario_id: 1 });
  });

  it('rechaza un nombre parcial de servicio, lista los disponibles y no crea turno', async () => {
    const db = prepararBase();
    const resultado = await ejecutar(db, 'reservar', { ...reservaBase, servicio: 'Alquiler 1' }, { usuarioId: 1 });
    assert.match(resultado.error, /Alquiler 1 hora y media/);
    assert.equal(cantidadDeTurnos(db), 0);
  });

  it('no reserva sin sesión', async () => {
    const db = prepararBase();
    const resultado = await ejecutar(db, 'reservar', reservaBase, {});
    assert.match(resultado.error, /iniciar sesión/);
    assert.equal(cantidadDeTurnos(db), 0);
  });

  it('lista y cancela los turnos propios pero no los ajenos', async () => {
    const db = prepararBase();
    const { id_turno: idTurno } = await ejecutar(db, 'reservar', reservaBase, { usuarioId: 1 });
    const propios = await ejecutar(db, 'mis_turnos', {}, { usuarioId: 1 });
    assert.equal(propios.length, 1);
    const ajeno = await ejecutar(db, 'cancelar_turno', { turno_id: idTurno }, { usuarioId: 2 });
    assert.ok(ajeno.error);
    const cancelado = await ejecutar(db, 'cancelar_turno', { turno_id: idTurno }, { usuarioId: 1 });
    assert.equal(cancelado.cancelado, true);
    assert.equal(db.prepare('SELECT estado FROM turnos WHERE id = ?').get(idTurno).estado, 'cancelado');
  });

  it('avisa qué herramienta falló y por qué', async () => {
    const fallos = [];
    await ejecutar(prepararBase(), 'reservar', reservaBase, {}, { alFallarHerramienta: (herramienta, motivo) => fallos.push({ herramienta, motivo }) });
    assert.equal(fallos[0].herramienta, 'reservar');
    assert.match(fallos[0].motivo, /iniciar sesión/);
  });
});

describe('identidad del chat por teléfono', () => {
  it('reserva a nombre del cliente identificado sin pedirle nombre ni teléfono', async () => {
    const db = prepararBase();
    const argumentos = { slug: 'cancha-test', servicio: 'Alquiler 1 hora', inicio: `${FECHA}T20:00` };
    await ejecutar(db, 'reservar', argumentos, { usuarioId: 1, usuarioNombre: 'Ana López', usuarioTelefono: '+54 9 341 555 0100' });
    const turno = db.prepare('SELECT cliente_nombre, cliente_telefono, usuario_id FROM turnos').get();
    assert.deepEqual({ ...turno }, { cliente_nombre: 'Ana López', cliente_telefono: '+54 9 341 555 0100', usuario_id: 1 });
  });

  it('el endpoint de identidad devuelve al cliente por defecto y la hora', async (t) => {
    const { crearServidor } = await import('../src/server.js');
    const db = prepararBase();
    db.prepare("UPDATE usuarios SET telefono = '+54 9 341 555 0100' WHERE id = 1").run();
    const app = crearServidor({ db });
    t.after(() => app.close());
    const respuesta = await app.inject({ method: 'GET', url: '/api/chat/identidad' });
    const { cliente, ahora } = respuesta.json();
    assert.equal(cliente.nombre, 'Ana');
    assert.equal(cliente.fuente, 'telefono');
    assert.match(ahora, /^\w+ \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });
});

describe('búsqueda tolerante', () => {
  it('encuentra comercios con palabras sueltas y sinónimos', async () => {
    const { listarComercios } = await import('../src/comercios.js');
    const db = prepararBase();
    db.prepare("UPDATE comercios SET nombre = 'Barbería El Corte', rubro = 'peluquería' WHERE id = 1").run();
    db.prepare("UPDATE servicios SET nombre = 'Corte' WHERE id = 1").run();
    assert.equal(listarComercios(db, { q: 'quiero un corte de pelo' }).length, 1);
    assert.equal(listarComercios(db, { q: 'perro' }).length, 0);
  });
});

describe('ofertas y horario de hoy', () => {
  it('lista las ofertas con el precio a pagar y el precio normal', async () => {
    const db = prepararBase();
    db.prepare('UPDATE servicios SET oferta = 1, precio_oferta_centavos = 1500000 WHERE id = 1').run();
    const ofertas = await ejecutar(db, 'ver_ofertas', {});
    assert.equal(ofertas.length, 1);
    assert.match(ofertas[0].precio_a_pagar, /\$\s?15\.000/);
    assert.match(ofertas[0].precio_normal_sin_oferta, /\$\s?20\.000/);
  });

  it('ver_comercio informa el horario de hoy', async () => {
    const comercio = await ejecutar(prepararBase(), 'ver_comercio', { slug: 'cancha-test' });
    assert.equal(comercio.horario_de_hoy, '10:00–23:00');
  });
});
