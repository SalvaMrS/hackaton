const SEMANA_LABORAL = [1, 2, 3, 4, 5];

export const PLANTILLAS = {
  peluquería: {
    servicios: [
      { nombre: 'Corte', duracion_min: 30, precio_centavos: 800000, caracteristicas: 'Lavado incluido' },
      { nombre: 'Color', duracion_min: 90, precio_centavos: 2500000, caracteristicas: 'Tintura a elección' },
      { nombre: 'Barba', duracion_min: 20, precio_centavos: 500000, caracteristicas: '' },
    ],
    plazas: [{ nombre: 'Sillón 1', tipo: 'Sillón', capacidad: 1 }, { nombre: 'Sillón 2', tipo: 'Sillón', capacidad: 1 }],
    dias: [...SEMANA_LABORAL, 6], apertura: '09:00', cierre: '19:00',
  },
  restaurante: {
    servicios: [
      { nombre: 'Reserva de mesa', duracion_min: 90, precio_centavos: 0, caracteristicas: 'Cena' },
      { nombre: 'Mesa con menú degustación', duracion_min: 120, precio_centavos: 3500000, caracteristicas: 'Por mesa' },
    ],
    plazas: [
      { nombre: 'Mesa 1', tipo: 'Mesa', capacidad: 2 }, { nombre: 'Mesa 2', tipo: 'Mesa', capacidad: 4 },
      { nombre: 'Mesa 3', tipo: 'Mesa', capacidad: 4 }, { nombre: 'Mesa 4', tipo: 'Mesa', capacidad: 8 },
    ],
    dias: [2, 3, 4, 5, 6, 0], apertura: '20:00', cierre: '23:59',
  },
  consultorio: {
    servicios: [
      { nombre: 'Consulta general', duracion_min: 30, precio_centavos: 1500000, caracteristicas: 'Presencial' },
      { nombre: 'Control', duracion_min: 15, precio_centavos: 800000, caracteristicas: '' },
    ],
    plazas: [{ nombre: 'Consultorio 1', tipo: 'Consultorio', capacidad: 1 }],
    dias: SEMANA_LABORAL, apertura: '08:00', cierre: '13:00',
  },
  otro: { servicios: [], plazas: [], dias: [], apertura: '09:00', cierre: '18:00' },
};
