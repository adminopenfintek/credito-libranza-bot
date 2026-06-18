import express from "express";
import axios from "axios";
import { config } from "./src/config.js";
import { log } from "./src/logger.js";
import { google } from "googleapis";

/**
 * ============================================================
 *  SERVIDOR WEBHOOK DEL BOT CREDITO LIBRANZA
 * ============================================================
 *  Este servidor recibe los mensajes entrantes que llegan al
 *  numero de WhatsApp Business via la API de la Nube de Meta.
 *
 *  Hace 3 cosas principales:
 *  1) Responde a la verificacion inicial de Meta (handshake).
 *  2) Cuando alguien toca el boton "Mas informacion", le envia
 *     automaticamente un mensaje de bienvenida.
 *  3) Registra la interaccion en una nueva pestania del Google
 *     Sheet llamada "Respuestas" para que Alejandra haga
 *     seguimiento.
 * ============================================================
 */

const app = express();
app.use(express.json());

// ============================================================
//  UTILIDADES
// ============================================================

/**
 * Devuelve un cliente autenticado de Google Sheets.
 *
 * Detecta automaticamente si esta corriendo en:
 *  - Local (tu computador): usa el archivo google-credentials.json
 *  - Render (la nube): usa la variable de entorno GOOGLE_CREDENTIALS_JSON
 */
async function getSheetsClient() {
  let authConfig;

  // ===== LOGS DE DIAGNOSTICO (temporales) =====
  const jsonEnv = process.env.GOOGLE_CREDENTIALS_JSON;
  log.info(`[DEBUG] GOOGLE_CREDENTIALS_JSON existe: ${!!jsonEnv}`);
  log.info(`[DEBUG] tipo: ${typeof jsonEnv}`);
  log.info(`[DEBUG] longitud: ${jsonEnv ? jsonEnv.length : 0}`);
  log.info(`[DEBUG] primeros 5 chars: ${JSON.stringify((jsonEnv || "").substring(0, 5))}`);
  log.info(`[DEBUG] ultimos 5 chars: ${JSON.stringify((jsonEnv || "").substring((jsonEnv || "").length - 5))}`);
  // ============================================

  const tieneJsonEnv =
    jsonEnv && jsonEnv.trim() !== "" && jsonEnv.trim().startsWith("{");

  log.info(`[DEBUG] tieneJsonEnv: ${tieneJsonEnv}`);

  if (tieneJsonEnv) {
    log.info("[DEBUG] Entrando a modo PRODUCCION (variable de entorno)");
    try {
      const credentialsJSON = JSON.parse(jsonEnv);
      authConfig = {
        credentials: credentialsJSON,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      };
      log.info("[DEBUG] JSON parseado correctamente");
    } catch (err) {
      log.error(`[DEBUG] Error parseando JSON: ${err.message}`);
      throw new Error(
        `La variable GOOGLE_CREDENTIALS_JSON no contiene un JSON valido: ${err.message}`
      );
    }
  } else {
    log.info("[DEBUG] Entrando a modo DESARROLLO (archivo local)");
    authConfig = {
      keyFile: config.sheets.credentialsPath,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    };
  }

  const auth = new google.auth.GoogleAuth(authConfig);
  const authClient = await auth.getClient();
  return google.sheets({ version: "v4", auth: authClient });
}

/**
 * Agrega una fila nueva en la pestania "Respuestas" del Sheet.
 * Si la pestania no existe, no falla: solo registra en consola.
 */
async function registrarRespuesta({ telefono, nombre, tipo, contenido }) {
  try {
    const sheets = await getSheetsClient();
    const fecha = new Date().toISOString().replace("T", " ").substring(0, 19);

    await sheets.spreadsheets.values.append({
      spreadsheetId: config.sheets.sheetId,
      range: "Respuestas!A:E",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [[fecha, telefono, nombre, tipo, contenido]],
      },
    });

    log.ok(`Respuesta registrada en Sheet: ${telefono} (${tipo})`);
  } catch (err) {
    log.warn(`No se pudo registrar en Sheet: ${err.message}`);
    log.warn(`Asegurate de que exista la pestania "Respuestas" con encabezados.`);
  }
}

/**
 * Envia un mensaje de texto LIBRE a un numero (no usa plantilla).
 * Esto solo funciona dentro de la ventana de 24h despues de que
 * el cliente nos haya escrito o tocado un boton.
 */
async function enviarMensajeTexto(telefono, texto) {
  const url = `https://graph.facebook.com/${config.whatsapp.graphVersion}/${config.whatsapp.phoneNumberId}/messages`;

  const body = {
    messaging_product: "whatsapp",
    to: telefono,
    type: "text",
    text: { body: texto },
  };

  try {
    const res = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${config.whatsapp.token}`,
        "Content-Type": "application/json",
      },
      timeout: 20000,
    });
    const messageId = res.data?.messages?.[0]?.id || "sin-id";
    log.ok(`Mensaje automatico enviado a ${telefono} id=${messageId}`);
    return { ok: true, messageId };
  } catch (err) {
    const apiError =
      err.response?.data?.error?.message ||
      err.response?.data?.error?.error_data?.details ||
      err.message;
    log.error(`Fallo el envio automatico a ${telefono}: ${apiError}`);
    return { ok: false, error: apiError };
  }
}

/**
 * Texto del mensaje automatico de bienvenida cuando alguien toca
 * el boton "Mas informacion". El {{nombre}} se reemplaza al vuelo.
 */
function construirMensajeBienvenida(nombre) {
  const nombreSeguro = nombre && nombre.trim() !== "" ? nombre : "";
  const saludo = nombreSeguro ? `¡Hola ${nombreSeguro}!` : "¡Hola!";
  return (
    `${saludo} 💚 Gracias por tu interes.\n\n` +
    `Soy Alejandra Fonseca. En las proximas horas te contacto personalmente ` +
    `para conversar sobre tus opciones de Libranza.\n\n` +
    `Mientras tanto, ¿podrias contarme:\n` +
    `1. ¿Eres empleado o pensionado?\n` +
    `2. ¿Tienes creditos activos actualmente?\n\n` +
    `Con eso preparo mejor tu asesoria. 🙌`
  );
}

// ============================================================
//  RUTAS DEL WEBHOOK
// ============================================================

/**
 * 1) Verificacion inicial: Meta llama a este endpoint con GET
 *    cuando configuras el webhook. Tenemos que devolverle el
 *    "challenge" para confirmar que somos los duenos.
 */
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === config.webhook.verifyToken) {
    log.ok("Webhook verificado correctamente por Meta.");
    return res.status(200).send(challenge);
  }

  log.warn("Verificacion de webhook fallida (token no coincide).");
  return res.sendStatus(403);
});

/**
 * 2) Recepcion de eventos: Meta llama a este endpoint con POST
 *    cada vez que pasa algo (mensaje entrante, status de envio).
 */
app.post("/webhook", async (req, res) => {
  // SIEMPRE respondemos 200 RAPIDO a Meta, para que no reintente.
  // Lo que tarde el procesamiento lo hacemos despues.
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0]?.changes?.[0]?.value;

    // -------- 2.A) Mensajes entrantes --------
    const mensajes = entry?.messages;
    if (mensajes && mensajes.length > 0) {
      const contactos = entry?.contacts || [];

      for (const m of mensajes) {
        const de = m.from;
        const nombre = contactos[0]?.profile?.name || "";

        // Caso 1: la persona toco un boton de respuesta rapida
        if (m.type === "button") {
          const textoBoton = m.button?.text || "";
          const payload = m.button?.payload || "";

          log.info(`Boton tocado por ${de} (${nombre}): "${textoBoton}"`);

          await registrarRespuesta({
            telefono: de,
            nombre,
            tipo: "BOTON",
            contenido: `${textoBoton} | payload: ${payload}`,
          });

          // Si el boton es "Mas informacion", mandamos el saludo automatico.
          const esBotonInteres =
            /m[aá]s\s*informaci[oó]n/i.test(textoBoton) ||
            payload.toUpperCase().includes("MAS_INFORMACION");

          if (esBotonInteres) {
            const textoBienvenida = construirMensajeBienvenida(nombre);
            await enviarMensajeTexto(de, textoBienvenida);
          }
        }
        // Caso 2: la persona escribio texto libre
        else if (m.type === "text") {
          const textoCliente = m.text?.body || "";
          log.info(`Texto entrante de ${de} (${nombre}): "${textoCliente}"`);

          await registrarRespuesta({
            telefono: de,
            nombre,
            tipo: "TEXTO",
            contenido: textoCliente,
          });
        }
        // Caso 3: cualquier otro tipo (imagen, audio, ubicacion, etc.)
        else {
          log.info(`Mensaje tipo ${m.type} de ${de} (${nombre})`);
          await registrarRespuesta({
            telefono: de,
            nombre,
            tipo: m.type.toUpperCase(),
            contenido: `(contenido tipo ${m.type})`,
          });
        }
      }
    }

    // -------- 2.B) Estados de entrega --------
    // Esto NO lo registramos en el Sheet para no llenarlo de ruido,
    // pero lo mostramos en consola por si quieres depurar.
    const estados = entry?.statuses;
    if (estados && estados.length > 0) {
      for (const s of estados) {
        log.info(`Estado de ${s.recipient_id}: ${s.status} (id=${s.id})`);
      }
    }
  } catch (err) {
    log.error(`Error procesando webhook: ${err.message}`);
  }
});

// ============================================================
//  RUTAS AUXILIARES
// ============================================================

// Pagina de inicio para chequeo manual.
app.get("/", (_req, res) => {
  res.send("Bot Credito Libranza activo. Webhook listo. 🚀");
});

// Ruta de salud (la usa UptimeRobot para no dejar dormir el server).
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
//  ARRANQUE DEL SERVIDOR
// ============================================================
const PORT = process.env.PORT || config.webhook.port;
app.listen(PORT, () => {
  log.ok(`Webhook escuchando en el puerto ${PORT}`);
  log.info("Listo para recibir mensajes de WhatsApp 📩");
});