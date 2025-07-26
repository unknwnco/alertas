require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const { Server } = require('ws');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

// Variables de entorno
const {
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
  TWITCH_REDIRECT_URI,
  TWITCH_EVENTSUB_SECRET
} = process.env;

// --- WEBSOCKET SERVER ---
const server = http.createServer(app);
const wss = new Server({ noServer: true });
let clientes = [];

wss.on('connection', (ws) => {
  clientes.push(ws);
  ws.on('close', () => {
    clientes = clientes.filter(c => c !== ws);
  });
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

function enviarAlerta(data) {
  const mensaje = JSON.stringify(data);
  clientes.forEach(ws => {
    if (ws.readyState === 1) {
      ws.send(mensaje);
    }
  });
}

// --- TWITCH AUTH ---
app.get('/auth/twitch', (req, res) => {
  const scope = 'channel:manage:redemptions user:read:email';
  const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${TWITCH_REDIRECT_URI}&response_type=code&scope=${scope}`;
  res.redirect(url);
});

app.get('/auth/twitch/callback', async (req, res) => {
  const code = req.query.code;

  try {
    const tokenResponse = await axios.post('https://id.twitch.tv/oauth2/token', null, {
      params: {
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: TWITCH_REDIRECT_URI
      }
    });

    const { access_token } = tokenResponse.data;

    const userInfo = await axios.get('https://api.twitch.tv/helix/users', {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Client-ID': TWITCH_CLIENT_ID
      }
    });

    const user = userInfo.data.data[0];

    res.cookie('access_token', access_token, { httpOnly: true });
    res.cookie('user_id', user.id, { httpOnly: true });
    res.redirect('/');
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send('Error al autenticar con Twitch');
  }
});

// --- CREAR RECOMPENSA ---
app.post('/create-reward', async (req, res) => {
  const token = req.cookies.access_token;
  const broadcaster_id = req.cookies.user_id;

  if (!token || !broadcaster_id) return res.status(401).json({ error: 'No autorizado' });

  const { title, cost, prompt } = req.body;

  try {
    const response = await axios.post(
      'https://api.twitch.tv/helix/channel_points/custom_rewards',
      {
        broadcaster_id,
        title,
        cost: parseInt(cost),
        prompt,
        is_enabled: true
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Client-ID': TWITCH_CLIENT_ID,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({ success: true, reward: response.data });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// --- OBTENER RECOMPENSAS ---
app.get('/rewards', async (req, res) => {
  const token = req.cookies.access_token;
  const broadcaster_id = req.cookies.user_id;

  if (!token || !broadcaster_id) return res.status(401).json({ error: 'No autorizado' });

  try {
    const response = await axios.get(
      `https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${broadcaster_id}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Client-ID': TWITCH_CLIENT_ID
        }
      }
    );

    res.json(response.data.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- SUSCRIPCIÓN A EVENTSUB ---
app.post('/subscribe-reward-events', async (req, res) => {
  const token = req.cookies.access_token;
  const broadcaster_id = req.cookies.user_id;

  if (!token || !broadcaster_id) return res.status(401).json({ error: 'No autorizado' });

  try {
    await axios.post('https://api.twitch.tv/helix/eventsub/subscriptions', {
      type: 'channel.channel_points_custom_reward_redemption.add',
      version: '1',
      condition: { broadcaster_user_id: broadcaster_id },
      transport: {
        method: 'webhook',
        callback: `https://${req.headers.host}/eventsub/callback`,
        secret: TWITCH_EVENTSUB_SECRET
      }
    }, {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Error suscribiendo a EventSub:', err.response?.data || err.message);
    res.status(500).json({ error: 'No se pudo suscribir a eventos' });
  }
});

// --- EVENTSUB CALLBACK (Webhook) ---
app.use('/eventsub/callback', express.raw({ type: 'application/json' }), (req, res, next) => {
  try {
    const messageId = req.headers['twitch-eventsub-message-id'];
    const timestamp = req.headers['twitch-eventsub-message-timestamp'];
    const signature = req.headers['twitch-eventsub-message-signature'];
    const hmacMessage = messageId + timestamp + req.body.toString();
    const computedSignature = 'sha256=' +
      crypto.createHmac('sha256', TWITCH_EVENTSUB_SECRET)
        .update(hmacMessage)
        .digest('hex');

    if (computedSignature !== signature) {
      return res.status(403).send('Firma inválida');
    }

    const messageType = req.headers['twitch-eventsub-message-type'];
    const body = JSON.parse(req.body.toString());

    if (messageType === 'webhook_callback_verification') {
      return res.status(200).send(body.challenge);
    }

    if (messageType === 'notification') {
      const redemption = body.event;
      console.log('Canje recibido:', redemption);

      // Enviar a OBS vía WebSocket
      enviarAlerta({
        mensaje: `🎉 ${redemption.user_name} canjeó: ${redemption.reward.title}`
      });

      return res.sendStatus(200);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Error en verificación EventSub:', err.message);
    res.status(500).send('Error interno');
  }
});

// --- LEVANTAR SERVIDOR ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
