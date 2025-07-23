# 🎉 Sistema de Alertas Personalizadas para Twitch (con EventSub)

Este es un sistema web gratuito y autoalojable que muestra alertas en vivo de Twitch dentro de OBS, sin depender de Streamlabs ni otros servicios externos.

---

## 🚀 Características

- 🔐 Login con Twitch (OAuth)
- 🔔 Alertas en tiempo real con **Twitch EventSub**
- 📺 Compatible con OBS (HTML fuente)
- 🔊 Sonido personalizado para cada alerta
- 🧪 Panel de pruebas manuales
- 💬 WebSocket para comunicación en vivo
- ❌ No usa base de datos (temporal, sin almacenar usuarios)
- ☁️ Se puede desplegar fácilmente en **Render.com**

---

## 📁 Estructura

```
twitch-alerts/
├── public/
│   ├── alert.html         # Fuente HTML para OBS
│   └── alert.mp3          # Sonido de alerta
├── views/
│   ├── login.html         # Página de inicio de sesión
│   └── panel.html         # Panel de prueba manual
├── routes/
│   └── webhook.js         # Webhook para recibir eventos EventSub
├── eventsub.js            # Suscriptor EventSub
├── server.js              # Servidor principal
├── .env.example           # Plantilla de configuración
├── package.json
```

---

## 🛠 Requisitos

- Cuenta de Twitch
- [Twitch Developer App](https://dev.twitch.tv/console/apps)
- Cuenta en [Render](https://render.com) (gratis)

---

## ⚙️ Pasos para desplegar en Render

### 1. Crear app en Twitch Developer

1. Ir a [https://dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps)
2. Crear nueva aplicación:
   - **Name**: TwitchAlerts
   - **OAuth Redirect**: `https://<tu-app>.onrender.com/auth/twitch/callback`
   - **Category**: Website

3. Copia el `Client ID` y `Client Secret`.

---

### 2. Subir a GitHub

1. Crea un repositorio en GitHub (por ejemplo: `twitch-alerts`)
2. Sube todo el contenido del proyecto allí
3. No subas `.env` (usa `.env.example`)

---

### 3. Crear Web Service en Render

1. Ve a [https://render.com](https://render.com)
2. Clic en **"New Web Service"**
3. Conecta tu repositorio de GitHub
4. Configura:

- **Build Command**: `npm install`
- **Start Command**: `node server.js`
- **Environment Variables**:

| Variable            | Valor                                                              |
|---------------------|---------------------------------------------------------------------|
| `TWITCH_CLIENT_ID`  | Tu Client ID de Twitch                                              |
| `TWITCH_CLIENT_SECRET` | Tu Client Secret de Twitch                                      |
| `TWITCH_REDIRECT_URI` | `https://<tu-app>.onrender.com/auth/twitch/callback`            |
| `SESSION_SECRET`    | Lo que quieras (ej: `midato-secreto`)                              |
| `EVENTSUB_SECRET`   | Una clave secreta (ej: `alert-secure-2024`) usada para validar HMAC |

---

### 4. Usar en OBS

1. Inicia el servidor y entra a `https://<tu-app>.onrender.com`
2. Inicia sesión con Twitch
3. Abre `https://<tu-app>.onrender.com/public/alert.html` en una fuente de navegador en OBS
4. También puedes ir a `/panel` para probar alertas manuales

---

## 🧠 Notas

- Twitch requiere HTTPS para EventSub (Render lo cumple)
- Si Render reinicia tu app, se pierden las suscripciones temporales
- No se guarda información del usuario (no hay base de datos)

---

## 📌 Licencia

MIT. Puedes modificar y redistribuir este sistema libremente.
