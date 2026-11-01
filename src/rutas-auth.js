import { randomBytes } from 'node:crypto';
import { errorHttp, hashearPassword, verificarPassword, iniciarSesion, cerrarSesion, usuarioActual } from './auth.js';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DESTINO_PERMITIDO = /^(\/panel\.html|\/\?c=[a-z0-9-]+)$/;
const GOOGLE_AUTORIZAR = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';

function validarCredenciales({ email, password }) {
  if (typeof email !== 'string' || !EMAIL.test(email)) throw errorHttp(400, 'email_invalido', 'Email inválido');
  if (typeof password !== 'string' || password.length < 6) {
    throw errorHttp(400, 'password_corta', 'La contraseña debe tener al menos 6 caracteres');
  }
}

function googleHabilitado() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
}

async function canjearCodigoGoogle(codigo) {
  const respuesta = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    body: new URLSearchParams({
      code: codigo,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  if (!respuesta.ok) throw errorHttp(502, 'google_rechazo', 'Google rechazó el inicio de sesión');
  const { id_token: idToken } = await respuesta.json();
  // El token llega directo de Google por TLS, por eso no se verifica la firma.
  return JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString());
}

function buscarOCrearUsuarioGoogle(db, { sub, email, name }) {
  const existente = db.prepare('SELECT id FROM usuarios WHERE google_sub = ? OR email = ?').get(sub, email);
  if (existente) {
    db.prepare('UPDATE usuarios SET google_sub = ? WHERE id = ?').run(sub, existente.id);
    return existente.id;
  }
  const { lastInsertRowid } = db
    .prepare('INSERT INTO usuarios (email, nombre, google_sub) VALUES (?, ?, ?)')
    .run(email, name ?? '', sub);
  return Number(lastInsertRowid);
}

export function rutasAuth(app) {
  const { db } = app;

  app.post('/api/auth/registro', async (req, reply) => {
    validarCredenciales(req.body ?? {});
    const { email, password, nombre = '' } = req.body;
    if (db.prepare('SELECT 1 FROM usuarios WHERE email = ?').get(email)) {
      throw errorHttp(409, 'email_en_uso', 'Ya existe una cuenta con ese email');
    }
    const { lastInsertRowid } = db
      .prepare('INSERT INTO usuarios (email, nombre, password_hash) VALUES (?, ?, ?)')
      .run(email, nombre, hashearPassword(password));
    iniciarSesion(reply, lastInsertRowid);
    return reply.status(201).send({ ok: true });
  });

  app.post('/api/auth/login', async (req, reply) => {
    validarCredenciales(req.body ?? {});
    const { email, password } = req.body;
    const usuario = db.prepare('SELECT id, password_hash FROM usuarios WHERE email = ?').get(email);
    if (!usuario?.password_hash || !verificarPassword(password, usuario.password_hash)) {
      throw errorHttp(401, 'credenciales_invalidas', 'Email o contraseña incorrectos');
    }
    iniciarSesion(reply, usuario.id);
    return { ok: true };
  });

  app.post('/api/auth/salir', async (_req, reply) => {
    cerrarSesion(reply);
    return { ok: true };
  });

  app.get('/api/yo', async (req) => {
    const usuario = usuarioActual(app, req);
    return { usuario, googleHabilitado: googleHabilitado() };
  });

  app.get('/api/auth/google', async (req, reply) => {
    if (!googleHabilitado()) throw errorHttp(404, 'google_deshabilitado', 'Google no está configurado');
    const estado = randomBytes(16).toString('hex');
    const destino = DESTINO_PERMITIDO.test(req.query.destino ?? '') ? req.query.destino : '/';
    reply.setCookie('oauth_destino', destino, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600 });
    reply.setCookie('oauth_estado', estado, { signed: true, httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600 });
    const parametros = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      state: estado,
    });
    return reply.redirect(`${GOOGLE_AUTORIZAR}?${parametros}`);
  });

  app.get('/auth/google/callback', async (req, reply) => {
    const firmada = req.cookies.oauth_estado;
    const { valid, value } = firmada ? req.unsignCookie(firmada) : { valid: false };
    if (!valid || value !== req.query.state || !req.query.code) {
      throw errorHttp(400, 'estado_invalido', 'Inicio de sesión con Google inválido');
    }
    const perfil = await canjearCodigoGoogle(req.query.code);
    iniciarSesion(reply, buscarOCrearUsuarioGoogle(db, perfil));
    reply.clearCookie('oauth_estado', { path: '/' });
    reply.clearCookie('oauth_destino', { path: '/' });
    return reply.redirect(DESTINO_PERMITIDO.test(req.cookies.oauth_destino ?? '') ? req.cookies.oauth_destino : '/');
  });
}
