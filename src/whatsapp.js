import axios from "axios";
import { config } from "./config.js";

/**
 * Normaliza un numero de telefono al formato que exige WhatsApp:
 * solo digitos, con codigo de pais, sin "+", sin espacios ni guiones.
 * Si el numero no parece traer codigo de pais, antepone el DEFAULT_COUNTRY_CODE.
 */
export function normalizarTelefono(raw) {
  let n = (raw || "").toString().replace(/\D/g, ""); // deja solo digitos
  if (!n) return null;

  const cc = config.sending.defaultCountryCode;

  // En Colombia los celulares tienen 10 digitos (empiezan por 3).
  // Si llega de 10 digitos, le anteponemos el codigo de pais.
  if (n.length === 10 && n.startsWith("3")) {
    n = cc + n;
  }
  return n;
}

/**
 * Envia un mensaje de PLANTILLA aprobada con HEADER de imagen.
 *
 * Estructura de la plantilla en Meta:
 *   HEADER  -> tipo IMAGE (la imagen llega por URL en cada envio)
 *   BODY    -> texto con UNA variable: {{1}} = nombre de la persona
 *   FOOTER  -> texto fijo aprobado en Meta (la firma de la asesora)
 *
 * Devuelve { ok, messageId, error }
 */
export async function enviarPlantilla({ telefono, nombre }) {
  const to = normalizarTelefono(telefono);
  if (!to) {
    return { ok: false, error: "Telefono invalido o vacio" };
  }

  const url = `https://graph.facebook.com/${config.whatsapp.graphVersion}/${config.whatsapp.phoneNumberId}/messages`;

  const body = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: config.whatsapp.templateName,
      language: { code: config.whatsapp.templateLang },
      components: [
        {
          type: "header",
          parameters: [
            {
              type: "image",
              image: { link: config.whatsapp.headerImageUrl },
            },
          ],
        },
        {
          type: "body",
          parameters: [
            { type: "text", text: nombre || "estimado cliente" },
          ],
        },
      ],
    },
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
    return { ok: true, messageId };
  } catch (err) {
    // Meta devuelve detalle util en err.response.data.error
    const apiError =
      err.response?.data?.error?.message ||
      err.response?.data?.error?.error_data?.details ||
      err.message;
    return { ok: false, error: apiError };
  }
}
