'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');

function clean(value) {
  return String(value ?? '').trim();
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const current = argv[i];
    if (!current.startsWith('--')) continue;
    const key = current.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) out[key] = 'true';
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function boolLike(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value).toLowerCase());
}

function add(checks, id, ok, severity, message, details = {}) {
  checks.push({ id, ok: Boolean(ok), severity, message, ...details });
}

function findBrowser() {
  const candidates = [];
  if (process.env.FBM_BROWSER_PATH) candidates.push(process.env.FBM_BROWSER_PATH);
  if (process.platform === 'win32') {
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    const pfx86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const local = process.env.LOCALAPPDATA || '';
    candidates.push(
      path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pfx86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(pfx86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(local, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    );
  }
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || '';
}

function requestJson(url, timeoutMs = 2000) {
  return new Promise((resolve) => {
    let parsed;
    try { parsed = new URL(url); } catch (err) {
      resolve({ ok: false, error: err.message });
      return;
    }
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(parsed, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(body || '{}');
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json });
        } catch (err) {
          resolve({ ok: false, status: res.statusCode, error: `invalid JSON: ${err.message}` });
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
  });
}

function loadConfig(configPath) {
  if (!configPath) return { path: '', value: {} };
  const resolved = path.resolve(configPath);
  if (!fs.existsSync(resolved)) throw new Error(`Config not found: ${resolved}`);
  return { path: resolved, value: JSON.parse(fs.readFileSync(resolved, 'utf8').replace(/^\uFEFF/, '')) };
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const strict = boolLike(args.strict, false);
  const checks = [];
  const root = path.resolve(__dirname, '..');

  const major = Number(process.versions.node.split('.')[0]);
  add(checks, 'node', major >= 20, 'error', `Node ${process.version}`, { minimum: '20.x' });

  for (const dep of ['playwright', 'xlsx']) {
    try {
      const resolved = require.resolve(dep, { paths: [root] });
      add(checks, `dependency:${dep}`, true, 'error', `${dep} is installed`, { resolved });
    } catch (err) {
      add(checks, `dependency:${dep}`, false, 'error', `${dep} is missing; run npm ci`, { error: err.message });
    }
  }

  const browser = findBrowser();
  add(
    checks,
    'browser',
    Boolean(browser) || process.platform !== 'win32',
    process.platform === 'win32' ? 'error' : 'warning',
    browser ? `Supported browser found: ${browser}` : `No standard Chrome/Edge path detected on ${process.platform}`,
  );

  const profile = process.env.FBM_BROWSER_PROFILE
    || (process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'FacebookGameGroupMonitor', 'browser-profile')
      : path.join(os.homedir(), '.fb-group-monitor', 'browser-profile'));
  try {
    fs.mkdirSync(profile, { recursive: true });
    const probe = path.join(profile, `.__doctor_${process.pid}.tmp`);
    fs.writeFileSync(probe, 'ok', 'utf8');
    fs.unlinkSync(probe);
    add(checks, 'browser_profile', true, 'error', `Browser profile is writable: ${profile}`);
  } catch (err) {
    add(checks, 'browser_profile', false, 'error', `Browser profile is not writable: ${profile}`, { error: err.message });
  }

  let config = {};
  let configPath = '';
  try {
    const loaded = loadConfig(args.config || '');
    config = loaded.value;
    configPath = loaded.path;
    add(checks, 'task_config', true, 'error', configPath ? `Config JSON parsed: ${configPath}` : 'No task config supplied; base environment check only');
  } catch (err) {
    add(checks, 'task_config', false, 'error', err.message);
  }

  const cdp = clean(args.cdp || config.cdp_url || 'http://127.0.0.1:9222').replace(/\/$/, '');
  const cdpResult = await requestJson(`${cdp}/json/version`);
  add(
    checks,
    'cdp',
    cdpResult.ok && Boolean(cdpResult.json && (cdpResult.json.Browser || cdpResult.json.webSocketDebuggerUrl)),
    strict ? 'error' : 'warning',
    cdpResult.ok
      ? `CDP endpoint is reachable: ${cdp}`
      : `CDP endpoint is not reachable: ${cdp}. Run npm run login before collection.`,
    cdpResult.ok ? { browser: cdpResult.json.Browser || '' } : { error: cdpResult.error || '', status: cdpResult.status || '' },
  );

  const gitignorePath = path.join(root, '.gitignore');
  const gitignore = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
  const localIgnored = /(^|\n)config\/local\/(?:\*\*)?\s*(?:\n|$)/m.test(gitignore) || /config\/\*\*\/\*\.local\.json/.test(gitignore);
  add(checks, 'local_config_gitignore', localIgnored, 'error', localIgnored
    ? 'Local config paths are protected by .gitignore'
    : 'config/local/ is not safely ignored; credentials may be committed accidentally');

  const geocoder = config.external_geocoder && typeof config.external_geocoder === 'object' ? config.external_geocoder : {};
  const geonamesUser = clean(geocoder.username || process.env[clean(geocoder.username_env || 'GEONAMES_USERNAME')] || process.env.GEONAMES_USERNAME);
  if (geocoder.enabled === true || geocoder.enabled === 'true') {
    add(checks, 'geonames_credentials', Boolean(geonamesUser), 'warning', geonamesUser
      ? 'GeoNames is enabled and a username is configured'
      : 'GeoNames is enabled but no username was found in config/environment');
  }

  const errors = checks.filter((item) => !item.ok && item.severity === 'error');
  const warnings = checks.filter((item) => !item.ok && item.severity === 'warning');
  const result = {
    ok: errors.length === 0,
    checked_at: new Date().toISOString(),
    root,
    config: configPath,
    errors: errors.length,
    warnings: warnings.length,
    checks,
  };

  for (const item of checks) {
    const symbol = item.ok ? '[OK]' : item.severity === 'error' ? '[ERROR]' : '[WARN]';
    console.log(`${symbol} ${item.id}: ${item.message}`);
  }
  console.log('');
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 2);
})();
