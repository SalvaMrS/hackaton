import { errorHttp, exigirComercio } from './auth.js';
import { enteroEnRango } from './validacion.js';
import { ahoraLocal, minutosEntre } from './turnos.js';

const COLUMNAS_POR_FILA = 5;

function posicionPorDefecto(indice) {
  return {
    x: Math.min(10 + (indice % COLUMNAS_POR_FILA) * 18, 92),
    y: Math.min(15 + Math.floor(indice / COLUMNAS_POR_FILA) * 24, 90),
  };
}

export function situacionDelTurno(turno, comercio, ahora) {
  if (turno.estado === 'en_curso') return { situacion: 'en_curso', minutos: minutosEntre(turno.inicio, ahora) };
  const faltan = minutosEntre(ahora, turno.inicio);
  if (faltan > 0) return { situacion: 'proximo', minutos: faltan };
  const tarde = -faltan;
  if (tarde < comercio.tolerancia_min) return { situacion: 'en_hora', minutos: tarde };
  if (tarde < comercio.ausente_min) return { situacion: 'demorado', minutos: tarde };
  return { situacion: 'ausente', minutos: tarde };
}

function turnosVigentes(db, comercioId, ahora) {
  return db.prepare(
    `SELECT t.id, t.plaza_id, t.inicio, t.fin, t.estado, t.cliente_nombre, t.cliente_telefono, t.personas,
            s.nombre AS servicio, p.nombre AS plaza
     FROM turnos t JOIN servicios s ON s.id = t.servicio_id JOIN plazas p ON p.id = t.plaza_id
     WHERE t.comercio_id = ? AND t.estado IN ('confirmado', 'en_curso') AND t.fin > ? AND substr(t.inicio, 1, 10) = ?
     ORDER BY t.inicio`,
  ).all(comercioId, ahora, ahora.slice(0, 10));
}

export function estadoDelSalon(db, comercio, ahora = ahoraLocal(), { incluirInactivas = false } = {}) {
  const plazas = db.prepare('SELECT id, nombre, tipo, descripcion, forma, ancho, alto, color, capacidad, activo, pos_x, pos_y FROM plazas WHERE comercio_id = ? AND (activo = 1 OR ?) ORDER BY id').all(comercio.id, incluirInactivas ? 1 : 0);
  const todosLosTurnos = turnosVigentes(db, comercio.id, ahora)
    .map((turno) => ({ ...turno, ...situacionDelTurno(turno, comercio, ahora) }));
  const turnos = todosLosTurnos.filter((turno) => turno.situacion !== 'proximo' || turno.minutos <= comercio.aviso_min);

  return plazas.map((plaza, indice) => {
    const turno = turnos.find((candidato) => candidato.plaza_id === plaza.id) ?? null;
    const porDefecto = posicionPorDefecto(indice);
    return {
      ...plaza,
      x: plaza.pos_x ?? porDefecto.x,
      y: plaza.pos_y ?? porDefecto.y,
      estado: plaza.activo ? (turno ? turno.situacion : 'libre') : 'inactiva',
      turno,
      proximos: todosLosTurnos.filter((candidato) => candidato.plaza_id === plaza.id),
    };
  });
}

export function buscarEnRecepcion(db, comercio, consulta, ahora = ahoraLocal()) {
  const texto = consulta.trim().toLowerCase();
  if (!texto) return [];
  return turnosVigentes(db, comercio.id, ahora)
    .filter((turno) => turno.cliente_nombre.toLowerCase().includes(texto))
    .map((turno) => ({ ...turno, ...situacionDelTurno(turno, comercio, ahora) }));
}

export function rutasSalon(app) {
  const { db } = app;
  const antes = { preHandler: exigirComercio(app) };
  const comercioDe = (req) => db.prepare('SELECT * FROM comercios WHERE id = ?').get(req.usuario.comercio_id);

  app.get('/api/salon', antes, async (req) =>
    estadoDelSalon(db, comercioDe(req), undefined, { incluirInactivas: req.query.todas === '1' }));

  app.get('/api/recepcion', antes, async (req) => buscarEnRecepcion(db, comercioDe(req), String(req.query.q ?? '')));

  app.patch('/api/plazas/:id/posicion', antes, async (req) => {
    const x = enteroEnRango(Math.round(Number(req.body?.x)), 'x', 0, 100);
    const y = enteroEnRango(Math.round(Number(req.body?.y)), 'y', 0, 100);
    const { changes } = db.prepare('UPDATE plazas SET pos_x = ?, pos_y = ? WHERE id = ? AND comercio_id = ?')
      .run(x, y, Number(req.params.id), req.usuario.comercio_id);
    if (!changes) throw errorHttp(404, 'no_encontrado', 'No existe esa plaza');
    return { id: Number(req.params.id), x, y };
  });
}
