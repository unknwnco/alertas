const express = require('express');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const bodyParser = require('body-parser');
const session = require('express-session');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const { setupAuth } = require('./auth');
setupAuth(app);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: 'supersecretkey',
  resave: false,
  saveUninitialized: false
}));

// WebSocket overlay
let overlaySocket = null;
wss.on('connection', (ws) => {
  console.log('[📺] Overlay conectado');
  overlaySocket = ws;
});

// Simulación manual
app.post('/simulate', (req, res) => {
  const { rewardId, videoUrl } = req.body;
  if (overlaySocket && overlaySocket.readyState === WebSocket.OPEN) {
    overlaySocket.send(JSON.stringify({ rewardId, videoUrl }));
    return res.json({ success: true });
  }
  return res.status(500).json({ success: false, message: 'Overlay no conectado' });
});

// Crear recompensa con video
app.post('/crear-recompensa', async (req, res) => {
  try {
    const { title, cost, videoUrl } = req.body;

    if (!req.session.access_token || !req.session.user_id) {
      return res.status(401).json({ success: false, message: 'No autenticado con Twitch' });
    }

    const response = await fetch('https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=' + req.session.user_id, {
      method: 'POST',
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        'Authorization': 'Bearer ' + req.session.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title,
        cost,
        is_enabled: true
      })
    });

    const data = await response.json();
    if (data.status && data.status >= 400) {
      return res.status(data.status).json({ success: false, message: data.message });
    }

    // Guardar la asociación de recompensa y video en memoria
    app.locals.rewards = app.locals.rewards || {};
    app.locals.rewards[data.data[0].id] = videoUrl;

    res.json({ success: true, rewardId: data.data[0].id });
  } catch (err) {
    console.error('[❌] Error en /crear-recompensa:', err);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Reenvío automático cuando se recibe canje real (puede ser vía EventSub)
app.post('/eventsub', (req, res) => {
  const body = req.body;
  if (body.challenge) {
    return res.status(200).send(body.challenge); // verificación de EventSub
  }

  if (body.event && body.event.reward && body.event.reward.id) {
    const rewardId = body.event.reward.id;
    const videoUrl = app.locals.rewards?.[rewardId];
    if (videoUrl && overlaySocket && overlaySocket.readyState === WebSocket.OPEN) {
      overlaySocket.send(JSON.stringify({ rewardId, videoUrl }));
      return res.status(200).send('OK');
    }
  }

  res.status(200).send('Evento recibido');
});

// Servir frontend
app.use('/admin', express.static(path.join(__dirname, '../frontend/admin')));
app.use('/', express.static(path.join(__dirname, '../frontend')));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[✅] Servidor corriendo en http://localhost:${PORT}`);
});