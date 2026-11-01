import { errorHttp } from './auth.js';

const URL_NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const TIMEOUT_MS = 8_000;
const MAX_CONSULTAS_POR_MINUTO = 12;
const MAX_LARGO_CONSULTA = 150;
const CACHE_MAXIMO = 500;
const cache = new Map();

async function buscarEnNominatim(consulta) {
  const parametros = new URLSearchParams({ format: 'jsonv2', limit: '1', countrycodes: 'ar', q: consulta });
  const respuesta = await fetch(`${URL_NOMINATIM}?${parametros}`, {
    headers: { 'User-Agent': 'turnos-demo/1.0 (hackaton)', 'Accept-Language': 'es' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!respuesta.ok) throw errorHttp(502, 'geocodificacion_fallida', 'No pudimos consultar el mapa, probá de nuevo');
  const [resultado] = await respuesta.json();
  if (!resultado) throw errorHttp(404, 'direccion_no_encontrada', 'No encontramos esa dirección. Probá con calle, número y ciudad');
  return { lat: Number(resultado.lat), lng: Number(resultado.lon), nombre: resultado.display_name.split(',').slice(0, 3).join(',') };
}

export function rutasGeocodificar(app) {
  app.get('/api/geocodificar', { config: { rateLimit: { max: MAX_CONSULTAS_POR_MINUTO, timeWindow: '1 minute' } } }, async (req) => {
    const consulta = String(req.query.q ?? '').trim().slice(0, MAX_LARGO_CONSULTA);
    if (consulta.length < 3) throw errorHttp(400, 'consulta_invalida', 'Escribí al menos 3 letras de tu dirección o barrio');
    const clave = consulta.toLowerCase();
    if (!cache.has(clave)) {
      if (cache.size >= CACHE_MAXIMO) cache.delete(cache.keys().next().value);
      cache.set(clave, await buscarEnNominatim(consulta));
    }
    return cache.get(clave);
  });
}
