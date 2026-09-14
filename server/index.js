const WebSocket = require('ws');
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ host: '::', port: PORT });

wss.on('connection', (ws, req) => {
    console.log(`[Server] Client connected from ${req.socket.remoteAddress}`);
    
    ws.on('message', (message) => {
        console.log(`[Server] Relaying message: ${JSON.parse(message).type}`);
        wss.clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(message.toString());
            }
        });
    });

    ws.on('close', () => console.log('[Server] Client disconnected.'));
    ws.on('error', (err) => console.error('[Server] Socket error:', err));
});

console.log(`Signaling server running on port ${PORT}`);
