const { spawn, execSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const URL = `http://localhost:${PORT}/sender`;

// Helper: Check if DropNexus server is already responding on port 3000
function isServerRunning() {
    return new Promise((resolve) => {
        const req = http.get(`http://localhost:${PORT}/api/info`, { timeout: 1500 }, (res) => {
            resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
    });
}

// Helper: Find dedicated standalone browser runtime (Edge or Chrome for app-mode)
function findAppBrowser() {
    const candidates = [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe')
    ];

    for (const p of candidates) {
        if (p && fs.existsSync(p)) {
            return p;
        }
    }
    return null;
}

// Open DropNexus window
function openWindow() {
    const browserPath = findAppBrowser();
    if (browserPath) {
        try {
            // Launch as native desktop app window without browser URL clutter
            const child = spawn(browserPath, [`--app=${URL}`], {
                detached: true,
                stdio: 'ignore'
            });
            child.unref();
            return;
        } catch (e) {}
    }

    // Fallback: open in default system browser
    try {
        execSync(`start "" "${URL}"`, { stdio: 'ignore' });
    } catch (e) {}
}

async function main() {
    const running = await isServerRunning();

    if (running) {
        // Server already running; just bring up the window
        openWindow();
        process.exit(0);
    }

    // Locate node executable (system or portable .node)
    let nodeExec = process.execPath;
    const portableNode = path.join(__dirname, '.node', 'node.exe');
    if (fs.existsSync(portableNode)) {
        nodeExec = portableNode;
    }

    // Start server.js silently in persistent detached background mode
    const serverScript = path.join(__dirname, 'server.js');
    const serverProcess = spawn(nodeExec, [serverScript], {
        cwd: __dirname,
        detached: true,
        stdio: 'ignore',
        windowsHide: true
    });
    serverProcess.unref();

    // Poll until server is ready (up to 8 seconds)
    const startTime = Date.now();
    while (Date.now() - startTime < 8000) {
        await new Promise((r) => setTimeout(r, 250));
        if (await isServerRunning()) {
            break;
        }
    }

    // Open the app window
    openWindow();
    process.exit(0);
}

main().catch(() => {
    openWindow();
    process.exit(0);
});
