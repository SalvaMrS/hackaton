import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const COOKIE = 'sesion';
const DURACION_SEGUNDOS = 60 * 60 * 24 * 7;

export function errorHttp(status, code, message) {
  return Object.assign(new Error(message), { statusCode: status, code });
}

export function hashearPassword(password) {
  const sal = randomBytes(16);
  const hash = scryptSync(password, sal, 64);
  return `${sal.toString('hex')}:${hash.toString('hex')}`;
}

export function verificarPassword(password, almacenado) {
  const [sal, hash] = almacenado.split(':');
  const esperado = Buffer.from(hash, 'hex');
  const obtenido = scryptSync(password, Buffer.from(sal, 'hex'), esperado.length);
  return timingSafeEqual(esperado, obtenido);
}

export function iniciarSesion(reply, usuarioId) {
  reply.setCookie(COOKIE, String(usuarioId), {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: DURACION_SEGUNDOS,
  });
}

export function cerrarSesion(reply) {
  reply.clearCookie(COOKIE, { path: '/' });
}

export function usuarioActual(app, req) {
  const firmada = req.cookies[COOKIE];
  if (!firmada) return null;
  const { valid, value } = req.unsignCookie(firmada);
  if (!valid) return null;
  return app.db.prepare('SELECT id, comercio_id, email, nombre FROM usuarios WHERE id = ?').get(Number(value)) ?? null;
}

export function exigirUsuario(app) {
  return async (req) => {
    const usuario = usuarioActual(app, req);
    if (!usuario) throw errorHttp(401, 'no_autenticado', 'Iniciá sesión para continuar');
    req.usuario = usuario;
  };
}

export function exigirComercio(app) {
  const exigir = exigirUsuario(app);
  return async (req) => {
    await exigir(req);
    if (!req.usuario.comercio_id) throw errorHttp(403, 'sin_comercio', 'Primero creá tu comercio');
  };
}
