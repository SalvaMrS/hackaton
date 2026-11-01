import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBaseDeDatos } from '../src/db.js';
import { calcularEstadisticas } from '../src/estadisticas.js';

function prepararBase() {
  const db = abrirBaseDeDatos(':memory:');
  db.exec(`INSERT INTO comercios (id, slug, nombre, rubro) VALUES (1, 'c', 'Comercio', 'cancha');
    INSERT INTO servicios (id, comercio_id, nombre, duracion_min) VALUES (1, 1, 'Alquiler', 60);
    INSERT INTO plazas (id, comercio_id, nombre) VALUES (1, 1, 'Cancha 1');`);
  const estados = ['atendido', 'en_curso', 'confirmado', 'confirmado', 'confirmado', 'cancelado', 'ausente'];
  estados.forEach((estado, indice) => db.prepare(
    `INSERT INTO turnos (comercio_id, servicio_id, plaza_id, inicio, fin, cliente_nombre, estado, codigo) VALUES (1, 1, 1, ?, ?, 'Ana', ?, ?)`,
  ).run(`2026-11-01T${String(10 + indice).padStart(2, '0')}:00`, `2026-11-01T${String(11 + indice).padStart(2, '0')}:00`, estado, `K${indice}`));
  db.prepare("INSERT INTO turnos (comercio_id, servicio_id, plaza_id, inicio, fin, cliente_nombre, estado, codigo) VALUES (1, 1, 1, '2026-11-20T10:00', '2026-11-20T11:00', 'Beto', 'confirmado', 'K9')").run();
  return db;
}

describe('estadísticas de turnos', () => {
  it('separa ocupados, faltan, cancelados y ausentes del día', () => {
    const { totales } = calcularEstadisticas(prepararBase(), 1, 'hoy', '2026-11-01T09:00');
    assert.deepEqual(totales, { total: 7, ocupados: 2, faltan: 3, cancelados: 1, ausentes: 1 });
  });

  it('el rango "todo" suma también los turnos de otros días', () => {
    const { totales, generales } = calcularEstadisticas(prepararBase(), 1, 'todo', '2026-11-01T09:00');
    assert.equal(totales.total, 8);
    assert.equal(generales.faltan, 4);
  });

  it('arma 7 días y los rankings sin contar cancelados', () => {
    const datos = calcularEstadisticas(prepararBase(), 1, 'hoy', '2026-11-01T09:00');
    assert.equal(datos.por_dia.length, 7);
    assert.equal(datos.por_dia[0].fecha, '2026-11-01');
    assert.equal(datos.por_servicio[0].total, 6);
  });
});
