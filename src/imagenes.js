import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { errorHttp, exigirComercio } from './auth.js';

const TIPOS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const MAX_BYTES = 2 * 1024 * 1024;
const DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;

export const DIRECTORIO_SUBIDAS = path.resolve(process.env.UPLOAD_DIR ?? 'uploads');

export function rutasImagenes(app) {
  app.post('/api/imagenes', { preHandler: exigirComercio(app) }, async (req, reply) => {
    const coincidencia = DATA_URL.exec(req.body?.imagen ?? '');
    if (!coincidencia) throw errorHttp(400, 'imagen_invalida', 'Subí una imagen PNG, JPG o WEBP');
    const contenido = Buffer.from(coincidencia[2], 'base64');
    if (contenido.length > MAX_BYTES) throw errorHttp(413, 'imagen_grande', 'La imagen no puede superar 2 MB');

    const archivo = `${randomBytes(12).toString('hex')}.${TIPOS[coincidencia[1]]}`;
    await mkdir(DIRECTORIO_SUBIDAS, { recursive: true });
    await writeFile(path.join(DIRECTORIO_SUBIDAS, archivo), contenido);
    return reply.status(201).send({ url: `/uploads/${archivo}` });
  });
}
