import { errorHttp } from './auth.js';
import { ahoraLocal, calcularDisponibilidad, reservarTurno } from './turnos.js';
import { listarComercios, detalleComercio } from './comercios.js';

const URL_OPENAI = 'https://api.openai.com/v1/chat/completions';
const TIMEOUT_MS = 20_000;
const INTENTOS = 3;
const MAX_VUELTAS = 5;
const MAX_MENSAJES = 20;
const MAX_FRANJAS_MOSTRADAS = 12;

const HERRAMIENTAS = [
  {
    name: 'buscar_comercios',
    description: 'Busca comercios por texto (nombre, rubro o servicio); con texto vacío lista todos. Devuelve slug, rubro, servicios y distancia si se conoce la ubicación.',
    parameters: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'] },
  },
  {
    name: 'ver_comercio',
    description: 'Devuelve servicios con precio y duración, y horarios de un comercio.',
    parameters: { type: 'object', properties: { slug: { type: 'string' } }, required: ['slug'] },
  },
  {
    name: 'ver_disponibilidad',
    description: 'Lista los horarios libres de un servicio en una fecha.',
    parameters: {
      type: 'object',
      properties: { slug: { type: 'string' }, servicio_id: { type: 'integer' }, fecha: { type: 'string', description: 'AAAA-MM-DD' }, personas: { type: 'integer' } },
      required: ['slug', 'servicio_id', 'fecha'],
    },
  },
  {
    name: 'reservar',
    description: 'Reserva un turno. Solo llamar cuando el cliente confirmó servicio, horario y nombre.',
    parameters: {
      type: 'object',
      properties: {
        slug: { type: 'string' }, servicio_id: { type: 'integer' }, inicio: { type: 'string', description: 'AAAA-MM-DDTHH:MM' },
        personas: { type: 'integer' }, cliente_nombre: { type: 'string' }, cliente_telefono: { type: 'string' },
      },
      required: ['slug', 'servicio_id', 'inicio', 'cliente_nombre'],
    },
  },
].map((funcion) => ({ type: 'function', function: funcion }));

function instrucciones(contexto) {
  const ubicacion = contexto.lat != null ? `Ubicación del cliente: ${contexto.lat}, ${contexto.lng}.` : 'No se conoce la ubicación del cliente.';
  const foco = contexto.slug ? `El cliente está viendo el comercio "${contexto.slug}"; usalo por defecto.` : '';
  return [
    'Sos el asistente de turnos de una plataforma de reservas para comercios. Respondé en español rioplatense, breve y amable.',
    `Ahora es ${ahoraLocal().replace('T', ' ')} (hora de Argentina). ${ubicacion} ${foco}`,
    'Usá siempre las herramientas para precios, horarios y disponibilidad: nunca inventes datos.',
    'Los precios vienen en centavos de pesos argentinos: dividilos por 100 y mostralos como $ con separador de miles. Un servicio con oferta=1 está en oferta: informá el precio normal y el de oferta (precio_oferta_centavos).',
    'Si buscar_comercios no devuelve resultados, probá con una palabra más corta o con texto vacío para listar todos antes de decir que no hay.',
    'Antes de reservar confirmá servicio, fecha y hora, cantidad de personas si aplica, y a nombre de quién va. Si reservar falla porque falta iniciar sesión, pedile que ingrese desde la página y vuelva a intentar. Al reservar, informá la plaza asignada y el horario.',
    'Si no podés resolver algo, decí que el cliente puede llamar o escribir al comercio.',
  ].join('\n');
}

function ejecutarHerramienta(db, nombre, argumentos, contexto) {
  switch (nombre) {
    case 'buscar_comercios':
      return listarComercios(db, { q: argumentos.texto, lat: contexto.lat, lng: contexto.lng })
        .slice(0, 5)
        .map(({ slug, nombre: comercio, rubro, direccion, servicios, distancia_km: distancia }) => ({ slug, nombre: comercio, rubro, direccion, servicios, distancia_km: distancia }));
    case 'ver_comercio':
      return detalleComercio(db, argumentos.slug);
    case 'ver_disponibilidad': {
      const comercio = detalleComercio(db, argumentos.slug);
      return calcularDisponibilidad(db, {
        comercioId: comercio.id, servicioId: argumentos.servicio_id, fecha: argumentos.fecha, personas: argumentos.personas ?? 1,
      }).slice(0, MAX_FRANJAS_MOSTRADAS).map(({ inicio }) => inicio);
    }
    case 'reservar': {
      if (!contexto.usuarioId) return { error: 'El cliente debe iniciar sesión en la página para poder reservar' };
      const comercio = detalleComercio(db, argumentos.slug);
      return reservarTurno(db, {
        usuarioId: contexto.usuarioId, comercioId: comercio.id, servicioId: argumentos.servicio_id, inicio: argumentos.inicio, personas: argumentos.personas ?? 1,
        clienteNombre: argumentos.cliente_nombre, clienteTelefono: argumentos.cliente_telefono ?? '',
      });
    }
    default:
      throw new Error(`Herramienta desconocida: ${nombre}`);
  }
}

function resultadoDeHerramienta(db, llamada, contexto) {
  try {
    const argumentos = JSON.parse(llamada.function.arguments || '{}');
    return ejecutarHerramienta(db, llamada.function.name, argumentos, contexto);
  } catch (error) {
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

export async function responderChat(db, { mensajes, contexto = {} }, llamarModelo = llamarOpenAI) {
  const conversacion = [{ role: 'system', content: instrucciones(contexto) }, ...sanear(mensajes)];
  const modelo = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta += 1) {
    const { choices } = await llamarModelo({ model: modelo, messages: conversacion, tools: HERRAMIENTAS });
    const mensaje = choices[0].message;
    if (!mensaje.tool_calls?.length) return { respuesta: mensaje.content ?? '' };
    conversacion.push(mensaje);
    for (const llamada of mensaje.tool_calls) {
      const resultado = resultadoDeHerramienta(db, llamada, contexto);
      conversacion.push({ role: 'tool', tool_call_id: llamada.id, content: JSON.stringify(resultado) });
    }
  }
  throw errorHttp(502, 'asistente_error', 'El asistente no pudo completar la consulta');
}
