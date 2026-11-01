import { errorHttp, exigirComercio } from './auth.js';
import { textoRequerido, textoOpcional, enteroEnRango, coordenadaOpcional } from './validacion.js';
import { calcularDisponibilidad, reservarTurno, validarFecha } from './turnos.js';
import { listarComercios, detalleComercio, buscarComercioPorSlug } from './comercios.js';

import { responderChat } from './chat.js';

const ESTADOS = ['confirmado', 'atendido', 'cancelado'];
const LIMITE_CHAT_POR_MINUTO = 20;

function leerContextoChat(contexto = {}) {
  return {
    slug: typeof contexto.slug === 'string' ? contexto.slug.slice(0, 80) : null,
    lat: coordenadaOpcional(contexto.lat, 'lat', 90),
    lng: coordenadaOpcional(contexto.lng, 'lng', 180),
  };
}

function leerReserva(body) {
  return {
    servicioId: enteroEnRango(body.servicio_id, 'servicio_id', 1, Number.MAX_SAFE_INTEGER),
    inicio: textoRequerido(body.inicio, 'inicio', 16),
    personas: enteroEnRango(body.personas ?? 1, 'personas', 1, 500),
    clienteNombre: textoRequerido(body.cliente_nombre, 'cliente_nombre', 80),
    clienteTelefono: textoOpcional(body.cliente_telefono, 'cliente_telefono', 40),
  };
}

export function rutasPublicas(app) {
  const { db } = app;

  app.get('/api/comercios', async (req) => listarComercios(db, req.query));

  app.get('/api/comercios/:slug', async (req) => detalleComercio(db, req.params.slug));

  app.get('/api/comercios/:slug/disponibilidad', async (req) => {
    const comercio = buscarComercioPorSlug(db, req.params.slug);
    return calcularDisponibilidad(db, {
      comercioId: comercio.id,
      servicioId: enteroEnRango(req.query.servicio_id, 'servicio_id', 1, Number.MAX_SAFE_INTEGER),
      fecha: validarFecha(req.query.fecha),
      personas: enteroEnRango(req.query.personas ?? 1, 'personas', 1, 500),
    });
  });

  app.post('/api/comercios/:slug/turnos', async (req, reply) => {
    const comercio = buscarComercioPorSlug(db, req.params.slug);
    const turno = reservarTurno(db, { comercioId: comercio.id, ...leerReserva(req.body ?? {}) });
    return reply.status(201).send(turno);
  });

  app.get('/api/turnos/codigo/:codigo', async (req) => {
    const turno = db.prepare(
      `SELECT t.codigo, t.inicio, t.fin, t.estado, t.cliente_nombre, s.nombre AS servicio, p.nombre AS plaza, c.nombre AS comercio
       FROM turnos t JOIN servicios s ON s.id = t.servicio_id JOIN plazas p ON p.id = t.plaza_id JOIN comercios c ON c.id = t.comercio_id
       WHERE t.codigo = ?`,
    ).get(String(req.params.codigo).toUpperCase());
    if (!turno) throw errorHttp(404, 'turno_no_encontrado', 'No existe un turno con ese código');
    return turno;
  });

  app.post('/api/chat', { config: { rateLimit: { max: LIMITE_CHAT_POR_MINUTO, timeWindow: '1 minute' } } }, async (req) =>
    responderChat(db, { mensajes: req.body?.mensajes, contexto: leerContextoChat(req.body?.contexto) }));

  const antes = { preHandler: exigirComercio(app) };

  app.get('/api/turnos', antes, async (req) => {
    const fecha = req.query.fecha ? validarFecha(req.query.fecha) : null;
    return db.prepare(
      `SELECT t.*, s.nombre AS servicio, p.nombre AS plaza
       FROM turnos t JOIN servicios s ON s.id = t.servicio_id JOIN plazas p ON p.id = t.plaza_id
       WHERE t.comercio_id = ? AND (? IS NULL OR substr(t.inicio, 1, 10) = ?)
       ORDER BY t.inicio`,
    ).all(req.usuario.comercio_id, fecha, fecha);
  });

  app.post('/api/turnos', antes, async (req, reply) => {
    const turno = reservarTurno(db, { comercioId: req.usuario.comercio_id, ...leerReserva(req.body ?? {}) });
    return reply.status(201).send(turno);
  });

  app.patch('/api/turnos/:id', antes, async (req) => {
    const estado = req.body?.estado;
    if (!ESTADOS.includes(estado)) throw errorHttp(400, 'estado_invalido', `estado debe ser ${ESTADOS.join(', ')}`);
    const { changes } = db.prepare('UPDATE turnos SET estado = ? WHERE id = ? AND comercio_id = ?')
      .run(estado, Number(req.params.id), req.usuario.comercio_id);
    if (!changes) throw errorHttp(404, 'no_encontrado', 'No existe ese turno');
    return { id: Number(req.params.id), estado };
  });
}
