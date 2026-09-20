const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const https = require('https');

// Tunneling Providers
let cloudflared = null;
try {
    cloudflared = require('cloudflared');
} catch (e) {}

let ngrok = null;
try {
    ngrok = require('@ngrok/ngrok');
} catch (e) {}

let tunnelmole = null;
try {
    tunnelmole = require('tunnelmole').tunnelmole;
} catch (e) {}

let localtunnel = null;
try {
    localtunnel = require('localtunnel');
} catch (e) {}

const app = express();
const server = http.createServer(app);

// Security Headers Middleware
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Bypass-Tunnel-Reminder', 'true');
    res.setHeader('ngrok-skip-browser-warning', 'true');
    next();
});

const io = new Server(server, {
    maxHttpBufferSize: 1e8, // 100MB buffer limit
    pingTimeout: 60000,     // 60s heartbeat timeout
    pingInterval: 25000,    // 25s ping interval
    allowEIO3: true,        // Compatibility mode for public tunnel proxies
    transports: ['polling', 'websocket'], // Robust fallback transports
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const PORT = process.env.PORT || 3000;
let publicTunnelUrl = null;
let publicIpAddress = 'Fetching...';

function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const name in interfaces) {
        for (const net of interfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}

const localIp = getLocalIpAddress();

// Fetch Public IP Address for fallback password displays
function fetchPublicIp() {
    https.get('https://api.ipify.org?format=json', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                const parsed = JSON.parse(data);
                publicIpAddress = parsed.ip || publicIpAddress;
            } catch (e) {}
        });
    }).on('error', () => {});
}
fetchPublicIp();

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint for server info
app.get('/api/info', (req, res) => {
    res.json({
        localIp: localIp,
        port: PORT,
        wifiUrl: `http://${localIp}:${PORT}`,
        publicUrl: publicTunnelUrl,
        publicIp: publicIpAddress
    });
});

// Secure Room Token Generator
app.get('/api/new-room', (req, res) => {
    const token = crypto.randomBytes(8).toString('hex');
    res.json({ roomId: `NEXUS_${token}` });
});

// Routes
app.get('/', (req, res) => {
    res.redirect('/sender');
});

app.get('/sender', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'sender.html'));
});

app.get('/receive', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'receiver.html'));
});

app.get('/receive/:roomId', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'receiver.html'));
});

// Socket.io Secure Signaling System (Zero File Storage)
const rooms = new Map();

function cleanRoom(roomId) {
    if (!roomId || typeof roomId !== 'string') return '';
    return roomId.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase().substring(0, 64);
}

io.on('connection', (socket) => {
    socket.on('join-room', ({ roomId, role }) => {
        const cleanRoomId = cleanRoom(roomId);
        if (!cleanRoomId) return;
        
        socket.join(cleanRoomId);
        socket.roomId = cleanRoomId;
        socket.role = role;

        if (!rooms.has(cleanRoomId)) {
            rooms.set(cleanRoomId, { sender: null, receiver: null });
        }
        const room = rooms.get(cleanRoomId);

        if (role === 'sender') {
            room.sender = socket.id;
            if (room.receiver) {
                socket.emit('receiver-joined', { socketId: room.receiver });
                io.to(cleanRoomId).emit('sender-joined', { socketId: socket.id });
            }
        } else if (role === 'receiver') {
            room.receiver = socket.id;
            io.to(cleanRoomId).emit('receiver-joined', { socketId: socket.id });
            if (room.sender) {
                socket.emit('sender-joined', { socketId: room.sender });
            }
        }

        console.log(`[Socket] ${role} (${socket.id}) joined room: ${cleanRoomId}`);
    });

    socket.on('signal', (data) => {
        if (!data || !data.roomId) return;
        const cleanRoomId = cleanRoom(data.roomId);
        socket.to(cleanRoomId).emit('signal', data);
    });

    socket.on('file-meta', (data) => {
        if (!data || !data.roomId) return;
        const cleanRoomId = cleanRoom(data.roomId);
        console.log(`[Socket] Broadcasting file-meta to room: ${cleanRoomId}`);
        socket.to(cleanRoomId).emit('file-meta', data);
    });

    socket.on('file-chunk', (data) => {
        if (!data || !data.roomId) return;
        const cleanRoomId = cleanRoom(data.roomId);
        socket.to(cleanRoomId).emit('file-chunk', data);
    });

    socket.on('transfer-progress', (data) => {
        if (!data || !data.roomId) return;
        const cleanRoomId = cleanRoom(data.roomId);
        socket.to(cleanRoomId).emit('transfer-progress', data);
    });

    socket.on('receiver-completed', (data) => {
        if (!data || !data.roomId) return;
        const cleanRoomId = cleanRoom(data.roomId);
        console.log(`[Socket] Receiver completed signal received for room: ${cleanRoomId}`);
        socket.to(cleanRoomId).emit('receiver-completed', data);
    });

    socket.on('transfer-cancel', (data) => {
        if (!data || !data.roomId) return;
        const cleanRoomId = cleanRoom(data.roomId);
        socket.to(cleanRoomId).emit('transfer-cancel', data);
    });

    socket.on('disconnect', () => {
        if (socket.roomId) {
            console.log(`[Socket] ${socket.role || 'Client'} (${socket.id}) disconnected from room: ${socket.roomId}`);
            socket.to(socket.roomId).emit('peer-disconnected', { role: socket.role, socketId: socket.id });
            
            const room = rooms.get(socket.roomId);
            if (room) {
                if (room.sender === socket.id) room.sender = null;
                if (room.receiver === socket.id) room.receiver = null;
                if (!room.sender && !room.receiver) {
                    rooms.delete(socket.roomId);
                }
            }
        }
    });
});

async function startTunnel(port) {
    if (cloudflared) {
        try {
            console.log('⚡ Starting Cloudflare Quick Tunnel...');
            const tunnel = await cloudflared.tunnel({ port: port });
            const url = await tunnel.url;
            if (url) {
                publicTunnelUrl = url;
                console.log(`==================================================`);
                console.log(`🌍 PUBLIC INTERNET SHARE URL (Cloudflare - Direct Access!):`);
                console.log(`🔗 ${url}`);
                console.log(`==================================================\n`);
                return;
            }
        } catch (e) {
            console.log('Cloudflare tunnel skipped, trying Ngrok...');
        }
    }

    if (ngrok && process.env.NGROK_AUTHTOKEN) {
        try {
            console.log('⚡ Starting Ngrok Tunnel...');
            const listener = await ngrok.connect({ addr: port, authtoken: process.env.NGROK_AUTHTOKEN });
            const url = listener.url();
            if (url) {
                publicTunnelUrl = url;
                console.log(`==================================================`);
                console.log(`🌍 PUBLIC INTERNET SHARE URL (Ngrok Tunnel):`);
                console.log(`🔗 ${url}`);
                console.log(`==================================================\n`);
                return;
            }
        } catch (e) {
            console.log('Ngrok tunnel skipped, trying Tunnelmole...');
        }
    }

    if (tunnelmole) {
        try {
            console.log('⚡ Starting Tunnelmole Tunnel...');
            const tunnelUrl = await tunnelmole({ port: port });
            if (tunnelUrl) {
                publicTunnelUrl = tunnelUrl;
                console.log(`==================================================`);
                console.log(`🌍 PUBLIC INTERNET SHARE URL (Tunnelmole):`);
                console.log(`🔗 ${tunnelUrl}`);
                console.log(`==================================================\n`);
                return;
            }
        } catch (e) {
            console.log('Tunnelmole skipped, trying Localtunnel...');
        }
    }

    if (localtunnel) {
        try {
            console.log('⚡ Starting Localtunnel Fallback...');
            const tunnel = await localtunnel({ port: port });
            publicTunnelUrl = tunnel.url;
            console.log(`==================================================`);
            console.log(`🌍 PUBLIC INTERNET SHARE URL (Localtunnel):`);
            console.log(`🔗 ${tunnel.url}`);
            console.log(`🔑 IP Password (if prompted): ${publicIpAddress}`);
            console.log(`==================================================\n`);

            tunnel.on('close', () => {
                publicTunnelUrl = null;
            });
        } catch (err) {
            console.log('⚠️ Tunnel fallback notice: Use WiFi IP URL:', `http://${localIp}:${port}`);
        }
    }
}

function startServer(port) {
    server.listen(port, async () => {
        const localUrl = `http://localhost:${port}`;
        const wifiUrl = `http://${localIp}:${port}`;
        console.log(`\n==================================================`);
        console.log(`🚀 P2P File Share Server Running!`);
        console.log(`🔒 Security Status: Zero-Storage Encrypted P2P Active`);
        console.log(`💻 Local PC URL:      ${localUrl}/sender`);
        console.log(`📱 Same WiFi / Phone: ${wifiUrl}/sender`);
        console.log(`==================================================\n`);

        if (process.env.NODE_ENV !== 'production' && !process.env.RENDER) {
            startTunnel(port);
        } else {
            console.log(`🌍 Cloud Deployment Mode Active! Serviced via Cloud Domain.`);
        }
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`⚠️ Port ${port} is busy, attempting port ${port + 1}...`);
            startServer(port + 1);
        } else {
            console.error('Server error:', err);
        }
    });
}

startServer(PORT);