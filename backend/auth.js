const express = require('express');
const session = require('express-session');
const fetch = require('node-fetch');
const querystring = require('querystring');

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI || "https://alertas-c8s5.onrender.com/auth/twitch/callback";

function setupAuth(app) {
  app.use(session({
    secret: 'supersecretkey',
    resave: false,
    saveUninitialized: false,
  }));

  app.get('/auth/twitch', (req, res) => {
    const params = querystring.stringify({
      client_id: TWITCH_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'channel:read:redemptions channel:manage:redemptions',
    });
    res.redirect(`https://id.twitch.tv/oauth2/authorize?${params}`);
  });

  app.get('/auth/twitch/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.status(400).send('No code provided');

    try {
      const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        body: querystring.stringify({
          client_id: TWITCH_CLIENT_ID,
          client_secret: TWITCH_CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
          redirect_uri: REDIRECT_URI,
        }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      const tokenData = await tokenResponse.json();
      req.session.token = tokenData.access_token;

      const userRes = await fetch('https://api.twitch.tv/helix/users', {
        headers: {
          'Client-ID': TWITCH_CLIENT_ID,
          'Authorization': `Bearer ${tokenData.access_token}`
        }
      });
      const userData = await userRes.json();
      req.session.user = userData.data[0];
      console.log('[👤] Usuario autenticado:', req.session.user.display_name);

      res.redirect('/admin/index.html');
    } catch (err) {
      console.error('[❌] Error en /auth/twitch/callback:', err);
      res.status(500).send('Error al obtener el token');
    }
  });
}

module.exports = { setupAuth };