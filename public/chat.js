import { h } from './dom.js';

const VENTANA = 'width=440,height=760,noopener=no';

export function iniciarChat({ obtenerContexto }) {
  function abrirAsistente() {
    const { slug, lat, lng } = obtenerContexto();
    try {
      if (lat != null) localStorage.setItem('ubicacion', JSON.stringify({ lat, lng }));
    } catch { /* sin almacenamiento: el asistente igual funciona sin ubicación */ }
    const destino = slug ? `/chat.html?c=${encodeURIComponent(slug)}` : '/chat.html';
    window.open(destino, 'asistente-turnos', VENTANA);
  }

  document.body.append(h('button', { id: 'chat-boton', onclick: abrirAsistente }, '💬 Asistente'));
}
