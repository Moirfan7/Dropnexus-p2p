# 🚀 DropNexus — P2P Unlimited Multi-File Transfer Web App

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green?logo=node.js)](https://nodejs.org/)
[![WebRTC](https://img.shields.io/badge/WebRTC-P2P_Direct-blue?logo=webrtc)](https://webrtc.org/)
[![Socket.io](https://img.shields.io/badge/Socket.io-v4.6-black?logo=socket.io)](https://socket.io/)
[![Security](https://img.shields.io/badge/Security-Zero--Storage-emerald)](https://github.com/)
[![License](https://img.shields.io/badge/License-MIT-purple)](LICENSE)

**DropNexus** is a production-grade, ultra-fast Peer-to-Peer (P2P) file sharing application that lets you transfer files of **any size (unlimited GBs)** directly between browsers anywhere in the world—with zero file size limits, zero server storage, and automatic link expiration when localhost stops.

---

## ✨ Features

- ⚡ **Direct Peer-to-Peer Transfer (WebRTC DataChannel)**: Data transfers directly browser-to-browser at maximum network hardware speed without clogging intermediate servers.
- 🔒 **Zero Server Storage & Cryptographic Privacy**: Files **NEVER** touch the server disk. All transfers occur purely in memory. Room IDs use 128-bit cryptographic tokens (`crypto.randomBytes`).
- 🌍 **Share Anywhere (Public Tunnel & WiFi Hotspot)**:
  - **Public Link**: Automatically generates an HTTPS public internet URL (`localtunnel`) so friends anywhere in the world can connect.
  - **WiFi / Hotspot Link**: Auto-detects local network IPv4 address for instant offline/local network sharing.
- 📱 **Mobile & Desktop QR Code Scanning**: Integrated QR Code generator for 1-tap phone camera scanning.
- 📂 **Sequential Multi-File Queue Transfer**: Select multiple files at once. Files send sequentially (File 1 → File 2 → File 3) with real-time queue badges.
- 📊 **Selective & Batch Receiver Downloads**: Receiver UI features an interactive file list with checkboxes, a **"Download Selected"** button, a **"Download All"** button, and 1-tap native save links.
- 🏎️ **Memory Backpressure & Throttling (Zero Blinking)**: Strict `bufferedAmount` checks and 100ms DOM throttling ensure silky-smooth 60fps transfer rendering with zero screen flickering.
- ⏳ **Expirable Share Links**: The moment you stop the local server in VS Code (`Ctrl+C`), both localhost and the public internet link expire instantly.

---

## 📸 Interfaces

### 📤 Sender Dashboard
- Neon Violet / Indigo Glassmorphism theme.
- Drag-and-Drop upload area with file queue list.
- Public Link vs. WiFi Link tabs.
- QR Code modal toggle.
- Real-time MB/s speed counter, ETA timer, and progress bar.

### 📥 Receiver Dashboard
- Emerald / Teal Glassmorphism theme.
- Auto-joins room via URL parameters (`/receive/:roomId`).
- Real-time receiving progress bar and speed stats.
- Interactive Received Files Manager with checkboxes and batch download actions.

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js, Socket.io, Localtunnel
- **Frontend**: Vanilla HTML5, CSS3 Glassmorphism, Modern ES6+ JavaScript
- **Protocols**: WebRTC (`RTCPeerConnection`, `RTCDataChannel`), WebSockets (Socket.io)
- **STUN Servers**: Public Google STUN Infrastructure (`stun:stun.l.google.com:19302`)

---

## 🚀 Quick Start

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) (v16 or higher) installed on your system.

### 2. Clone Repository
```bash
git clone https://github.com/your-username/p2p-file-share.git
cd p2p-file-share
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Run Application
```bash
npm start
```

### 5. Open in Browser
- **Local PC Sender**: `http://localhost:3000/sender`
- **Mobile / Local Network**: `http://<your-local-ip>:3000/sender`
- **Public Internet Share Link**: Automatically printed in your VS Code terminal log!

---

## 📁 Repository Structure

```
p2p-file-share/
├── package.json          # Project dependencies & scripts
├── server.js             # Express server, Socket.io signaling, security headers, localtunnel
├── .gitignore            # Git exclusion rules
├── LICENSE               # MIT License
└── public/
    ├── sender.html       # Sender UI template
    ├── sender.css        # Sender Glassmorphism stylesheet
    ├── sender.js         # WebRTC DataChannel & Queue Sender logic
    ├── receiver.html     # Receiver UI template
    ├── receiver.css      # Receiver Glassmorphism stylesheet
    └── receiver.js       # WebRTC Receiver & Selective Download Manager
```

---

## 🛡️ Security & Privacy

- **No File Persistence**: All binary chunks stream in memory and vanish immediately after delivery.
- **XSS & Injection Protection**: HTML entity sanitization on filenames.
- **HTTP Security Headers**: Configured `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, and `Cache-Control: no-store`.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) - feel free to use and modify!
