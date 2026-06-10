import { google } from "googleapis";
import { config } from "./config.js";
import { log } from "./logger.js";

/**
 * ============================================================
 *  ESTRUCTURA ESPERADA DEL GOOGLE SHEET (fila 1 = encabezados)
 * ============================================================
 *  A: nombre        -> Nombre del destinatario (variable {{1}} de la plantilla)
 *  B: telefono      -> Numero. Ideal en formato internacional: 573001234567
 *  C: estado        -> Lo llena el bot: PENDIENTE / ENVIADO / ERROR
 *  D: fecha_envio   -> Lo llena el bot
 *  E: detalle       -> Lo llena el bot: message_id o motivo del error
 *
 *  Solo se envia a las filas cuyo estado NO sea "ENVIADO".
 * ============================================================
 */

const COLUMNS = ["nombre", "telefono", "estado", "fecha_envio", "detalle"];

/**
 * Devuelve un cliente autenticado de Google Sheets.
 *
 * Detecta automaticamente si esta corriendo en:
 *  - Local (tu computador): usa el archivo google-credentials.json
 *  - Render (la nube): usa la variable de entorno GOOGLE_CREDENTIALS_JSON
 */
async function getSheetsClient() {
  let authConfig;

  // Verifica si la variable de entorno existe Y tiene contenido valido
  const jsonEnv = process.env.GOOGLE_CREDENTIALS_JSON;
  const tieneJsonEnv =
    jsonEnv && jsonEnv.trim() !== "" && jsonEnv.trim().startsWith("{");

  if (tieneJsonEnv) {
    // MODO PRODUCCION (Render): leer de variable de entorno
    try {
      const credentialsJSON = JSON.parse(jsonEnv);
      authConfig = {
        credentials: credentialsJSON,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      };
      log.info("Usando credenciales de Google desde variable de entorno.");
    } catch (err) {
      throw new Error(
        `La variable GOOGLE_CREDENTIALS_JSON no contiene un JSON valido: ${err.message}`
      );
    }
  } else {
    // MODO DESARROLLO (local): leer del archivo
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
 * Lee todas las filas de la pestania configurada y las devuelve
 * como objetos { rowNumber, nombre, telefono, estado, ... }
 */
export async function leerDestinatarios() {
  const sheets = await getSheetsClient();
  const range = `${config.sheets.tab}!A1:E`;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheets.sheetId,
    range,
  });

  const rows = res.data.values || [];
  if (rows.length < 2) {
    log.warn("El Sheet no tiene filas de datos (solo encabezados o vacio).");
    return [];
  }

  // rows[0] son los encabezados; los datos empiezan en la fila 2 (indice 1).
  const data = rows.slice(1).map((row, i) => {
    const obj = { rowNumber: i + 2 }; // numero de fila real en el Sheet
    COLUMNS.forEach((col, idx) => {
      obj[col] = (row[idx] || "").toString().trim();
    });
    return obj;
  });

  return data;
}

/**
 * Devuelve solo las filas que faltan por enviar (estado distinto de ENVIADO)
 * y que tienen telefono.
 */
export function filtrarPendientes(destinatarios) {
  return destinatarios.filter(
    (d) => d.telefono && d.estado.toUpperCase() !== "ENVIADO"
  );
}

/**
 * Escribe el resultado del envio en las columnas C, D, E de una fila.
 */
export async function actualizarEstado(rowNumber, { estado, detalle }) {
  const sheets = await getSheetsClient();
  const fecha = new Date().toISOString().replace("T", " ").substring(0, 19);
  const range = `${config.sheets.tab}!C${rowNumber}:E${rowNumber}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.sheets.sheetId,
    range,
    valueInputOption: "RAW",
    requestBody: {
      values: [[estado, fecha, detalle || ""]],
    },
  });
}