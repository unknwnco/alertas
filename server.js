require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { wss, enviarAlerta } = require('./ws-server');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));
app.use(express.raw({ type: 'application/json' })); // necesario para validar firmas EventSub

const {
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
  TWITCH_REDIRECT_URI,
  EVENTSUB_SECRET,
  EVENTSUB_CALLBACK_URL
} = process.env;

// Redirige a Twitch para hacer login
app.get('/auth/twitch', (req, res) => {
  const scope = 'channel:manage:redemptions user:read:email channel:read:redemptions';
  const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${TWITCH_REDIRECT_URI}&response_type=code&scope=${scope}`;
  res.redirect(url);
});

// Callback de Twitch
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

// Crear recompensa
app.post('/create-reward', async (req, res) => {
  const token = req.cookies.access_token;
  const broadcaster_id = req.cookies.user_id;
  const { title, cost, prompt } = req.body;

  if (!token || !broadcaster_id) return res.status(401).json({ error: 'No autorizado' });

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
          Authorization: `Bearer ${token}`,
          'Client-ID': TWITCH_CLIENT_ID
        }
      }
    );
    res.json({ success: true, reward: response.data });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Obtener recompensas existentes
app.get('/rewards', async (req, res) => {
  const token = req.cookies.access_token;
  const broadcaster_id = req.cookies.user_id;

  if (!token || !broadcaster_id) return res.status(401).json({ error: 'No autorizado' });

  try {
    const response = await axios.get(
      `https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${broadcaster_id}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
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

// Suscripción a eventos de redención
app.post('/subscribe-reward-events', async (req, res) => {
  const accessToken = req.cookies.access_token;
  const userId = req.cookies.user_id;

  if (!accessToken || !userId) return res.status(401).json({ error: 'No autorizado' });

  try {
    const response = await axios.post('https://api.twitch.tv/helix/eventsub/subscriptions', {
      type: 'channel.channel_points_custom_reward_redemption.add',
      version: '1',
      condition: { broadcaster_user_id: userId },
      transport: {
        method: 'webhook',
        callback: EVENTSUB_CALLBACK_URL,
        secret: EVENTSUB_SECRET
      }
    }, {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${accessToken}`
      }
    });

    res.json({ success: true, data: response.data });
  } catch (err) {
    console.error('Error al suscribirse a EventSub:', err.response?.data || err.message);
    res.status(500).json({ error: 'Fallo al activar el webhook.' });
  }
});

// Endpoint EventSub para recibir redenciones
app.post('/eventsub', (req, res) => {
  const messageId = req.headers['twitch-eventsub-message-id'];
  const timestamp = req.headers['twitch-eventsub-message-timestamp'];
  const signature = req.headers['twitch-eventsub-message-signature'];
  const messageType = req.headers['twitch-eventsub-message-type'];

  const body = req.body;
  const computedHmac = 'sha256=' + crypto.createHmac('sha256', EVENTSUB_SECRET)
    .update(messageId + timestamp + body)
    .digest('hex');

  if (computedHmac !== signature) {
    console.warn('Firma inválida');
    return res.status(403).send('Firma no válida');
  }

  const jsonBody = JSON.parse(body);

  if (messageType === 'webhook_callback_verification') {
    return res.status(200).send(jsonBody.challenge);
  }

  if (messageType === 'notification') {
    const event = jsonBody.event;
    console.log('🔔 Redención recibida:', event);
    enviarAlerta({ mensaje: `🎉 ${event.user_name} canjeó: ${event.reward.title}` });
    return res.status(200).end();
  }

  res.status(200).end();
});

// WebSocket upgrade
const server = http.createServer(app);
server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
