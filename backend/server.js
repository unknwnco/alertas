
const express = require('express');
const session = require('express-session');
const fetch = require('node-fetch');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();
app.use(express.json());

// Servir archivos estáticos desde /admin
app.use('/admin', express.static(path.join(__dirname, '..', 'frontend', 'admin')));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'keyboard cat',
  resave: false,
  saveUninitialized: true
}));

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const CALLBACK_URL = process.env.CALLBACK_URL;
const SCOPES = 'user:read:email channel:read:redemptions channel:manage:redemptions';

let globalAccessToken = null;
let globalUserId = null;

// OAuth login start
app.get('/auth/twitch', (req, res) => {
  const authUrl = `https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${CALLBACK_URL}&scope=${encodeURIComponent(SCOPES)}`;
  res.redirect(authUrl);
});

// OAuth callback
app.get('/auth/twitch/callback', async (req, res) => {
  const code = req.query.code;
  try {
    const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: CALLBACK_URL
      })
    });
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    const userRes = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        'Client-ID': CLIENT_ID,
        'Authorization': 'Bearer ' + accessToken
      }
    });
    const userData = await userRes.json();
    const user = userData.data[0];

    globalAccessToken = accessToken;
    globalUserId = user.id;

    console.log(`🔐 Authenticated Twitch user: ${user.display_name} (id: ${user.id})`);
    res.redirect('/admin/index.html');
  } catch (err) {
    console.error('OAuth Error:', err);
    res.status(500).send('OAuth failed');
  }
});

// Token test endpoint
app.get('/admin/token-status', (req, res) => {
  res.json({
    user_id: globalUserId || null,
    access_token: globalAccessToken || null,
    has_token: !!globalAccessToken
  });
});

// Register EventSub manually
app.post('/admin/register-eventsub-test', async (req, res) => {
  const callbackURL = process.env.EVENTSUB_CALLBACK_URL;
  const secret = process.env.EVENTSUB_SECRET;

  if (!callbackURL || !globalAccessToken || !globalUserId || !secret) {
    return res.status(400).send('Missing required environment variables or session data.');
  }

  try {
    const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
      method: 'POST',
      headers: {
        'Client-ID': CLIENT_ID,
        'Authorization': 'Bearer ' + globalAccessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'channel.channel_points_custom_reward_redemption.add',
        version: '1',
        condition: { broadcaster_user_id: globalUserId },
        transport: {
          method: 'webhook',
          callback: callbackURL,
          secret: secret
        }
      })
    });

    const json = await response.json();
    console.log('📡 Manual Register Response:', json);
    if (!response.ok) return res.status(500).send(JSON.stringify(json));
    res.send('Registered successfully');
  } catch (err) {
    console.error('Register EventSub Error:', err);
    res.status(500).send('Registration failed');
  }
});

// Static frontend
app.use(express.static(path.join(__dirname, 'frontend')));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log('🚀 Server running on port', port);
});
