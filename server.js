const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');

const PORT = 3000;

// Create HTTP server for serving static files
const server = http.createServer((req, res) => {
  // Parse URL to separate path from query parameters
  const url = new URL(req.url, `http://${req.headers.host}`);
  let filePath = '.' + url.pathname;
  if (filePath === './') {
    filePath = './index.html';
  }
  
  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm',
    '.woff2': 'font/woff2'
  };

  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if(error.code == 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('404 - File Not Found', 'utf-8');
      }
      else {
        res.writeHead(500);
        res.end('Sorry, check with the site admin for error: '+error.code+' ..\n');
      }
    }
    else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

let gameClient = null;
let controllerClients = new Set();
let activeSessions = new Map(); // sessionCode -> { gameClient, controllerClient }

// Generate random 4-digit session code
function generateSessionCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Clean up inactive sessions periodically
setInterval(() => {
  for (let [sessionCode, session] of activeSessions.entries()) {
    if (!session.gameClient || session.gameClient.readyState !== WebSocket.OPEN) {
      console.log(`Cleaning up inactive session: ${sessionCode}`);
      activeSessions.delete(sessionCode);
    }
  }
}, 30000); // Clean up every 30 seconds

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const clientType = url.searchParams.get('type');
  // Check for session parameter case-insensitively
  let sessionCode = url.searchParams.get('session') || url.searchParams.get('SESSION');
  
  console.log(`Request URL: ${req.url}`);
  console.log(`New ${clientType || 'unknown'} client connected${sessionCode ? ` (session: ${sessionCode})` : ' (no session)'}`);

  if (clientType === 'game') {
    // Generate new session code for this game
    const newSessionCode = generateSessionCode();
    console.log(`Generated session code: ${newSessionCode}`);
    
    gameClient = ws;
    ws.sessionCode = newSessionCode;
    
    // Create session entry
    activeSessions.set(newSessionCode, { 
      gameClient: ws, 
      controllerClient: null 
    });
    
    // Send session code to game client
    ws.send(JSON.stringify({
      type: 'sessionCode',
      sessionCode: newSessionCode
    }));
    
    // Notify game of controller status
    ws.send(JSON.stringify({
      type: 'status',
      controllersConnected: 0
    }));

  } else if (clientType === 'controller') {
    // Validate session code
    if (!sessionCode || !activeSessions.has(sessionCode)) {
      console.log(`Invalid session code: ${sessionCode}`);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid session code'
      }));
      ws.close();
      return;
    }
    
    const session = activeSessions.get(sessionCode);
    
    // Check if controller slot is already taken
    if (session.controllerClient && session.controllerClient.readyState === WebSocket.OPEN) {
      console.log(`Session ${sessionCode} already has a controller`);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Session already has a controller'
      }));
      ws.close();
      return;
    }
    // Register controller for this session
    session.controllerClient = ws;
    ws.sessionCode = sessionCode;
    controllerClients.add(ws);
    
    // Notify game that a controller connected
    if (session.gameClient && session.gameClient.readyState === WebSocket.OPEN) {
      session.gameClient.send(JSON.stringify({
        type: 'status',
        controllersConnected: 1
      }));
    }
    
    // Handle controller input
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        const session = activeSessions.get(ws.sessionCode);
        
        if (!session || !session.gameClient || session.gameClient.readyState !== WebSocket.OPEN) {
          return;
        }
        
        // Handle start game command
        if (message.type === 'startGame') {
          session.gameClient.send(JSON.stringify({
            type: 'startGame'
          }));
        } else {
          // Relay controller input to game
          session.gameClient.send(JSON.stringify({
            type: 'input',
            ...message
          }));
        }
      } catch (error) {
        console.error('Error parsing controller message:', error);
      }
    });
  }

  ws.on('close', () => {
    console.log(`${clientType || 'Unknown'} client disconnected${ws.sessionCode ? ` (session: ${ws.sessionCode})` : ''}`);
    
    if (ws === gameClient && ws.sessionCode) {
      // Clean up session when game disconnects
      activeSessions.delete(ws.sessionCode);
      gameClient = null;
    } else if (controllerClients.has(ws) && ws.sessionCode) {
      controllerClients.delete(ws);
      
      const session = activeSessions.get(ws.sessionCode);
      if (session) {
        session.controllerClient = null;
        
        // Notify game of controller disconnection
        if (session.gameClient && session.gameClient.readyState === WebSocket.OPEN) {
          session.gameClient.send(JSON.stringify({
            type: 'status',
            controllersConnected: 0
          }));
        }
      }
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Get local network IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const interface of interfaces[name]) {
      // Skip loopback and non-IPv4 addresses
      if (interface.family === 'IPv4' && !interface.internal) {
        return interface.address;
      }
    }
  }
  return 'localhost'; // fallback
}

server.listen(PORT, () => {
  const localIP = getLocalIP();
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Server also available at http://${localIP}:${PORT}`);
  console.log(`Controller available at http://${localIP}:${PORT}/controller.html`);
  console.log(`QR Code will point to: http://${localIP}:${PORT}/controller.html`);
});