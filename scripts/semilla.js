import { abrirBaseDeDatos } from '../src/db.js';
import { hashearPassword } from '../src/auth.js';

const COMERCIOS = [
  {
    slug: 'barberia-el-corte', nombre: 'Barbería El Corte', rubro: 'peluquería', direccion: 'Córdoba 1450, Rosario', telefono: '341 555 0101',
    lat: -32.9442, lng: -60.6505, descripcion: 'Cortes clásicos y modernos, sin esperas.',
    servicios: [['Corte', 30, 800000, 'Lavado incluido'], ['Corte + barba', 45, 1200000, 'Toalla caliente'], ['Color', 90, 2500000, 'Tintura a elección']],
    plazas: [['Sillón 1', 'Sillón', 1], ['Sillón 2', 'Sillón', 1]], dias: [1, 2, 3, 4, 5, 6], horario: ['09:00', '19:00'],
  },
  {
    slug: 'la-parrilla-del-puerto', nombre: 'La Parrilla del Puerto', rubro: 'restaurante', direccion: 'Av. Belgrano 300, Rosario', telefono: '341 555 0202',
    lat: -32.9468, lng: -60.6306, descripcion: 'Parrilla frente al río. Reservá tu mesa.',
    servicios: [['Reserva de mesa', 90, 0, 'Cena'], ['Menú degustación', 120, 3500000, 'Por persona']],
    plazas: [['Mesa 1', 'Mesa', 2], ['Mesa 2', 'Mesa', 4], ['Mesa 3', 'Mesa', 4], ['Mesa 4', 'Mesa', 8]], dias: [2, 3, 4, 5, 6, 0], horario: ['20:00', '23:30'],
  },
  {
    slug: 'consultorio-dra-lopez', nombre: 'Consultorio Dra. López', rubro: 'consultorio', direccion: 'Mitre 780, Rosario', telefono: '341 555 0303',
    lat: -32.9519, lng: -60.6393, descripcion: 'Clínica médica y controles.',
    servicios: [['Consulta general', 30, 1500000, 'Presencial'], ['Control', 15, 800000, 'Con estudios previos']],
    plazas: [['Consultorio 1', 'Consultorio', 1]], dias: [1, 2, 3, 4, 5], horario: ['08:00', '13:00'],
  },
];

const db = abrirBaseDeDatos();
db.exec('BEGIN');
for (const comercio of COMERCIOS) {
  if (db.prepare('SELECT 1 FROM comercios WHERE slug = ?').get(comercio.slug)) continue;
  const { lastInsertRowid: id } = db.prepare(
    'INSERT INTO comercios (slug, nombre, rubro, descripcion, direccion, telefono, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(comercio.slug, comercio.nombre, comercio.rubro, comercio.descripcion, comercio.direccion, comercio.telefono, comercio.lat, comercio.lng);
  for (const [nombre, duracion, precio, caracteristicas] of comercio.servicios) {
    db.prepare('INSERT INTO servicios (comercio_id, nombre, duracion_min, precio_centavos, caracteristicas) VALUES (?, ?, ?, ?, ?)').run(id, nombre, duracion, precio, caracteristicas);
  }
  for (const [nombre, tipo, capacidad] of comercio.plazas) {
    db.prepare('INSERT INTO plazas (comercio_id, nombre, tipo, capacidad) VALUES (?, ?, ?, ?)').run(id, nombre, tipo, capacidad);
  }
  for (const dia of comercio.dias) {
    db.prepare('INSERT INTO horarios (comercio_id, dia_semana, apertura, cierre) VALUES (?, ?, ?, ?)').run(id, dia, ...comercio.horario);
  }
  db.prepare('INSERT INTO usuarios (comercio_id, email, nombre, password_hash) VALUES (?, ?, ?, ?)')
    .run(id, `${comercio.slug}@demo.com`, comercio.nombre, hashearPassword('demo1234'));
}
db.exec('COMMIT');
console.log('Demo lista. Usuarios: <slug>@demo.com / demo1234');
