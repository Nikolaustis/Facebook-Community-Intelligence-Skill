'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { readJsonFile } = require('./json_io');

function clean(s) {
  return String(s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) out[key] = 'true';
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function loadConfig(configFile) {
  if (!configFile) return {};
  const p = path.resolve(configFile);
  if (!fs.existsSync(p)) return {};
  return readJsonFile(p);
}

function writeJsonAtomic(file, obj) {
  if (!file) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  try {
    fs.renameSync(tmp, file);
  } catch (_err) {
    try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch (_e) { /* ignore */ }
    try { fs.renameSync(tmp, file); } catch (_err2) {
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_e) { /* ignore */ }
      fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8');
    }
  }
}

async function safePageText(page) {
  try {
    return clean(await page.locator('body').innerText({ timeout: 5000 }));
  } catch (_err) {
    return '';
  }
}

async function countLoginInputs(page) {
  try {
    return await page.locator('input[name="email"], input[name="pass"], form[action*="login"], input[type="password"]').count();
  } catch (_err) {
    return 0;
  }
}

async function countAuthenticatedUiSignals(page) {
  const selectors = [
    'a[href*="/friends/"]',
    'a[href*="/groups/"]',
    'a[href*="/messages/"]',
    '[role="navigation"] a[href*="facebook.com"]',
    '[aria-label="Account controls and settings"]',
    '[aria-label="Your profile"]',
  ];
  let count = 0;
  for (const selector of selectors) {
    try {
      if (await page.locator(selector).count()) count++;
    } catch (_err) { /* ignore */ }
  }
  return count;
}

function classifyLoginState({ url, title, bodyText, loginInputCount, hasCUserCookie, authenticatedUiSignals }) {
  const combined = `${url}\n${title}\n${bodyText}`;

  if (/checkpoint|two_step_verification|recover|confirmemail|login_approval/i.test(url)) {
    return {
      logged_in: false,
      status: 'checkpoint_or_verification_required',
      reason: 'Facebook requires checkpoint, account recovery, or two-step verification.',
    };
  }

  if (/(temporarily blocked|you'?re temporarily blocked|try again later|rate limit|too many requests|操作过于频繁|操作過於頻繁|暂时无法使用|暫時無法使用)/iu.test(combined)) {
    return {
      logged_in: false,
      status: 'temporarily_blocked_or_rate_limited',
      reason: 'Facebook returned a temporary restriction/rate-limit page. Collection should not start.',
    };
  }

  if (/(consent|cookie settings|allow all cookies|同意.*cookie|接受.*cookie|选择.*cookie)/iu.test(combined) && !hasCUserCookie) {
    return {
      logged_in: false,
      status: 'consent_interstitial',
      reason: 'Facebook is showing a consent/interstitial page and no authenticated c_user cookie is present.',
    };
  }

  const loggedOutByUrl = /facebook\.com\/(login|recover|r\.php|reg)(?:[/?#]|$)/i.test(url);
  const loggedOutByText = /(log in to facebook|登录 facebook|登入 facebook|เข้าสู่ระบบ Facebook|đăng nhập facebook|masuk ke facebook|iniciar sesi[oó]n en facebook|entrar no facebook)/iu.test(combined);
  if (loginInputCount > 0 || loggedOutByUrl || loggedOutByText) {
    return {
      logged_in: false,
      status: 'not_logged_in',
      reason: 'A Facebook login form/login-page signal is still present.',
    };
  }

  // c_user is the strongest stable browser-session evidence available from a CDP-attached
  // Facebook context. UI signals are kept as corroborating diagnostics rather than using
  // "body text is long" as a positive login test.
  if (hasCUserCookie && /facebook\.com/i.test(url)) {
    return {
      logged_in: true,
      status: 'logged_in',
      reason: authenticatedUiSignals > 0
        ? 'Authenticated Facebook c_user cookie and signed-in UI signals are present.'
        : 'Authenticated Facebook c_user cookie is present and no blocking/login page was detected.',
    };
  }

  return {
    logged_in: false,
    status: 'unknown',
    reason: 'No authenticated c_user cookie was found. Inspect the dedicated browser and log in again if needed.',
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig(args.config || '');
  const cdpUrl = args.cdp || config.cdp_url || 'http://127.0.0.1:9222';
  const outStatus = path.resolve(args['out-status'] || args.out || './runs/login_state.json');
  let browser = null;
  let result;

  try {
    browser = await chromium.connectOverCDP(cdpUrl);
    const context = browser.contexts()[0] || (await browser.newContext());
    const page = context.pages().find((p) => /facebook\.com/i.test(p.url())) || (await context.newPage());
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
    await page.waitForTimeout(2000);

    const url = page.url();
    const title = clean(await page.title().catch(() => ''));
    const bodyText = await safePageText(page);
    const loginInputCount = await countLoginInputs(page);
    const cookies = await context.cookies('https://www.facebook.com/').catch(() => []);
    const cUserCookie = cookies.find((cookie) => cookie && cookie.name === 'c_user' && clean(cookie.value));
    const authenticatedUiSignals = await countAuthenticatedUiSignals(page);
    const state = classifyLoginState({
      url,
      title,
      bodyText,
      loginInputCount,
      hasCUserCookie: Boolean(cUserCookie),
      authenticatedUiSignals,
    });

    result = {
      ok: state.logged_in,
      event: 'facebook_login_state_validation',
      validated_at: new Date().toISOString(),
      cdp_url: cdpUrl,
      url,
      title,
      login_input_count: loginInputCount,
      has_c_user_cookie: Boolean(cUserCookie),
      authenticated_ui_signals: authenticatedUiSignals,
      ...state,
    };
  } catch (err) {
    result = {
      ok: false,
      event: 'facebook_login_state_validation',
      validated_at: new Date().toISOString(),
      cdp_url: cdpUrl,
      status: 'cdp_connection_failed',
      logged_in: false,
      reason: 'Cannot connect to the Chromium CDP endpoint. Run npm run login or verify the configured CDP URL.',
      error: err && err.stack ? err.stack : String(err),
    };
  } finally {
    writeJsonAtomic(outStatus, result);
    console.log(JSON.stringify(result, null, 2));
    // Do not call browser.close(): closing a CDP-attached browser terminates the real
    // dedicated Chrome/Edge process that the collector must reuse.
    process.exit(result && result.ok ? 0 : 2);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  });
}

module.exports = { classifyLoginState };
