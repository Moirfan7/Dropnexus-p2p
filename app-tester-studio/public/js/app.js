/**
 * AppForge Studio Main Application Controller
 */

class AppForgeStudio {
  constructor() {
    this.projects = [];
    this.currentProject = null;
    this.currentVersion = null;
    this.adbInfo = null;

    this.emulator = new DeviceEmulator();
    this.bugTracker = new BugTracker();
    window.BugTracker = this.bugTracker;

    this.init();
  }

  async init() {
    this.setupListeners();
    this.setupUploadHandlers();
    await this.checkAdbStatus();
    await this.loadProjects();
  }

  setupListeners() {
    // Tab switching (Console vs Bug Tracker)
    document.querySelectorAll('.panel-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        tab.classList.add('active');
        const targetId = tab.dataset.tab;
        const targetEl = document.getElementById(targetId);
        if (targetEl) targetEl.classList.add('active');
      });
    });

    // Console filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.emulator.setLogFilter(btn.dataset.filter);
      });
    });

    // Clear logs button
    document.getElementById('btn-clear-logs')?.addEventListener('click', () => {
      this.emulator.clearLogs();
    });

    // Project selector
    document.getElementById('project-select')?.addEventListener('change', (e) => {
      const proj = this.projects.find(p => p.id === e.target.value);
      if (proj) this.selectProject(proj);
    });

    // Sample buttons
    document.getElementById('btn-load-sample-v1')?.addEventListener('click', () => {
      this.loadSampleVersion('v1.0.0');
    });

    document.getElementById('btn-load-sample-v2')?.addEventListener('click', () => {
      this.loadSampleVersion('v1.0.1');
    });

    // ADB Run Button inside APK Inspector
    document.getElementById('btn-adb-run')?.addEventListener('click', () => {
      this.runOnAdbDevice();
    });
  }

  setupUploadHandlers() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');

    if (!dropzone || !fileInput) return;

    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        fileInput.files = e.dataTransfer.files;
        this.handleFileSelected(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.handleFileSelected(e.target.files[0]);
      }
    });

    document.getElementById('upload-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.uploadApp();
    });
  }

  handleFileSelected(file) {
    const filenameDisplay = document.getElementById('selected-filename');
    if (filenameDisplay) {
      filenameDisplay.innerText = `Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
      filenameDisplay.style.display = 'block';
    }

    const nameInput = document.getElementById('project-name-input');
    if (nameInput && !nameInput.value) {
      const extIndex = file.name.lastIndexOf('.');
      nameInput.value = extIndex > 0 ? file.name.substring(0, extIndex) : file.name;
    }
  }

  async uploadApp() {
    const fileInput = document.getElementById('file-input');
    const nameInput = document.getElementById('project-name-input');
    const versionInput = document.getElementById('version-input');
    const submitBtn = document.getElementById('btn-upload-submit');

    if (!fileInput.files || fileInput.files.length === 0) {
      alert('Kripya ek .apk ya .zip file chunein.');
      return;
    }

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('appFile', file);
    formData.append('projectName', nameInput.value.trim());
    formData.append('version', versionInput.value.trim() || 'v1.0.0');

    submitBtn.disabled = true;
    submitBtn.innerHTML = '⏳ Uploading & Processing...';

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (data.success) {
        alert(`✅ App upload ho gaya! Version ${data.currentVersion.version} ready for testing.`);
        
        // Reset form
        fileInput.value = '';
        document.getElementById('selected-filename').style.display = 'none';
        
        await this.loadProjects();
        const updatedProj = this.projects.find(p => p.id === data.project.id);
        if (updatedProj) {
          this.selectProject(updatedProj, data.currentVersion.version);
        }
      } else {
        alert('Upload failed: ' + data.error);
      }
    } catch (err) {
      alert('Upload error: ' + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '🚀 Upload & Test App';
    }
  }

  async loadProjects() {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      this.projects = data.projects || [];
      this.renderProjectSelector();

      if (!this.currentProject && this.projects.length > 0) {
        this.selectProject(this.projects[0]);
      } else if (this.currentProject) {
        const refreshed = this.projects.find(p => p.id === this.currentProject.id);
        if (refreshed) this.selectProject(refreshed, this.currentVersion?.version);
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
    }
  }

  renderProjectSelector() {
    const select = document.getElementById('project-select');
    if (!select) return;

    select.innerHTML = this.projects.map(p => 
      `<option value="${p.id}" ${this.currentProject?.id === p.id ? 'selected' : ''}>${p.name} (${p.type.toUpperCase()})</option>`
    ).join('');
  }

  selectProject(project, targetVersionStr = null) {
    this.currentProject = project;
    this.renderProjectSelector();

    const versions = project.versions || [];
    let versionToLoad = versions[0];
    if (targetVersionStr) {
      const found = versions.find(v => v.version === targetVersionStr);
      if (found) versionToLoad = found;
    }

    this.selectVersion(versionToLoad);
    this.renderVersionsList();
    this.renderMetadata();
  }

  selectVersion(version) {
    if (!version) return;
    this.currentVersion = version;

    // Update active badge in header
    const currentVerBadge = document.getElementById('current-version-pill');
    if (currentVerBadge) {
      currentVerBadge.innerText = `${this.currentProject.name} — ${version.version}`;
    }

    // Pass context to bug tracker
    this.bugTracker.setContext(this.currentProject, version);

    // Load into emulator
    if (this.currentProject.type === 'apk') {
      this.emulator.loadApkView(version.apkInfo || {}, version);
    } else {
      const url = version.entryPath || '/sample/v1/index.html';
      this.emulator.loadUrl(url);
    }

    this.renderVersionsList();
    this.renderMetadata();
  }

  loadSampleVersion(verStr) {
    const sampleProj = this.projects.find(p => p.id === 'proj_swiftbite');
    if (sampleProj) {
      this.selectProject(sampleProj, verStr);
    }
  }

  renderVersionsList() {
    const container = document.getElementById('version-list-container');
    if (!container || !this.currentProject) return;

    const versions = this.currentProject.versions || [];
    container.innerHTML = versions.map(v => {
      const isActive = this.currentVersion?.version === v.version;
      const isApk = this.currentProject.type === 'apk';
      const typeBadge = isApk ? '<span class="badge-pill badge-apk">APK</span>' : '<span class="badge-pill badge-web">WEB</span>';

      return `
        <div class="version-card ${isActive ? 'active' : ''}" onclick="window.App.selectVersionByStr('${v.version}')">
          <div>
            <div class="version-tag">
              ${typeBadge}
              <span>${v.version}</span>
            </div>
            <div class="version-time">${new Date(v.uploadedAt).toLocaleTimeString()} · ${v.notes || 'Build'}</div>
          </div>
          <div>
            ${isActive ? '<span class="badge-pill badge-ok">Testing Now</span>' : '<span style="font-size:11px;color:#9ca3af;">Select →</span>'}
          </div>
        </div>
      `;
    }).join('');
  }

  selectVersionByStr(verStr) {
    const v = this.currentProject?.versions.find(ver => ver.version === verStr);
    if (v) this.selectVersion(v);
  }

  renderMetadata() {
    const typeEl = document.getElementById('meta-type');
    const verEl = document.getElementById('meta-version');
    const createdEl = document.getElementById('meta-uploaded');

    if (typeEl) typeEl.innerText = (this.currentProject?.type || 'web').toUpperCase();
    if (verEl) verEl.innerText = this.currentVersion?.version || 'N/A';
    if (createdEl && this.currentVersion?.uploadedAt) {
      createdEl.innerText = new Date(this.currentVersion.uploadedAt).toLocaleDateString();
    }
  }

  async checkAdbStatus() {
    try {
      const res = await fetch('/api/adb/status');
      const data = await res.json();
      this.adbInfo = data;

      const adbStatusDot = document.getElementById('adb-status-dot');
      const adbStatusText = document.getElementById('adb-status-text');
      const devSelect = document.getElementById('target-device-select');

      if (data.available) {
        const devices = data.devices || [];
        if (devices.length > 0) {
          adbStatusDot.style.background = '#10b981';
          adbStatusDot.style.boxShadow = '0 0 8px #10b981';
          adbStatusText.innerText = `ADB: ${devices.length} Online`;

          if (devSelect) {
            devSelect.style.display = 'block';
            devSelect.innerHTML = devices.map(d => {
              const label = d.serial.startsWith('emulator') ? `🤖 Virtual Emulator (${d.serial})` : `📱 Phone (${d.model || d.serial})`;
              return `<option value="${d.serial}">${label}</option>`;
            }).join('');
            
            devSelect.onchange = (e) => {
              if (this.emulator) this.emulator.mirrorDeviceId = e.target.value;
            };
            if (this.emulator) this.emulator.mirrorDeviceId = devices[0].serial;
          }
        } else {
          adbStatusDot.style.background = '#f59e0b';
          adbStatusDot.style.boxShadow = '0 0 8px #f59e0b';
          adbStatusText.innerText = 'ADB Ready (0 Devices)';
          if (devSelect) devSelect.style.display = 'none';
        }
      } else {
        adbStatusDot.style.background = '#ef4444';
        adbStatusDot.style.boxShadow = '0 0 8px #ef4444';
        adbStatusText.innerText = 'ADB Not Detected';
        if (devSelect) devSelect.style.display = 'none';
      }
    } catch (e) {
      console.warn('ADB status check error:', e);
    }
  }

  async runOnAdbDevice() {
    if (!this.currentVersion?.fullDiskPath) {
      alert('Is version ke liye APK file disk par uplabdh nahi hai.');
      return;
    }

    if (!this.adbInfo?.devices || this.adbInfo.devices.length === 0) {
      alert('Koi Android Device ya Emulator connected nahi mila.\n\nKripya phone ko USB se connect karke USB Debugging on karein, ya local Android Emulator start karein!');
      return;
    }

    const devSelect = document.getElementById('target-device-select');
    const targetDev = devSelect?.value || this.adbInfo.devices[0].serial;
    const btn = document.getElementById('btn-adb-run');
    btn.disabled = true;
    btn.innerText = '⏳ Installing on Device...';

    try {
      const res = await fetch('/api/adb/install-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apkDiskPath: this.currentVersion.fullDiskPath,
          packageName: this.currentVersion.apkInfo?.packageName,
          launchableActivity: this.currentVersion.apkInfo?.launchableActivity,
          deviceId: targetDev
        })
      });

      const data = await res.json();
      if (data.success) {
        alert(`✅ APK Device (${targetDev}) par successfully install aur launch ho gaya!`);
        this.emulator.addLog('info', `[ADB] Installed and launched on ${targetDev}`);
      } else {
        alert('ADB Error: ' + data.error);
      }
    } catch (err) {
      alert('Request error: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.innerText = '▶️ Install & Run on Local Android Device';
    }
  }

  async refreshProjectData() {
    await this.loadProjects();
  }
}

// Instantiate on load
window.addEventListener('DOMContentLoaded', () => {
  window.App = new AppForgeStudio();
});
