const WebSocket = require('ws');

const wss = new WebSocket.Server({ noServer: true });

let liveUsers = new Set();


wss.on('connection', (ws, request) => {
    const user = request.session.user;
    liveUsers.add(user);

   
    ws.on('close', () => {
        liveUsers.delete(user);
    });
});


module.exports = { wss, liveUsers };