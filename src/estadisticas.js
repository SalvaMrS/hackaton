import { exigirComercio } from './auth.js';
import { ahoraLocal } from './turnos.js';

const RANGOS = { hoy: 0, semana: 6 };
const ESTADOS_OCUPADOS = ['atendido', 'en_curso'];

function sumarDias(fecha, dias) {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
}

function categoriaDe(estado) {
  if (ESTADOS_OCUPADOS.includes(estado)) return 'ocupado';
  if (estado === 'confirmado') return 'falta';
  return estado === 'cancelado' ? 'cancelado' : 'ausente';
}

function contar(turnos) {
  const totales = { total: turnos.length, ocupados: 0, faltan: 0, cancelados: 0, ausentes: 0 };
  for (const { categoria } of turnos) {
    if (categoria === 'ocupado') totales.ocupados += 1;
    else if (categoria === 'falta') totales.faltan += 1;
    else if (categoria === 'cancelado') totales.cancelados += 1;
    else totales.ausentes += 1;
  }
  return totales;
}

function ranking(turnos, campo) {
  const cuenta = new Map();
  for (const turno of turnos.filter(({ categoria }) => categoria !== 'cancelado')) cuenta.set(turno[campo], (cuenta.get(turno[campo]) ?? 0) + 1);
  return [...cuenta].map(([nombre, total]) => ({ nombre, total })).sort((a, b) => b.total - a.total).slice(0, 6);
}

export function calcularEstadisticas(db, comercioId, rango = 'hoy', ahora = ahoraLocal()) {
  const hoy = ahora.slice(0, 10);
  const todos = db.prepare(
    `SELECT t.id, t.inicio, t.fin, t.estado, t.personas, t.cliente_nombre, s.nombre AS servicio, p.nombre AS plaza
     FROM turnos t JOIN servicios s ON s.id = t.servicio_id JOIN plazas p ON p.id = t.plaza_id
     WHERE t.comercio_id = ? ORDER BY t.inicio`,
  ).all(comercioId).map((turno) => ({ ...turno, categoria: categoriaDe(turno.estado), fecha: turno.inicio.slice(0, 10) }));

  const enRango = rango === 'todo' ? todos : todos.filter(({ fecha }) => fecha >= hoy && fecha <= sumarDias(hoy, RANGOS[rango] ?? 0));
  const porDia = Array.from({ length: 7 }, (_, indice) => sumarDias(hoy, indice)).map((fecha) => ({ fecha, ...contar(todos.filter((turno) => turno.fecha === fecha)) }));
  return {
    rango, ahora,
    totales: contar(enRango),
    generales: contar(todos),
    por_dia: porDia,
    por_servicio: ranking(enRango, 'servicio'),
    por_plaza: ranking(enRango, 'plaza'),
    turnos: enRango.slice(0, 300),
  };
}

export function rutasEstadisticas(app) {
  app.get('/api/estadisticas', { preHandler: exigirComercio(app) }, async (req) =>
    calcularEstadisticas(app.db, req.usuario.comercio_id, ['hoy', 'semana', 'todo'].includes(req.query.rango) ? req.query.rango : 'hoy'));
}
