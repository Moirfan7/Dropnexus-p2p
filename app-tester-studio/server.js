const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 4000;

// Enable JSON & CORS
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Directories
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const APKS_DIR = path.join(UPLOADS_DIR, 'apks');
const SANDBOXES_DIR = path.join(UPLOADS_DIR, 'sandboxes');
const DATA_DIR = path.join(__dirname, 'data');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');

// Ensure directories exist
[UPLOADS_DIR, APKS_DIR, SANDBOXES_DIR, DATA_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Locate Android SDK tools
function findAdbPath() {
  const localAppData = process.env.LOCALAPPDATA || '';
  const standardPath = path.join(localAppData, 'Android', 'Sdk', 'platform-tools', 'adb.exe');
  if (fs.existsSync(standardPath)) return standardPath;
  return 'adb'; // fallback to PATH
}

function findAaptPath() {
  const localAppData = process.env.LOCALAPPDATA || '';
  const buildToolsDir = path.join(localAppData, 'Android', 'Sdk', 'build-tools');
  if (fs.existsSync(buildToolsDir)) {
    const versions = fs.readdirSync(buildToolsDir).sort().reverse();
    for (const v of versions) {
      const candidate = path.join(buildToolsDir, v, 'aapt.exe');
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

const ADB_PATH = findAdbPath();
const AAPT_PATH = findAaptPath();

console.log(`[Config] ADB Tool: ${ADB_PATH}`);
console.log(`[Config] AAPT Tool: ${AAPT_PATH || 'Not found (fallback to basic zip inspection)'}`);

// Initial / Seed Database
function getProjectsData() {
  if (!fs.existsSync(PROJECTS_FILE)) {
    const initialData = {
      projects: [
        {
          id: "proj_swiftbite",
          name: "SwiftBite Food Delivery",
          type: "web",
          createdAt: new Date().toISOString(),
          versions: [
            {
              version: "v1.0.0",
              uploadedAt: new Date(Date.now() - 3600000).toISOString(),
              entryPath: "/sample/v1/index.html",
              notes: "Initial buggy build with payment gateway null-pointer error.",
              bugsCount: 1
            },
            {
              version: "v1.0.1",
              uploadedAt: new Date().toISOString(),
              entryPath: "/sample/v2/index.html",
              notes: "Patched payment session token generation. Tested and ready.",
              bugsCount: 0
            }
          ],
          bugs: [
            {
              id: "bug_demo_01",
              projectId: "proj_swiftbite",
              version: "v1.0.0",
              title: "Checkout Error: paymentGatewaySession.getToken() is null",
              description: "Proceed to checkout button click karne par screen freeze ho jati hai aur console me TypeError aata hai.",
              level: "error",
              status: "resolved",
              resolvedInVersion: "v1.0.1",
              createdAt: new Date(Date.now() - 3500000).toISOString(),
              stackTrace: "TypeError: Cannot read properties of null (reading 'getToken')\n    at triggerCheckout (index.html:112:35)\n    at HTMLButtonElement.onclick (index.html:79:65)"
            }
          ]
        }
      ]
    };
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(initialData, null, 2));
    return initialData;
  }
  try {
    return JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
  } catch (err) {
    return { projects: [] };
  }
}

function saveProjectsData(data) {
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(data, null, 2));
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(UPLOADS_DIR, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${Date.now()}_${cleanName}`);
  }
});
const upload = multer({ storage });

// Static Folders
app.use(express.static(path.join(__dirname, 'public')));
app.use('/sandboxes', express.static(SANDBOXES_DIR));
app.use('/apks', express.static(APKS_DIR));

// -------------------------------------------------------------
// REST APIs
// -------------------------------------------------------------

// 1. Get all projects, versions and bugs
app.get('/api/projects', (req, res) => {
  const data = getProjectsData();
  res.json(data);
});

// 2. Upload and parse App (APK or ZIP)
app.post('/api/upload', upload.single('appFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const { projectName, version = 'v1.0.0', projectType } = req.body;
    const originalName = req.file.originalname;
    const ext = path.extname(originalName).toLowerCase();
    const tempFilePath = req.file.path;

    const projId = 'proj_' + (projectName ? projectName.toLowerCase().replace(/[^a-z0-9]/g, '_') : 'app_' + Date.now());
    const displayProjectName = projectName || path.basename(originalName, ext);

    const db = getProjectsData();
    let project = db.projects.find(p => p.id === projId);

    // Is it an Android APK?
    if (ext === '.apk') {
      const apkDestDir = path.join(APKS_DIR, projId, version);
      if (!fs.existsSync(apkDestDir)) fs.mkdirSync(apkDestDir, { recursive: true });
      const finalApkPath = path.join(apkDestDir, path.basename(tempFilePath));
      fs.copyFileSync(tempFilePath, finalApkPath);
      fs.unlinkSync(tempFilePath);

      // Parse APK metadata
      let apkInfo = {
        appName: displayProjectName,
        packageName: 'com.app.' + projId,
        versionName: version,
        versionCode: '1',
        permissions: [],
        launchableActivity: ''
      };

      if (AAPT_PATH) {
        try {
          const badgingOutput = await new Promise((resolve) => {
            exec(`"${AAPT_PATH}" dump badging "${finalApkPath}"`, { timeout: 8000 }, (err, stdout) => {
              if (err) resolve(null);
              else resolve(stdout);
            });
          });

          if (badgingOutput) {
            const pkgMatch = badgingOutput.match(/package: name='([^']+)' versionCode='([^']*)' versionName='([^']*)'/);
            if (pkgMatch) {
              apkInfo.packageName = pkgMatch[1];
              apkInfo.versionCode = pkgMatch[2];
              apkInfo.versionName = pkgMatch[3] || version;
            }
            const labelMatch = badgingOutput.match(/application-label:'([^']+)'/);
            if (labelMatch) apkInfo.appName = labelMatch[1];

            const actMatch = badgingOutput.match(/launchable-activity: name='([^']+)'/);
            if (actMatch) apkInfo.launchableActivity = actMatch[1];

            const permMatches = [...badgingOutput.matchAll(/uses-permission: name='([^']+)'/g)];
            apkInfo.permissions = permMatches.map(m => m[1].replace('android.permission.', ''));
          }
        } catch (e) {
          console.warn('AAPT dump failed:', e.message);
        }
      }

      const versionEntry = {
        version: version,
        uploadedAt: new Date().toISOString(),
        apkPath: `/apks/${projId}/${version}/${path.basename(finalApkPath)}`,
        fullDiskPath: finalApkPath,
        apkInfo: apkInfo,
        notes: `Uploaded APK build (${(req.file.size / (1024 * 1024)).toFixed(2)} MB)`
      };

      if (!project) {
        project = {
          id: projId,
          name: apkInfo.appName || displayProjectName,
          type: 'apk',
          createdAt: new Date().toISOString(),
          versions: [versionEntry],
          bugs: []
        };
        db.projects.unshift(project);
      } else {
        project.type = 'apk';
        const vIndex = project.versions.findIndex(v => v.version === version);
        if (vIndex >= 0) project.versions[vIndex] = versionEntry;
        else project.versions.unshift(versionEntry);
      }

      saveProjectsData(db);
      return res.json({ success: true, project, currentVersion: versionEntry });
    }

    // Is it a Web App / HTML5 / Zip?
    if (ext === '.zip') {
      const sandboxDest = path.join(SANDBOXES_DIR, projId, version);
      if (fs.existsSync(sandboxDest)) fs.rmSync(sandboxDest, { recursive: true, force: true });
      fs.mkdirSync(sandboxDest, { recursive: true });

      const zip = new AdmZip(tempFilePath);
      zip.extractAllTo(sandboxDest, true);
      fs.unlinkSync(tempFilePath);

      // Find HTML entry point
      let entryFile = 'index.html';
      function findIndexHtml(dir, relPath = '') {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && entry.name.toLowerCase() === 'index.html') {
            return path.posix.join(relPath, entry.name);
          }
        }
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const found = findIndexHtml(path.join(dir, entry.name), path.posix.join(relPath, entry.name));
            if (found) return found;
          }
        }
        return null;
      }

      const foundHtml = findIndexHtml(sandboxDest);
      if (foundHtml) {
        entryFile = foundHtml;
      }

      // Inject sandbox-bridge script into the HTML entry file
      const fullHtmlPath = path.join(sandboxDest, entryFile);
      if (fs.existsSync(fullHtmlPath)) {
        let content = fs.readFileSync(fullHtmlPath, 'utf8');
        if (!content.includes('sandbox-bridge.js')) {
          const scriptTag = `\n<!-- Injected AppTester Bridge -->\n<script src="/js/sandbox-bridge.js"></script>\n`;
          if (content.includes('</head>')) {
            content = content.replace('</head>', scriptTag + '</head>');
          } else if (content.includes('</body>')) {
            content = content.replace('</body>', scriptTag + '</body>');
          } else {
            content += scriptTag;
          }
          fs.writeFileSync(fullHtmlPath, content);
        }
      }

      const versionEntry = {
        version: version,
        uploadedAt: new Date().toISOString(),
        entryPath: `/sandboxes/${projId}/${version}/${entryFile}`,
        notes: `Uploaded Web Zip build (${(req.file.size / 1024).toFixed(1)} KB)`
      };

      if (!project) {
        project = {
          id: projId,
          name: displayProjectName,
          type: 'web',
          createdAt: new Date().toISOString(),
          versions: [versionEntry],
          bugs: []
        };
        db.projects.unshift(project);
      } else {
        project.type = 'web';
        const vIndex = project.versions.findIndex(v => v.version === version);
        if (vIndex >= 0) project.versions[vIndex] = versionEntry;
        else project.versions.unshift(versionEntry);
      }

      saveProjectsData(db);
      return res.json({ success: true, project, currentVersion: versionEntry });
    }

    return res.status(400).json({ error: 'Unsupported file type. Please upload a .apk or .zip file.' });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Bug Tracker APIs
app.post('/api/bugs', (req, res) => {
  const { projectId, version, title, description, screenshot, logs, stackTrace, level = 'error' } = req.body;
  if (!projectId || !title) {
    return res.status(400).json({ error: 'Missing projectId or title' });
  }

  const db = getProjectsData();
  const project = db.projects.find(p => p.id === projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const newBug = {
    id: 'bug_' + Date.now(),
    projectId,
    version,
    title,
    description: description || '',
    screenshot: screenshot || null,
    logs: logs || [],
    stackTrace: stackTrace || '',
    level,
    status: 'open', // open | resolved
    createdAt: new Date().toISOString(),
    resolvedInVersion: null
  };

  if (!project.bugs) project.bugs = [];
  project.bugs.unshift(newBug);

  saveProjectsData(db);
  io.emit('bug_created', newBug);
  res.json({ success: true, bug: newBug });
});

app.patch('/api/bugs/:id', (req, res) => {
  const { id } = req.params;
  const { status, resolvedInVersion, description } = req.body;

  const db = getProjectsData();
  let foundBug = null;
  for (const proj of db.projects) {
    if (proj.bugs) {
      const b = proj.bugs.find(bug => bug.id === id);
      if (b) {
        if (status !== undefined) b.status = status;
        if (resolvedInVersion !== undefined) b.resolvedInVersion = resolvedInVersion;
        if (description !== undefined) b.description = description;
        foundBug = b;
        break;
      }
    }
  }

  if (!foundBug) return res.status(404).json({ error: 'Bug not found' });

  saveProjectsData(db);
  io.emit('bug_updated', foundBug);
  res.json({ success: true, bug: foundBug });
});

app.delete('/api/bugs/:id', (req, res) => {
  const { id } = req.params;
  const db = getProjectsData();
  for (const proj of db.projects) {
    if (proj.bugs) {
      const idx = proj.bugs.findIndex(b => b.id === id);
      if (idx >= 0) {
        proj.bugs.splice(idx, 1);
        saveProjectsData(db);
        return res.json({ success: true });
      }
    }
  }
  res.status(404).json({ error: 'Bug not found' });
});

// 4. Local Android ADB Device APIs
app.get('/api/adb/status', (req, res) => {
  exec(`"${ADB_PATH}" devices -l`, (err, stdout, stderr) => {
    if (err) {
      return res.json({ available: false, error: err.message, devices: [] });
    }
    const lines = stdout.split('\n').filter(l => l.trim() && !l.startsWith('List of devices'));
    const devices = lines.map(line => {
      const parts = line.trim().split(/\s+/);
      const serial = parts[0];
      const state = parts[1] || 'unknown';
      const modelMatch = line.match(/model:([^\s]+)/);
      const deviceMatch = line.match(/device:([^\s]+)/);
      return {
        serial,
        state,
        model: modelMatch ? modelMatch[1] : (deviceMatch ? deviceMatch[1] : serial)
      };
    });

    res.json({
      available: true,
      adbPath: ADB_PATH,
      devices
    });
  });
});

app.post('/api/adb/install-run', (req, res) => {
  const { apkDiskPath, packageName, launchableActivity, deviceId } = req.body;
  if (!apkDiskPath || !fs.existsSync(apkDiskPath)) {
    return res.status(400).json({ error: 'APK file not found on disk' });
  }

  const devArg = deviceId ? `-s ${deviceId}` : '';
  const installCmd = `"${ADB_PATH}" ${devArg} install -r "${apkDiskPath}"`;

  exec(installCmd, { timeout: 30000 }, (err, stdout, stderr) => {
    if (err) {
      return res.status(500).json({ error: 'Install failed: ' + (stderr || err.message) });
    }

    // Launch app if package is known
    if (packageName) {
      const launchCmd = launchableActivity
        ? `"${ADB_PATH}" ${devArg} shell am start -n ${packageName}/${launchableActivity}`
        : `"${ADB_PATH}" ${devArg} shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`;

      exec(launchCmd, (launchErr) => {
        res.json({
          success: true,
          message: 'App installed and launched on Android device/emulator!',
          output: stdout
        });
      });
    } else {
      res.json({ success: true, message: 'App installed successfully!', output: stdout });
    }
  });
});

app.get('/api/adb/screenshot', (req, res) => {
  const { deviceId } = req.query;
  const devArg = deviceId ? `-s ${deviceId}` : '';
  const cmd = `"${ADB_PATH}" ${devArg} exec-out screencap -p`;

  const child = spawn(ADB_PATH, [...(deviceId ? ['-s', deviceId] : []), 'exec-out', 'screencap', '-p']);
  const chunks = [];
  child.stdout.on('data', chunk => chunks.push(chunk));
  child.on('close', code => {
    if (code === 0 && chunks.length > 0) {
      const buffer = Buffer.concat(chunks);
      res.set('Content-Type', 'image/png');
      res.send(buffer);
    } else {
      res.status(500).send('Screenshot capture failed');
    }
  });
});

app.post('/api/adb/tap', (req, res) => {
  const { x, y, deviceId } = req.body;
  const devArg = deviceId ? `-s ${deviceId}` : '';
  exec(`"${ADB_PATH}" ${devArg} shell input tap ${Math.round(x)} ${Math.round(y)}`, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.post('/api/adb/key', (req, res) => {
  const { keycode, deviceId } = req.body; // 3: HOME, 4: BACK, 187: APP_SWITCH
  const devArg = deviceId ? `-s ${deviceId}` : '';
  exec(`"${ADB_PATH}" ${devArg} shell input keyevent ${keycode}`, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Socket.io for Realtime Debugging
io.on('connection', (socket) => {
  console.log('[Socket] Developer client connected:', socket.id);

  socket.on('app_log', (logData) => {
    socket.broadcast.emit('device_log', logData);
  });

  socket.on('disconnect', () => {
    console.log('[Socket] Client disconnected');
  });
});

// Start Server
server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 AppTester Studio running at: http://localhost:${PORT}`);
  console.log(`📱 In-Browser Mobile Emulator & Bug Tracking Ready`);
  console.log(`======================================================\n`);
});
