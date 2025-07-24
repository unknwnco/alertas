const fetch = require('node-fetch');
const express = require('express');
const router = express.Router();
const querystring = require('querystring');

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI || 'http://localhost:3000/auth/twitch/callback';
const SCOPE = 'user:read:email channel:manage:redemptions';

function setupAuth(app) {
  app.get('/auth/twitch', (req, res) => {
    const authUrl = 'https://id.twitch.tv/oauth2/authorize?' + querystring.stringify({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: SCOPE
    });
    res.redirect(authUrl);
  });

  app.get('/auth/twitch/callback', async (req, res) => {
    const code = req.query.code;

    try {
      const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: querystring.stringify({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
          redirect_uri: REDIRECT_URI
        })
      });

      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;

      const userResponse = await fetch('https://api.twitch.tv/helix/users', {
        headers: {
          'Client-ID': CLIENT_ID,
          'Authorization': 'Bearer ' + accessToken
        }
      });

      const userData = await userResponse.json();
      const user = userData.data[0];

      req.session.access_token = accessToken;
      req.session.user_id = user.id;
      req.session.display_name = user.display_name;

      console.log('[✅] Usuario autenticado:', user.display_name);
      res.redirect('/admin');
    } catch (err) {
      console.error('[❌] Error autenticando:', err);
      res.status(500).send('Error autenticando con Twitch');
    }
  });

  app.get('/logout', (req, res) => {
    req.session.destroy(() => {
      res.redirect('/');
    });
  });
}

module.exports = { setupAuth };