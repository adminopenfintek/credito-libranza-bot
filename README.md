# Bot WhatsApp - Asesoría Financiera Libranza

Bot que lee una base de datos en **Google Sheets** y envía por **WhatsApp** (Cloud API oficial de Meta) una invitación corta a una asesoría financiera personalizada sobre crédito de **Libranza**.

El mensaje no afirma cupos preaprobados: invita a la persona a una conversación gratuita donde se evalúan opciones como Libranza libre destino o compra de cartera.

Cada envío queda registrado de vuelta en el mismo Google Sheet, para no enviar dos veces a la misma persona.

---

## ⚠️ Antes de empezar: 3 reglas que NO puedes saltarte

1. **Necesitas una plantilla aprobada por Meta.** Como tú inicias el contacto, WhatsApp solo permite enviar plantillas pre-aprobadas. Una invitación comercial cae en categoría **Marketing**.
2. **Necesitas consentimiento (opt-in).** Enviar mensajes comerciales a personas que no autorizaron su tratamiento de datos viola la **Ley 1581 de 2012 (Habeas Data, Colombia)** y dispara reportes de spam que degradan tu número hasta que Meta lo bloquea. Envía solo a quienes autorizaron recibir comunicaciones.
3. **No prometas lo que no tienes.** No digas "cupo preaprobado", "crédito aprobado" o cifras inventadas. La Superintendencia Financiera persigue publicidad engañosa, y Meta también rechaza plantillas que prometen lo que no es.

---

## ✉️ El mensaje que envía el bot

**Header:** una imagen (banner promocional)

**Body:**

> Hola {{1}} 👋
> Imagina pagar una sola cuota al mes en lugar de varias.
> Con una asesoría financiera personalizada exploramos si un crédito de Libranza se ajusta a lo que necesitas.
> Sin compromiso. ¿Te cuento cómo? 💚

**Footer (firma fija):**

> — Alejandra Fonseca, Asesora Financiera

> `{{1}}` se reemplaza automáticamente por el nombre de cada persona del Google Sheet.

---

## 📁 Estructura del proyecto

```
credito-libranza-bot/
├── .env.example          # Plantilla de variables (cópiala a .env)
├── .gitignore            # Protege .env y credenciales
├── LICENSE
├── package.json
├── README.md
├── server.js             # Webhook opcional (respuestas y estados)
├── assets/               # (la creas tú: aquí va el banner de la plantilla)
├── credentials/
│   └── google-credentials.json   # (lo pones tú; NO se sube a Git)
└── src/
    ├── config.js         # Carga y valida variables de entorno
    ├── googleSheets.js   # Lee destinatarios y escribe estados
    ├── whatsapp.js       # Envía la plantilla por la Cloud API
    ├── logger.js         # Logs con timestamp
    └── index.js          # Orquestador del envío
```

---

## 📊 Cómo debe verse tu Google Sheet

La fila 1 son encabezados. Los datos empiezan en la fila 2. Las columnas C, D y E las llena el bot solo.

| A (nombre)     | B (telefono)  | C (estado) | D (fecha_envio) | E (detalle) |
|----------------|---------------|------------|-----------------|-------------|
| María Gómez    | 573001234567  |            |                 |             |
| Juan Pérez     | 3015556677    |            |                 |             |

> El teléfono ideal va en formato internacional (`57` + celular). Si pones solo el celular de 10 dígitos, el bot le antepone el código de país de `DEFAULT_COUNTRY_CODE`.

---

## 🔧 Paso 1 — Configurar WhatsApp Cloud API (Meta)

1. Entra a **developers.facebook.com** → *My Apps* → *Create App* → tipo **Business**.
2. Agrega el producto **WhatsApp**. Te dan un número de prueba y un **Phone Number ID**.
3. Para producción, registra tu propio número en **WhatsApp Manager**.
4. **Token permanente:** ve a *Business Settings → Users → System Users* → crea uno, asígnale la app de WhatsApp con permisos `whatsapp_business_messaging` y `whatsapp_business_management`, y genera un token (no expira). El token temporal del panel **solo dura 24h**, no sirve para producción.
5. Copia `Phone Number ID` y el token al `.env`.

### Crear la plantilla en WhatsApp Manager

En **WhatsApp Manager → Message Templates → Create template**:

- **Nombre:** `asesoria_libranza_invitacion` (minúsculas, números y guiones bajos)
- **Categoría:** `Marketing`
- **Idioma:** Español (`es`) o Español Colombia (`es_CO`)

#### Header (encabezado)
- Tipo: **Media → Image**
- Sube un banner de muestra (1200 x 628 px, JPG o PNG, < 5MB) — esa muestra es solo para revisión; en producción la imagen real la pasa el bot por URL.

#### Body (cuerpo)
Pega exactamente este texto:

```
Hola {{1}} 👋
Imagina pagar una sola cuota al mes en lugar de varias.
Con una asesoría financiera personalizada exploramos si un crédito de Libranza se ajusta a lo que necesitas.
Sin compromiso. ¿Te cuento cómo? 💚
```

Meta te va a pedir un ejemplo para la variable {{1}}. Pon: `María`

#### Footer (pie de página)
```
— Alejandra Fonseca, Asesora Financiera
```

Envía la plantilla a revisión. Cuando quede en estado **Approved**, ya puedes enviarla.

> Si Meta rechaza la plantilla, lee el motivo en el correo: casi siempre es por categoría equivocada o por palabras "prohibidas" en marketing. Ajusta y vuelve a enviar.

### Subir la imagen para el header

La imagen DEL HEADER debe estar accesible desde internet por una URL pública. Lo más fácil:

1. Crea una carpeta `assets/` en este proyecto.
2. Pon ahí tu imagen, por ejemplo `assets/banner.jpg`.
3. Cuando subas el proyecto a GitHub, GitHub te genera una URL "raw" así:
   ```
   https://raw.githubusercontent.com/TU_USUARIO/credito-libranza-bot/main/assets/banner.jpg
   ```
4. Esa URL la pegas en el `.env` como `WHATSAPP_HEADER_IMAGE_URL`.

> Alternativas: subir la imagen a un servicio como imgur.com o a tu propio hosting. Lo importante es que sea **https**, pública (sin login) y termine en `.jpg`, `.jpeg` o `.png`.

---

## 🔧 Paso 2 — Configurar Google Sheets

1. Entra a **console.cloud.google.com**, crea un proyecto.
2. Habilita la **Google Sheets API**.
3. Crea una **Cuenta de servicio** (*Service Account*): *IAM & Admin → Service Accounts → Create*.
4. En esa cuenta de servicio, pestaña *Keys → Add Key → JSON*. Se descarga un archivo.
5. Renómbralo a `google-credentials.json` y ponlo en la carpeta `credentials/`.
6. Abre ese JSON, copia el valor de `client_email` (algo como `xxx@xxx.iam.gserviceaccount.com`).
7. En tu Google Sheet → botón **Compartir** → pega ese email y dale permiso de **Editor**. (Este paso es el que más se olvida; sin él, el bot no puede leer ni escribir.)
8. Copia el **ID del Sheet** (está en la URL, entre `/d/` y `/edit`) al `.env`.

---

## 🔧 Paso 3 — Instalar y ejecutar

Requisitos: **Node.js 18 o superior**.

```bash
# 1. Instalar dependencias
npm install

# 2. Crear tu archivo de configuración
cp .env.example .env
# (edita .env con tus datos reales)

# 3. Prueba SIN enviar nada (verifica que lee el Sheet bien)
npm run dry-run

# 4. Envío real
npm run send
```

---

## 🔁 (Opcional) Webhook para recibir respuestas

```bash
npm run server
```

Expón el puerto con HTTPS (Railway, Render o `ngrok http 3000`) y registra esa URL en *Meta → WhatsApp → Configuration → Webhooks*, usando el mismo `WEBHOOK_VERIFY_TOKEN` del `.env`.

---

## 🔒 Seguridad

- **Nunca** subas `.env` ni `credentials/*.json` a GitHub (ya están en `.gitignore`).
- Si filtras un token, revócalo de inmediato en Meta y genera otro.
- Trata la base de teléfonos conforme a la Ley 1581 de 2012.

---

## Licencia

MIT — ver archivo `LICENSE`.
