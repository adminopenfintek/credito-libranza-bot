import dotenv from "dotenv";
dotenv.config();

/**
 * Centraliza toda la configuracion del bot leida desde .env
 * y valida que lo minimo indispensable este presente.
 */
function required(name) {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Falta la variable de entorno obligatoria: ${name}. Revisa tu archivo .env`);
  }
  return value.trim();
}

function optional(name, fallback) {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : fallback;
}

export const config = {
  whatsapp: {
    token: required("WHATSAPP_TOKEN"),
    phoneNumberId: required("WHATSAPP_PHONE_NUMBER_ID"),
    graphVersion: optional("GRAPH_API_VERSION", "v21.0"),
    templateName: required("WHATSAPP_TEMPLATE_NAME"),
    templateLang: optional("WHATSAPP_TEMPLATE_LANG", "es"),
    headerImageUrl: required("WHATSAPP_HEADER_IMAGE_URL"),
  },
  sheets: {
    sheetId: required("GOOGLE_SHEET_ID"),
    tab: optional("GOOGLE_SHEET_TAB", "Hoja1"),
    credentialsPath: optional("GOOGLE_CREDENTIALS_PATH", "./credentials/google-credentials.json"),
  },
  sending: {
    defaultCountryCode: optional("DEFAULT_COUNTRY_CODE", "57"),
    delayMs: parseInt(optional("DELAY_MS", "1500"), 10),
    concurrency: parseInt(optional("CONCURRENCY", "1"), 10),
    maxPerRun: parseInt(optional("MAX_PER_RUN", "200"), 10),
  },
  webhook: {
    verifyToken: optional("WEBHOOK_VERIFY_TOKEN", ""),
    port: parseInt(optional("PORT", "3000"), 10),
  },
};
