import { errorHttp, exigirUsuario, exigirComercio } from './auth.js';
import {
  textoRequerido, textoOpcional, enteroEnRango, coordenadaOpcional, hora, slugDesde,
} from './validacion.js';

function leerComercio(body) {
  return {
    nombre: textoRequerido(body.nombre, 'nombre', 80),
    rubro: textoRequerido(body.rubro, 'rubro', 40),
    descripcion: textoOpcional(body.descripcion, 'descripcion'),
    direccion: textoOpcional(body.direccion, 'direccion', 200),
    telefono: textoOpcional(body.telefono, 'telefono', 40),
    lat: coordenadaOpcional(body.lat, 'lat', 90),
    lng: coordenadaOpcional(body.lng, 'lng', 180),
  };
}

function leerServicio(body) {
  return {
    nombre: textoRequerido(body.nombre, 'nombre', 80),
    descripcion: textoOpcional(body.descripcion, 'descripcion'),
    caracteristicas: textoOpcional(body.caracteristicas, 'caracteristicas'),
    precio_centavos: enteroEnRango(body.precio_centavos ?? 0, 'precio_centavos', 0, 100_000_000),
    duracion_min: enteroEnRango(body.duracion_min, 'duracion_min', 5, 600),
    activo: body.activo === false || body.activo === 0 ? 0 : 1,
  };
}

function leerPlaza(body) {
  return {
    nombre: textoRequerido(body.nombre, 'nombre', 80),
    tipo: textoOpcional(body.tipo, 'tipo', 40),
    capacidad: enteroEnRango(body.capacidad ?? 1, 'capacidad', 1, 500),
    activo: body.activo === false || body.activo === 0 ? 0 : 1,
  };
}

function leerHorario(body) {
  const apertura = hora(body.apertura, 'apertura');
  const cierre = hora(body.cierre, 'cierre');
  if (apertura >= cierre) throw errorHttp(400, 'campo_invalido', 'apertura debe ser anterior al cierre');
  return { dia_semana: enteroEnRango(body.dia_semana, 'dia_semana', 0, 6), apertura, cierre };
}

function slugLibre(db, nombre) {
  const base = slugDesde(nombre) || 'comercio';
  for (let intento = 0; ; intento += 1) {
    const slug = intento === 0 ? base : `${base}-${intento + 1}`;
    if (!db.prepare('SELECT 1 FROM comercios WHERE slug = ?').get(slug)) return slug;
  }
}

function registrarCrud(app, { ruta, tabla, columnas, leer, orden }) {
  const { db } = app;
  const antes = { preHandler: exigirComercio(app) };
  const lista = columnas.join(', ');
  const marcas = columnas.map(() => '?').join(', ');
  const asignaciones = columnas.map((columna) => `${columna} = ?`).join(', ');
  const valores = (fila) => columnas.map((columna) => fila[columna]);

  const buscar = (req) => {
    const fila = db.prepare(`SELECT * FROM ${tabla} WHERE id = ? AND comercio_id = ?`)
      .get(Number(req.params.id), req.usuario.comercio_id);
    if (!fila) throw errorHttp(404, 'no_encontrado', 'No existe ese elemento');
    return fila;
  };

  app.get(ruta, antes, async (req) =>
    db.prepare(`SELECT * FROM ${tabla} WHERE comercio_id = ? ORDER BY ${orden}`).all(req.usuario.comercio_id));

  app.post(ruta, antes, async (req, reply) => {
    const fila = leer(req.body ?? {});
    const { lastInsertRowid } = db
      .prepare(`INSERT INTO ${tabla} (comercio_id, ${lista}) VALUES (?, ${marcas})`)
      .run(req.usuario.comercio_id, ...valores(fila));
    return reply.status(201).send({ id: Number(lastInsertRowid), ...fila });
  });

  app.put(`${ruta}/:id`, antes, async (req) => {
    const existente = buscar(req);
    const fila = leer(req.body ?? {});
    db.prepare(`UPDATE ${tabla} SET ${asignaciones} WHERE id = ?`).run(...valores(fila), existente.id);
    return { id: existente.id, ...fila };
  });

  app.delete(`${ruta}/:id`, antes, async (req, reply) => {
    const existente = buscar(req);
    try {
      db.prepare(`DELETE FROM ${tabla} WHERE id = ?`).run(existente.id);
    } catch {
      throw errorHttp(409, 'en_uso', 'Tiene turnos asociados: desactivalo en lugar de borrarlo');
    }
    return reply.status(204).send();
  });
}

export function rutasComercio(app) {
  const { db } = app;

  app.post('/api/comercio', { preHandler: exigirUsuario(app) }, async (req, reply) => {
    if (req.usuario.comercio_id) throw errorHttp(409, 'comercio_existente', 'Ya tenés un comercio');
    const datos = leerComercio(req.body ?? {});
    const slug = slugLibre(db, datos.nombre);
    const { lastInsertRowid } = db
      .prepare('INSERT INTO comercios (slug, nombre, rubro, descripcion, direccion, telefono, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(slug, datos.nombre, datos.rubro, datos.descripcion, datos.direccion, datos.telefono, datos.lat, datos.lng);
    db.prepare('UPDATE usuarios SET comercio_id = ? WHERE id = ?').run(lastInsertRowid, req.usuario.id);
    return reply.status(201).send({ id: Number(lastInsertRowid), slug, ...datos });
  });

  app.get('/api/comercio', { preHandler: exigirComercio(app) }, async (req) =>
    db.prepare('SELECT * FROM comercios WHERE id = ?').get(req.usuario.comercio_id));

  app.put('/api/comercio', { preHandler: exigirComercio(app) }, async (req) => {
    const datos = leerComercio(req.body ?? {});
    db.prepare('UPDATE comercios SET nombre = ?, rubro = ?, descripcion = ?, direccion = ?, telefono = ?, lat = ?, lng = ? WHERE id = ?')
      .run(datos.nombre, datos.rubro, datos.descripcion, datos.direccion, datos.telefono, datos.lat, datos.lng, req.usuario.comercio_id);
    return db.prepare('SELECT * FROM comercios WHERE id = ?').get(req.usuario.comercio_id);
  });

  registrarCrud(app, {
    ruta: '/api/servicios', tabla: 'servicios', orden: 'nombre', leer: leerServicio,
    columnas: ['nombre', 'descripcion', 'caracteristicas', 'precio_centavos', 'duracion_min', 'activo'],
  });
  registrarCrud(app, {
    ruta: '/api/plazas', tabla: 'plazas', orden: 'nombre', leer: leerPlaza,
    columnas: ['nombre', 'tipo', 'capacidad', 'activo'],
  });
  registrarCrud(app, {
    ruta: '/api/horarios', tabla: 'horarios', orden: 'dia_semana, apertura', leer: leerHorario,
    columnas: ['dia_semana', 'apertura', 'cierre'],
  });
}
