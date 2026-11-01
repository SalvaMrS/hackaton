# Turnos: recepción con IA para cualquier comercio

**URL pública (sin SSL por ahora):** http://201.32.132.177/

**Informe con funciones y capturas:** [INFORME.md](INFORME.md) · http://201.32.132.177/informe.html

## El problema
Restaurantes, peluquerías, consultorios y canchas pierden ventas porque las consultas llegan por WhatsApp, teléfono o en persona, y los mensajes se pierden o se anotan mal. El cliente espera y se va.

## La solución
Una plataforma de turnos para cualquier rubro, con dos caras:

- **Cliente** (`/`): busca comercios por texto, rubro o cercanía, elige servicio, día, personas y horario, y reserva en segundos. Al confirmar inicia sesión y ve **Mis turnos** (con su plaza y dirección). Un **asistente estilo WhatsApp** (`/chat.html`) conversa, guía, busca turnos cercanos, reserva, lista y cancela.
- **Comercio** (`/panel.html`): catálogo de servicios (precio, duración, imagen, ofertas), **plazas** (mesas, sillas, canchas, camillas) dibujadas en un mapa del salón con forma, tamaño, color y líneas guía; salón en vivo con estados (libre, reserva próxima, demorado, no se presentó, en atención), recepción para ver a qué plaza ir y agenda del día. Los tiempos de aviso y tolerancia son configurables.

## Cómo corre
Requiere Node 26.12+ (usa `node:sqlite`, sin dependencias nativas).

```sh
npm ci
npm run semilla      # carga 11 comercios de ejemplo con fotos y movimiento en vivo (necesita internet la primera vez)
npm start            # http://localhost:3000
npm test             # 50 tests
```

Variables en `~/.env` (nunca dentro del proyecto): `OPENAI_API_KEY` (asistente), `OPENAI_MODEL` (opcional), `SESSION_SECRET`, `PORT`, `DB_PATH`, `UPLOAD_DIR`.

**Cuentas de prueba** (clave `test123`): un cliente, `cliente@test.com`, y un usuario por comercio, `<slug>@demo.com` (por ejemplo `futbol-5-la-terraza@demo.com`, `taller-rapida-sur@demo.com`, `spa-sereno@demo.com`). Con `CUENTAS_PRUEBA=1` las pantallas de ingreso muestran un botón por cuenta para entrar con un toque.

## Decisiones técnicas
- **Un solo modelo para todos los rubros:** servicio + plaza. El servicio indica qué *tipo* de plaza usa; al reservar se asigna automáticamente la plaza libre más ajustada a la cantidad de personas.
- **Alta demanda:** Fastify + SQLite en modo WAL, reserva en transacción atómica (`BEGIN IMMEDIATE`), sin doble reserva; límite de consultas por IP y por ruta; sin paso de build.
- **IA con herramientas, sin inventar:** el asistente solo consulta y modifica por funciones del sistema (buscar, disponibilidad, reservar, mis turnos, cancelar). Los precios son fijos y se informan tal cual, con timeout y reintentos con backoff ante 429 y 5xx.
- **Login:** usuario y contraseña (scrypt). El ingreso con Google está implementado pero **deshabilitado**: requiere HTTPS y el servidor aún no tiene certificado SSL.
- **Ubicación:** la geolocalización del navegador también requiere HTTPS, así que hoy se ubica al cliente escribiendo su dirección (OpenStreetMap). La automática queda marcada como pendiente de SSL.
- **Seguridad:** claves fuera del repositorio, cookie de sesión firmada y `httpOnly`, logs sin cookies ni claves.

## Guion de demo (2 minutos)
1. **(20 s) Cliente:** en `/` escribir una dirección ("Pellegrini 1200, Rosario"), ver los comercios ordenados por cercanía y filtrar por rubro. Entrar a *Fútbol 5 La Terraza* (hay una oferta).
2. **(30 s) Reservar:** elegir servicio, "Mañana", 8 personas, un horario; poner el nombre. Pide iniciar sesión, crear cuenta y queda confirmado con la cancha asignada.
3. **(40 s) Asistente:** abrir 💬, decir "quiero jugar al fútbol mañana a la noche": pregunta lo que falta, propone opciones cercanas con precio fijo, resume, confirma y reserva; luego "¿qué turnos tengo?" y cancelar.
4. **(30 s) Comercio:** entrar como `futbol-5-la-terraza@demo.com`: *Salón* en vivo con la reserva, *Recepción* (buscar el nombre, "Ir a: Cancha 1", marcar llegada) y *Plazas* → habilitar edición para mover una cancha y cambiar su forma y color.
