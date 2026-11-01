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
    servicios: db.prepare('SELECT id, nombre, descripcion, caracteristicas, precio_centavos, duracion_min FROM servicios WHERE comercio_id = ? AND activo = 1 ORDER BY nombre').all(comercio.id),
    horarios: db.prepare('SELECT dia_semana, apertura, cierre FROM horarios WHERE comercio_id = ? ORDER BY dia_semana, apertura').all(comercio.id),
  };
}

export function listarComercios(db, { q, rubro, lat, lng }) {
  const origen = lat != null && lng != null
    ? { lat: coordenadaOpcional(lat, 'lat', 90), lng: coordenadaOpcional(lng, 'lng', 180) }
    : null;
  const patron = `%${(q ?? '').toLowerCase()}%`;
  const filas = db.prepare(
    `SELECT c.*, (SELECT group_concat(s.nombre, ', ') FROM servicios s WHERE s.comercio_id = c.id AND s.activo = 1) AS servicios
     FROM comercios c
     WHERE (? = '' OR c.rubro = ?)
       AND (lower(c.nombre) LIKE ? OR lower(c.rubro) LIKE ? OR EXISTS (
         SELECT 1 FROM servicios s WHERE s.comercio_id = c.id AND s.activo = 1 AND lower(s.nombre) LIKE ?))`,
  ).all(rubro ?? '', rubro ?? '', patron, patron, patron);

  const conDistancia = filas.map((fila) => ({
    ...fila,
    distancia_km: origen && fila.lat != null && fila.lng != null ? Number(distanciaKm(origen, fila).toFixed(2)) : null,
  }));
  return conDistancia.sort((a, b) => (a.distancia_km ?? Infinity) - (b.distancia_km ?? Infinity) || a.nombre.localeCompare(b.nombre));
}
