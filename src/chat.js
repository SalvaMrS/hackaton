import { errorHttp } from './auth.js';
import { ahoraLocal, calcularDisponibilidad, reservarTurno } from './turnos.js';
import { listarComercios, detalleComercio, normalizar } from './comercios.js';

const URL_OPENAI = 'https://api.openai.com/v1/chat/completions';
const TIMEOUT_MS = 25_000;
const INTENTOS = 3;
const MAX_VUELTAS = 8;
const MAX_MENSAJES = 24;
const MAX_FRANJAS_MOSTRADAS = 12;
const MAX_COMERCIOS_SUGERIDOS = 3;
const MAX_HORARIOS_POR_SERVICIO = 6;
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const formatoPrecio = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const precioTexto = (centavos) => formatoPrecio.format(centavos / 100);

const parametros = (propiedades, requeridos = []) => ({ type: 'object', properties: propiedades, required: requeridos });
const FECHA = { type: 'string', description: 'AAAA-MM-DD' };

const HERRAMIENTAS = [
  {
    name: 'buscar_comercios',
    description: 'Busca comercios por texto (nombre, rubro o servicio); con texto vacío lista todos. Ordena por cercanía si se conoce la ubicación.',
    parameters: parametros({ texto: { type: 'string' } }, ['texto']),
  },
  {
    name: 'ver_comercio',
    description: 'Devuelve dirección, teléfono, horarios y servicios con precio fijo, duración y características de un comercio.',
    parameters: parametros({ slug: { type: 'string' } }, ['slug']),
  },
  {
    name: 'buscar_turnos_cercanos',
    description: 'Para un tipo de servicio y un día, devuelve los comercios más cercanos con sus horarios libres. Usala cuando ya sepas qué busca, para qué día y (si lo dijo) en qué franja horaria.',
    parameters: parametros({
      texto: { type: 'string', description: 'servicio o rubro buscado, ej: cancha, corte de pelo, mesa' },
      fecha: FECHA,
      personas: { type: 'integer' },
      hora_desde: { type: 'string', description: 'HH:MM, opcional' },
      hora_hasta: { type: 'string', description: 'HH:MM, opcional' },
    }, ['texto', 'fecha']),
  },
  {
    name: 'ver_disponibilidad',
    description: 'Lista los horarios libres de un servicio concreto de un comercio en una fecha.',
    parameters: parametros({
      slug: { type: 'string', description: 'slug o nombre del comercio' }, servicio: { type: 'string', description: 'nombre del servicio, tal cual figura en el comercio' },
      fecha: FECHA, personas: { type: 'integer' },
      hora_desde: { type: 'string', description: 'HH:MM, opcional' }, hora_hasta: { type: 'string', description: 'HH:MM, opcional' },
    }, ['slug', 'servicio', 'fecha']),
  },
  {
    name: 'reservar',
    description: 'Reserva un turno a nombre de quien tiene la sesión iniciada. Solo llamar después de que el cliente confirmó el resumen (comercio, servicio, fecha y hora, personas y nombre).',
    parameters: parametros({
      slug: { type: 'string', description: 'slug o nombre del comercio' }, servicio: { type: 'string', description: 'nombre del servicio, tal cual figura en el comercio' },
      inicio: { type: 'string', description: 'AAAA-MM-DDTHH:MM' },
      personas: { type: 'integer' }, cliente_nombre: { type: 'string' }, cliente_telefono: { type: 'string' },
    }, ['slug', 'servicio', 'inicio', 'cliente_nombre']),
  },
  {
    name: 'mis_turnos',
    description: 'Lista los turnos del cliente con sesión iniciada (con su id, comercio, fecha, plaza y estado).',
    parameters: parametros({}),
  },
  {
    name: 'cancelar_turno',
    description: 'Cancela un turno confirmado del cliente. Solo llamar después de que el cliente confirmó cuál cancelar.',
    parameters: parametros({ turno_id: { type: 'integer' } }, ['turno_id']),
  },
].map((funcion) => ({ type: 'function', function: funcion }));

function fechaConDia(ahora) {
  const dia = DIAS_SEMANA[new Date(`${ahora.slice(0, 10)}T00:00:00Z`).getUTCDay()];
  return `${dia} ${ahora.slice(0, 10)} ${ahora.slice(11)}`;
}

function instrucciones(contexto) {
  const ubicacion = contexto.lat != null
    ? 'Conocés la ubicación del cliente: buscar_comercios y buscar_turnos_cercanos ya ordenan por cercanía y devuelven distancia_km.'
    : 'No conocés la ubicación del cliente: avisale una vez que puede tocar "Escribir mi dirección" arriba del chat para ver lo más cercano (la ubicación automática no está disponible), y mientras tanto seguí sin ella.';
  const sesion = contexto.usuarioId
    ? `El cliente tiene la sesión iniciada como ${contexto.usuarioNombre}.`
    : 'El cliente NO inició sesión: puede consultar todo, pero para reservar o cancelar tiene que tocar "Ingresar" arriba del chat. Pedíselo recién cuando vaya a reservar.';
  const foco = contexto.slug ? `El cliente está mirando el comercio "${contexto.slug}": usalo por defecto.` : '';
  return [
    'Sos el asistente de turnos de una plataforma de reservas de comercios (canchas, restaurantes, peluquerías, consultorios, estudios). Hablás en español rioplatense, cálido y breve, como en WhatsApp.',
    `Ahora es ${fechaConDia(ahoraLocal())} (hora de Argentina). Resolvé "hoy", "mañana", "el viernes" con esta fecha. ${ubicacion} ${sesion} ${foco}`,
    'GUION: guiá al cliente con un ida y vuelta, UNA pregunta por mensaje. Averiguá en este orden lo que falte: 1) qué busca (servicio o rubro) y características que le importen, 2) para qué día y en qué momento u horario, 3) cuántas personas, 4) preferencias (más cerca, oferta). En cuanto sepas servicio y día, llamá a buscar_turnos_cercanos y proponé como máximo 3 opciones con comercio, distancia (si la hay), servicio, precio y 3 o 4 horarios. Después cerrá la elección y confirmá el resumen antes de reservar.',
    'RESERVAS: antes de llamar a reservar mostrá el resumen (comercio, servicio, día y hora, personas, precio y a nombre de quién) y preguntá "¿Confirmo?". Al reservar informá el lugar asignado (plaza) y la dirección. Si el horario ya no está, ofrecé otros. Para cancelar: listá con mis_turnos, confirmá cuál y recién ahí llamá a cancelar_turno. Para cambiar un turno: reservá el nuevo y después cancelá el viejo, con confirmación.',
    'PRECIOS: son fijos. Informalos exactamente como los devuelven las herramientas (texto con $), sin redondear ni calcular. No hay regateo ni descuentos: si piden rebaja respondé amable que los precios son fijos, y solo mencioná las ofertas publicadas (oferta = true, con precio_oferta).',
    'DATOS: usá siempre las herramientas para precios, horarios y disponibilidad; nunca inventes. Identificá el comercio por su slug (o nombre) y el servicio por su nombre exacto; nunca uses ids numéricos de servicio. Si buscar_comercios no devuelve resultados, probá con una palabra más corta o con texto vacío.',
    'FORMATO: mensajes cortos, texto plano con saltos de línea, sin títulos ni listas con guiones largos. Para resaltar usá *un asterisco* a cada lado (nunca doble) solo en una palabra o frase corta, por ejemplo *Fútbol 5 La Terraza*; no uses asteriscos en listas ni en líneas con dos puntos. Podés usar algún emoji. Al final de tu mensaje, cuando convenga ofrecer opciones tocables, agregá UNA última línea con este formato exacto: [Opciones: Hoy | Mañana | Esta semana] (máximo 4 opciones cortas, sin repetir lo que ya está en el texto).',
    'Si no podés resolver algo, decí que puede llamar o escribir al comercio (teléfono en ver_comercio).',
  ].join('\n');
}

function resumirHorarios(horarios) {
  const porRango = new Map();
  for (const { dia_semana: dia, apertura, cierre } of horarios) {
    const rango = `${apertura}–${cierre}`;
    porRango.set(rango, [...(porRango.get(rango) ?? []), DIAS_SEMANA[dia]]);
  }
  return [...porRango].map(([rango, dias]) => `${dias.join(', ')} ${rango}`);
}

function servicioParaModelo(servicio) {
  return {
    id: servicio.id,
    nombre: servicio.nombre,
    descripcion: servicio.descripcion,
    caracteristicas: servicio.caracteristicas,
    duracion_min: servicio.duracion_min,
    precio: precioTexto(servicio.precio_centavos),
    oferta: Boolean(servicio.oferta),
    precio_oferta: servicio.oferta ? precioTexto(servicio.precio_oferta_centavos) : null,
  };
}

function resolverComercio(db, referencia) {
  try {
    return detalleComercio(db, referencia);
  } catch { /* no era un slug: se busca por nombre */ }
  const [candidato] = listarComercios(db, { q: referencia ?? '' });
  if (!candidato) throw new Error(`No encontré el comercio "${referencia}"`);
  return detalleComercio(db, candidato.slug);
}

function resolverServicio(comercio, nombre) {
  const buscado = normalizar(nombre);
  const servicio = comercio.servicios.find((candidato) => normalizar(candidato.nombre) === buscado);
  if (!servicio) throw new Error(`No hay un servicio con ese nombre exacto en ${comercio.nombre}. Disponibles: ${comercio.servicios.map((s) => s.nombre).join(' | ')}`);
  return servicio;
}

function enRango(inicio, desde, hasta) {
  const hora = inicio.slice(11);
  return (!desde || hora >= desde) && (!hasta || hora <= hasta);
}

function horariosLibres(db, comercio, servicio, { fecha, personas = 1, hora_desde: desde, hora_hasta: hasta }) {
  return calcularDisponibilidad(db, { comercioId: comercio.id, servicioId: servicio.id, fecha, personas })
    .filter(({ inicio }) => enRango(inicio, desde, hasta))
    .map(({ inicio }) => inicio.slice(11));
}

function serviciosBuscados(comercio, texto) {
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean).map((palabra) => palabra.replace(/s$/, ''));
  const coinciden = comercio.servicios.filter((servicio) => palabras.some((palabra) => normalizar(servicio.nombre).includes(palabra)));
  return (coinciden.length ? coinciden : comercio.servicios).slice(0, 2);
}

function turnosCercanos(db, argumentos, contexto) {
  const personas = argumentos.personas ?? 1;
  const comercios = listarComercios(db, { q: argumentos.texto, lat: contexto.lat, lng: contexto.lng }).slice(0, MAX_COMERCIOS_SUGERIDOS);
  return comercios.map((comercio) => {
    const detalle = detalleComercio(db, comercio.slug);
    const opciones = serviciosBuscados(detalle, argumentos.texto).map((servicio) => ({
      ...servicioParaModelo(servicio),
      horarios_libres: horariosLibres(db, detalle, servicio, { ...argumentos, personas }).slice(0, MAX_HORARIOS_POR_SERVICIO),
    }));
    return { slug: comercio.slug, nombre: comercio.nombre, direccion: comercio.direccion, distancia_km: comercio.distancia_km, servicios: opciones };
  });
}

function turnosDelCliente(db, usuarioId) {
  return db.prepare(
    `SELECT t.id, t.inicio, t.estado, t.personas, s.nombre AS servicio, p.nombre AS plaza, c.nombre AS comercio, c.slug, c.direccion
     FROM turnos t JOIN servicios s ON s.id = t.servicio_id JOIN plazas p ON p.id = t.plaza_id JOIN comercios c ON c.id = t.comercio_id
     WHERE t.usuario_id = ? AND t.estado = 'confirmado' AND t.inicio >= ? ORDER BY t.inicio LIMIT 10`,
  ).all(usuarioId, ahoraLocal());
}

function exigirSesion(contexto) {
  if (!contexto.usuarioId) throw new Error('El cliente debe iniciar sesión (botón "Ingresar" arriba del chat) para reservar o cancelar');
}

function ejecutarHerramienta(db, nombre, argumentos, contexto) {
  switch (nombre) {
    case 'buscar_comercios':
      return listarComercios(db, { q: argumentos.texto, lat: contexto.lat, lng: contexto.lng })
        .slice(0, 5)
        .map(({ slug, nombre: comercio, rubro, direccion, servicios, distancia_km: distancia }) => ({ slug, nombre: comercio, rubro, direccion, servicios, distancia_km: distancia }));
    case 'ver_comercio': {
      const comercio = resolverComercio(db, argumentos.slug);
      return {
        slug: comercio.slug, nombre: comercio.nombre, rubro: comercio.rubro, descripcion: comercio.descripcion, direccion: comercio.direccion,
        telefono: comercio.telefono, horarios: resumirHorarios(comercio.horarios), capacidad_maxima_por_reserva: comercio.capacidad_maxima,
        servicios: comercio.servicios.map(servicioParaModelo),
      };
    }
    case 'buscar_turnos_cercanos':
      return turnosCercanos(db, argumentos, contexto);
    case 'ver_disponibilidad': {
      const comercio = resolverComercio(db, argumentos.slug);
      const servicio = resolverServicio(comercio, argumentos.servicio);
      return horariosLibres(db, comercio, servicio, argumentos).slice(0, MAX_FRANJAS_MOSTRADAS);
    }
    case 'reservar': {
      exigirSesion(contexto);
      const comercio = resolverComercio(db, argumentos.slug);
      const servicio = resolverServicio(comercio, argumentos.servicio);
      const turno = reservarTurno(db, {
        usuarioId: contexto.usuarioId, comercioId: comercio.id, servicioId: servicio.id, inicio: argumentos.inicio,
        personas: argumentos.personas ?? 1, clienteNombre: argumentos.cliente_nombre, clienteTelefono: argumentos.cliente_telefono ?? '',
      });
      return { ...turno, comercio: comercio.nombre, direccion: comercio.direccion, telefono: comercio.telefono, ...servicioParaModelo(servicio), id_turno: turno.id };
    }
    case 'mis_turnos':
      exigirSesion(contexto);
      return turnosDelCliente(db, contexto.usuarioId);
    case 'cancelar_turno': {
      exigirSesion(contexto);
      const { changes } = db.prepare("UPDATE turnos SET estado = 'cancelado' WHERE id = ? AND usuario_id = ? AND estado = 'confirmado'")
        .run(argumentos.turno_id, contexto.usuarioId);
      if (!changes) throw new Error('No encontré un turno confirmado tuyo con ese id');
      return { cancelado: true, turno_id: argumentos.turno_id };
    }
    default:
      throw new Error(`Herramienta desconocida: ${nombre}`);
  }
}

function resultadoDeHerramienta(db, llamada, contexto, alFallar) {
  try {
    const argumentos = JSON.parse(llamada.function.arguments || '{}');
    return ejecutarHerramienta(db, llamada.function.name, argumentos, contexto);
  } catch (error) {
    alFallar?.(llamada.function.name, error.message);
    return { error: error.message };
  }
}

const esperar = (ms) => new Promise((resolver) => { setTimeout(resolver, ms); });

export async function llamarOpenAI(cuerpo, { clave = process.env.OPENAI_API_KEY, pausaBaseMs = 500 } = {}) {
  if (!clave) throw errorHttp(503, 'asistente_no_disponible', 'El asistente no está configurado');
  for (let intento = 1; intento <= INTENTOS; intento += 1) {
    try {
      const respuesta = await fetch(URL_OPENAI, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clave}` },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (respuesta.ok) return await respuesta.json();
      const reintentable = respuesta.status === 429 || respuesta.status >= 500;
      if (!reintentable) throw errorHttp(502, 'asistente_error', 'El asistente rechazó la consulta');
    } catch (error) {
      if (error.code === 'asistente_error') throw error;
    }
    if (intento < INTENTOS) await esperar(pausaBaseMs * 2 ** (intento - 1));
  }
  throw errorHttp(503, 'asistente_ocupado', 'El asistente está ocupado, probá de nuevo en unos segundos');
}

function sanear(mensajes) {
  if (!Array.isArray(mensajes) || !mensajes.length) throw errorHttp(400, 'mensajes_invalidos', 'Enviá al menos un mensaje');
  return mensajes.slice(-MAX_MENSAJES).map(({ role, content }) => {
    if (!['user', 'assistant'].includes(role) || typeof content !== 'string') {
      throw errorHttp(400, 'mensajes_invalidos', 'Mensaje inválido');
    }
    return { role, content: content.slice(0, 1000) };
  });
}

export async function responderChat(db, { mensajes, contexto = {}, alFallarHerramienta }, llamarModelo = llamarOpenAI) {
  const conversacion = [{ role: 'system', content: instrucciones(contexto) }, ...sanear(mensajes)];
  const modelo = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta += 1) {
    const { choices } = await llamarModelo({ model: modelo, messages: conversacion, tools: HERRAMIENTAS });
    const mensaje = choices[0].message;
    if (!mensaje.tool_calls?.length) return { respuesta: mensaje.content ?? '' };
    conversacion.push(mensaje);
    for (const llamada of mensaje.tool_calls) {
      const resultado = resultadoDeHerramienta(db, llamada, contexto, alFallarHerramienta);
      conversacion.push({ role: 'tool', tool_call_id: llamada.id, content: JSON.stringify(resultado) });
    }
  }
  throw errorHttp(502, 'asistente_error', 'El asistente no pudo completar la consulta');
}
