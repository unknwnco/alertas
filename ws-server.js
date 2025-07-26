const WebSocket = require('ws');

const wss = new WebSocket.Server({ noServer: true });
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('📡 Cliente conectado al WebSocket');

  ws.on('close', () => {
    clients.delete(ws);
    console.log('❌ Cliente desconectado');
  });
});

function enviarAlerta(data) {
  const mensaje = JSON.stringify({ tipo: 'alerta', ...data });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(mensaje);
    }
  }
}

module.exports = { wss, enviarAlerta };
