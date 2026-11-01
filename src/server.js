import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import fastifyCookie from '@fastify/cookie';
import { randomBytes } from 'node:crypto';
import { abrirBaseDeDatos } from './db.js';
import { rutasAuth } from './rutas-auth.js';
import { rutasComercio } from './rutas-comercio.js';
import { rutasPublicas } from './rutas-publicas.js';

const publico = fileURLToPath(new URL('../public', import.meta.url));

export function crearServidor({ db = abrirBaseDeDatos() } = {}) {
  const app = Fastify({ logger: { redact: ['req.headers.cookie', 'req.headers.authorization'] } });
  app.decorate('db', db);
  app.register(fastifyCookie, { secret: process.env.SESSION_SECRET ?? randomBytes(32).toString('hex') });
  app.register(async (instancia) => rutasAuth(instancia));
  app.register(async (instancia) => rutasComercio(instancia));
  app.register(async (instancia) => rutasPublicas(instancia));

  app.get('/api/salud', async () => ({ ok: true }));

  app.setErrorHandler((error, _req, reply) => {
    const status = error.statusCode ?? 500;
    const code = error.code ?? (status === 500 ? 'error_interno' : 'solicitud_invalida');
    const message = status === 500 ? 'Error interno del servidor' : error.message;
    if (status === 500) app.log.error(error);
    reply.status(status).send({ error: { code, message } });
  });

  app.register(fastifyStatic, { root: publico });
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = crearServidor();
  const port = Number(process.env.PORT ?? 3000);
  app.listen({ port, host: '0.0.0.0' }).catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
}
