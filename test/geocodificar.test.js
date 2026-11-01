import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBaseDeDatos } from '../src/db.js';
import { crearServidor } from '../src/server.js';

async function iniciarApp(t) {
  const app = crearServidor({ db: abrirBaseDeDatos(':memory:') });
  t.after(() => app.close());
  await app.ready();
  return app;
}

const respuestaDeMapa = (resultados) => ({ ok: true, json: async () => resultados });

describe('geocodificación de direcciones', () => {
  it('rechaza consultas demasiado cortas', async (t) => {
    const app = await iniciarApp(t);
    const respuesta = await app.inject({ method: 'GET', url: '/api/geocodificar?q=ab' });
    assert.equal(respuesta.statusCode, 400);
    assert.equal(respuesta.json().error.code, 'consulta_invalida');
  });

  it('devuelve coordenadas y reutiliza la consulta repetida sin volver al mapa', async (t) => {
    const app = await iniciarApp(t);
    const consultaAlMapa = mock.method(globalThis, 'fetch', async () => respuestaDeMapa([{ lat: '-32.95', lon: '-60.64', display_name: 'Calle 1, Barrio, Rosario, Santa Fe, Argentina' }]));
    t.after(() => consultaAlMapa.mock.restore());
    const url = '/api/geocodificar?q=Calle%20Unica%20Prueba%201';
    const primera = await app.inject({ method: 'GET', url });
    const segunda = await app.inject({ method: 'GET', url });
    assert.deepEqual(primera.json(), { lat: -32.95, lng: -60.64, nombre: 'Calle 1, Barrio, Rosario' });
    assert.deepEqual(segunda.json(), primera.json());
    assert.equal(consultaAlMapa.mock.callCount(), 1);
  });

  it('responde 404 cuando el mapa no encuentra la dirección', async (t) => {
    const app = await iniciarApp(t);
    const consultaAlMapa = mock.method(globalThis, 'fetch', async () => respuestaDeMapa([]));
    t.after(() => consultaAlMapa.mock.restore());
    const respuesta = await app.inject({ method: 'GET', url: '/api/geocodificar?q=Direccion%20Inexistente%20Zzz' });
    assert.equal(respuesta.statusCode, 404);
    assert.equal(respuesta.json().error.code, 'direccion_no_encontrada');
  });
});
