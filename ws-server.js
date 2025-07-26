const WebSocket = require('ws');

const wss = new WebSocket.Server({ noServer: true });

const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('📡 Cliente conectado al WebSocket');

  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log('❌ Cliente desconectado');
  });
});

// Función para emitir alerta a todos los clientes conectados
function enviarAlerta(data) {
  const mensaje = JSON.stringify({ tipo: 'alerta', ...data });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(mensaje);
    }
  }
}

// Mantener viva la conexión (Render puede cerrar sockets inactivos)
const interval = setInterval(() => {
  for (const client of clients) {
    if (client.isAlive === false) {
      client.terminate();
      continue;
    }

    client.isAlive = false;
    client.ping(); // envía ping, el cliente debe responder con pong
  }
}, 30000); // cada 30 segundos

wss.on('close', () => {
  clearInterval(interval);
});

module.exports = { wss, enviarAlerta };
