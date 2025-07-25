require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

const { TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_REDIRECT_URI } = process.env;

app.get('/auth/twitch', (req, res) => {
  const scope = 'channel:manage:redemptions user:read:email';
  const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${TWITCH_REDIRECT_URI}&response_type=code&scope=${scope}`;
  res.redirect(url);
});

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
    res.redirect('/');
  } catch (err) {
    res.status(500).send('Error al autenticar con Twitch');
  }
});

app.post('/create-reward', async (req, res) => {
  const token = req.cookies.access_token;
  const broadcaster_id = req.cookies.user_id;

  if (!token || !broadcaster_id) return res.status(401).json({ error: 'No autorizado' });

  const { title, cost, prompt } = req.body;

  try {
    const response = await axios.post('https://api.twitch.tv/helix/channel_points/custom_rewards', {
      broadcaster_id,
      title,
      cost: parseInt(cost),
      prompt,
      is_enabled: true
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Client-ID': TWITCH_CLIENT_ID,
        'Content-Type': 'application/json'
      }
    });

    res.json({ success: true, reward: response.data });
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

app.listen(3000, () => console.log('Servidor corriendo en http://localhost:3000'));
