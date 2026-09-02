'use strict';

const { chromium } = require('playwright');

(async () => {
  const cdp = process.argv[2] || 'http://127.0.0.1:9222';
  let browser;
  try {
    browser = await chromium.connectOverCDP(cdp);
    const contexts = browser.contexts();
    const pages = contexts.flatMap((context) => context.pages());
    const page = pages[0] || await contexts[0].newPage();
    const session = await page.context().newCDPSession(page);
    await Promise.race([
      session.send('Browser.close'),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    console.log(JSON.stringify({ ok: true, reason: 'Browser.close_sent', cdp }));
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    if (/ECONNREFUSED|connectOverCDP|socket hang up|Target page, context or browser has been closed/i.test(message)) {
      console.log(JSON.stringify({ ok: true, reason: 'browser_already_closed_or_unreachable', cdp, detail: message }));
      return;
    }
    console.error(JSON.stringify({ ok: false, reason: 'Browser.close_failed', cdp, error: message }));
    process.exitCode = 1;
  } finally {
    try { if (browser) await browser.close(); } catch (_) {}
  }
})();

