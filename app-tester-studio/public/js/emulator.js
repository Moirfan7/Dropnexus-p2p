/**
 * Mobile Device Emulator Controller
 * Manages frame resizing, device presets, orientation, touch translation, and live ADB mirroring
 */

const DevicePresets = {
  iphone15: {
    name: 'iPhone 15 Pro',
    width: 393,
    height: 852,
    radius: 50,
    island: true
  },
  pixel8: {
    name: 'Google Pixel 8',
    width: 412,
    height: 892,
    radius: 40,
    island: false
  },
  s24: {
    name: 'Samsung Galaxy S24',
    width: 384,
    height: 832,
    radius: 36,
    island: false
  },
  tablet: {
    name: 'Tablet 10-inch',
    width: 768,
    height: 1024,
    radius: 28,
    island: false
  }
};

class DeviceEmulator {
  constructor() {
    this.currentPreset = 'iphone15';
    this.isLandscape = false;
    this.scale = 0.85; // Default fit for standard screens
    this.iframe = document.getElementById('emulator-iframe');
    this.deviceWrapper = document.getElementById('device-wrapper');
    this.deviceBezel = document.getElementById('device-bezel');
    this.deviceIsland = document.getElementById('device-island');
    this.adbCanvas = document.getElementById('adb-canvas');
    this.apkInspector = document.getElementById('apk-inspector');
    
    this.isMirroring = false;
    this.mirrorInterval = null;
    this.mirrorDeviceId = null;
    this.nativeWidth = 1080;
    this.nativeHeight = 2400;

    this.logs = [];
    this.logFilter = 'all';
    this.initListeners();
    this.applyPreset(this.currentPreset);
  }

  initListeners() {
    // Window message listener for sandbox bridge
    window.addEventListener('message', (event) => {
      if (!event.data || event.data.source !== 'APPTESTER_EMULATOR_FRAME') return;
      this.handleBridgeMessage(event.data);
    });

    // Hardware Navigation Bar
    document.getElementById('nav-back')?.addEventListener('click', () => this.goBack());
    document.getElementById('nav-home')?.addEventListener('click', () => this.goHome());
    document.getElementById('nav-refresh')?.addEventListener('click', () => this.reload());
    
    // Stage Toolbar
    document.getElementById('tool-rotate')?.addEventListener('click', () => this.toggleOrientation());
    document.getElementById('tool-screenshot')?.addEventListener('click', () => this.captureScreenshot());
    document.getElementById('tool-live-mirror')?.addEventListener('click', () => this.toggleLiveMirror());
    document.getElementById('device-select')?.addEventListener('change', (e) => this.applyPreset(e.target.value));
    document.getElementById('scale-select')?.addEventListener('change', (e) => this.setScale(parseFloat(e.target.value)));

    // Interactive Tap on ADB Canvas
    if (this.adbCanvas) {
      this.adbCanvas.addEventListener('click', (e) => this.handleCanvasClick(e));
    }
  }

  applyPreset(presetKey) {
    const preset = DevicePresets[presetKey] || DevicePresets.iphone15;
    this.currentPreset = presetKey;

    let w = this.isLandscape ? preset.height : preset.width;
    let h = this.isLandscape ? preset.width : preset.height;

    document.documentElement.style.setProperty('--device-width', `${w}px`);
    document.documentElement.style.setProperty('--device-height', `${h}px`);
    document.documentElement.style.setProperty('--device-radius', `${preset.radius}px`);

    if (this.deviceIsland) {
      this.deviceIsland.style.display = preset.island && !this.isLandscape ? 'flex' : 'none';
    }

    this.updateTransform();
  }

  toggleOrientation() {
    this.isLandscape = !this.isLandscape;
    const btn = document.getElementById('tool-rotate');
    if (btn) btn.classList.toggle('active', this.isLandscape);
    this.applyPreset(this.currentPreset);
  }

  setScale(scaleVal) {
    this.scale = scaleVal;
    this.updateTransform();
  }

  updateTransform() {
    if (this.deviceWrapper) {
      this.deviceWrapper.style.transform = `scale(${this.scale})`;
      this.deviceWrapper.style.transformOrigin = 'center top';
    }
  }

  loadUrl(url) {
    this.stopLiveMirror();
    if (this.adbCanvas) this.adbCanvas.style.display = 'none';
    if (this.apkInspector) this.apkInspector.style.display = 'none';
    if (this.iframe) {
      this.iframe.style.display = 'block';
      this.iframe.src = url;
    }
    this.addLog('info', `[Emulator] Loading application: ${url}`);
  }

  loadApkView(apkInfo, version) {
    this.stopLiveMirror();
    if (this.iframe) this.iframe.style.display = 'none';
    if (this.adbCanvas) this.adbCanvas.style.display = 'none';
    if (this.apkInspector) {
      this.apkInspector.style.display = 'flex';
      
      document.getElementById('apk-name-display').innerText = apkInfo.appName || 'Android App';
      document.getElementById('apk-pkg-display').innerText = apkInfo.packageName || 'Unknown Package';
      document.getElementById('apk-ver-display').innerText = version.version || 'v1.0.0';
      
      const permsContainer = document.getElementById('apk-perms-list');
      if (permsContainer) {
        if (apkInfo.permissions && apkInfo.permissions.length > 0) {
          permsContainer.innerHTML = apkInfo.permissions.map(p => 
            `<span class="badge-pill" style="background:#1e293b;border:1px solid #334155;color:#94a3b8;display:inline-block;margin:2px;">${p}</span>`
          ).join('');
        } else {
          permsContainer.innerHTML = '<span style="color:#64748b;font-size:11px;">Standard permissions</span>';
        }
      }
    }
    this.addLog('info', `[APK Inspector] Loaded APK build: ${apkInfo.packageName}`);
  }

  // --- Live Mirroring Methods ---
  toggleLiveMirror() {
    if (this.isMirroring) {
      this.stopLiveMirror();
    } else {
      const devSelect = document.getElementById('target-device-select');
      const devId = devSelect ? devSelect.value : null;
      this.startLiveMirror(devId);
    }
  }

  startLiveMirror(deviceId = null) {
    this.mirrorDeviceId = deviceId;
    this.isMirroring = true;
    const btn = document.getElementById('tool-live-mirror');
    if (btn) {
      btn.classList.add('active');
      btn.innerHTML = '🛑 <span>Stop Mirror</span>';
    }

    if (this.iframe) this.iframe.style.display = 'none';
    if (this.apkInspector) this.apkInspector.style.display = 'none';
    if (this.adbCanvas) this.adbCanvas.style.display = 'block';

    this.addLog('info', `[Mirror] Starting Live Android Device Stream${deviceId ? ` (${deviceId})` : ''}...`);
    this.fetchMirrorFrame();
    
    // Poll frames every 800ms
    if (this.mirrorInterval) clearInterval(this.mirrorInterval);
    this.mirrorInterval = setInterval(() => {
      if (this.isMirroring) this.fetchMirrorFrame();
    }, 900);
  }

  stopLiveMirror() {
    this.isMirroring = false;
    if (this.mirrorInterval) {
      clearInterval(this.mirrorInterval);
      this.mirrorInterval = null;
    }
    const btn = document.getElementById('tool-live-mirror');
    if (btn) {
      btn.classList.remove('active');
      btn.innerHTML = '📱 <span>Live Mirror</span>';
    }
    if (this.adbCanvas) this.adbCanvas.style.display = 'none';
    if (this.iframe) this.iframe.style.display = 'block';
    this.addLog('info', '[Mirror] Stopped Live Screen Mirroring.');
  }

  fetchMirrorFrame() {
    if (!this.adbCanvas) return;
    const devParam = this.mirrorDeviceId ? `deviceId=${encodeURIComponent(this.mirrorDeviceId)}&` : '';
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.nativeWidth = img.width;
      this.nativeHeight = img.height;
      this.adbCanvas.width = img.width;
      this.adbCanvas.height = img.height;
      const ctx = this.adbCanvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
    };
    img.src = `/api/adb/screenshot?${devParam}t=${Date.now()}`;
  }

  async handleCanvasClick(e) {
    if (!this.isMirroring || !this.adbCanvas) return;
    const rect = this.adbCanvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const realX = Math.round((clickX / rect.width) * this.nativeWidth);
    const realY = Math.round((clickY / rect.height) * this.nativeHeight);

    try {
      await fetch('/api/adb/tap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: realX, y: realY, deviceId: this.mirrorDeviceId })
      });
      // Trigger instant frame refresh
      setTimeout(() => this.fetchMirrorFrame(), 200);
    } catch (err) {
      console.warn('Tap error:', err);
    }
  }

  async sendAdbKey(keycode) {
    if (!this.isMirroring) return;
    try {
      await fetch('/api/adb/key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keycode, deviceId: this.mirrorDeviceId })
      });
      setTimeout(() => this.fetchMirrorFrame(), 200);
    } catch (err) {}
  }

  reload() {
    if (this.isMirroring) {
      this.fetchMirrorFrame();
      this.addLog('info', '[Mirror] Refreshed device screen.');
      return;
    }
    if (this.iframe && this.iframe.style.display !== 'none') {
      try {
        this.iframe.contentWindow.postMessage({ target: 'EMULATED_APP', action: 'RELOAD' }, '*');
      } catch (e) {
        this.iframe.src = this.iframe.src;
      }
    }
    this.addLog('info', '[Emulator] Reloaded screen.');
  }

  goBack() {
    if (this.isMirroring) {
      this.sendAdbKey(4); // Android KEYCODE_BACK
      this.addLog('info', '[Navigation] Sent ADB BACK key.');
      return;
    }
    if (this.iframe && this.iframe.style.display !== 'none') {
      try {
        this.iframe.contentWindow.history.back();
      } catch (e) {}
    }
    this.addLog('info', '[Navigation] Back button pressed.');
  }

  goHome() {
    if (this.isMirroring) {
      this.sendAdbKey(3); // Android KEYCODE_HOME
      this.addLog('info', '[Navigation] Sent ADB HOME key.');
      return;
    }
    this.reload();
    this.addLog('info', '[Navigation] Home button pressed.');
  }

  handleBridgeMessage(payload) {
    const { type, data, timestamp } = payload;
    if (type === 'CONSOLE_LOG') {
      this.addLog(data.level, data.message, timestamp);
    } else if (type === 'RUNTIME_ERROR') {
      const msg = `❌ [Runtime Error] ${data.message} at ${data.filename}:${data.lineno}`;
      this.addLog('error', msg, timestamp, data.stack);
      
      if (window.BugTracker) {
        window.BugTracker.onAutoErrorDetected(data);
      }
    } else if (type === 'PROMISE_REJECTION') {
      this.addLog('error', `⚠️ [Unhandled Promise] ${data.message}`, timestamp, data.stack);
    }
  }

  addLog(level, message, time = null, stack = null) {
    const logTime = time || new Date().toLocaleTimeString();
    const entry = { level, message, time: logTime, stack };
    this.logs.push(entry);

    const output = document.getElementById('console-output');
    if (!output) return;

    if (this.logFilter === 'all' || this.logFilter === level) {
      const row = document.createElement('div');
      row.className = `log-entry ${level}`;
      row.innerHTML = `
        <span class="log-time">[${logTime}]</span>
        <span class="log-msg">${this.escapeHtml(message)}</span>
      `;
      if (stack) {
        const stackDiv = document.createElement('div');
        stackDiv.style.fontSize = '10.5px';
        stackDiv.style.color = '#fca5a5';
        stackDiv.style.marginTop = '4px';
        stackDiv.style.whiteSpace = 'pre-wrap';
        stackDiv.innerText = stack;
        row.appendChild(stackDiv);
      }
      output.appendChild(row);
      output.scrollTop = output.scrollHeight;
    }
  }

  clearLogs() {
    this.logs = [];
    const output = document.getElementById('console-output');
    if (output) output.innerHTML = '';
  }

  setLogFilter(filter) {
    this.logFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    
    const output = document.getElementById('console-output');
    if (!output) return;
    output.innerHTML = '';
    this.logs.forEach(log => {
      if (filter === 'all' || log.level === filter) {
        const row = document.createElement('div');
        row.className = `log-entry ${log.level}`;
        row.innerHTML = `
          <span class="log-time">[${log.time}]</span>
          <span class="log-msg">${this.escapeHtml(log.message)}</span>
        `;
        output.appendChild(row);
      }
    });
    output.scrollTop = output.scrollHeight;
  }

  captureScreenshot() {
    this.addLog('info', '[Capture] Emulator screenshot snapshot taken.');
    alert("📸 Emulator screenshot taken! You can attach this when recording a bug.");
  }

  escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}

window.DeviceEmulator = DeviceEmulator;
