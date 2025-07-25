const express = require('express');
const fetch = require('node-fetch');
const querystring = require('querystring');
const router = express.Router();

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI || 'https://alertas-c8s5.onrender.com/auth/twitch/callback';

function setupAuth(app) {
  app.get('/auth/twitch', (req, res) => {
    const authUrl = 'https://id.twitch.tv/oauth2/authorize?' + querystring.stringify({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'user:read:email channel:manage:redemptions'
    });
    res.redirect(authUrl);
  });

  app.get('/auth/twitch/callback', async (req, res) => {
    const code = req.query.code;

    const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
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

    const tokenData = await tokenRes.json();
    const access_token = tokenData.access_token;

    const userRes = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        'Client-ID': CLIENT_ID,
        'Authorization': 'Bearer ' + access_token
      }
    });

    const userData = await userRes.json();
    const user = userData.data[0];

    req.session.access_token = access_token;
    req.session.user_id = user.id;
    req.session.display_name = user.display_name;

    res.redirect('/admin');
  });

  app.get('/logout', (req, res) => {
    req.session.destroy(() => {
      res.redirect('/');
    });
  });
}

module.exports = { setupAuth };