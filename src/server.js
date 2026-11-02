import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { abrirBaseDeDatos } from './db.js';
import { rutasAuth } from './rutas-auth.js';
import { rutasComercio } from './rutas-comercio.js';
import { rutasPublicas } from './rutas-publicas.js';
import { rutasSalon } from './salon.js';
import { rutasImagenes, DIRECTORIO_SUBIDAS } from './imagenes.js';
import { rutasGeocodificar } from './geocodificar.js';
import { rutasEstadisticas } from './estadisticas.js';
import { rutasTrafico } from './trafico.js';
import { aplicarCabecerasDeSeguridad } from './seguridad.js';

const publico = fileURLToPath(new URL('../public', import.meta.url));

export function crearServidor({ db = abrirBaseDeDatos() } = {}) {
  mkdirSync(DIRECTORIO_SUBIDAS, { recursive: true });
  const secreto = process.env.SESSION_SECRET ?? randomBytes(32).toString('hex');
  const app = Fastify({
    bodyLimit: 4 * 1024 * 1024,
    trustProxy: process.env.TRUST_PROXY === '1',
    logger: { redact: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-monitor-token"]'] },
  });
  app.decorate('db', db);
  aplicarCabecerasDeSeguridad(app);
  rutasTrafico(app, { sal: secreto });
  app.register(fastifyCookie, { secret: secreto });
  app.register(fastifyRateLimit, { max: 300, timeWindow: '1 minute' });
  app.register(async (instancia) => rutasAuth(instancia));
  app.register(async (instancia) => rutasComercio(instancia));
  app.register(async (instancia) => rutasPublicas(instancia));
  app.register(async (instancia) => rutasSalon(instancia));
  app.register(async (instancia) => rutasImagenes(instancia));
  app.register(async (instancia) => rutasGeocodificar(instancia));
  app.register(async (instancia) => rutasEstadisticas(instancia));

  app.get('/api/salud', async () => ({ ok: true }));

  app.setErrorHandler((error, _req, reply) => {
    const status = error.statusCode ?? 500;
    const code = error.code ?? (status === 500 ? 'error_interno' : 'solicitud_invalida');
    const message = status === 500 ? 'Error interno del servidor' : error.message;
    if (status === 500) app.log.error(error);
    reply.status(status).send({ error: { code, message } });
  });

  app.register(fastifyStatic, { root: publico });
  app.register(fastifyStatic, { root: DIRECTORIO_SUBIDAS, prefix: '/uploads/', decorateReply: false, maxAge: '7d' });
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = crearServidor();
  const port = Number(process.env.PORT ?? 3000);
  app.listen({ port, host: process.env.HOST ?? '0.0.0.0' }).catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
}
