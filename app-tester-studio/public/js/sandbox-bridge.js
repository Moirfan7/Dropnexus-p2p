/**
 * AppTester Sandbox Bridge Script
 * Injected automatically into the emulated app frame to capture:
 * - console.log / warn / error / info
 * - unhandled exceptions (window.onerror)
 * - promise rejections
 * - touch & gesture bridging
 */
(function() {
  if (window.__APPTESTER_BRIDGE_INJECTED__) return;
  window.__APPTESTER_BRIDGE_INJECTED__ = true;

  function sendToParent(type, data) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          source: 'APPTESTER_EMULATOR_FRAME',
          type: type,
          data: data,
          timestamp: new Date().toLocaleTimeString()
        }, '*');
      }
    } catch (e) {}
  }

  // Intercept standard console methods
  const levels = ['log', 'info', 'warn', 'error', 'debug'];
  levels.forEach(level => {
    const original = console[level] || console.log;
    console[level] = function(...args) {
      original.apply(console, args);
      
      const formatted = args.map(arg => {
        if (typeof arg === 'object') {
          try { return JSON.stringify(arg, null, 2); } catch (e) { return String(arg); }
        }
        return String(arg);
      }).join(' ');

      sendToParent('CONSOLE_LOG', {
        level: level,
        message: formatted,
        raw: args
      });
    };
  });

  // Intercept uncaught runtime errors
  window.addEventListener('error', function(event) {
    sendToParent('RUNTIME_ERROR', {
      level: 'error',
      message: event.message || 'Uncaught Error',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error ? event.error.stack : null
    });
  });

  // Intercept unhandled promise rejections
  window.addEventListener('unhandledrejection', function(event) {
    const reason = event.reason;
    sendToParent('PROMISE_REJECTION', {
      level: 'error',
      message: reason ? (reason.message || String(reason)) : 'Unhandled Promise Rejection',
      stack: reason && reason.stack ? reason.stack : null
    });
  });

  // Listen for control commands from parent
  window.addEventListener('message', function(event) {
    if (!event.data || event.data.target !== 'EMULATED_APP') return;
    
    if (event.data.action === 'RELOAD') {
      window.location.reload();
    } else if (event.data.action === 'PING') {
      sendToParent('PONG', { title: document.title, url: window.location.href });
    }
  });

  // Notify parent on ready
  window.addEventListener('DOMContentLoaded', () => {
    sendToParent('FRAME_READY', { title: document.title, url: window.location.href });
  });
})();
