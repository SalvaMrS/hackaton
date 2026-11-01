import { DatabaseSync } from 'node:sqlite';

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS comercios (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  rubro TEXT NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  direccion TEXT NOT NULL DEFAULT '',
  telefono TEXT NOT NULL DEFAULT '',
  lat REAL,
  lng REAL
);
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY,
  comercio_id INTEGER REFERENCES comercios(id),
  email TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL DEFAULT '',
  google_sub TEXT UNIQUE,
  password_hash TEXT
);
CREATE TABLE IF NOT EXISTS servicios (
  id INTEGER PRIMARY KEY,
  comercio_id INTEGER NOT NULL REFERENCES comercios(id),
  nombre TEXT NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  caracteristicas TEXT NOT NULL DEFAULT '',
  precio_centavos INTEGER NOT NULL DEFAULT 0,
  duracion_min INTEGER NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS plazas (
  id INTEGER PRIMARY KEY,
  comercio_id INTEGER NOT NULL REFERENCES comercios(id),
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT '',
  capacidad INTEGER NOT NULL DEFAULT 1,
  activo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS horarios (
  id INTEGER PRIMARY KEY,
  comercio_id INTEGER NOT NULL REFERENCES comercios(id),
  dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  apertura TEXT NOT NULL,
  cierre TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS turnos (
  id INTEGER PRIMARY KEY,
  comercio_id INTEGER NOT NULL REFERENCES comercios(id),
  servicio_id INTEGER NOT NULL REFERENCES servicios(id),
  plaza_id INTEGER NOT NULL REFERENCES plazas(id),
  inicio TEXT NOT NULL,
  fin TEXT NOT NULL,
  cliente_nombre TEXT NOT NULL,
  cliente_telefono TEXT NOT NULL DEFAULT '',
  personas INTEGER NOT NULL DEFAULT 1,
  estado TEXT NOT NULL DEFAULT 'confirmado',
  codigo TEXT NOT NULL UNIQUE,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS guias (
  id INTEGER PRIMARY KEY,
  comercio_id INTEGER NOT NULL REFERENCES comercios(id),
  x1 REAL NOT NULL, y1 REAL NOT NULL, x2 REAL NOT NULL, y2 REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_turnos_plaza_inicio ON turnos(plaza_id, inicio);
CREATE INDEX IF NOT EXISTS idx_turnos_comercio_inicio ON turnos(comercio_id, inicio);
`;

const COLUMNAS_NUEVAS = [
  ['plazas', 'pos_x', 'REAL'],
  ['plazas', 'pos_y', 'REAL'],
  ['plazas', 'descripcion', "TEXT NOT NULL DEFAULT ''"],
  ['turnos', 'usuario_id', 'INTEGER REFERENCES usuarios(id)'],
  ['comercios', 'aviso_min', 'INTEGER NOT NULL DEFAULT 30'],
  ['comercios', 'tolerancia_min', 'INTEGER NOT NULL DEFAULT 10'],
  ['comercios', 'ausente_min', 'INTEGER NOT NULL DEFAULT 30'],
];

function agregarColumnasFaltantes(db) {
  for (const [tabla, columna, definicion] of COLUMNAS_NUEVAS) {
    const existe = db.prepare(`PRAGMA table_info(${tabla})`).all().some(({ name }) => name === columna);
    if (!existe) db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
  }
}

export function abrirBaseDeDatos(ruta = process.env.DB_PATH ?? 'turnos.db') {
  const db = new DatabaseSync(ruta);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(ESQUEMA);
  agregarColumnasFaltantes(db);
  return db;
}
