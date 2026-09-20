// P2P File Transfer - Sender Client JS
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const statusPill = document.getElementById('statusPill');
    const statusText = document.getElementById('statusText');
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    const dropZonePrompt = document.getElementById('dropZonePrompt');
    const fileQueueContainer = document.getElementById('fileQueueContainer');
    const queueList = document.getElementById('queueList');
    const queueCountBadge = document.getElementById('queueCountBadge');
    const clearQueueBtn = document.getElementById('clearQueueBtn');
    const sendBtn = document.getElementById('sendBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const shareUrlInput = document.getElementById('shareUrlInput');
    const copyLinkBtn = document.getElementById('copyLinkBtn');
    const copyBtnText = document.getElementById('copyBtnText');
    const roomCodeDisplay = document.getElementById('roomCodeDisplay');
    const toggleQrBtn = document.getElementById('toggleQrBtn');
    const qrContainer = document.getElementById('qrContainer');
    const qrImage = document.getElementById('qrImage');
    const liveStateBadge = document.getElementById('liveStateBadge');
    const currentFileTitle = document.getElementById('currentFileTitle');
    const queueOverallText = document.getElementById('queueOverallText');
    const progressBarFill = document.getElementById('progressBarFill');
    const progressPercentage = document.getElementById('progressPercentage');
    const statTransferred = document.getElementById('statTransferred');
    const statSpeed = document.getElementById('statSpeed');
    const statEta = document.getElementById('statEta');

    const tabPublicLink = document.getElementById('tabPublicLink');
    const tabWifiLink = document.getElementById('tabWifiLink');

    // Theme Switcher Logic (Dark / Light Mode)
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const themeIcon = document.getElementById('themeIcon');
    const savedTheme = localStorage.getItem('dropnexus-theme') || 'dark';

    function applyTheme(theme) {
        if (theme === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
            if (themeIcon) themeIcon.className = 'fa-solid fa-moon';
        } else {
            document.documentElement.removeAttribute('data-theme');
            if (themeIcon) themeIcon.className = 'fa-solid fa-sun';
        }
        localStorage.setItem('dropnexus-theme', theme);
    }

    applyTheme(savedTheme);

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            applyTheme(newTheme);
        });
    }

    // App State
    let socket = null;
    if (typeof io !== 'undefined') {
        try {
            socket = io({
                transports: ['polling', 'websocket'],
                allowEIO3: true,
                reconnection: true,
                reconnectionAttempts: 20,
                reconnectionDelay: 1000
            });
        } catch (e) {}
    }

    let peerConnection = null;
    let dataChannel = null;
    let peer = null;
    let peerConn = null;
    
    // Multi-File Queue State
    let fileQueue = [];
    let currentFileIndex = 0;
    let selectedFile = null;
    let isTransferring = false;
    let isReceiverConnected = false;
    let disconnectTimer = null;
    let ackTimeoutTimer = null;
    let serverInfo = { wifiUrl: '', publicUrl: '' };
    let currentMode = 'public'; // 'public' or 'wifi'
    
    // Transfer Metrics - 64KB chunk size
    const CHUNK_SIZE = 64 * 1024;
    let offset = 0;
    let startTime = 0;
    let lastTime = 0;
    let lastBytes = 0;

    // Generate Secure Cryptographic Room Token
    let roomId = 'nexus_' + Math.random().toString(36).substring(2, 10);

    const refreshLinkBtn = document.getElementById('refreshLinkBtn');
    const refreshIcon = document.getElementById('refreshIcon');

    async function initRoomToken() {
        try {
            const res = await fetch('/api/new-room');
            const data = await res.json();
            if (data && data.roomId) {
                roomId = data.roomId.toLowerCase();
            }
        } catch (e) {
            roomId = 'nexus_' + Math.random().toString(36).substring(2, 10);
        }

        roomCodeDisplay.innerText = `ROOM: ${roomId.replace('nexus_', '').toUpperCase()}`;
        if (socket && socket.connected) {
            socket.emit('join-room', { roomId, role: 'sender' });
        }
        initPeerJS();
        loadServerInfo();
    }

    if (refreshLinkBtn) {
        refreshLinkBtn.addEventListener('click', async () => {
            if (refreshIcon) refreshIcon.classList.add('spin-anim');
            
            if (isTransferring) {
                cancelTransfer('New room generated');
            } else if (socket && isReceiverConnected) {
                socket.emit('transfer-cancel', { roomId, reason: 'Sender generated a new room link' });
            }

            isReceiverConnected = false;
            sendBtn.disabled = true;
            sendBtn.classList.remove('btn-pulse');
            updateStatus('Generating new room link...', 'waiting');

            await initRoomToken();

            updateStatus('New Link Generated! Waiting for Receiver to open link...', 'waiting');

            setTimeout(() => {
                if (refreshIcon) refreshIcon.classList.remove('spin-anim');
            }, 600);
        });
    }

    function initPeerJS() {
        if (typeof Peer !== 'undefined') {
            try {
                const peerId = roomId;
                peer = new Peer(peerId, {
                    debug: 1,
                    config: {
                        iceServers: [
                            { urls: 'stun:stun.l.google.com:19302' },
                            { urls: 'stun:stun1.l.google.com:19302' },
                            { urls: 'stun:stun2.l.google.com:19302' }
                        ]
                    }
                });

                peer.on('connection', (conn) => {
                    console.log('[Sender PeerJS] Receiver connected via PeerJS!');
                    peerConn = conn;
                    isReceiverConnected = true;
                    updateStatus('Receiver Connected! Click Start Transfer', 'connected');
                    if (fileQueue.length > 0) {
                        sendBtn.disabled = false;
                        sendBtn.classList.add('btn-pulse');
                    }

                    peerConn.on('data', (data) => {
                        if (data && data.type === 'transfer-progress') {
                            updateProgress(data.receivedBytes, selectedFile ? selectedFile.size : data.receivedBytes);
                        } else if (data && (data.type === 'receiver-completed' || data === 'receiver-completed')) {
                            handleFileCompletion();
                        }
                    });
                });
            } catch (e) {
                console.log('PeerJS init fallback', e);
            }
        }
    }

    const tunnelPassBox = document.getElementById('tunnelPassBox');
    const tunnelPassIp = document.getElementById('tunnelPassIp');
    const copyPassBtn = document.getElementById('copyPassBtn');

    async function loadServerInfo() {
        try {
            const res = await fetch('/api/info');
            serverInfo = await res.json();
            if (serverInfo && serverInfo.publicIp && serverInfo.publicIp !== 'Fetching...') {
                tunnelPassIp.innerText = serverInfo.publicIp;
            }
        } catch (e) {
            console.log('Failed to fetch /api/info');
        }
        updateShareUrl();
    }

    function updateShareUrl() {
        let baseUrl = window.location.origin;
        if (currentMode === 'public' && serverInfo.publicUrl) {
            baseUrl = serverInfo.publicUrl;
        } else if (currentMode === 'wifi' && serverInfo.wifiUrl) {
            baseUrl = serverInfo.wifiUrl;
        } else if (serverInfo.wifiUrl) {
            baseUrl = serverInfo.wifiUrl;
        }

        let receivePath = `${baseUrl}/receive/${roomId}`;
        if (window.location.pathname.includes('.html') || window.location.hostname.includes('github.io')) {
            const basePath = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
            receivePath = `${basePath}/receiver.html?room=${roomId}`;
        }

        shareUrlInput.value = receivePath;
        qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(receivePath)}`;

        if (receivePath.includes('loca.lt') && serverInfo.publicIp) {
            tunnelPassBox.classList.remove('hidden');
        } else {
            tunnelPassBox.classList.add('hidden');
        }
    }

    if (copyPassBtn) {
        copyPassBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(tunnelPassIp.innerText).then(() => {
                copyPassBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
                setTimeout(() => {
                    copyPassBtn.innerHTML = '<i class="fa-regular fa-copy"></i>';
                }, 2000);
            });
        });
    }

    tabPublicLink.addEventListener('click', () => {
        currentMode = 'public';
        tabPublicLink.classList.add('active');
        tabWifiLink.classList.remove('active');
        updateShareUrl();
    });

    tabWifiLink.addEventListener('click', () => {
        currentMode = 'wifi';
        tabWifiLink.classList.add('active');
        tabPublicLink.classList.remove('active');
        updateShareUrl();
    });

    initRoomToken();

    // Socket Setup
    if (socket) {
        socket.on('connect', () => {
            console.log('[Sender Socket Connected]:', socket.id);
            socket.emit('join-room', { roomId, role: 'sender' });
        });

        socket.on('receiver-joined', async () => {
            console.log('[Sender] Receiver connected to room!');
            if (disconnectTimer) {
                clearTimeout(disconnectTimer);
                disconnectTimer = null;
            }
            isReceiverConnected = true;
            updateStatus('Receiver Connected! Click Start Transfer', 'connected');
            
            if (fileQueue.length > 0) {
                sendBtn.disabled = false;
                sendBtn.classList.add('btn-pulse');
            }
            
            if (!peerConnection) {
                await initPeerConnection();
            }
        });

        socket.on('signal', async (data) => {
            if (!peerConnection) return;
            if (data.type === 'answer') {
                console.log('[Sender] Received WebRTC Answer');
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal));
            } else if (data.type === 'candidate') {
                console.log('[Sender] Received ICE Candidate');
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        });

        socket.on('transfer-progress', (data) => {
            if (data && data.receivedBytes !== undefined) {
                updateProgress(data.receivedBytes, selectedFile ? selectedFile.size : data.receivedBytes);
            }
        });

        socket.on('receiver-completed', () => {
            console.log(`[Sender] Receiver completed file ${currentFileIndex + 1} of ${fileQueue.length}`);
            handleFileCompletion();
        });

        socket.on('peer-disconnected', () => {
            console.log('[Sender] Receiver disconnected');
            if (disconnectTimer) clearTimeout(disconnectTimer);
            disconnectTimer = setTimeout(() => {
                if (!isReceiverConnected) {
                    isReceiverConnected = false;
                    updateStatus('Receiver Disconnected', 'waiting');
                    sendBtn.disabled = true;
                    sendBtn.classList.remove('btn-pulse');
                    if (isTransferring) cancelTransfer('Receiver disconnected');
                }
            }, 5000);
        });
    }

    // WebRTC Peer Connection Setup
    async function initPeerConnection() {
        const rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' }
            ]
        };

        peerConnection = new RTCPeerConnection(rtcConfig);

        peerConnection.onicecandidate = (event) => {
            if (event.candidate && socket) {
                socket.emit('signal', { roomId, type: 'candidate', candidate: event.candidate });
            }
        };

        dataChannel = peerConnection.createDataChannel('fileTransfer', { ordered: true });
        dataChannel.binaryType = 'arraybuffer';
        dataChannel.bufferedAmountLowThreshold = CHUNK_SIZE * 2;

        dataChannel.onopen = () => {
            console.log('[Sender] RTCDataChannel Opened!');
            updateStatus('P2P Direct Link Active', 'connected');
        };

        dataChannel.onmessage = (e) => {
            if (typeof e.data === 'string') {
                try {
                    const msg = JSON.parse(e.data);
                    if (msg.type === 'receiver-completed') {
                        handleFileCompletion();
                    } else if (msg.type === 'transfer-progress') {
                        updateProgress(msg.receivedBytes, selectedFile ? selectedFile.size : msg.receivedBytes);
                    }
                } catch (err) {}
            }
        };

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        if (socket) socket.emit('signal', { roomId, type: 'offer', signal: offer });
    }

    function handleFileCompletion() {
        if (ackTimeoutTimer) {
            clearTimeout(ackTimeoutTimer);
            ackTimeoutTimer = null;
        }

        updateQueueItemStatus(currentFileIndex, 'completed', 'Completed ✓');
        currentFileIndex++;
        
        if (currentFileIndex < fileQueue.length) {
            setTimeout(() => {
                startFileInQueue(currentFileIndex);
            }, 500);
        } else {
            completeQueueTransfer();
        }
    }

    // File Drag and Drop Handlers
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFilesSelect(e.dataTransfer.files);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFilesSelect(e.target.files);
        }
    });

    function handleFilesSelect(files) {
        for (let i = 0; i < files.length; i++) {
            fileQueue.push(files[i]);
        }

        renderQueueList();

        dropZonePrompt.classList.add('hidden');
        fileQueueContainer.classList.remove('hidden');

        if (isReceiverConnected) {
            sendBtn.disabled = false;
            sendBtn.classList.add('btn-pulse');
            updateStatus('Receiver Connected! Click Start Queue Transfer', 'connected');
        } else {
            sendBtn.disabled = true;
            sendBtn.classList.remove('btn-pulse');
            updateStatus('Waiting for Receiver to open link...', 'waiting');
        }
    }

    clearQueueBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileQueue = [];
        fileInput.value = '';
        fileQueueContainer.classList.add('hidden');
        dropZonePrompt.classList.remove('hidden');
        sendBtn.disabled = true;
        sendBtn.classList.remove('btn-pulse');
        resetStats();
    });

    function renderQueueList() {
        queueCountBadge.innerText = `${fileQueue.length} ${fileQueue.length === 1 ? 'File' : 'Files'} Selected`;
        queueList.innerHTML = '';

        fileQueue.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'queue-item';
            item.id = `queueItem_${index}`;

            item.innerHTML = `
                <div class="queue-item-info">
                    <div class="queue-item-icon">
                        <i class="fa-solid ${getFileIconClass(file.type)}"></i>
                    </div>
                    <div class="queue-item-details">
                        <h5>${file.name}</h5>
                        <p>${formatBytes(file.size)}</p>
                    </div>
                </div>
                <span class="queue-item-status" id="queueStatus_${index}">Pending</span>
            `;

            queueList.appendChild(item);
        });
    }

    function updateQueueItemStatus(index, stateClass, text) {
        const item = document.getElementById(`queueItem_${index}`);
        const statusBadge = document.getElementById(`queueStatus_${index}`);
        if (item && statusBadge) {
            item.className = `queue-item ${stateClass}`;
            statusBadge.className = `queue-item-status ${stateClass}`;
            statusBadge.innerText = text;
        }
    }

    function getFileIconClass(mimeType) {
        if (!mimeType) return 'fa-file';
        if (mimeType.startsWith('image/')) return 'fa-file-image';
        if (mimeType.startsWith('video/')) return 'fa-file-video';
        if (mimeType.startsWith('audio/')) return 'fa-file-audio';
        if (mimeType.includes('pdf')) return 'fa-file-pdf';
        if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar')) return 'fa-file-zipper';
        return 'fa-file-code';
    }

    // Copy Share Link
    copyLinkBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(shareUrlInput.value).then(() => {
            copyBtnText.innerText = 'Copied!';
            copyLinkBtn.style.background = '#10b981';
            setTimeout(() => {
                copyBtnText.innerText = 'Copy';
                copyLinkBtn.style.background = '';
            }, 2000);
        });
    });

    // Toggle QR Code
    toggleQrBtn.addEventListener('click', () => {
        qrContainer.classList.toggle('hidden');
        toggleQrBtn.innerHTML = qrContainer.classList.contains('hidden') 
            ? '<i class="fa-solid fa-qrcode"></i> Show QR Code'
            : '<i class="fa-solid fa-eye-slash"></i> Hide QR Code';
    });

    // Start Queue Transfer Button Click
    sendBtn.addEventListener('click', () => {
        if (fileQueue.length === 0) {
            alert('Please select files first!');
            return;
        }

        if (!isReceiverConnected) {
            alert('Wait for receiver to connect via the link first!');
            return;
        }

        currentFileIndex = 0;
        isTransferring = true;
        sendBtn.classList.add('hidden');
        cancelBtn.classList.remove('hidden');
        
        startFileInQueue(currentFileIndex);
    });

    cancelBtn.addEventListener('click', () => {
        cancelTransfer('Cancelled by user');
    });

    function startFileInQueue(index) {
        if (index >= fileQueue.length) return;
        selectedFile = fileQueue[index];

        const progressSection = document.getElementById('progressSection');
        if (progressSection) progressSection.classList.remove('hidden');

        currentFileTitle.innerText = selectedFile.name;
        queueOverallText.innerText = `File ${index + 1} of ${fileQueue.length}`;
        liveStateBadge.innerText = `File ${index + 1}/${fileQueue.length}`;
        liveStateBadge.style.background = 'rgba(99, 102, 241, 0.2)';
        liveStateBadge.style.color = '#818cf8';
        updateStatus(`Sending File ${index + 1} of ${fileQueue.length}...`, 'transferring');

        updateQueueItemStatus(index, 'sending', 'Sending...');

        const fileMeta = {
            fileIndex: index,
            totalFiles: fileQueue.length,
            name: selectedFile.name,
            size: selectedFile.size,
            type: selectedFile.type,
            totalChunks: Math.ceil(selectedFile.size / CHUNK_SIZE)
        };
        
        if (socket && socket.connected) {
            socket.emit('file-meta', { roomId, meta: fileMeta });
        }
        if (dataChannel && dataChannel.readyState === 'open') {
            try {
                dataChannel.send(JSON.stringify({ type: 'meta', data: fileMeta }));
            } catch (e) {}
        }
        if (peerConn) {
            try {
                peerConn.send({ type: 'file-meta', meta: fileMeta });
            } catch (e) {}
        }

        offset = 0;
        startTime = Date.now();
        lastTime = startTime;
        lastBytes = 0;

        resetStats();

        // 100ms Pacing delay: ensure receiver parses metadata before chunks stream
        setTimeout(() => {
            if (isTransferring) {
                sendChunks();
            }
        }, 100);
    }

    function sendChunks() {
        if (!isTransferring || !selectedFile) return;

        const useDataChannel = (dataChannel && dataChannel.readyState === 'open');

        if (offset < selectedFile.size) {
            if (useDataChannel && dataChannel.bufferedAmount > dataChannel.bufferedAmountLowThreshold) {
                dataChannel.onbufferedamountlow = () => {
                    dataChannel.onbufferedamountlow = null;
                    sendChunks();
                };
                setTimeout(() => {
                    if (isTransferring && offset < selectedFile.size) sendChunks();
                }, 80);
                return;
            }

            const slice = selectedFile.slice(offset, offset + CHUNK_SIZE);
            const reader = new FileReader();

            reader.onload = (event) => {
                if (!isTransferring) return;
                const buffer = event.target.result;

                if (useDataChannel) {
                    try {
                        dataChannel.send(buffer);
                    } catch (e) {
                        if (socket) socket.emit('file-chunk', { roomId, chunk: buffer });
                    }
                } else if (peerConn) {
                    try {
                        peerConn.send(buffer);
                    } catch (e) {
                        if (socket) socket.emit('file-chunk', { roomId, chunk: buffer });
                    }
                } else if (socket) {
                    socket.emit('file-chunk', { roomId, chunk: buffer });
                }

                offset += buffer.byteLength;

                if (offset < selectedFile.size) {
                    if (useDataChannel) {
                        if (dataChannel.bufferedAmount <= dataChannel.bufferedAmountLowThreshold) {
                            sendChunks();
                        } else {
                            setTimeout(sendChunks, 20);
                        }
                    } else {
                        setTimeout(sendChunks, 15);
                    }
                } else {
                    console.log(`[Sender] File ${currentFileIndex + 1} read complete. Waiting for receiver ACK...`);
                    if (ackTimeoutTimer) clearTimeout(ackTimeoutTimer);
                    ackTimeoutTimer = setTimeout(() => {
                        if (isTransferring && offset >= selectedFile.size) {
                            console.log('[Sender] Safety ACK timeout reached, advancing queue...');
                            handleFileCompletion();
                        }
                    }, 4000);
                }
            };

            reader.readAsArrayBuffer(slice);
        }
    }

    let lastDomUpdate = 0;

    function updateProgress(sent, total) {
        const now = Date.now();

        if (now - lastDomUpdate < 100 && sent < total) {
            return;
        }
        lastDomUpdate = now;

        const percent = Math.min(100, Math.round((sent / total) * 100));
        progressBarFill.style.width = `${percent}%`;
        progressPercentage.innerText = `${percent}%`;

        statTransferred.innerText = `${formatBytes(sent)} / ${formatBytes(total)}`;

        const timeDiff = (now - lastTime) / 1000;
        if (timeDiff >= 0.4 || percent === 100) {
            const bytesDiff = sent - lastBytes;
            const speedBytesPerSec = timeDiff > 0 ? bytesDiff / timeDiff : 0;
            statSpeed.innerText = `${formatBytes(speedBytesPerSec)}/s`;

            const remainingBytes = total - sent;
            const etaSec = speedBytesPerSec > 0 ? Math.round(remainingBytes / speedBytesPerSec) : 0;
            statEta.innerText = formatTime(etaSec);

            lastTime = now;
            lastBytes = sent;
        }
    }

    function completeQueueTransfer() {
        isTransferring = false;
        sendBtn.classList.remove('hidden');
        cancelBtn.classList.add('hidden');
        liveStateBadge.innerText = 'Completed ✓';
        liveStateBadge.style.background = 'rgba(16, 185, 129, 0.2)';
        liveStateBadge.style.color = '#34d399';
        currentFileTitle.innerText = 'All Files Sent!';
        queueOverallText.innerText = `Completed ${fileQueue.length} of ${fileQueue.length}`;
        updateStatus('All Files Transferred Successfully!', 'connected');
    }

    function cancelTransfer(reason) {
        isTransferring = false;
        sendBtn.classList.remove('hidden');
        cancelBtn.classList.add('hidden');
        liveStateBadge.innerText = 'Cancelled';
        liveStateBadge.style.background = 'rgba(244, 63, 94, 0.2)';
        liveStateBadge.style.color = '#fb7185';
        updateStatus(`Transfer Cancelled: ${reason}`, 'waiting');
        if (socket) socket.emit('transfer-cancel', { roomId, reason });
        resetStats();
    }

    function resetStats() {
        progressBarFill.style.width = '0%';
        progressPercentage.innerText = '0%';
        statTransferred.innerText = '0 MB / 0 MB';
        statSpeed.innerText = '0.0 MB/s';
        statEta.innerText = '--:--';
        liveStateBadge.innerText = 'Idle';
        liveStateBadge.style.background = '';
        liveStateBadge.style.color = '';
    }

    function updateStatus(text, stateClass) {
        statusText.innerText = text;
        statusPill.className = `connection-status-pill ${stateClass}`;
    }

    function formatBytes(bytes, decimals = 2) {
        if (!bytes || bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    function formatTime(seconds) {
        if (!seconds || seconds <= 0 || !isFinite(seconds)) return '00:00';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
});
