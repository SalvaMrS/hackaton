import { writeFile, access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { abrirBaseDeDatos } from '../src/db.js';
import { hashearPassword } from '../src/auth.js';
import { DIRECTORIO_SUBIDAS } from '../src/imagenes.js';

const ALTO_MAPA_CQW = 56.25;
const TODOS_LOS_DIAS = [0, 1, 2, 3, 4, 5, 6];
const FOTOS = {
  barberia: '1585747860715-2ba37e788b70', corte: '1622286342621-4bd786c2447c', barba: '1599351431202-1e0f0137899a', color: '1522337360788-8b13dee7a37e',
  restaurante: '1517248135467-4c7edcad34c4', terraza: '1559339352-11d035aa65de', degustacion: '1414235077428-338989a2e8c0', parrilla: '1544025162-d76694265947',
  cancha: '1431324155629-1a6deb1dec8d', pelota: '1574629810360-7efbbe195018', partido: '1560272564-c83b66b1ad12',
  clinica: '1519494026892-80bbd2d6fd0d', doctor: '1576091160399-112ba8d25d1d', dental: '1629909613654-28e377c37b09', control: '1505751172876-fa1923c5c528',
  pilates: '1518611012118-696072aa579a', yoga: '1544367567-0f2fcb009e0b', estiramiento: '1593810450967-f9c42742e326',
};

const plaza = (nombre, tipo, capacidad, forma, x, y, ancho, alto, color = '', descripcion = '') =>
  ({ nombre, tipo, capacidad, forma, x, y: (y / ALTO_MAPA_CQW) * 100, ancho, alto, color, descripcion });
const linea = (x1, y1, x2, y2) => ({ x1, y1, x2, y2 });
const perimetro = (huecoAbajo) => [
  linea(2, 3, 98, 3), linea(98, 3, 98, 97), linea(2, 3, 2, 97),
  ...(huecoAbajo ? [linea(2, 97, huecoAbajo[0], 97), linea(huecoAbajo[1], 97, 98, 97)] : [linea(2, 97, 98, 97)]),
];

const COMERCIOS = [
  {
    slug: 'futbol-5-la-terraza', nombre: 'Fútbol 5 La Terraza', rubro: 'cancha de fútbol 5', direccion: 'Bv. Oroño 2100, Rosario', telefono: '341 555 0404',
    lat: -32.9573, lng: -60.6508, foto: 'cancha', dias: TODOS_LOS_DIAS, horario: ['10:00', '23:00'],
    descripcion: 'Cuatro canchas de césped sintético con luz LED, quincho con parrilla y buffet.',
    servicios: [
      { nombre: 'Alquiler de cancha 1 hora', duracion: 60, precio: 2000000, tipo: 'Cancha', car: 'Césped sintético · hasta 10 jugadores', foto: 'pelota' },
      { nombre: 'Alquiler 1 hora y media', duracion: 90, precio: 2800000, tipo: 'Cancha', car: 'Incluye pelota y pecheras', foto: 'partido' },
      { nombre: 'Turno mañana', duracion: 60, precio: 2000000, oferta: 1400000, tipo: 'Cancha', car: 'Lunes a viernes antes de las 14', foto: 'cancha' },
      { nombre: 'Asado en el quincho', duracion: 150, precio: 3500000, tipo: 'Quincho', car: 'Parrilla libre para el grupo', foto: 'parrilla' },
    ],
    plazas: [
      plaza('Cancha 1', 'Cancha', 10, 'rectangulo', 27, 14, 31, 17, '#16a34a', 'Césped sintético. Techada.'),
      plaza('Cancha 2', 'Cancha', 10, 'rectangulo', 73, 14, 31, 17, '#16a34a', 'Césped sintético.'),
      plaza('Cancha 3', 'Cancha', 10, 'rectangulo', 27, 40, 31, 17, '#15803d', 'Césped sintético. Luz LED.'),
      plaza('Cancha 4', 'Cancha', 10, 'rectangulo', 73, 40, 31, 17, '#15803d', 'Césped sintético. Luz LED.'),
      plaza('Quincho', 'Quincho', 20, 'rectangulo', 50, 28, 12, 16, '#b45309', 'Parrilla, heladera y mesas largas.'),
      plaza('Buffet 1', 'Buffet', 6, 'circulo', 50, 8, 8, 8, '#f59e0b', 'Mesa del buffet.'),
      plaza('Buffet 2', 'Buffet', 6, 'circulo', 50, 47, 8, 8, '#f59e0b', 'Mesa del buffet.'),
    ],
    guias: [...perimetro([44, 56]), linea(4, 48, 41, 48), linea(59, 48, 96, 48)],
  },
  {
    slug: 'la-parrilla-del-puerto', nombre: 'La Parrilla del Puerto', rubro: 'restaurante', direccion: 'Av. Belgrano 300, Rosario', telefono: '341 555 0202',
    lat: -32.9468, lng: -60.6306, foto: 'restaurante', dias: [2, 3, 4, 5, 6, 0], horario: ['20:00', '23:30'],
    descripcion: 'Parrilla frente al río con salón, barra y terraza. Reservá tu mesa.',
    servicios: [
      { nombre: 'Mesa en el salón', duracion: 90, precio: 0, tipo: 'Mesa', car: 'Cena', foto: 'restaurante' },
      { nombre: 'Mesa en la terraza', duracion: 90, precio: 0, tipo: 'Terraza', car: 'Vista al río', foto: 'terraza' },
      { nombre: 'Cena en la barra', duracion: 60, precio: 0, tipo: 'Barra', car: 'Para dos o tres personas', foto: 'parrilla' },
      { nombre: 'Menú degustación', duracion: 120, precio: 3500000, oferta: 2900000, tipo: 'Mesa', car: 'Siete pasos con maridaje', foto: 'degustacion' },
    ],
    plazas: [
      ...[12, 26, 40, 54].map((x, i) => plaza(`Mesa ${i + 1}`, 'Mesa', 2, 'circulo', x, 10, 8, 8, '#fb923c')),
      ...[14, 32, 50].map((x, i) => plaza(`Mesa ${i + 5}`, 'Mesa', 4, 'rectangulo', x, 24, 10, 10, '#fdba74')),
      plaza('Mesa comunitaria', 'Mesa', 10, 'rectangulo', 30, 37, 30, 8, '#c2410c', 'Mesa larga para grupos.'),
      plaza('Mesa redonda', 'Mesa', 8, 'circulo', 54, 37, 12, 12, '#ea580c'),
      plaza('Barra', 'Barra', 6, 'rectangulo', 26, 49, 40, 5, '#78350f', 'Seis banquetas frente a la parrilla.'),
      plaza('Terraza 1', 'Terraza', 4, 'circulo', 80, 12, 9, 9, '#38bdf8', 'Junto a la baranda.'),
      plaza('Terraza 2', 'Terraza', 4, 'circulo', 80, 28, 9, 9, '#38bdf8'),
      plaza('Terraza 3', 'Terraza', 4, 'circulo', 80, 44, 9, 9, '#38bdf8'),
      plaza('Terraza 4', 'Terraza', 2, 'circulo', 92, 20, 7, 7, '#7dd3fc'),
      plaza('Terraza 5', 'Terraza', 2, 'circulo', 92, 36, 7, 7, '#7dd3fc'),
    ],
    guias: [...perimetro(), linea(69, 3, 69, 40), linea(69, 60, 69, 97)],
  },
  {
    slug: 'barberia-el-corte', nombre: 'Barbería El Corte', rubro: 'peluquería', direccion: 'Córdoba 1450, Rosario', telefono: '341 555 0101',
    lat: -32.9442, lng: -60.6505, foto: 'barberia', dias: [1, 2, 3, 4, 5, 6], horario: ['09:00', '19:00'],
    descripcion: 'Cortes clásicos y modernos, barba con toalla caliente y color. Sin esperas.',
    servicios: [
      { nombre: 'Corte', duracion: 30, precio: 800000, tipo: 'Sillón', car: 'Lavado incluido', foto: 'corte' },
      { nombre: 'Corte + barba', duracion: 45, precio: 1200000, oferta: 990000, tipo: 'Sillón', car: 'Toalla caliente', foto: 'barba' },
      { nombre: 'Color', duracion: 90, precio: 2500000, tipo: 'Cabina', car: 'Tintura a elección', foto: 'color' },
      { nombre: 'Lavado y brushing', duracion: 20, precio: 500000, tipo: 'Lavado', car: 'Masaje capilar' },
    ],
    plazas: [
      ...[14, 30, 46, 62].map((x, i) => plaza(`Sillón ${i + 1}`, 'Sillón', 1, 'rectangulo', x, 12, 8, 8, '#334155')),
      plaza('Lavado 1', 'Lavado', 1, 'circulo', 18, 33, 8, 6, '#0ea5e9'),
      plaza('Lavado 2', 'Lavado', 1, 'circulo', 34, 33, 8, 6, '#0ea5e9'),
      plaza('Cabina de color', 'Cabina', 1, 'rectangulo', 72, 34, 20, 10, '#a855f7', 'Reservado, con extractor.'),
    ],
    guias: [...perimetro(), linea(4, 22, 56, 22), linea(88, 3, 88, 60)],
  },
  {
    slug: 'consultorio-dra-lopez', nombre: 'Consultorio Dra. López', rubro: 'consultorio', direccion: 'Mitre 780, Rosario', telefono: '341 555 0303',
    lat: -32.9519, lng: -60.6393, foto: 'clinica', dias: [1, 2, 3, 4, 5], horario: ['08:00', '13:00'],
    descripcion: 'Clínica médica, controles y estudios. Atención con turno.',
    servicios: [
      { nombre: 'Consulta general', duracion: 30, precio: 1500000, tipo: 'Consultorio', car: 'Presencial', foto: 'doctor' },
      { nombre: 'Control', duracion: 15, precio: 800000, tipo: 'Consultorio', car: 'Con estudios previos', foto: 'control' },
      { nombre: 'Electrocardiograma', duracion: 20, precio: 1800000, oferta: 1400000, tipo: 'Estudios', car: 'Resultado en el día', foto: 'dental' },
    ],
    plazas: [
      plaza('Consultorio 1', 'Consultorio', 1, 'rectangulo', 18, 14, 24, 16, '#60a5fa'),
      plaza('Consultorio 2', 'Consultorio', 1, 'rectangulo', 46, 14, 24, 16, '#60a5fa'),
      plaza('Consultorio 3', 'Consultorio', 1, 'rectangulo', 74, 14, 24, 16, '#93c5fd'),
      plaza('Sala de estudios', 'Estudios', 1, 'rectangulo', 22, 42, 30, 12, '#34d399', 'Equipo de ECG y ecografía.'),
      plaza('Sala de procedimientos', 'Estudios', 1, 'rectangulo', 62, 42, 22, 12, '#6ee7b7'),
    ],
    guias: [...perimetro(), linea(3, 27, 97, 27), linea(3, 31, 97, 31)],
  },
  {
    slug: 'pilates-armonia', nombre: 'Estudio Pilates Armonía', rubro: 'pilates y yoga', direccion: 'Pellegrini 1220, Rosario', telefono: '341 555 0505',
    lat: -32.9631, lng: -60.6469, foto: 'pilates', dias: [1, 2, 3, 4, 5, 6], horario: ['07:00', '21:00'],
    descripcion: 'Clases de pilates reformer y yoga en grupos reducidos.',
    servicios: [
      { nombre: 'Clase de pilates reformer', duracion: 50, precio: 900000, tipo: 'Camilla', car: 'Grupos de hasta 8', foto: 'pilates' },
      { nombre: 'Primera clase de prueba', duracion: 50, precio: 900000, oferta: 0, tipo: 'Camilla', car: 'Para nuevos alumnos', foto: 'estiramiento' },
      { nombre: 'Yoga en la sala', duracion: 60, precio: 700000, tipo: 'Sala', car: 'Hasta 12 personas', foto: 'yoga' },
    ],
    plazas: [
      ...[16, 36, 56, 76].flatMap((x, columna) => [14, 42].map((y, fila) => plaza(`Camilla ${columna * 2 + fila + 1}`, 'Camilla', 1, 'rectangulo', x, y, 8, 19, columna % 2 ? '#c4b5fd' : '#a78bfa'))),
      plaza('Sala de yoga', 'Sala', 12, 'rectangulo', 91, 28, 12, 44, '#f9a8d4', 'Colchonetas y bloques.'),
    ],
    guias: [...perimetro(), linea(84, 3, 84, 97)],
  },
];

async function descargarFoto(clave, ancho) {
  const archivo = `demo-${clave}-${ancho}.jpg`;
  const destino = path.join(DIRECTORIO_SUBIDAS, archivo);
  try {
    await access(destino);
    return `/uploads/${archivo}`;
  } catch { /* no estaba descargada */ }
  try {
    const respuesta = await fetch(`https://images.unsplash.com/photo-${FOTOS[clave]}?auto=format&fit=crop&w=${ancho}&q=75`, { signal: AbortSignal.timeout(20_000) });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    await writeFile(destino, Buffer.from(await respuesta.arrayBuffer()));
    return `/uploads/${archivo}`;
  } catch (error) {
    console.warn(`Sin foto "${clave}": ${error.message}`);
    return '';
  }
}

function borrarComercio(db, slug) {
  const comercio = db.prepare('SELECT id FROM comercios WHERE slug = ?').get(slug);
  if (!comercio) return;
  for (const tabla of ['turnos', 'servicios', 'plazas', 'horarios', 'guias']) db.prepare(`DELETE FROM ${tabla} WHERE comercio_id = ?`).run(comercio.id);
  db.prepare('DELETE FROM usuarios WHERE comercio_id = ?').run(comercio.id);
  db.prepare('DELETE FROM comercios WHERE id = ?').run(comercio.id);
}

async function cargarComercio(db, comercio) {
  const portada = await descargarFoto(comercio.foto, 1400);
  const servicios = [];
  for (const servicio of comercio.servicios) servicios.push({ ...servicio, imagen: servicio.foto ? await descargarFoto(servicio.foto, 600) : '' });

  db.exec('BEGIN');
  const { lastInsertRowid: id } = db.prepare(
    'INSERT INTO comercios (slug, nombre, rubro, descripcion, direccion, telefono, lat, lng, imagen_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(comercio.slug, comercio.nombre, comercio.rubro, comercio.descripcion, comercio.direccion, comercio.telefono, comercio.lat, comercio.lng, portada);
  for (const s of servicios) {
    db.prepare(
      'INSERT INTO servicios (comercio_id, nombre, duracion_min, precio_centavos, caracteristicas, tipo_plaza, imagen_url, oferta, precio_oferta_centavos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(id, s.nombre, s.duracion, s.precio, s.car ?? '', s.tipo ?? '', s.imagen, s.oferta ? 1 : 0, s.oferta ?? 0);
  }
  for (const p of comercio.plazas) {
    db.prepare(
      'INSERT INTO plazas (comercio_id, nombre, tipo, capacidad, forma, ancho, alto, color, descripcion, pos_x, pos_y) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(id, p.nombre, p.tipo, p.capacidad, p.forma, p.ancho, p.alto, p.color, p.descripcion, p.x, p.y);
  }
  for (const g of comercio.guias) db.prepare('INSERT INTO guias (comercio_id, x1, y1, x2, y2) VALUES (?, ?, ?, ?, ?)').run(id, g.x1, g.y1, g.x2, g.y2);
  for (const dia of comercio.dias) db.prepare('INSERT INTO horarios (comercio_id, dia_semana, apertura, cierre) VALUES (?, ?, ?, ?)').run(id, dia, ...comercio.horario);
  db.prepare('INSERT INTO usuarios (comercio_id, email, nombre, password_hash) VALUES (?, ?, ?, ?)')
    .run(id, `${comercio.slug}@demo.com`, comercio.nombre, hashearPassword('demo1234'));
  db.exec('COMMIT');
}

const reiniciar = process.argv.includes('--reiniciar');
const db = abrirBaseDeDatos();
await mkdir(DIRECTORIO_SUBIDAS, { recursive: true });
for (const comercio of COMERCIOS) {
  if (db.prepare('SELECT 1 FROM comercios WHERE slug = ?').get(comercio.slug)) {
    if (!reiniciar) continue;
    borrarComercio(db, comercio.slug);
  }
  await cargarComercio(db, comercio);
  console.log(`+ ${comercio.nombre}`);
}
console.log('Demo lista. Usuarios: <slug>@demo.com / demo1234');
