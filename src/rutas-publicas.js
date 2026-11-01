import { errorHttp, exigirComercio, exigirUsuario, usuarioActual } from './auth.js';
import { textoRequerido, textoOpcional, enteroEnRango, coordenadaOpcional } from './validacion.js';
import { calcularDisponibilidad, reservarTurno, validarFecha } from './turnos.js';
import { listarComercios, detalleComercio, buscarComercioPorSlug } from './comercios.js';

import { responderChat, fechaConDia } from './chat.js';

const ESTADOS = ['confirmado', 'en_curso', 'atendido', 'cancelado', 'ausente'];
const LIMITE_CHAT_POR_MINUTO = 20;
const TELEFONO_POR_DEFECTO = '+54 9 341 555 0100';

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

  const identidadDelChat = (req) => {
    const sesion = usuarioActual(app, req);
    const usuario = sesion
      ? db.prepare('SELECT id, nombre, email, telefono FROM usuarios WHERE id = ?').get(sesion.id)
      : db.prepare('SELECT id, nombre, email, telefono FROM usuarios WHERE telefono = ?').get(process.env.CHAT_TELEFONO_POR_DEFECTO ?? TELEFONO_POR_DEFECTO);
    return usuario ? { ...usuario, fuente: sesion ? 'sesion' : 'telefono' } : null;
  };

  const contextoDelChat = (req) => {
    const usuario = identidadDelChat(req);
    return {
      ...leerContextoChat(req.body?.contexto), usuarioId: usuario?.id ?? null,
      usuarioNombre: usuario?.nombre || usuario?.email || '', usuarioTelefono: usuario?.telefono ?? '',
    };
  };

  app.get('/api/chat/identidad', async (req) => {
    const usuario = identidadDelChat(req);
    return { ahora: fechaConDia(), cliente: usuario && { nombre: usuario.nombre || usuario.email, telefono: usuario.telefono, fuente: usuario.fuente } };
  });

  app.get('/api/anuncios', async () => db.prepare(
    `SELECT c.nombre AS comercio, c.slug, c.rubro, c.imagen_url AS portada, s.nombre AS servicio, s.imagen_url AS imagen,
            s.precio_centavos AS precio_normal, s.precio_oferta_centavos AS precio_oferta
     FROM servicios s JOIN comercios c ON c.id = s.comercio_id
     WHERE s.oferta = 1 AND s.activo = 1 ORDER BY c.id, s.id LIMIT 12`,
  ).all());

  app.get('/api/cuentas-prueba', async () => {
    if (process.env.CUENTAS_PRUEBA !== '1') return { activas: false, cuentas: [] };
    const cuentas = db.prepare(
      `SELECT u.email, u.nombre, c.slug, c.rubro FROM usuarios u LEFT JOIN comercios c ON c.id = u.comercio_id
       WHERE u.email LIKE '%@demo.com' OR u.email = 'cliente@test.com' ORDER BY (c.id IS NULL) DESC, c.nombre`,
    ).all();
    return { activas: true, clave: 'test123', cuentas };
  });

  app.get('/api/rubros', async () =>
    db.prepare('SELECT MIN(rubro) AS rubro FROM comercios GROUP BY lower(rubro) ORDER BY lower(rubro)').all().map(({ rubro }) => rubro));

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

  app.post('/api/comercios/:slug/turnos', { preHandler: exigirUsuario(app) }, async (req, reply) => {
    const comercio = buscarComercioPorSlug(db, req.params.slug);
    const turno = reservarTurno(db, { comercioId: comercio.id, usuarioId: req.usuario.id, ...leerReserva(req.body ?? {}) });
    return reply.status(201).send(turno);
  });

  const soloCliente = { preHandler: exigirUsuario(app) };

  app.get('/api/mis-turnos', soloCliente, async (req) => db.prepare(
    `SELECT t.id, t.inicio, t.fin, t.estado, t.personas, t.cliente_nombre, s.nombre AS servicio, p.nombre AS plaza,
            c.nombre AS comercio, c.slug, c.direccion, c.telefono, c.lat, c.lng
     FROM turnos t JOIN servicios s ON s.id = t.servicio_id JOIN plazas p ON p.id = t.plaza_id JOIN comercios c ON c.id = t.comercio_id
     WHERE t.usuario_id = ? ORDER BY t.inicio DESC LIMIT 50`,
  ).all(req.usuario.id));

  app.post('/api/mis-turnos/:id/cancelar', soloCliente, async (req) => {
    const turno = db.prepare('SELECT id, estado FROM turnos WHERE id = ? AND usuario_id = ?').get(Number(req.params.id), req.usuario.id);
    if (!turno) throw errorHttp(404, 'turno_no_encontrado', 'No existe ese turno');
    if (turno.estado !== 'confirmado') throw errorHttp(409, 'no_cancelable', 'Este turno ya no se puede cancelar');
    db.prepare("UPDATE turnos SET estado = 'cancelado' WHERE id = ?").run(turno.id);
    return { id: turno.id, estado: 'cancelado' };
  });

  app.post('/api/chat', { config: { rateLimit: { max: LIMITE_CHAT_POR_MINUTO, timeWindow: '1 minute' } } }, async (req) =>
    responderChat(db, {
      mensajes: req.body?.mensajes,
      contexto: contextoDelChat(req),
      alFallarHerramienta: (herramienta, motivo) => req.log.warn({ herramienta, motivo }, 'falló una herramienta del asistente'),
    }));

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
