import { writeFile, access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { abrirBaseDeDatos } from '../src/db.js';
import { hashearPassword } from '../src/auth.js';
import { DIRECTORIO_SUBIDAS } from '../src/imagenes.js';
import { ahoraLocal, calcularDisponibilidad, reservarTurno } from '../src/turnos.js';

const ALTO_MAPA_CQW = 56.25;
const CLAVE_DE_PRUEBA = 'test123';
const CLIENTE_POR_DEFECTO = { nombre: 'Lucía Fernández', telefono: '+54 9 341 555 0100' };
const TODOS_LOS_DIAS = [0, 1, 2, 3, 4, 5, 6];
const FOTOS = {
  barberia: '1585747860715-2ba37e788b70', corte: '1622286342621-4bd786c2447c', barba: '1599351431202-1e0f0137899a', color: '1522337360788-8b13dee7a37e',
  restaurante: '1517248135467-4c7edcad34c4', terraza: '1559339352-11d035aa65de', degustacion: '1414235077428-338989a2e8c0', parrilla: '1544025162-d76694265947',
  cancha: '1431324155629-1a6deb1dec8d', pelota: '1574629810360-7efbbe195018', partido: '1560272564-c83b66b1ad12',
  clinica: '1519494026892-80bbd2d6fd0d', doctor: '1576091160399-112ba8d25d1d', dental: '1629909613654-28e377c37b09', control: '1505751172876-fa1923c5c528',
  pilates: '1518611012118-696072aa579a', yoga: '1544367567-0f2fcb009e0b', estiramiento: '1593810450967-f9c42742e326',
  taller: '1625047509248-ec889cbff17f', mecanico: '1619642751034-765dfdf7c58e', motor: '1486262715619-67b85e0b08d3',
  gomeria: '1530046339160-ce3e530c7d2f', neumatico: '1558618666-fcd25c85cd64',
  lavadero: '1520340356584-f9917d1eea6f', lavado: '1607860108855-64acf2078ed9', pulido: '1632823469850-2f77dd9c7f93',
  software: '1522071820081-009f0129c71c', codigo: '1461749280684-dccba630e2f6', laptop: '1498050108023-c5249f4df085', codigo2: '1555066931-4365d14bab8c',
  veterinaria: '1548199973-03cce0bbc87b', vet1: '1587300003388-59208cc962cb', vet2: '1583511655857-d19b40a7a54e', vet3: '1612536057832-2ff7ead58194',
  spa: '1544161515-4ab6ce6db874', masaje: '1600334129128-685c5582fd35', spa1: '1519823551278-64ac92734fb1', spa2: '1540555700478-4be289fbecef',
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
      plaza('Terraza 4', 'Terraza', 2, 'circulo', 92, 20, 8.5, 8.5, '#7dd3fc'),
      plaza('Terraza 5', 'Terraza', 2, 'circulo', 92, 36, 8.5, 8.5, '#7dd3fc'),
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
    guias: [...perimetro(), linea(4, 42, 56, 42), linea(88, 3, 88, 60)],
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
    guias: [...perimetro(), linea(3, 46, 97, 46), linea(3, 54, 97, 54)],
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
  {
    slug: 'taller-rapida-sur', nombre: 'Taller Mecánico Rápida Sur', rubro: 'taller mecánico', direccion: 'Av. San Martín 4300, Rosario', telefono: '341 555 0606',
    lat: -32.9712, lng: -60.6603, foto: 'taller', dias: [1, 2, 3, 4, 5, 6], horario: ['08:00', '18:00'],
    descripcion: 'Mecánica integral, service oficial, alineación y diagnóstico computarizado. Turnos sin demoras.',
    servicios: [
      { nombre: 'Cambio de aceite y filtro', duracion: 45, precio: 4500000, oferta: 3800000, tipo: 'Elevador', car: 'Aceite sintético y filtro incluidos', foto: 'mecanico' },
      { nombre: 'Alineación y balanceo', duracion: 60, precio: 3800000, tipo: 'Elevador', car: 'Las cuatro ruedas', foto: 'taller' },
      { nombre: 'Service completo', duracion: 180, precio: 12000000, tipo: 'Elevador', car: 'Frenos, filtros, aceite y revisión de 30 puntos', foto: 'motor' },
      { nombre: 'Inspección bajo el vehículo', duracion: 30, precio: 1500000, tipo: 'Fosa', car: 'Con informe escrito' },
      { nombre: 'Diagnóstico computarizado', duracion: 30, precio: 2500000, tipo: 'Diagnóstico', car: 'Lectura de fallas y mapa de sensores' },
      { nombre: 'Cambio de neumáticos', duracion: 40, precio: 2000000, tipo: 'Neumáticos', car: 'Colocación y balanceo' },
    ],
    plazas: [
      plaza('Elevador 1', 'Elevador', 1, 'rectangulo', 18, 12, 16, 11, '#64748b'), plaza('Elevador 2', 'Elevador', 1, 'rectangulo', 42, 12, 16, 11, '#64748b'),
      plaza('Elevador 3', 'Elevador', 1, 'rectangulo', 66, 12, 16, 11, '#64748b'),
      plaza('Fosa 1', 'Fosa', 1, 'rectangulo', 20, 32, 20, 7, '#334155'), plaza('Fosa 2', 'Fosa', 1, 'rectangulo', 46, 32, 20, 7, '#334155'),
      plaza('Box de diagnóstico', 'Diagnóstico', 1, 'circulo', 74, 34, 11, 11, '#0ea5e9'),
      plaza('Zona de neumáticos', 'Neumáticos', 1, 'rectangulo', 30, 47, 24, 8, '#a16207'),
    ],
    guias: [...perimetro(), linea(4, 41, 96, 41)],
  },
  {
    slug: 'gomeria-el-ruleman', nombre: 'Gomería y Lubricentro El Rulemán', rubro: 'gomería', direccion: 'Bv. Rondeau 1850, Rosario', telefono: '341 555 0707',
    lat: -32.9361, lng: -60.6702, foto: 'gomeria', dias: [1, 2, 3, 4, 5, 6], horario: ['08:00', '19:00'],
    descripcion: 'Neumáticos nuevos y usados, reparaciones, balanceo y lubricación. Colocación en el día.',
    servicios: [
      { nombre: 'Reparación de pinchadura', duracion: 20, precio: 600000, tipo: 'Puesto', car: 'Con parche y control de presión', foto: 'neumatico' },
      { nombre: 'Neumático 175/65 R14 con colocación', duracion: 30, precio: 8500000, tipo: 'Puesto', car: 'Producto con colocación y balanceo incluidos', foto: 'gomeria' },
      { nombre: 'Cambio de aceite', duracion: 30, precio: 3000000, tipo: 'Lubricación', car: 'Aceite 10W40 y filtro' },
      { nombre: 'Balanceo', duracion: 30, precio: 1200000, oferta: 990000, tipo: 'Balanceo', car: 'Por rueda, con contrapesos' },
    ],
    plazas: [
      plaza('Puesto 1', 'Puesto', 1, 'rectangulo', 18, 14, 18, 12, '#475569'), plaza('Puesto 2', 'Puesto', 1, 'rectangulo', 42, 14, 18, 12, '#475569'),
      plaza('Puesto 3', 'Puesto', 1, 'rectangulo', 66, 14, 18, 12, '#475569'),
      plaza('Lubricentro', 'Lubricación', 1, 'rectangulo', 28, 38, 28, 10, '#ca8a04', 'Foso con elevador.'),
      plaza('Balanceadora', 'Balanceo', 1, 'circulo', 66, 38, 11, 11, '#f59e0b'),
    ],
    guias: [...perimetro(), linea(4, 28, 96, 28)],
  },
  {
    slug: 'lavadero-burbuja', nombre: 'Lavadero Burbuja', rubro: 'lavadero de autos', direccion: 'Av. Pellegrini 2900, Rosario', telefono: '341 555 0808',
    lat: -32.9555, lng: -60.6811, foto: 'lavadero', dias: TODOS_LOS_DIAS, horario: ['09:00', '19:00'],
    descripcion: 'Lavado a mano y a máquina, pulido, encerado y limpieza de tapizados. Dejá el auto y volvé.',
    servicios: [
      { nombre: 'Lavado exterior', duracion: 30, precio: 900000, tipo: 'Box', car: 'Shampoo, enjuague y secado', foto: 'lavado' },
      { nombre: 'Lavado completo', duracion: 60, precio: 1800000, oferta: 1490000, tipo: 'Box', car: 'Exterior, interior y cubiertas', foto: 'lavadero' },
      { nombre: 'Pulido y encerado', duracion: 120, precio: 4500000, tipo: 'Box', car: 'Pulido en tres pasos y cera', foto: 'pulido' },
      { nombre: 'Aspirado de interior', duracion: 20, precio: 600000, tipo: 'Aspirado', car: 'Butacas, alfombras y baúl' },
    ],
    plazas: [
      ...[14, 38, 62, 86].map((x, i) => plaza(`Box ${i + 1}`, 'Box', 1, 'rectangulo', x, 14, 20, 14, i % 2 ? '#38bdf8' : '#0ea5e9')),
      plaza('Aspirado 1', 'Aspirado', 1, 'circulo', 20, 40, 9, 9, '#a3a3a3'), plaza('Aspirado 2', 'Aspirado', 1, 'circulo', 40, 40, 9, 9, '#a3a3a3'),
      plaza('Zona de secado', 'Secado', 1, 'rectangulo', 74, 40, 34, 10, '#cbd5e1'),
    ],
    guias: [...perimetro(), linea(4, 30, 96, 30)],
  },
  {
    slug: 'codigo-norte-software', nombre: 'Código Norte Software', rubro: 'desarrollo de software', direccion: 'Santa Fe 1500, Rosario', telefono: '341 555 0909',
    lat: -32.9420, lng: -60.6350, foto: 'software', dias: [1, 2, 3, 4, 5], horario: ['09:00', '18:00'],
    descripcion: 'Estudio de desarrollo web y móvil. Reuniones de relevamiento, consultoría técnica y coworking para equipos.',
    servicios: [
      { nombre: 'Reunión de relevamiento', duracion: 30, precio: 0, tipo: 'Sala', car: 'Sin cargo: contanos tu idea', foto: 'software' },
      { nombre: 'Consultoría técnica (1 hora)', duracion: 60, precio: 6000000, tipo: 'Sala', car: 'Arquitectura, stack y presupuesto', foto: 'codigo' },
      { nombre: 'Mentoría de código', duracion: 60, precio: 4500000, tipo: 'Sala', car: 'Revisión de código y buenas prácticas', foto: 'codigo2' },
      { nombre: 'Coworking por día', duracion: 480, precio: 1200000, oferta: 900000, tipo: 'Escritorio', car: 'Escritorio, wifi y café', foto: 'laptop' },
    ],
    plazas: [
      plaza('Sala de reuniones 1', 'Sala', 8, 'rectangulo', 20, 14, 26, 16, '#6366f1'), plaza('Sala de reuniones 2', 'Sala', 6, 'rectangulo', 50, 14, 26, 16, '#818cf8'),
      plaza('Sala de videollamadas', 'Sala', 4, 'rectangulo', 80, 14, 18, 16, '#a5b4fc'),
      ...[14, 32, 50, 68].map((x, i) => plaza(`Escritorio ${i + 1}`, 'Escritorio', 1, 'rectangulo', x, 38, 11, 7, '#94a3b8')),
    ],
    guias: [...perimetro(), linea(4, 27, 96, 27)],
  },
  {
    slug: 'veterinaria-patitas', nombre: 'Veterinaria Patitas', rubro: 'veterinaria', direccion: 'Dorrego 800, Rosario', telefono: '341 555 1010',
    lat: -32.9488, lng: -60.6580, foto: 'veterinaria', dias: [1, 2, 3, 4, 5, 6], horario: ['09:00', '19:00'],
    descripcion: 'Clínica veterinaria, vacunación, cirugía y peluquería canina con turno.',
    servicios: [
      { nombre: 'Consulta clínica', duracion: 30, precio: 2000000, tipo: 'Consultorio', car: 'Perros, gatos y animales pequeños', foto: 'vet1' },
      { nombre: 'Vacunación', duracion: 15, precio: 1500000, oferta: 1200000, tipo: 'Consultorio', car: 'Incluye libreta sanitaria', foto: 'vet2' },
      { nombre: 'Baño y corte', duracion: 60, precio: 2500000, tipo: 'Baño', car: 'Secado y perfume', foto: 'vet3' },
      { nombre: 'Cirugía programada', duracion: 120, precio: 8000000, tipo: 'Quirófano', car: 'Con control previo y posoperatorio' },
    ],
    plazas: [
      plaza('Consultorio 1', 'Consultorio', 1, 'rectangulo', 16, 14, 22, 15, '#34d399'), plaza('Consultorio 2', 'Consultorio', 1, 'rectangulo', 42, 14, 22, 15, '#6ee7b7'),
      plaza('Quirófano', 'Quirófano', 1, 'rectangulo', 70, 14, 22, 15, '#f87171'),
      plaza('Mesa de baño 1', 'Baño', 1, 'circulo', 18, 38, 9, 9, '#38bdf8'), plaza('Mesa de baño 2', 'Baño', 1, 'circulo', 34, 38, 9, 9, '#7dd3fc'),
      plaza('Sala de internación', 'Internación', 4, 'rectangulo', 68, 40, 30, 10, '#fbbf24'),
    ],
    guias: [...perimetro(), linea(4, 30, 96, 30)],
  },
  {
    slug: 'spa-sereno', nombre: 'Spa Sereno', rubro: 'spa y estética', direccion: 'Rioja 1250, Rosario', telefono: '341 555 1111',
    lat: -32.9338, lng: -60.6428, foto: 'spa', dias: [1, 2, 3, 4, 5, 6], horario: ['10:00', '20:00'],
    descripcion: 'Masajes, tratamientos faciales, manicuría y días de spa para desconectar.',
    servicios: [
      { nombre: 'Masaje descontracturante', duracion: 60, precio: 2800000, tipo: 'Cabina', car: 'Con piedras calientes', foto: 'masaje' },
      { nombre: 'Limpieza facial', duracion: 45, precio: 2200000, oferta: 1700000, tipo: 'Cabina', car: 'Hidratación profunda', foto: 'spa1' },
      { nombre: 'Manicuría', duracion: 45, precio: 1200000, tipo: 'Manicuría', car: 'Esmaltado semipermanente', foto: 'spa2' },
      { nombre: 'Pack día de spa', duracion: 180, precio: 8500000, tipo: 'Cabina', car: 'Masaje, facial y circuito de hidromasaje', foto: 'spa' },
    ],
    plazas: [
      plaza('Cabina 1', 'Cabina', 1, 'rectangulo', 16, 14, 22, 16, '#f9a8d4'), plaza('Cabina 2', 'Cabina', 1, 'rectangulo', 42, 14, 22, 16, '#fbcfe8'),
      plaza('Cabina 3', 'Cabina', 2, 'rectangulo', 68, 14, 22, 16, '#f472b6', 'Cabina doble para parejas.'),
      plaza('Hidromasaje', 'Hidromasaje', 4, 'circulo', 20, 40, 14, 14, '#7dd3fc'),
      ...[46, 58, 70].map((x, i) => plaza(`Manicuría ${i + 1}`, 'Manicuría', 1, 'circulo', x, 40, 8, 8, '#c4b5fd')),
    ],
    guias: [...perimetro(), linea(4, 30, 96, 30)],
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
    .run(id, `${comercio.slug}@demo.com`, comercio.nombre, hashearPassword(CLAVE_DE_PRUEBA));
  db.exec('COMMIT');
}

const NOMBRES_CLIENTES = ['Lucía Fernández', 'Mateo Gómez', 'Sofía Rossi', 'Diego Martínez', 'Valentina Paz', 'Joaquín Ledesma'];
const ESCENARIOS_EN_VIVO = [
  { estado: 'en_curso', desfase: -25 }, { estado: 'confirmado', desfase: 15 }, { estado: 'confirmado', desfase: -5 },
  { estado: 'confirmado', desfase: -18 }, { estado: 'confirmado', desfase: -40 },
];

function desplazar(local, minutos) {
  return new Date(Date.parse(`${local}:00Z`) + minutos * 60_000).toISOString().slice(0, 16);
}

function cargarMovimientoEnVivo(db, slug) {
  const comercio = db.prepare('SELECT id FROM comercios WHERE slug = ?').get(slug);
  const servicios = db.prepare('SELECT id, duracion_min, tipo_plaza FROM servicios WHERE comercio_id = ?').all(comercio.id);
  const plazas = db.prepare('SELECT id, tipo FROM plazas WHERE comercio_id = ? ORDER BY id').all(comercio.id);
  const ahora = ahoraLocal();
  ESCENARIOS_EN_VIVO.forEach((escenario, indice) => {
    const plaza = plazas[indice];
    const servicio = plaza && servicios.find(({ tipo_plaza: tipo }) => !tipo || tipo.toLowerCase() === plaza.tipo.toLowerCase());
    if (!servicio) return;
    const inicio = desplazar(ahora, escenario.desfase);
    db.prepare(
      `INSERT INTO turnos (comercio_id, servicio_id, plaza_id, inicio, fin, cliente_nombre, personas, estado, codigo)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).run(comercio.id, servicio.id, plaza.id, inicio, desplazar(inicio, Math.max(servicio.duracion_min, 90)),
      NOMBRES_CLIENTES[indice % NOMBRES_CLIENTES.length], escenario.estado, `V${comercio.id}${indice}${Math.floor(Math.random() * 900 + 100)}`);
  });
}

function cargarCliente(db, comerciosNuevos) {
  const existente = db.prepare('SELECT id FROM usuarios WHERE email = ?').get('cliente@test.com');
  const usuarioId = existente?.id ?? Number(db.prepare('INSERT INTO usuarios (email, nombre, password_hash) VALUES (?, ?, ?)')
    .run('cliente@test.com', CLIENTE_POR_DEFECTO.nombre, hashearPassword(CLAVE_DE_PRUEBA)).lastInsertRowid);
  db.prepare('UPDATE usuarios SET nombre = ?, telefono = ? WHERE id = ?').run(CLIENTE_POR_DEFECTO.nombre, CLIENTE_POR_DEFECTO.telefono, usuarioId);
  for (const slug of comerciosNuevos.filter((candidato) => ['futbol-5-la-terraza', 'la-parrilla-del-puerto', 'spa-sereno'].includes(candidato))) {
    const comercio = db.prepare('SELECT id FROM comercios WHERE slug = ?').get(slug);
    const servicio = db.prepare('SELECT id FROM servicios WHERE comercio_id = ? ORDER BY id LIMIT 1').get(comercio.id);
    for (let dias = 1; dias <= 4; dias += 1) {
      const fecha = desplazar(ahoraLocal(), dias * 1440).slice(0, 10);
      const franja = calcularDisponibilidad(db, { comercioId: comercio.id, servicioId: servicio.id, fecha })[4];
      if (!franja) continue;
      reservarTurno(db, { comercioId: comercio.id, servicioId: servicio.id, usuarioId, inicio: franja.inicio, clienteNombre: CLIENTE_POR_DEFECTO.nombre, clienteTelefono: CLIENTE_POR_DEFECTO.telefono, personas: 1 });
      break;
    }
  }
}

const reiniciar = process.argv.includes('--reiniciar');
const db = abrirBaseDeDatos();
await mkdir(DIRECTORIO_SUBIDAS, { recursive: true });
const cargados = [];
for (const comercio of COMERCIOS) {
  if (db.prepare('SELECT 1 FROM comercios WHERE slug = ?').get(comercio.slug)) {
    if (!reiniciar) continue;
    borrarComercio(db, comercio.slug);
  }
  await cargarComercio(db, comercio);
  cargarMovimientoEnVivo(db, comercio.slug);
  cargados.push(comercio.slug);
  console.log(`+ ${comercio.nombre}`);
}
cargarCliente(db, cargados);
console.log(`Demo lista. Cuentas: <slug>@demo.com y cliente@test.com, clave ${CLAVE_DE_PRUEBA}`);
