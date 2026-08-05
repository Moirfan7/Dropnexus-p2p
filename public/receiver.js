// P2P File Transfer - Receiver Client JS
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const statusPill = document.getElementById('statusPill');
    const statusText = document.getElementById('statusText');
    const roomBadge = document.getElementById('roomBadge');
    const queueIndicator = document.getElementById('queueIndicator');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const fileType = document.getElementById('fileType');
    const fileTypeIcon = document.getElementById('fileTypeIcon');
    const liveStateBadge = document.getElementById('liveStateBadge');
    const progressBarFill = document.getElementById('progressBarFill');
    const progressPercentage = document.getElementById('progressPercentage');
    const statReceived = document.getElementById('statReceived');
    const statSpeed = document.getElementById('statSpeed');
    const statEta = document.getElementById('statEta');
    const waitMsg = document.getElementById('waitMsg');

    // Files Manager DOM Elements
    const filesManagerCard = document.getElementById('filesManagerCard');
    const receivedCountBadge = document.getElementById('receivedCountBadge');
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const downloadSelectedBtn = document.getElementById('downloadSelectedBtn');
    const downloadAllBtn = document.getElementById('downloadAllBtn');
    const receivedFilesList = document.getElementById('receivedFilesList');

    // Helper: Convert any incoming raw Socket / DataChannel / PeerJS chunk into a valid ArrayBuffer
    function ensureArrayBuffer(chunk) {
        if (!chunk) return new ArrayBuffer(0);
        if (chunk instanceof ArrayBuffer) return chunk;
        if (ArrayBuffer.isView(chunk)) {
            return chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
        }
        if (chunk.data && Array.isArray(chunk.data)) {
            return new Uint8Array(chunk.data).buffer;
        }
        if (typeof chunk === 'string') {
            return new TextEncoder().encode(chunk).buffer;
        }
        return new ArrayBuffer(0);
    }

    // Extract Room ID from URL path or query params
    const pathParts = window.location.pathname.split('/');
    let roomId = pathParts[pathParts.length - 1];

    if (!roomId || roomId === 'receive' || roomId.includes('.')) {
        const urlParams = new URLSearchParams(window.location.search);
        roomId = urlParams.get('room') || 'DEFAULT_ROOM';
    }

    roomId = roomId.toLowerCase();
    roomBadge.innerText = `ROOM: ${roomId.replace('nexus_', '').replace('room_', '').toUpperCase()}`;

    // App State
    let socket = null;
    if (typeof io !== 'undefined') {
        try {
            socket = io({
                reconnection: true,
                reconnectionAttempts: 10,
                reconnectionDelay: 1000
            });
        } catch (e) {}
    }

    let peerConnection = null;
    let dataChannel = null;
    let peer = null;
    let peerConn = null;
    let fileMeta = null;
    let receivedChunks = [];
    let receivedBytes = 0;
    let startTime = 0;
    let lastTime = 0;
    let lastBytes = 0;

    // Completed Received Files List State
    let receivedFiles = []; // [{ id, name, size, type, blob, url, checked }]

    // Connect to Socket Room if available
    if (socket) {
        socket.emit('join-room', { roomId, role: 'receiver' });
    }
    updateStatus('Connecting to Sender...', 'connecting');

    // PeerJS Fallback Initialization for GitHub Pages
    if (typeof Peer !== 'undefined') {
        try {
            peer = new Peer({
                debug: 1,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'stun:stun2.l.google.com:19302' }
                    ]
                }
            });

            peer.on('open', () => {
                console.log('[Receiver PeerJS] Connecting to Peer ID:', roomId);
                peerConn = peer.connect(roomId, { reliable: true });

                peerConn.on('open', () => {
                    console.log('[Receiver PeerJS] Connected to Sender Peer!');
                    updateStatus('Connected & Ready (P2P Cloud)', 'connected');
                });

                peerConn.on('data', (data) => {
                    if (data && data.type === 'file-meta') {
                        setupFileMetadata(data.meta);
                    } else {
                        handleBinaryChunk(data);
                    }
                });
            });
        } catch (e) {
            console.log('PeerJS Receiver fallback error', e);
        }
    }

    // WebRTC Signaling Handlers
    if (socket) {
        socket.on('signal', async (data) => {
            if (!peerConnection) {
                await initPeerConnection();
            }

            if (data.type === 'offer') {
                console.log('[Receiver] Received WebRTC Offer');
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                socket.emit('signal', { roomId, type: 'answer', signal: answer });
                updateStatus('Connected & Ready', 'connected');
            } else if (data.type === 'candidate') {
                console.log('[Receiver] Received ICE Candidate');
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        });

        socket.on('file-meta', (data) => {
            if (data && data.meta) {
                console.log('[Receiver] Received File Metadata:', data.meta);
                setupFileMetadata(data.meta);
            }
        });

        socket.on('file-chunk', (data) => {
            if (data && data.chunk) {
                handleBinaryChunk(data.chunk);
            }
        });

        socket.on('transfer-cancel', (data) => {
            updateStatus(`Transfer Cancelled: ${data.reason || 'Sender stopped'}`, 'connecting');
            liveStateBadge.innerText = 'Cancelled';
            liveStateBadge.style.background = 'rgba(244, 63, 94, 0.2)';
            liveStateBadge.style.color = '#fb7185';
            waitMsg.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Transfer was cancelled by Sender.';
        });

        socket.on('peer-disconnected', () => {
            console.log('[Receiver] Sender disconnected');
            updateStatus('Sender Offline / Link Expired', 'connecting');
            waitMsg.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Sender is offline or stopped localhost. Share link expired.';
        });
    }

    // Initialize WebRTC PeerConnection
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

        // Handle Incoming DataChannel
        peerConnection.ondatachannel = (event) => {
            console.log('[Receiver] Data Channel Received');
            dataChannel = event.channel;
            dataChannel.binaryType = 'arraybuffer';

            dataChannel.onmessage = (e) => {
                if (typeof e.data === 'string') {
                    try {
                        const msg = JSON.parse(e.data);
                        if (msg.type === 'meta') setupFileMetadata(msg.data);
                    } catch (err) {}
                } else {
                    handleBinaryChunk(e.data);
                }
            };

            dataChannel.onopen = () => {
                console.log('[Receiver] RTCDataChannel Opened!');
                updateStatus('P2P Direct Link Active', 'connected');
            };
        };
    }

    function handleBinaryChunk(rawChunk) {
        if (!fileMeta) {
            console.warn('[Receiver] Chunk received before file metadata!');
            return;
        }

        const chunk = ensureArrayBuffer(rawChunk);
        if (chunk.byteLength === 0) return;

        if (receivedBytes === 0) {
            startTime = Date.now();
            lastTime = startTime;
            lastBytes = 0;
            liveStateBadge.innerText = `File ${(fileMeta.fileIndex || 0) + 1}/${fileMeta.totalFiles || 1}`;
            liveStateBadge.className = 'badge badge-teal';
            updateStatus(`Receiving File ${(fileMeta.fileIndex || 0) + 1} of ${fileMeta.totalFiles || 1}...`, 'receiving');
            waitMsg.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Receiving data directly from sender...';
        }

        receivedChunks.push(chunk);
        receivedBytes += chunk.byteLength;

        updateProgress(receivedBytes, fileMeta.size);

        if (receivedBytes >= fileMeta.size) {
            completeDownload();
        }
    }

    function setupFileMetadata(meta) {
        fileMeta = meta;
        fileName.innerText = sanitizeHtml(meta.name);
        fileSize.innerText = formatBytes(meta.size);
        fileType.innerText = meta.type || 'Binary File';

        const fileNum = (meta.fileIndex !== undefined ? meta.fileIndex : 0) + 1;
        const totalNum = meta.totalFiles || 1;
        queueIndicator.innerText = `File ${fileNum} of ${totalNum}`;
        fileTypeIcon.innerHTML = `<i class="fa-solid ${getFileIconClass(meta.type)}"></i>`;

        receivedChunks = [];
        receivedBytes = 0;

        resetStats();
        statReceived.innerText = `0 MB / ${formatBytes(meta.size)}`;
        waitMsg.classList.remove('hidden');
        waitMsg.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sender is transferring File ${fileNum} of ${totalNum}...`;
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

    let lastDomUpdate = 0;

    function updateProgress(received, total) {
        const now = Date.now();

        // Send progress ACK to sender
        if (socket) {
            socket.emit('transfer-progress', { roomId, progress: Math.min(100, Math.round((received / total) * 100)), receivedBytes: received });
        }
        if (peerConn) {
            try {
                peerConn.send({ type: 'transfer-progress', receivedBytes: received });
            } catch (e) {}
        }

        // Throttle DOM updates to once every 100ms
        if (now - lastDomUpdate < 100 && received < total) {
            return;
        }
        lastDomUpdate = now;

        const percent = Math.min(100, Math.round((received / total) * 100));
        progressBarFill.style.width = `${percent}%`;
        progressPercentage.innerText = `${percent}%`;

        statReceived.innerText = `${formatBytes(received)} / ${formatBytes(total)}`;

        // Calculate speed & ETA
        const timeDiff = (now - lastTime) / 1000;
        if (timeDiff >= 0.4 || percent === 100) {
            const bytesDiff = received - lastBytes;
            const speedBytesPerSec = timeDiff > 0 ? bytesDiff / timeDiff : 0;
            statSpeed.innerText = `${formatBytes(speedBytesPerSec)}/s`;

            const remainingBytes = total - received;
            const etaSec = speedBytesPerSec > 0 ? Math.round(remainingBytes / speedBytesPerSec) : 0;
            statEta.innerText = formatTime(etaSec);

            lastTime = now;
            lastBytes = received;
        }
    }

    function completeDownload() {
        console.log(`[Receiver] Completed file ${fileMeta.name}, size: ${receivedBytes} bytes`);
        const fileNum = (fileMeta.fileIndex !== undefined ? fileMeta.fileIndex : 0) + 1;
        const totalNum = fileMeta.totalFiles || 1;

        liveStateBadge.innerText = `File ${fileNum} Done ✓`;
        liveStateBadge.style.background = 'rgba(16, 185, 129, 0.2)';
        liveStateBadge.style.color = '#34d399';

        // Notify sender that this file completed
        if (socket) socket.emit('receiver-completed', { roomId, fileIndex: fileMeta.fileIndex });
        if (peerConn) {
            try {
                peerConn.send({ type: 'receiver-completed', fileIndex: fileMeta.fileIndex });
            } catch (e) {}
        }

        // Create Blob from received chunks
        const blob = new Blob(receivedChunks, { type: fileMeta.type || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);

        const fileRecord = {
            id: 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            name: fileMeta.name,
            size: fileMeta.size,
            type: fileMeta.type,
            blob: blob,
            url: url,
            checked: true
        };

        receivedFiles.push(fileRecord);

        // Unhide Received Files Manager Card & render list
        filesManagerCard.classList.remove('hidden');
        renderReceivedFilesList();

        // Auto trigger download for current file
        triggerBlobDownload(url, fileMeta.name);

        if (fileNum >= totalNum) {
            updateStatus('All Files Received & Saved!', 'connected');
            waitMsg.classList.remove('hidden');
            waitMsg.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#10b981;"></i> All files downloaded successfully!';
        } else {
            updateStatus(`File ${fileNum} Received! Waiting for File ${fileNum + 1}...`, 'connected');
        }
    }

    // Files Manager Functions
    function renderReceivedFilesList() {
        receivedCountBadge.innerText = `${receivedFiles.length} ${receivedFiles.length === 1 ? 'File' : 'Files'} Ready`;
        receivedFilesList.innerHTML = '';

        receivedFiles.forEach((file) => {
            const item = document.createElement('div');
            item.className = 'received-file-item';

            const nameSafe = sanitizeHtml(file.name);

            item.innerHTML = `
                <div class="file-item-left">
                    <label class="checkbox-container" style="margin-right: 0.3rem;">
                        <input type="checkbox" class="file-select-cb" data-id="${file.id}" ${file.checked ? 'checked' : ''}>
                        <span class="checkmark"></span>
                    </label>
                    <div class="file-item-icon">
                        <i class="fa-solid ${getFileIconClass(file.type)}"></i>
                    </div>
                    <div class="file-item-text">
                        <h4>${nameSafe}</h4>
                        <p>${formatBytes(file.size)} &bull; ${file.type || 'Binary'}</p>
                    </div>
                </div>
                <div class="file-item-right">
                    <a href="${file.url}" download="${nameSafe}" class="btn-icon-save" data-id="${file.id}" title="Save File" target="_blank">
                        <i class="fa-solid fa-file-arrow-down"></i>
                    </a>
                </div>
            `;

            receivedFilesList.appendChild(item);
        });

        // Attach Checkbox Change Listeners
        document.querySelectorAll('.file-select-cb').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const id = e.target.getAttribute('data-id');
                const targetFile = receivedFiles.find(f => f.id === id);
                if (targetFile) targetFile.checked = e.target.checked;
                
                // Update Select All Checkbox state
                const allChecked = receivedFiles.length > 0 && receivedFiles.every(f => f.checked);
                selectAllCheckbox.checked = allChecked;
            });
        });
    }

    // Select All Checkbox Toggle
    selectAllCheckbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        receivedFiles.forEach(f => f.checked = isChecked);
        document.querySelectorAll('.file-select-cb').forEach(cb => cb.checked = isChecked);
    });

    // Download Selected Files Button
    downloadSelectedBtn.addEventListener('click', () => {
        const selected = receivedFiles.filter(f => f.checked);
        if (selected.length === 0) {
            alert('Please select at least one file to download!');
            return;
        }

        selected.forEach((f) => {
            triggerBlobDownload(f.url, f.name);
        });
    });

    // Download All Files Button
    downloadAllBtn.addEventListener('click', () => {
        if (receivedFiles.length === 0) return;

        receivedFiles.forEach((f) => {
            triggerBlobDownload(f.url, f.name);
        });
    });

    function triggerBlobDownload(url, filename) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.target = '_blank';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
        }, 300);
    }

    function resetStats() {
        progressBarFill.style.width = '0%';
        progressPercentage.innerText = '0%';
        statReceived.innerText = '0 MB / 0 MB';
        statSpeed.innerText = '0.0 MB/s';
        statEta.innerText = '--:--';
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

    function sanitizeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }
});
