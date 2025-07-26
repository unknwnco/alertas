require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const path = require('path');
const { wss, enviarAlerta } = require('./ws-server');
const http = require('http');

const app = express();
const server = http.createServer(app);
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; }}));
app.use(cookieParser());
app.use(express.static('public'));

// Variables de entorno
const {
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
  TWITCH_REDIRECT_URI,
  TWITCH_WEBHOOK_SECRET
} = process.env;

// Twitch OAuth Login
app.get('/auth/twitch', (req, res) => {
  const scope = 'channel:read:redemptions channel:manage:redemptions user:read:email';
  const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${TWITCH_REDIRECT_URI}&response_type=code&scope=${scope}`;
  res.redirect(url);
});

// OAuth Callback
app.get('/auth/twitch/callback', async (req, res) => {
  const code = req.query.code;
  try {
    const tokenRes = await axios.post(`https://id.twitch.tv/oauth2/token`, null, {
      params: {
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: TWITCH_REDIRECT_URI
      }
    });

    const access_token = tokenRes.data.access_token;

    const userRes = await axios.get('https://api.twitch.tv/helix/users', {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Client-ID': TWITCH_CLIENT_ID
      }
    });

    const user = userRes.data.data[0];

    res.cookie('access_token', access_token, { httpOnly: true });
    res.cookie('user_id', user.id, { httpOnly: true });

    // Registrar EventSub
    await subscribeToRedemptions(user.id, access_token);

    res.redirect('/');
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send('Error autenticando con Twitch');
  }
});

// Crear recompensa
app.post('/create-reward', async (req, res) => {
  const token = req.cookies.access_token;
  const broadcaster_id = req.cookies.user_id;
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
    res.status(500).json({ error: 'Error creando recompensa' });
  }
});

// Listar recompensas
app.get('/rewards', async (req, res) => {
  const token = req.cookies.access_token;
  const broadcaster_id = req.cookies.user_id;

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
    res.status(500).json({ error: 'Error obteniendo recompensas' });
  }
});

// Validar y recibir eventos EventSub
app.post('/eventsub', (req, res) => {
  const messageId = req.header('Twitch-Eventsub-Message-Id');
  const timestamp = req.header('Twitch-Eventsub-Message-Timestamp');
  const signature = req.header('Twitch-Eventsub-Message-Signature');
  const body = req.rawBody;
  const message = messageId + timestamp + body;
  const expectedSignature = 'sha256=' + crypto.createHmac('sha256', TWITCH_WEBHOOK_SECRET).update(message).digest('hex');

  if (signature !== expectedSignature) {
    console.warn('Firma inválida de Twitch');
    return res.status(403).send('Firma inválida');
  }

  const event = req.body;

  if (event.challenge) {
    return res.send(event.challenge);
  }

  if (event.subscription && event.event) {
    const redemption = event.event;
    console.log('🔔 Redención recibida:', redemption.reward.title);

    enviarAlerta({
      mensaje: `¡${redemption.user_name} canjeó: ${redemption.reward.title}!`
    });
  }

  res.status(200).end();
});

// Subscribirse a redenciones
async function subscribeToRedemptions(user_id, token) {
  try {
    await axios.post('https://api.twitch.tv/helix/eventsub/subscriptions', {
      type: 'channel.channel_points_custom_reward_redemption.add',
      version: '1',
      condition: { broadcaster_user_id: user_id },
      transport: {
        method: 'webhook',
        callback: `${process.env.PUBLIC_URL}/eventsub`,
        secret: TWITCH_WEBHOOK_SECRET
      }
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Client-ID': TWITCH_CLIENT_ID,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Subscripción EventSub exitosa');
  } catch (err) {
    console.error('❌ Error al suscribirse a EventSub:', err.response?.data || err.message);
  }
}

// WebSocket Upgrade
server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

// Puerto en Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
});
