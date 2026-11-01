import { errorHttp } from './auth.js';
import { coordenadaOpcional } from './validacion.js';

const RADIO_TIERRA_KM = 6371;

function distanciaKm(origen, destino) {
  const aRadianes = (grados) => (grados * Math.PI) / 180;
  const dLat = aRadianes(destino.lat - origen.lat);
  const dLng = aRadianes(destino.lng - origen.lng);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(aRadianes(origen.lat)) * Math.cos(aRadianes(destino.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.sqrt(a));
}

export function buscarComercioPorSlug(db, slug) {
  const comercio = db.prepare('SELECT * FROM comercios WHERE slug = ?').get(slug);
  if (!comercio) throw errorHttp(404, 'comercio_no_encontrado', 'No existe ese comercio');
  return comercio;
}

export function detalleComercio(db, slug) {
  const comercio = buscarComercioPorSlug(db, slug);
  return {
    ...comercio,
    capacidad_maxima: db.prepare('SELECT COALESCE(MAX(capacidad), 0) AS maxima FROM plazas WHERE comercio_id = ? AND activo = 1').get(comercio.id).maxima,
    servicios: db.prepare('SELECT id, nombre, descripcion, caracteristicas, precio_centavos, duracion_min, imagen_url, oferta, precio_oferta_centavos FROM servicios WHERE comercio_id = ? AND activo = 1 ORDER BY oferta DESC, nombre').all(comercio.id),
    horarios: db.prepare('SELECT dia_semana, apertura, cierre FROM horarios WHERE comercio_id = ? ORDER BY dia_semana, apertura').all(comercio.id),
  };
}

export const normalizar = (texto) => String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const PALABRAS_VACIAS = new Set(['de', 'del', 'el', 'la', 'los', 'las', 'un', 'una', 'para', 'en', 'con', 'y', 'o', 'a', 'mi', 'que', 'quiero', 'necesito', 'busco', 'turno', 'hoy', 'manana']);
const SINONIMOS = {
  pelo: 'peluquer barber corte', pelu: 'peluquer barber', cortar: 'corte', barba: 'barber', auto: 'taller lavadero gomeria', coche: 'taller lavadero gomeria',
  mecanic: 'taller', neumatic: 'gomeria', rueda: 'gomeria', lavar: 'lavadero', comer: 'restaurante', cenar: 'restaurante', almorzar: 'restaurante',
  perro: 'veterinaria', gato: 'veterinaria', mascota: 'veterinaria', masaje: 'spa', relaj: 'spa', futbol: 'cancha', fulbol: 'cancha', medico: 'consultorio',
  doctor: 'consultorio', doctora: 'consultorio', salud: 'consultorio', program: 'software', web: 'software', desarroll: 'software', gimnasia: 'pilates yoga', yoga: 'pilates',
};

function palabrasDeBusqueda(consulta) {
  return normalizar(consulta).split(/\s+/).filter((palabra) => palabra && !PALABRAS_VACIAS.has(palabra)).map((palabra) => palabra.replace(/s$/, ''));
}

function puntaje(comercio, consulta) {
  const palabras = palabrasDeBusqueda(consulta);
  if (!palabras.length) return 1;
  const texto = normalizar(`${comercio.nombre} ${comercio.rubro} ${comercio.servicios ?? ''}`);
  return palabras.reduce((total, palabra) => {
    const sinonimos = Object.entries(SINONIMOS).filter(([clave]) => palabra.startsWith(clave)).flatMap(([, valores]) => valores.split(' '));
    const alternativas = [palabra, ...sinonimos];
    return total + (alternativas.some((alternativa) => texto.includes(alternativa)) ? 1 : 0);
  }, 0);
}

function coincide(comercio, { rubro }) {
  return !rubro || normalizar(comercio.rubro) === normalizar(rubro);
}

export function listarComercios(db, { q, rubro, lat, lng }) {
  const origen = lat != null && lng != null
    ? { lat: coordenadaOpcional(lat, 'lat', 90), lng: coordenadaOpcional(lng, 'lng', 180) }
    : null;
  const filas = db.prepare(
    `SELECT c.*, (SELECT group_concat(s.nombre, ', ') FROM servicios s WHERE s.comercio_id = c.id AND s.activo = 1) AS servicios
     FROM comercios c`,
  ).all().filter((fila) => coincide(fila, { rubro })).map((fila) => ({ ...fila, relevancia: puntaje(fila, q) })).filter(({ relevancia }) => relevancia > 0);

  const conDistancia = filas.map((fila) => ({
    ...fila,
    distancia_km: origen && fila.lat != null && fila.lng != null ? Number(distanciaKm(origen, fila).toFixed(2)) : null,
  }));
  return conDistancia.sort((a, b) => b.relevancia - a.relevancia || (a.distancia_km ?? Infinity) - (b.distancia_km ?? Infinity) || a.nombre.localeCompare(b.nombre));
}
