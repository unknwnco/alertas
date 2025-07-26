require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');

const { wss, enviarAlerta } = require('./ws-server');

const app = express();
const server = http.createServer(app); // Usamos http para conectar WebSocket

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

// Variables de entorno
const {
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
  TWITCH_REDIRECT_URI
} = process.env;

// Auth de Twitch
app.get('/auth/twitch', (req, res) => {
  const scope = 'channel:read:redemptions channel:manage:redemptions user:read:email';
  const authUrl = `https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${TWITCH_CLIENT_ID}&redirect_uri=${TWITCH_REDIRECT_URI}&scope=${encodeURIComponent(scope)}`;
  res.redirect(authUrl);
});

// Callback de Twitch
app.get('/auth/twitch/callback', async (req, res) => {
  const code = req.query.code;

  try {
    const tokenRes = await axios.post('https://id.twitch.tv/oauth2/token', null, {
      params: {
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: TWITCH_REDIRECT_URI
      }
    });

    const { access_token } = tokenRes.data;

    const userRes = await axios.get('https://api.twitch.tv/helix/users', {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Client-ID': TWITCH_CLIENT_ID
      }
    });

    const user = userRes.data.data[0];

    res.cookie('access_token', access_token, { httpOnly: true });
    res.cookie('user_id', user.id, { httpOnly: true });
    res.redirect('/');
  } catch (err) {
    console.error('Error autenticando:', err.response?.data || err.message);
    res.status(500).send('Error de autenticación con Twitch');
  }
});

// Crear recompensa
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
    console.error('Error al crear recompensa:', err.response?.data || err.message);
    res.status(500).json({ error: 'Error creando recompensa' });
  }
});

// Obtener recompensas
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
    console.error('Error obteniendo recompensas:', err.response?.data || err.message);
    res.status(500).json({ error: 'Error obteniendo recompensas' });
  }
});

// WebSocket upgrade handler
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Arrancar servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Servidor listo en http://localhost:${PORT}`);
});
