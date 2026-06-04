import express from "express";
import { config } from "./src/config.js";
import { log } from "./src/logger.js";

/**
 * Servidor de WEBHOOK (OPCIONAL).
 *
 * Sirve para:
 *  - Recibir cuando una persona te RESPONDE (abre la ventana de 24h para
 *    poder escribirle texto libre).
 *  - Recibir estados de entrega: enviado / entregado / leido / fallido.
 *
 * Para usarlo necesitas exponerlo con HTTPS publico (ngrok, Railway, Render...)
 * y registrar esa URL en el panel de Meta > WhatsApp > Configuration > Webhooks.
 */
const app = express();
app.use(express.json());

// 1) Verificacion del webhook (Meta hace un GET la primera vez)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === config.webhook.verifyToken) {
    log.ok("Webhook verificado por Meta.");
    return res.status(200).send(challenge);
  }
  log.warn("Verificacion de webhook fallida (token no coincide).");
  return res.sendStatus(403);
});

// 2) Recepcion de eventos (mensajes entrantes y estados)
app.post("/webhook", (req, res) => {
  try {
    const entry = req.body?.entry?.[0]?.changes?.[0]?.value;

    // Mensaje entrante de un usuario
    const mensajes = entry?.messages;
    if (mensajes) {
      for (const m of mensajes) {
        const de = m.from;
        const texto = m.text?.body || `[${m.type}]`;
        log.info(`Mensaje entrante de ${de}: ${texto}`);
        // Aqui podrias responder, registrar en el Sheet, etc.
      }
    }

    // Estados de entrega
    const estados = entry?.statuses;
    if (estados) {
      for (const s of estados) {
        log.info(`Estado de ${s.recipient_id}: ${s.status} (id=${s.id})`);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    log.error(`Error procesando webhook: ${err.message}`);
    res.sendStatus(200); // siempre 200 para que Meta no reintente sin fin
  }
});

app.get("/", (_req, res) => res.send("Bot VantiListo activo."));

app.listen(config.webhook.port, () => {
  log.ok(`Webhook escuchando en el puerto ${config.webhook.port}`);
});
