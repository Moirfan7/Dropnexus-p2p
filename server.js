const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const localtunnel = require('localtunnel');

const app = express();
const server = http.createServer(app);

// Security Headers Middleware
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

const io = new Server(server, {
    maxHttpBufferSize: 1e8, // 100MB buffer limit
    pingTimeout: 60000,     // 60s heartbeat timeout
    pingInterval: 25000,    // 25s ping interval
    cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;
let publicTunnelUrl = null;

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

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint for server info
app.get('/api/info', (req, res) => {
    res.json({
        localIp: localIp,
        port: PORT,
        wifiUrl: `http://${localIp}:${PORT}`,
        publicUrl: publicTunnelUrl
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

io.on('connection', (socket) => {
    socket.on('join-room', ({ roomId, role }) => {
        // Sanitize roomId
        if (!roomId || typeof roomId !== 'string') return;
        const cleanRoomId = roomId.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 64);
        
        socket.join(cleanRoomId);
        socket.roomId = cleanRoomId;
        socket.role = role;

        if (!rooms.has(cleanRoomId)) {
            rooms.set(cleanRoomId, { sender: null, receiver: null });
        }
        const room = rooms.get(cleanRoomId);

        if (role === 'sender') {
            room.sender = socket.id;
        } else if (role === 'receiver') {
            room.receiver = socket.id;
            io.to(cleanRoomId).emit('receiver-joined', { socketId: socket.id });
        }

        console.log(`[Socket] ${role} (${socket.id}) joined room: ${cleanRoomId}`);
    });

    socket.on('signal', (data) => {
        if (!data || !data.roomId) return;
        socket.to(data.roomId).emit('signal', data);
    });

    socket.on('file-meta', (data) => {
        if (!data || !data.roomId) return;
        socket.to(data.roomId).emit('file-meta', data);
    });

    socket.on('file-chunk', (data) => {
        if (!data || !data.roomId) return;
        socket.to(data.roomId).emit('file-chunk', data);
    });

    socket.on('transfer-progress', (data) => {
        if (!data || !data.roomId) return;
        socket.to(data.roomId).emit('transfer-progress', data);
    });

    socket.on('receiver-completed', (data) => {
        if (!data || !data.roomId) return;
        socket.to(data.roomId).emit('receiver-completed', data);
    });

    socket.on('transfer-cancel', (data) => {
        if (!data || !data.roomId) return;
        socket.to(data.roomId).emit('transfer-cancel', data);
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

        try {
            const tunnel = await localtunnel({ port: port });
            publicTunnelUrl = tunnel.url;
            console.log(`==================================================`);
            console.log(`🌍 PUBLIC INTERNET SHARE URL (Send this to your friend!):`);
            console.log(`🔗 ${tunnel.url}`);
            console.log(`⚠️ Note: Link will work as long as this terminal is running.`);
            console.log(`==================================================\n`);

            tunnel.on('close', () => {
                publicTunnelUrl = null;
                console.log('🔒 Public internet tunnel closed.');
            });
        } catch (err) {
            console.log('⚠️ Localtunnel failed to start. Share on WiFi using:', wifiUrl);
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