import { h, api } from "./dom.js";

const MENSAJE_INICIAL = "Hola! Soy el asistente de turnos. Puedo buscar comercios cerca tuyo, mostrarte precios y horarios libres, y reservar por vos.";
const RESPUESTAS_RAPIDAS = [
  "Comercios cerca de mi",
  "Quiero reservar un turno",
  "Que ofertas hay?",
  "Ver mis horarios disponibles",
];
const CLAVE_GUARDADO = "chat-mensajes";
const ALTURA_MAXIMA_ENTRADA = 98;
const NS_SVG = "http://www.w3.org/2000/svg";

function leerGuardados() {
  try {
    const datos = JSON.parse(sessionStorage.getItem(CLAVE_GUARDADO));
    return Array.isArray(datos) ? datos : null;
  } catch {
    return null;
  }
}

const guardados = leerGuardados();
const conversacionRestaurada = Boolean(guardados?.length);
const mensajes = conversacionRestaurada ? guardados : [{ role: "assistant", content: MENSAJE_INICIAL }];

let enviando = false;
let indicadorEscribiendo = null;
let chips = null;

const contenedor = document.getElementById("mensajes");
const formulario = document.getElementById("formulario");
const entrada = document.getElementById("entrada");
const botonEnviar = document.getElementById("enviar");

function guardarMensajes() {
  try {
    sessionStorage.setItem(CLAVE_GUARDADO, JSON.stringify(mensajes));
  } catch {
    return;
  }
}

function horaActual() {
  const ahora = new Date();
  return `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
}

function crearBurbuja(mensaje) {
  const texto = h("span", { class: "texto" });
  texto.textContent = mensaje.content;
  const hora = h("span", { class: "hora" }, horaActual());
  if (mensaje.role === "user") hora.append(h("span", { class: "tilde" }, "✓✓"));
  const clase = mensaje.role === "user" ? "burbuja usuario" : "burbuja asistente";
  return h("div", { class: clase }, texto, hora);
}

function desplazarAlFinal() {
  contenedor.scrollTop = contenedor.scrollHeight;
}

function agregarMensaje(mensaje) {
  contenedor.append(crearBurbuja(mensaje));
  desplazarAlFinal();
}

function mostrarChips() {
  chips = h("div", { class: "chips" });
  for (const texto of RESPUESTAS_RAPIDAS) {
    chips.append(h("button", { type: "button", class: "chip", onclick: () => enviar(texto) }, texto));
  }
  contenedor.append(chips);
}

function ocultarChips() {
  chips?.remove();
  chips = null;
}

function mostrarEscribiendo() {
  indicadorEscribiendo = h(
    "div",
    { class: "burbuja asistente escribiendo", "aria-label": "Escribiendo" },
    h("span", {}, "escribiendo..."),
    h("span", { class: "puntos" }, h("span"), h("span"), h("span")),
  );
  contenedor.append(indicadorEscribiendo);
  desplazarAlFinal();
}

function ocultarEscribiendo() {
  indicadorEscribiendo?.remove();
  indicadorEscribiendo = null;
}

function crearIconoEnviar() {
  const icono = document.createElementNS(NS_SVG, "svg");
  icono.setAttribute("viewBox", "0 0 24 24");
  icono.setAttribute("aria-hidden", "true");
  const flecha = document.createElementNS(NS_SVG, "path");
  flecha.setAttribute("d", "M2.01 21 23 12 2.01 3 2 10l15 2-15 2z");
  icono.append(flecha);
  return icono;
}

function leerUbicacion() {
  try {
    const ubicacion = JSON.parse(localStorage.getItem("ubicacion"));
    return { lat: ubicacion?.lat ?? null, lng: ubicacion?.lng ?? null };
  } catch {
    return { lat: null, lng: null };
  }
}

function obtenerContexto() {
  return {
    slug: new URLSearchParams(location.search).get("c") || null,
    ...leerUbicacion(),
  };
}

function ajustarAltura() {
  entrada.style.height = "auto";
  const alto = Math.min(entrada.scrollHeight, ALTURA_MAXIMA_ENTRADA);
  entrada.style.height = `${alto}px`;
  entrada.style.overflowY = entrada.scrollHeight > ALTURA_MAXIMA_ENTRADA ? "auto" : "hidden";
}

async function enviar(texto) {
  const contenido = texto.trim();
  if (!contenido || enviando) return;

  ocultarChips();
  const mensajeUsuario = { role: "user", content: contenido };
  mensajes.push(mensajeUsuario);
  agregarMensaje(mensajeUsuario);
  guardarMensajes();
  entrada.value = "";
  ajustarAltura();

  enviando = true;
  botonEnviar.disabled = true;
  mostrarEscribiendo();

  try {
    const { respuesta } = await api("/api/chat", {
      metodo: "POST",
      cuerpo: { mensajes, contexto: obtenerContexto() },
    });
    const mensajeAsistente = { role: "assistant", content: respuesta };
    mensajes.push(mensajeAsistente);
    guardarMensajes();
    ocultarEscribiendo();
    agregarMensaje(mensajeAsistente);
  } catch (error) {
    mensajes.pop();
    guardarMensajes();
    ocultarEscribiendo();
    agregarMensaje({ role: "assistant", content: error.message });
  } finally {
    enviando = false;
    botonEnviar.disabled = false;
    entrada.focus();
  }
}

function iniciar() {
  document.title = "Asistente de turnos";
  botonEnviar.append(crearIconoEnviar());
  if (!conversacionRestaurada) mostrarChips();
  for (const mensaje of mensajes) contenedor.append(crearBurbuja(mensaje));
  guardarMensajes();
  ajustarAltura();
  desplazarAlFinal();
}

formulario.addEventListener("submit", (evento) => {
  evento.preventDefault();
  enviar(entrada.value);
});

entrada.addEventListener("keydown", (evento) => {
  if (evento.key === "Enter" && !evento.shiftKey && !evento.isComposing) {
    evento.preventDefault();
    enviar(entrada.value);
  }
});

entrada.addEventListener("input", ajustarAltura);

iniciar();
