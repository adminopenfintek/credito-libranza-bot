import pLimit from "p-limit";
import { config } from "./config.js";
import { log } from "./logger.js";
import { leerDestinatarios, filtrarPendientes, actualizarEstado } from "./googleSheets.js";
import { enviarPlantilla } from "./whatsapp.js";

const DRY_RUN = process.argv.includes("--dry-run");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  log.info(`Iniciando bot de Libranza${DRY_RUN ? " (MODO PRUEBA / DRY-RUN, no se envia nada)" : ""}`);

  // 1) Leer la base de datos desde Google Sheets
  const todos = await leerDestinatarios();
  log.info(`Filas leidas del Sheet: ${todos.length}`);

  // 2) Filtrar pendientes
  let pendientes = filtrarPendientes(todos);
  log.info(`Pendientes por enviar: ${pendientes.length}`);

  // 3) Respetar el limite por ejecucion
  if (pendientes.length > config.sending.maxPerRun) {
    log.warn(`Hay ${pendientes.length} pendientes pero MAX_PER_RUN=${config.sending.maxPerRun}. Se enviaran solo ${config.sending.maxPerRun}.`);
    pendientes = pendientes.slice(0, config.sending.maxPerRun);
  }

  if (pendientes.length === 0) {
    log.ok("No hay nada que enviar. Fin.");
    return;
  }

  const limit = pLimit(config.sending.concurrency);
  let enviados = 0;
  let errores = 0;

  const tareas = pendientes.map((d) =>
    limit(async () => {
      if (DRY_RUN) {
        log.info(`[PRUEBA] A ${d.telefono} (${d.nombre})`);
        return;
      }

      const r = await enviarPlantilla({
        telefono: d.telefono,
        nombre: d.nombre,
      });

      if (r.ok) {
        enviados++;
        log.ok(`Enviado a ${d.nombre} (${d.telefono}) id=${r.messageId}`);
        await actualizarEstado(d.rowNumber, { estado: "ENVIADO", detalle: r.messageId });
      } else {
        errores++;
        log.error(`Fallo con ${d.nombre} (${d.telefono}): ${r.error}`);
        await actualizarEstado(d.rowNumber, { estado: "ERROR", detalle: r.error });
      }

      // Espera entre mensajes para no saturar ni parecer spam
      await sleep(config.sending.delayMs);
    })
  );

  await Promise.all(tareas);

  log.info("==================================================");
  log.ok(`Enviados con exito: ${enviados}`);
  if (errores > 0) log.error(`Con error: ${errores}`);
  log.info("Proceso finalizado.");
}

main().catch((err) => {
  log.error(`Error fatal: ${err.message}`);
  process.exit(1);
});
