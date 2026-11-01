import { randomBytes } from 'node:crypto';
import { errorHttp } from './auth.js';

const PASO_MIN = 15;
const ZONA_HORARIA = 'America/Argentina/Buenos_Aires';
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function ahoraLocal(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat('sv-SE', {
    timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(fecha);
  return partes.replace(' ', 'T');
}

function aMinutos(horaTexto) {
  const [horas, minutos] = horaTexto.split(':').map(Number);
  return horas * 60 + minutos;
}

function aHora(minutos) {
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
}

export function validarFecha(fecha) {
  if (typeof fecha !== 'string' || !FECHA.test(fecha) || Number.isNaN(Date.parse(`${fecha}T00:00:00Z`))) {
    throw errorHttp(400, 'fecha_invalida', 'La fecha debe tener formato AAAA-MM-DD');
  }
  return fecha;
}

function diaSemana(fecha) {
  return new Date(`${fecha}T00:00:00Z`).getUTCDay();
}

function sumarMinutos(inicio, minutos) {
  const [fecha, horaTexto] = inicio.split('T');
  const total = aMinutos(horaTexto) + minutos;
  return `${fecha}T${aHora(total)}`;
}

function plazasQueEntran(db, comercioId, personas) {
  return db.prepare('SELECT id, nombre, capacidad FROM plazas WHERE comercio_id = ? AND activo = 1 AND capacidad >= ? ORDER BY capacidad, id')
    .all(comercioId, personas);
}

function plazaOcupada(db, plazaId, inicio, fin) {
  return Boolean(db.prepare(
    "SELECT 1 FROM turnos WHERE plaza_id = ? AND estado != 'cancelado' AND inicio < ? AND fin > ?",
  ).get(plazaId, fin, inicio));
}

export function obtenerServicioActivo(db, comercioId, servicioId) {
  const servicio = db.prepare('SELECT * FROM servicios WHERE id = ? AND comercio_id = ? AND activo = 1')
    .get(servicioId, comercioId);
  if (!servicio) throw errorHttp(404, 'servicio_no_encontrado', 'El servicio no existe o no está disponible');
  return servicio;
}

export function calcularDisponibilidad(db, { comercioId, servicioId, fecha, personas = 1, ahora = ahoraLocal() }) {
  const servicio = obtenerServicioActivo(db, comercioId, servicioId);
  const plazas = plazasQueEntran(db, comercioId, personas);
  const rangos = db.prepare('SELECT apertura, cierre FROM horarios WHERE comercio_id = ? AND dia_semana = ? ORDER BY apertura')
    .all(comercioId, diaSemana(fecha));

  const franjas = [];
  for (const { apertura, cierre } of rangos) {
    for (let minuto = aMinutos(apertura); minuto + servicio.duracion_min <= aMinutos(cierre); minuto += PASO_MIN) {
      const inicio = `${fecha}T${aHora(minuto)}`;
      if (inicio <= ahora) continue;
      const fin = sumarMinutos(inicio, servicio.duracion_min);
      const libres = plazas.filter((plaza) => !plazaOcupada(db, plaza.id, inicio, fin));
      if (libres.length) franjas.push({ inicio, plazas: libres.map(({ id, nombre }) => ({ id, nombre })) });
    }
  }
  return franjas;
}

function generarCodigo() {
  return Array.from(randomBytes(6), (byte) => ALFABETO_CODIGO[byte % ALFABETO_CODIGO.length]).join('');
}

export function reservarTurno(db, datos, ahora = ahoraLocal()) {
  const { comercioId, servicioId, inicio, personas = 1, clienteNombre, clienteTelefono = '', plazaId } = datos;
  const servicio = obtenerServicioActivo(db, comercioId, servicioId);
  const fecha = validarFecha(inicio?.slice(0, 10));

  db.exec('BEGIN IMMEDIATE');
  try {
    const franja = calcularDisponibilidad(db, { comercioId, servicioId, fecha, personas, ahora })
      .find((candidata) => candidata.inicio === inicio);
    const plaza = franja?.plazas.find((candidata) => !plazaId || candidata.id === plazaId);
    if (!plaza) throw errorHttp(409, 'sin_disponibilidad', 'Ese horario ya no está disponible');

    const codigo = generarCodigo();
    const { lastInsertRowid } = db.prepare(
      `INSERT INTO turnos (comercio_id, servicio_id, plaza_id, inicio, fin, cliente_nombre, cliente_telefono, personas, codigo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(comercioId, servicioId, plaza.id, inicio, sumarMinutos(inicio, servicio.duracion_min), clienteNombre, clienteTelefono, personas, codigo);
    db.exec('COMMIT');
    return { id: Number(lastInsertRowid), codigo, plaza: plaza.nombre, inicio, servicio: servicio.nombre };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
