import { h, api, mostrarError } from './dom.js';

const NS_SVG = 'http://www.w3.org/2000/svg';
const UMBRAL_ARRASTRE_PX = 4;
const REFRESCO_MS = 10_000;
const LINEA_NUEVA = { x1: 30, y1: 50, x2: 70, y2: 50 };

export const LEYENDA = [
  ['Libre', '#10b981'], ['Reserva próxima', '#eab308'], ['Hora de llegada', '#f97316'],
  ['Demorado', '#dc2626'], ['No se presentó', '#6b7280'], ['En atención', '#4f46e5'],
];

function limitar(valor, minimo, maximo) {
  return Math.min(maximo, Math.max(minimo, valor));
}

function porcentajes(evento, mapa) {
  const caja = mapa.getBoundingClientRect();
  return {
    x: limitar(((evento.clientX - caja.left) / caja.width) * 100, 3, 97),
    y: limitar(((evento.clientY - caja.top) / caja.height) * 100, 5, 95),
  };
}

function arrastrar(evento, elemento, { alMover, alSoltar, alTocar }) {
  elemento.setPointerCapture(evento.pointerId);
  const origen = { x: evento.clientX, y: evento.clientY };
  let movido = false;
  const mover = (movimiento) => {
    if (Math.hypot(movimiento.clientX - origen.x, movimiento.clientY - origen.y) > UMBRAL_ARRASTRE_PX) movido = true;
    if (movido) alMover(movimiento);
  };
  const soltar = () => {
    elemento.removeEventListener('pointermove', mover);
    elemento.removeEventListener('pointerup', soltar);
    if (movido) alSoltar(); else alTocar?.();
  };
  elemento.addEventListener('pointermove', mover);
  elemento.addEventListener('pointerup', soltar);
}

export function crearLienzo({ alElegirPlaza, mostrarInactivas = false }) {
  const mapa = h('div', { class: 'salon' });
  const capaGuias = document.createElementNS(NS_SVG, 'svg');
  capaGuias.setAttribute('class', 'guias');
  capaGuias.setAttribute('viewBox', '0 0 100 100');
  capaGuias.setAttribute('preserveAspectRatio', 'none');
  const mensaje = h('p');
  const estado = { plazas: [], guias: [], editando: false, ocupado: false, seleccionada: null };

  async function recargar() {
    if (estado.ocupado) return;
    try {
      const [plazas, guias] = await Promise.all([api(`/api/salon${mostrarInactivas ? '?todas=1' : ''}`), api('/api/guias')]);
      estado.plazas = plazas;
      estado.guias = guias;
      dibujar();
    } catch (error) { mostrarError(mensaje, error); }
  }

  function dibujar() {
    mapa.classList.toggle('editando', estado.editando);
    capaGuias.replaceChildren();
    mapa.replaceChildren(capaGuias);
    estado.guias.forEach(dibujarGuia);
    estado.plazas.forEach(dibujarPlaza);
    if (!estado.plazas.length) mapa.append(h('p', { class: 'suave', style: 'padding:20px' }, 'Todavía no hay plazas.'));
  }

  function dibujarPlaza(plaza) {
    const circulo = h('div', {
      class: `plaza ${plaza.estado} ${estado.seleccionada === plaza.id ? 'seleccionada' : ''}`,
      style: `left:${plaza.x}%;top:${plaza.y}%`, title: plaza.nombre,
    }, h('span', {}, plaza.nombre), h('small', {}, `👥 ${plaza.capacidad}`));
    circulo.addEventListener('pointerdown', (evento) => {
      const elegir = () => { estado.seleccionada = plaza.id; dibujar(); alElegirPlaza(plaza); };
      if (!estado.editando) { elegir(); return; }
      estado.ocupado = true;
      circulo.classList.add('arrastrando');
      arrastrar(evento, circulo, {
        alMover: (movimiento) => {
          Object.assign(plaza, porcentajes(movimiento, mapa));
          circulo.style.left = `${plaza.x}%`;
          circulo.style.top = `${plaza.y}%`;
        },
        alSoltar: async () => {
          estado.ocupado = false;
          circulo.classList.remove('arrastrando');
          try { await api(`/api/plazas/${plaza.id}/posicion`, { metodo: 'PATCH', cuerpo: { x: plaza.x, y: plaza.y } }); } catch (error) { mostrarError(mensaje, error); }
        },
        alTocar: () => { estado.ocupado = false; elegir(); },
      });
    });
    mapa.append(circulo);
  }

  function dibujarGuia(guia) {
    const linea = document.createElementNS(NS_SVG, 'line');
    const actualizar = () => {
      linea.setAttribute('x1', guia.x1); linea.setAttribute('y1', guia.y1);
      linea.setAttribute('x2', guia.x2); linea.setAttribute('y2', guia.y2);
    };
    actualizar();
    capaGuias.append(linea);
    if (!estado.editando) return;

    const crearAsa = (clave) => {
      const asa = h('div', { class: 'asa', style: `left:${guia[`x${clave}`]}%;top:${guia[`y${clave}`]}%` });
      asa.addEventListener('pointerdown', (evento) => {
        estado.ocupado = true;
        arrastrar(evento, asa, {
          alMover: (movimiento) => {
            const { x, y } = porcentajes(movimiento, mapa);
            guia[`x${clave}`] = x; guia[`y${clave}`] = y;
            asa.style.left = `${x}%`; asa.style.top = `${y}%`;
            actualizar();
          },
          alSoltar: async () => {
            estado.ocupado = false;
            try { await api(`/api/guias/${guia.id}`, { metodo: 'PUT', cuerpo: guia }); } catch (error) { mostrarError(mensaje, error); }
          },
          alTocar: () => { estado.ocupado = false; },
        });
      });
      return asa;
    };
    const quitar = h('div', { class: 'asa quitar', title: 'Quitar línea', style: `left:${(guia.x1 + guia.x2) / 2}%;top:${(guia.y1 + guia.y2) / 2}%`,
      onclick: async () => { await api(`/api/guias/${guia.id}`, { metodo: 'DELETE' }); await recargar(); } }, '×');
    mapa.append(crearAsa(1), crearAsa(2), quitar);
  }

  async function agregarGuia() {
    try { await api('/api/guias', { metodo: 'POST', cuerpo: LINEA_NUEVA }); await recargar(); } catch (error) { mostrarError(mensaje, error); }
  }

  function editar(habilitado) {
    estado.editando = habilitado;
    dibujar();
  }

  recargar();
  const refresco = setInterval(() => { if (mapa.isConnected) recargar(); else clearInterval(refresco); }, REFRESCO_MS);
  return { mapa, mensaje, recargar, editar, agregarGuia, deseleccionar: () => { estado.seleccionada = null; dibujar(); } };
}
