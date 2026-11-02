import { createHash, timingSafeEqual } from 'node:crypto';
import { errorHttp } from './auth.js';

const RETENCION_DIAS = 30;
const EXTENSIONES_ESTATICAS = /\.(?:js|css|jpe?g|png|svg|ico|webp|woff2?)$/;
const MAX_CONSULTA = 120;

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS trafico (
  id INTEGER PRIMARY KEY,
  momento TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metodo TEXT NOT NULL,
  ruta TEXT NOT NULL,
  estado INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  visitante TEXT NOT NULL,
  agente TEXT NOT NULL DEFAULT '',
  busqueda TEXT,
  rubro TEXT
);
CREATE INDEX IF NOT EXISTS trafico_momento ON trafico(momento);
`;

const rutaNormalizada = (url) => url.split('?')[0].replace(/\/comercios\/[^/]+/, '/comercios/:slug').replace(/\/\d+/g, '/:id');

const compararToken = (recibido, esperado) => {
  const a = Buffer.from(String(recibido ?? ''));
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
};

export function rutasTrafico(app, { sal, token = process.env.MONITOR_TOKEN } = {}) {
  const { db } = app;
  db.exec(ESQUEMA);
  const insertar = db.prepare(
    'INSERT INTO trafico (metodo, ruta, estado, ms, visitante, agente, busqueda, rubro) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const visitante = (ip) => createHash('sha256').update(`${sal}${ip}`).digest('hex').slice(0, 12);

  app.addHook('onResponse', async (req, reply) => {
    const ruta = req.url.split('?')[0];
    if (ruta.startsWith('/api/monitor') || ruta === '/api/salud' || EXTENSIONES_ESTATICAS.test(ruta)) return;
    const { q, rubro } = req.query ?? {};
    try {
      insertar.run(
        req.method, rutaNormalizada(req.url), reply.statusCode, Math.round(reply.elapsedTime), visitante(req.ip),
        String(req.headers['user-agent'] ?? '').slice(0, 160),
        typeof q === 'string' && q.trim() ? q.trim().slice(0, MAX_CONSULTA) : null,
        typeof rubro === 'string' && rubro ? rubro.slice(0, 40) : null,
      );
    } catch (error) {
      req.log.warn({ error: error.message }, 'no se pudo registrar el tráfico');
    }
  });

  const limpiar = () => db.prepare(`DELETE FROM trafico WHERE momento < datetime('now', ?)`).run(`-${RETENCION_DIAS} days`);
  limpiar();
  const temporizador = setInterval(limpiar, 6 * 60 * 60 * 1000);
  temporizador.unref();

  app.get('/api/monitor/resumen', async (req) => {
    if (!token || !compararToken(req.headers['x-monitor-token'], token)) throw errorHttp(404, 'no_encontrado', 'No encontrado');
    const horas = Math.min(Math.max(Number(req.query.horas) || 24, 1), RETENCION_DIAS * 24);
    const desde = `-${horas} hours`;
    const consultar = (sql) => db.prepare(sql).all(desde);
    return {
      horas,
      totales: db.prepare(
        `SELECT count(*) AS pedidos, count(DISTINCT visitante) AS visitantes,
                sum(estado >= 500) AS errores_5xx, sum(estado BETWEEN 400 AND 499) AS errores_4xx,
                sum(estado = 429) AS limitados, round(avg(ms), 1) AS ms_promedio
         FROM trafico WHERE momento >= datetime('now', ?)`).get(desde),
      busquedas: consultar(`SELECT busqueda, count(*) AS veces FROM trafico WHERE busqueda IS NOT NULL AND momento >= datetime('now', ?) GROUP BY busqueda ORDER BY veces DESC LIMIT 15`),
      rubros: consultar(`SELECT rubro, count(*) AS veces FROM trafico WHERE rubro IS NOT NULL AND momento >= datetime('now', ?) GROUP BY rubro ORDER BY veces DESC LIMIT 10`),
      rutas: consultar(`SELECT metodo, ruta, count(*) AS veces, round(avg(ms), 1) AS ms FROM trafico WHERE momento >= datetime('now', ?) GROUP BY metodo, ruta ORDER BY veces DESC LIMIT 15`),
      porHora: consultar(`SELECT substr(momento, 1, 13) AS hora, count(*) AS pedidos FROM trafico WHERE momento >= datetime('now', ?) GROUP BY hora ORDER BY hora`),
      sospechosos: consultar(`SELECT visitante, count(*) AS pedidos, sum(estado IN (401, 403)) AS rechazos, sum(estado = 404) AS no_encontrados, sum(estado = 429) AS limitados, max(agente) AS agente
                              FROM trafico WHERE momento >= datetime('now', ?) GROUP BY visitante
                              HAVING rechazos >= 5 OR no_encontrados >= 15 OR limitados >= 1 ORDER BY pedidos DESC LIMIT 10`),
    };
  });
}
