require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');
const { wss, enviarAlerta } = require('./ws-server');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

const {
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
  TWITCH_REDIRECT_URI,
  PUBLIC_URL
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

    await suscribirACanje(access_token, user.id);
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

  if (!token || !broadcaster_id) {
    return res.status(401).json({ error: 'No autorizado' });
  }

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
          Authorization: `Bearer ${token}`,
          'Client-ID': TWITCH_CLIENT_ID,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({ success: true, reward: response.data });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
});

// Obtener recompensas
app.get('/rewards', async (req, res) => {
  const token = req.cookies.access_token;
  const broadcaster_id = req.cookies.user_id;

  if (!token || !broadcaster_id) {
    return res.status(401).json({ error: 'No autorizado' });
  }

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

// Endpoint de EventSub para recibir notificaciones
app.post('/eventsub', express.json({ type: 'application/json' }), async (req, res) => {
  const messageType = req.header('Twitch-Eventsub-Message-Type');
  const { challenge, event } = req.body;

  if (messageType === 'webhook_callback_verification') {
    return res.status(200).send(challenge);
  }

  if (messageType === 'notification') {
    console.log('🎯 Canjeo recibido:', event);

    if (event.reward && event.user_input !== undefined) {
      enviarAlerta({ message: `🔔 ${event.user_name} canjeó: ${event.reward.title}` });
    }

    return res.sendStatus(204);
  }

  res.sendStatus(204);
});

// Función para suscribirse a canjes con EventSub
async function suscribirACanje(token, user_id) {
  try {
    await axios.post('https://api.twitch.tv/helix/eventsub/subscriptions', {
      type: 'channel.channel_points_custom_reward_redemption.add',
      version: '1',
      condition: { broadcaster_user_id: user_id },
      transport: {
        method: 'webhook',
        callback: `${PUBLIC_URL}/eventsub`,
        secret: 'mi_secreto_eventsub'
      }
    }, {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('📬 Suscripción a EventSub creada con éxito');
  } catch (err) {
    console.error('❌ Error al suscribirse a EventSub:', err.response?.data || err.message);
  }
}

const server = http.createServer(app);
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, ws => {
    wss.emit('connection', ws, request);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
