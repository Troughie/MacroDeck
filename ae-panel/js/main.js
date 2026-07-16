/*
 * MacroDeck CEP panel — resident bridge.
 *
 * Watches %TEMP%\macrodeck\ae_bridge\request.json. When MacroDeck writes a new
 * request (fresh id), the panel hands the JSX to AE via evalScript — which runs
 * the script WITHOUT activating/resizing the AE window — then writes the result
 * back to response.json. A heartbeat.json is refreshed every second so MacroDeck
 * knows the panel is alive.
 *
 * Node.js (cep_node) is enabled via manifest --enable-nodejs, so fs/os/path are
 * available directly.
 */
(function () {
  var fs = require('fs');
  var os = require('os');
  var path = require('path');

  var cs = new CSInterface();

  // Must match electron/ipc/ae-bridge.ts: os.tmpdir()/macrodeck/ae_bridge
  var bridgeDir = path.join(os.tmpdir(), 'macrodeck', 'ae_bridge');
  var requestPath = path.join(bridgeDir, 'request.json');
  var responsePath = path.join(bridgeDir, 'response.json');
  var heartbeatPath = path.join(bridgeDir, 'heartbeat.json');

  var statusEl = document.getElementById('status');
  var lastEl = document.getElementById('last');

  var lastHandledId = null;

  // Resolve the AE version once (e.g. "24.0"). Used in the heartbeat so the
  // MacroDeck settings panel can show "Connected — AE 24.0".
  var aeVersion = '';
  try {
    var hostEnv = cs.getHostEnvironment();
    if (hostEnv && hostEnv.appVersion) {
      var parts = String(hostEnv.appVersion).split('.');
      aeVersion = parts.length >= 2 ? parts[0] + '.' + parts[1] : parts[0];
    }
  } catch (e) {
    aeVersion = '';
  }

  function ensureDir() {
    try {
      if (!fs.existsSync(bridgeDir)) fs.mkdirSync(bridgeDir, { recursive: true });
    } catch (e) { /* ignore */ }
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function twoDigit(n) { return n < 10 ? '0' + n : '' + n; }

  function nowClock() {
    var d = new Date();
    return twoDigit(d.getHours()) + ':' + twoDigit(d.getMinutes()) + ':' + twoDigit(d.getSeconds());
  }

  function writeResponse(obj) {
    try {
      fs.writeFileSync(responsePath, JSON.stringify(obj), 'utf8');
    } catch (e) { /* ignore write races */ }
  }

  // ─── Poll loop: pick up new requests, run them, write the response ────────────
  function poll() {
    var raw;
    try {
      raw = fs.readFileSync(requestPath, 'utf8');
    } catch (e) {
      return; // no request file yet — nothing to do
    }

    var req;
    try {
      req = JSON.parse(raw);
    } catch (e) {
      return; // corrupt/partial write — ignore, retry next tick
    }

    if (!req || typeof req.id !== 'string' || req.id === lastHandledId) return;

    lastHandledId = req.id;
    var reqId = req.id;
    var jsx = req.jsx != null ? req.jsx : '';

    // evalScript is async: AE runs the JSX and calls back with the string the
    // ExtendScript function returned. No window activation happens here.
    cs.evalScript('MacroDeckRunner(' + JSON.stringify(jsx) + ')', function (result) {
      var payload;
      try {
        payload = JSON.parse(result);
      } catch (e) {
        payload = { ok: false, error: 'Panel could not parse AE result: ' + result };
      }
      writeResponse({
        id: reqId,
        ok: payload && payload.ok === true,
        error: payload ? (payload.error || null) : 'Unknown error',
        ts: Date.now(),
      });
      setStatus('Connected · last run ' + nowClock());
      if (lastEl) lastEl.textContent = payload && payload.ok ? 'OK' : ('Error: ' + (payload && payload.error));
    });
  }

  // ─── Heartbeat: refresh every second so MacroDeck sees the panel as alive ─────
  function heartbeat() {
    try {
      fs.writeFileSync(heartbeatPath, JSON.stringify({
        alive: true,
        aeVersion: aeVersion,
        ts: Date.now(),
      }), 'utf8');
    } catch (e) { /* ignore */ }
  }

  ensureDir();
  setStatus('Connected' + (aeVersion ? ' · AE ' + aeVersion : ''));
  heartbeat();
  setInterval(poll, 150);
  setInterval(heartbeat, 1000);
})();
