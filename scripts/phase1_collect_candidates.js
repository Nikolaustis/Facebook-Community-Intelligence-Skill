const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');
const { createCodexProgressReporter, parseProgressReportEveryMinutes } = require('./progress_reporter');
const { readJsonFile, readTextAuto } = require('./json_io');

function clean(s) {
  return (s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
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

function stripDiacritics(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeWords(s) {
  return stripDiacritics(clean(s))
    .normalize('NFKC')
    .replace(/[:：]+/g, ' ')
    .replace(/[×✕✖]/g, ' x ')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCompact(s) {
  return normalizeWords(s).toLowerCase().replace(/\s+/g, '');
}

function titleCaseLoose(s) {
  return clean(s)
    .split(/\s+/)
    .map((tk) => {
      if (/^[A-Z0-9]+$/.test(tk)) return tk;
      if (tk.length <= 1) return tk.toUpperCase();
      return tk.slice(0, 1).toUpperCase() + tk.slice(1);
    })
    .join(' ');
}

function uniqueObjectsByKey(list, keyFn) {
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function slugify(s) {
  const base = clean(s)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  const hash = crypto.createHash('sha1').update(clean(s)).digest('hex').slice(0, 8);
  return base ? `${base}_${hash}` : `game_${hash}`;
}

function parseMemberCount(text) {
  const t = clean(text);
  let m;
  m = t.match(/([0-9][0-9,]*)\s*位成员/i);
  if (m) return Number(String(m[1]).replace(/,/g, ''));
  m = t.match(/([0-9]+(?:\.[0-9]+)?)\s*万位成员/i);
  if (m) return Math.round(parseFloat(m[1]) * 10000);
  m = t.match(/([0-9]+(?:\.[0-9]+)?)\s*k\s*members?/i);
  if (m) return Math.round(parseFloat(m[1]) * 1000);
  m = t.match(/([0-9][0-9,]*)\s*members?/i);
  if (m) return Number(String(m[1]).replace(/,/g, ''));
  m = t.match(/([0-9][0-9,]*)\s*thành viên/i);
  if (m) return Number(String(m[1]).replace(/,/g, ''));
  m = t.match(/สมาชิก(?:ทั้งหมด)?[:：]?\s*([0-9][0-9,]*)\s*คน/i);
  if (m) return Number(String(m[1]).replace(/,/g, ''));
  return '';
}

function meaningfulTokens(text) {
  const stop = new Set(['the','and','for','with','from','this','that','your','game','games','group','official','mobile','online','of','on','to','in','m']);
  return clean(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3 && !stop.has(s));
}

function loadConfig(configFile) {
  if (!configFile) return {};
  const p = path.resolve(configFile);
  if (!fs.existsSync(p)) return {};
  return readJsonFile(p);
}

function loadGamesFromFile(gamesFile) {
  if (!gamesFile) return [];
  const p = path.resolve(gamesFile);
  const raw = readTextAuto(p).text;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_err) {
    return raw
      .split(/\r?\n/)
      .map((s) => clean(s))
      .filter(Boolean);
  }
  const list = Array.isArray(parsed) ? parsed : parsed && parsed.games;
  if (!Array.isArray(list)) {
    throw new Error(`Games file must be a JSON array or an object with a games array: ${p}`);
  }
  return list.map((s) => clean(String(s))).filter(Boolean);
}

function getTitleOverride(config, gameName) {
  const overrides = config.title_variant_overrides && typeof config.title_variant_overrides === 'object'
    ? config.title_variant_overrides
    : {};
  return overrides[gameName] || {};
}

function buildAutomaticSearchVariants(gameName) {
  const raw = clean(gameName);
  const normalized = normalizeWords(raw);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const variants = [
    { query: raw, type: 'canonical' },
  ];

  if (normalized && normalized !== raw) variants.push({ query: normalized, type: 'punctuation_normalized' });

  if (tokens.length >= 2) {
    // Merge one adjacent token pair at a time: "All Star Tower Defense" -> "Allstar Tower Defense", "All Star TowerDefense".
    for (let i = 0; i < tokens.length - 1; i++) {
      const merged = tokens.map((tk, idx) => (idx === i ? `${tk}${tokens[i + 1]}` : (idx === i + 1 ? '' : tk))).filter(Boolean).join(' ');
      if (merged) variants.push({ query: titleCaseLoose(merged), type: 'compact_spacing' });
    }

    // Merge common word-pairs: "Allstar TowerDefense". This is still a controlled spacing variant, not a broad keyword expansion.
    if (tokens.length >= 4) {
      const pairMerged = [];
      for (let i = 0; i < tokens.length; i += 2) {
        if (i + 1 < tokens.length) pairMerged.push(`${tokens[i]}${tokens[i + 1]}`);
        else pairMerged.push(tokens[i]);
      }
      variants.push({ query: titleCaseLoose(pairMerged.join(' ')), type: 'compact_spacing' });
    }
  }

  return uniqueObjectsByKey(variants, (v) => normalizeWords(v.query).toLowerCase());
}

function buildSearchPlan(gameName, config) {
  const override = getTitleOverride(config, gameName);
  const plan = override.search_variants_only ? [] : buildAutomaticSearchVariants(gameName);
  const explicitVariants = Array.isArray(override.search_variants) ? override.search_variants : [];
  for (const item of explicitVariants) {
    if (typeof item === 'string') {
      plan.push({ query: clean(item), type: 'configured_variant' });
      continue;
    }
    if (item && typeof item === 'object' && clean(item.query)) {
      plan.push({
        query: clean(item.query),
        type: clean(item.type) || 'configured_variant',
        threshold: item,
      });
    }
  }
  return uniqueObjectsByKey(plan, (v) => `${v.type}::${normalizeWords(v.query).toLowerCase()}`);
}

async function gotoWithRetry(page, url, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(2500 + i * 1500);
    }
  }
  throw lastError;
}

function buildSeedCandidates(gameName, config) {
  const override = getTitleOverride(config, gameName);
  const urls = Array.isArray(override.seed_group_urls) ? override.seed_group_urls : [];
  return urls.map((url) => ({
    group_name: '',
    group_url: clean(url).split('?')[0].replace(/\/+$/, ''),
    snippet: '',
    card_group_size: 100,
    source_game_name: gameName,
    source_query: '[seed_group_url]',
    query_variant_type: 'seed_group_url',
    source_is_seed_url: true,
    source_queries: ['[seed_group_url]'],
    query_variant_types: ['seed_group_url'],
  })).filter((x) => x.group_url);
}

async function collectRound(page, gameName, sourceQuery, variantType) {
  const queryTokens = Array.from(new Set([...meaningfulTokens(gameName), ...meaningfulTokens(sourceQuery)]));
  return page.evaluate(({ queryTokens, sourceQuery, variantType, gameName }) => {
    const main = document.querySelector('div[role="main"]') || document.body;
    const cleanText = (s) => (s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const normalize = (s) => cleanText(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ');
    const memberSignal = /members?|位成员|位成員|成員|成员|thành viên|สมาชิก|anggota|membros?|miembros?|membres?|mitglieder|участник|member/i;
    const uiOnlySignal = /^(join|joined|invite|share|visit|view group|see all|public group|private group|visible|hidden|加入|已加入|邀请|邀請|分享|查看小组|查看社团|公開社團|私人社團|公开小组|私密小组)$/i;
    const out = [];

    const canonicalGroupUrl = (rawHref) => {
      try {
        const u = new URL(rawHref || '', location.href);
        if (!/(^|\.)facebook\.com$/i.test(u.hostname)) return '';
        const m = u.pathname.match(/^\/groups\/([^/?#]+)/i);
        if (!m) return '';
        const id = decodeURIComponent(m[1] || '').trim();
        if (!id || /^(search|discover|feed|joins|create|notifications)$/i.test(id)) return '';
        return `https://www.facebook.com/groups/${encodeURIComponent(id).replace(/%2F/gi, '/')}`;
      } catch (_e) {
        return '';
      }
    };

    const findCard = (node) => {
      let cur = node;
      let best = node?.parentElement || null;
      for (let i = 0; i < 12 && cur && cur !== main.parentElement; i++) {
        const role = cleanText(cur.getAttribute?.('role'));
        const text = cleanText(cur.innerText || cur.textContent || '');
        if (role === 'article' || role === 'listitem') return cur;
        if (text.length >= 12 && text.length <= 5000 && memberSignal.test(text)) best = cur;
        cur = cur.parentElement;
      }
      return best || node?.parentElement || main;
    };

    const addCandidate = (list, text, source) => {
      const value = cleanText(text);
      if (!value || value.length < 2 || value.length > 220) return;
      if (/^https?:\/\//i.test(value) || uiOnlySignal.test(value)) return;
      list.push({ value, source });
    };

    const scoreCandidate = (candidate) => {
      const value = candidate.value;
      const normalized = normalize(value);
      let score = 0;
      if (candidate.source === 'same_url_anchor_text') score += 90;
      else if (candidate.source === 'heading') score += 80;
      else if (candidate.source === 'anchor_text') score += 70;
      else if (candidate.source === 'aria_label') score += 58;
      else if (candidate.source === 'title_attribute') score += 50;
      else if (candidate.source === 'card_line') score += 20;
      if (queryTokens.some((tk) => normalized.includes(tk))) score += 35;
      if (value.length >= 4 && value.length <= 120) score += 12;
      if (value.split(/\s+/).length >= 2) score += 5;
      if (memberSignal.test(value)) score -= 70;
      if (/\b(join|joined|invite|share|members?|public|private)\b/i.test(value)) score -= 25;
      if (/^[0-9.,]+$/.test(value)) score -= 100;
      return score;
    };

    const linkNodes = Array.from(main.querySelectorAll('a[href], [role="link"][href]'));
    const grouped = new Map();
    for (const node of linkNodes) {
      const href = node.href || node.getAttribute('href') || '';
      const groupUrl = canonicalGroupUrl(href);
      if (!groupUrl) continue;
      if (!grouped.has(groupUrl)) grouped.set(groupUrl, { groupUrl, nodes: [], cards: [] });
      const row = grouped.get(groupUrl);
      row.nodes.push(node);
      const card = findCard(node);
      if (card && !row.cards.includes(card)) row.cards.push(card);
    }

    for (const row of grouped.values()) {
      const nameCandidates = [];
      let snippet = '';

      for (const node of row.nodes) {
        addCandidate(nameCandidates, node.innerText || node.textContent, 'anchor_text');
        addCandidate(nameCandidates, node.getAttribute?.('aria-label'), 'aria_label');
        addCandidate(nameCandidates, node.getAttribute?.('title'), 'title_attribute');
      }

      for (const card of row.cards) {
        const cardText = cleanText(card.innerText || card.textContent || '');
        if (cardText.length > snippet.length) snippet = cardText;

        for (const heading of Array.from(card.querySelectorAll('h1,h2,h3,h4,[role="heading"]')).slice(0, 12)) {
          addCandidate(nameCandidates, heading.innerText || heading.textContent, 'heading');
        }

        for (const sameLink of Array.from(card.querySelectorAll('a[href], [role="link"][href]')).slice(0, 40)) {
          const sameUrl = canonicalGroupUrl(sameLink.href || sameLink.getAttribute('href') || '');
          if (sameUrl === row.groupUrl) {
            addCandidate(nameCandidates, sameLink.innerText || sameLink.textContent, 'same_url_anchor_text');
            addCandidate(nameCandidates, sameLink.getAttribute?.('aria-label'), 'aria_label');
          }
        }

        const lines = (card.innerText || card.textContent || '')
          .split(/\r?\n/)
          .map(cleanText)
          .filter(Boolean)
          .slice(0, 24);
        for (const line of lines) addCandidate(nameCandidates, line, 'card_line');
      }

      const deduped = [];
      const seen = new Set();
      for (const candidate of nameCandidates) {
        const key = normalize(candidate.value);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        deduped.push(candidate);
      }
      deduped.sort((a, b) => scoreCandidate(b) - scoreCandidate(a) || a.value.length - b.value.length);
      const bestName = deduped[0] || { value: '', source: 'missing' };
      const combined = normalize(`${bestName.value} ${snippet}`);
      const queryTokenMatch = queryTokens.length === 0 || queryTokens.some((tk) => combined.includes(tk));

      // Phase 1 is a high-recall discovery stage. Do not discard a Facebook-returned
      // group merely because its visible card text omits the query token. V7 Phase 1.5
      // and the Phase 2 title adjudicator perform the relevance decision later.
      out.push({
        group_name: bestName.value,
        group_url: row.groupUrl,
        snippet,
        source_game_name: gameName,
        source_query: sourceQuery,
        query_variant_type: variantType,
        source_is_seed_url: false,
        source_queries: [sourceQuery],
        query_variant_types: [variantType],
        phase1_query_token_match: queryTokenMatch,
        phase1_name_source: bestName.source,
        phase1_group_link_count: row.nodes.length,
      });
    }
    return out;
  }, { queryTokens, sourceQuery, variantType, gameName });
}

async function probeSearchPage(page) {
  return page.evaluate(() => {
    const main = document.querySelector('div[role="main"]') || document.body;
    const cleanText = (s) => (s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const bodyText = cleanText(document.body?.innerText || '');
    const nodes = Array.from(main.querySelectorAll('a[href], [role="link"][href]'));
    const groupNodes = nodes.filter((node) => /\/groups\/(?!search(?:[/?#]|$)|discover(?:[/?#]|$)|feed(?:[/?#]|$)|joins(?:[/?#]|$)|create(?:[/?#]|$)|notifications(?:[/?#]|$))[^/?#]+/i.test(node.href || node.getAttribute('href') || ''));
    return {
      url: location.href,
      title: document.title,
      ready_state: document.readyState,
      main_found: Boolean(document.querySelector('div[role="main"]')),
      all_link_count: nodes.length,
      group_link_count: groupNodes.length,
      body_text_length: bodyText.length,
      body_text_excerpt: bodyText.slice(0, 12000),
      login_or_checkpoint_signal: /\/login|\/checkpoint/i.test(location.href) || /log in to facebook|登录 facebook|登入 facebook|安全检查|security check/i.test(bodyText),
      temporary_error_signal: /something went wrong|出现错误|发生错误|temporarily blocked|暂时无法|try again later/i.test(bodyText),
      no_results_signal: /没有搜索到结果|沒有搜尋到結果|no results|couldn't find any results|找不到任何结果/i.test(bodyText),
      samples: groupNodes.slice(0, 20).map((node) => ({
        href: node.href || node.getAttribute('href') || '',
        text: cleanText(node.innerText || node.textContent || '').slice(0, 300),
        aria_label: cleanText(node.getAttribute?.('aria-label') || '').slice(0, 300),
        parent_text: cleanText(node.parentElement?.innerText || node.parentElement?.textContent || '').slice(0, 500),
      })),
    };
  });
}

async function waitForSearchResultsReady(page, timeoutMs = 25000) {
  try {
    await page.waitForFunction(() => {
      const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ');
      const main = document.querySelector('div[role="main"]') || document.body;
      const hasGroupLink = Array.from(main?.querySelectorAll('a[href*="/groups/"], [role="link"][href*="/groups/"]') || []).some((node) => /\/groups\/(?!search(?:[/?#]|$)|discover(?:[/?#]|$)|feed(?:[/?#]|$)|joins(?:[/?#]|$)|create(?:[/?#]|$)|notifications(?:[/?#]|$))[^/?#]+/i.test(node.href || node.getAttribute('href') || ''));
      const terminalText = /没有搜索到结果|沒有搜尋到結果|no results|couldn't find any results|something went wrong|出现错误|发生错误|登录 facebook|登入 facebook|log in to facebook/i.test(bodyText);
      return document.readyState === 'complete' && (hasGroupLink || terminalText);
    }, { timeout: timeoutMs });
  } catch (_e) {
    // The page can stay in a continuously-loading state. The caller will probe
    // the DOM and create diagnostics instead of treating this timeout as fatal.
  }
  await page.waitForTimeout(1500);
}

async function scrollSearchResults(page) {
  try {
    await page.evaluate(() => {
      const main = document.querySelector('div[role="main"]') || document.body;
      const candidates = [main, ...Array.from(main?.querySelectorAll('div') || []).slice(0, 500)];
      let best = null;
      let bestGap = 0;
      for (const el of candidates) {
        const gap = (el.scrollHeight || 0) - (el.clientHeight || 0);
        if (gap > bestGap + 200) {
          best = el;
          bestGap = gap;
        }
      }
      if (best && best !== document.body && best !== document.documentElement) best.scrollTop += Math.max(1800, best.clientHeight * 1.5);
      window.scrollBy(0, Math.max(2200, window.innerHeight * 2));
    });
  } catch (_e) {
    // Fall through to the wheel event.
  }
  await page.mouse.wheel(0, 3600);
  await page.waitForTimeout(1600);
}

function buildFacebookGroupSearchUrls(query) {
  const q = encodeURIComponent(query);
  return [
    `https://www.facebook.com/search/groups/?q=${q}`,
    `https://www.facebook.com/groups/search/groups_home/?q=${q}`,
  ];
}

async function capturePhase1Diagnostics(page, outDir, gameName, variant, stage, extra = {}) {
  if (!outDir) return null;
  const dir = path.join(outDir, 'phase1_diagnostics');
  fs.mkdirSync(dir, { recursive: true });
  const base = `${slugify(gameName)}__${slugify(variant.query)}__${clean(variant.type).replace(/[^a-z0-9_-]+/gi, '_')}__${stage}`;
  const jsonFile = path.join(dir, `${base}.json`);
  const htmlFile = path.join(dir, `${base}.html`);
  const screenshotFile = path.join(dir, `${base}.png`);
  try {
    const probe = await probeSearchPage(page);
    fs.writeFileSync(jsonFile, JSON.stringify({
      created_at: new Date().toISOString(),
      game_name: gameName,
      source_query: variant.query,
      query_variant_type: variant.type,
      stage,
      probe,
      extra,
    }, null, 2), 'utf8');
    try {
      const html = await page.content();
      fs.writeFileSync(htmlFile, html, 'utf8');
    } catch (_e) {}
    try {
      await page.screenshot({ path: screenshotFile, fullPage: false, timeout: 30000 });
    } catch (_e) {}
    return { json_file: jsonFile, html_file: htmlFile, screenshot_file: screenshotFile };
  } catch (_e) {
    return null;
  }
}

async function hasNoMoreResultsSignal(page) {
  return page.evaluate(() => {
    const txt = (document.body?.innerText || '').replace(/\s+/g, ' ');
    return /已经到底啦|已經到底啦|已经到底了|已到最底|没有更多结果|沒有更多結果|no more results|you've reached the end|end of results/i.test(txt);
  });
}

function mergeCandidate(existing, incoming) {
  const sourceQueries = Array.from(new Set([...(existing.source_queries || []), ...(incoming.source_queries || []), incoming.source_query].filter(Boolean)));
  const variantTypes = Array.from(new Set([...(existing.query_variant_types || []), ...(incoming.query_variant_types || []), incoming.query_variant_type].filter(Boolean)));
  const cardA = parseMemberCount(existing.snippet);
  const cardB = parseMemberCount(incoming.snippet);
  const betterIncomingSnippet = (cardB && !cardA) || ((incoming.snippet || '').length > (existing.snippet || '').length && !existing.source_is_seed_url);
  return {
    ...existing,
    group_name: clean(existing.group_name) || clean(incoming.group_name),
    snippet: betterIncomingSnippet ? incoming.snippet : existing.snippet,
    card_group_size: cardB || existing.card_group_size || '',
    source_query: existing.source_query || incoming.source_query,
    query_variant_type: existing.query_variant_type || incoming.query_variant_type,
    source_is_seed_url: Boolean(existing.source_is_seed_url || incoming.source_is_seed_url),
    source_queries: sourceQueries,
    query_variant_types: variantTypes,
  };
}

async function runOneSearchQuery(page, gameName, variant, maxMinutes, progressState, outDir, config) {
  if (progressState) {
    progressState.current_query = variant.query;
    progressState.current_query_variant_type = variant.type;
    progressState.current_round = 0;
    progressState.current_query_candidates = 0;
    progressState.current_query_started_at = new Date().toISOString();
  }

  const searchUrls = buildFacebookGroupSearchUrls(variant.query);
  let activeSearchUrlIndex = 0;
  let activeSearchUrl = searchUrls[activeSearchUrlIndex];
  let routeFallbackUsed = false;
  const diagnosticsEnabled = config?.phase1_zero_result_diagnostics !== false;

  await gotoWithRetry(page, activeSearchUrl);
  await waitForSearchResultsReady(page, Number(config?.phase1_results_ready_timeout_ms || 25000));

  const startedAt = Date.now();
  const map = new Map();
  const stats = [];
  const diagnosticFiles = [];
  let rounds = 0;
  let noNewStreak = 0;
  let noGrowthStreak = 0;
  let prevTotal = 0;
  let stopReason = '';

  while (true) {
    rounds++;
    let got = [];
    let probe = null;
    try {
      got = await collectRound(page, gameName, variant.query, variant.type);
      probe = await probeSearchPage(page);
    } catch (_e) {
      await gotoWithRetry(page, activeSearchUrl);
      await waitForSearchResultsReady(page, Number(config?.phase1_results_ready_timeout_ms || 25000));
      got = await collectRound(page, gameName, variant.query, variant.type);
      probe = await probeSearchPage(page);
    }

    // Some Facebook accounts are routed to the newer Groups-search surface while
    // others still receive the global-search surface. If the primary route exposes
    // no group links at all, retry once through the alternate route before accepting
    // a zero-result outcome.
    if (
      rounds === 1 &&
      map.size === 0 &&
      got.length === 0 &&
      Number(probe?.group_link_count || 0) === 0 &&
      activeSearchUrlIndex + 1 < searchUrls.length
    ) {
      if (diagnosticsEnabled) {
        const files = await capturePhase1Diagnostics(page, outDir, gameName, variant, 'primary_route_zero', {
          active_search_url: activeSearchUrl,
          route_index: activeSearchUrlIndex,
        });
        if (files) diagnosticFiles.push(files);
      }
      activeSearchUrlIndex++;
      activeSearchUrl = searchUrls[activeSearchUrlIndex];
      routeFallbackUsed = true;
      noNewStreak = 0;
      noGrowthStreak = 0;
      prevTotal = 0;
      await gotoWithRetry(page, activeSearchUrl);
      await waitForSearchResultsReady(page, Number(config?.phase1_results_ready_timeout_ms || 25000));
      continue;
    }

    let newGroups = 0;
    for (const g of got) {
      const key = g.group_url;
      if (!key) continue;
      const withSize = { ...g, card_group_size: parseMemberCount(g.snippet) };
      if (!map.has(key)) {
        map.set(key, withSize);
        newGroups++;
      } else {
        map.set(key, mergeCandidate(map.get(key), withSize));
      }
    }

    if (newGroups === 0) noNewStreak++;
    else noNewStreak = 0;

    if (map.size === prevTotal) noGrowthStreak++;
    else noGrowthStreak = 0;
    prevTotal = map.size;

    const noMore = await hasNoMoreResultsSignal(page);
    const elapsed = Date.now() - startedAt;
    if (progressState) {
      progressState.current_round = rounds;
      progressState.current_query_candidates = map.size;
      progressState.total_candidates = Math.max(progressState.total_candidates || 0, (progressState.completed_candidates || 0) + map.size);
      progressState.last_round_new_groups = newGroups;
      progressState.last_round_no_new_streak = noNewStreak;
      progressState.last_round_no_growth_streak = noGrowthStreak;
      progressState.last_no_more_results_signal = noMore;
      progressState.last_phase1_group_link_count = Number(probe?.group_link_count || 0);
      progressState.current_search_url = activeSearchUrl;
      progressState.route_fallback_used = routeFallbackUsed;
      progressState.last_updated_at = new Date().toISOString();
    }

    stats.push({
      query: variant.query,
      query_variant_type: variant.type,
      round: rounds,
      new_groups: newGroups,
      total_unique: map.size,
      raw_group_link_count: Number(probe?.group_link_count || 0),
      all_link_count: Number(probe?.all_link_count || 0),
      login_or_checkpoint_signal: Boolean(probe?.login_or_checkpoint_signal),
      temporary_error_signal: Boolean(probe?.temporary_error_signal),
      no_results_signal: Boolean(probe?.no_results_signal),
      search_url: activeSearchUrl,
      search_url_index: activeSearchUrlIndex,
      route_fallback_used: routeFallbackUsed,
      no_new_streak: noNewStreak,
      no_growth_streak: noGrowthStreak,
      no_more_results_signal: noMore,
      elapsed_sec: Math.floor(elapsed / 1000),
    });

    console.log(JSON.stringify({
      game: gameName,
      query: variant.query,
      variant_type: variant.type,
      round: rounds,
      new_groups: newGroups,
      total_unique: map.size,
      raw_group_links: Number(probe?.group_link_count || 0),
      route: activeSearchUrlIndex + 1,
    }));

    if (probe?.login_or_checkpoint_signal) {
      stopReason = 'LOGIN_OR_CHECKPOINT_SIGNAL';
      break;
    }
    if (probe?.temporary_error_signal && map.size === 0) {
      stopReason = 'FACEBOOK_TEMPORARY_ERROR';
      break;
    }
    if (noMore) {
      stopReason = 'NO_MORE_RESULTS_SIGNAL';
      break;
    }
    if (noNewStreak >= 3) {
      stopReason = map.size === 0 ? 'ZERO_CANDIDATES_AFTER_ROUTE_FALLBACK' : 'NO_NEW_GROUPS_3_SCROLLS';
      break;
    }
    if (noGrowthStreak >= 3) {
      stopReason = map.size === 0 ? 'ZERO_CANDIDATES_AFTER_ROUTE_FALLBACK' : 'LIST_NOT_GROWING';
      break;
    }
    if (elapsed > maxMinutes * 60 * 1000) {
      stopReason = 'TIME_GUARD';
      break;
    }

    await scrollSearchResults(page);
  }

  if (map.size === 0 && diagnosticsEnabled) {
    const files = await capturePhase1Diagnostics(page, outDir, gameName, variant, 'final_zero', {
      active_search_url: activeSearchUrl,
      route_index: activeSearchUrlIndex,
      route_fallback_used: routeFallbackUsed,
      stop_reason: stopReason,
      rounds,
      stats,
    });
    if (files) diagnosticFiles.push(files);
  }

  return {
    query: variant.query,
    query_variant_type: variant.type,
    stop_reason: stopReason,
    rounds,
    route_fallback_used: routeFallbackUsed,
    active_search_url: activeSearchUrl,
    diagnostics: diagnosticFiles,
    candidates: Array.from(map.values()),
    stats,
  };
}

async function runOneGame(page, gameName, maxMinutes, config, progressState, outDir) {
  const searchPlan = buildSearchPlan(gameName, config);
  const map = new Map();
  const allStats = [];
  const queryRuns = [];

  const perVariantMaxMinutes = Math.max(8, Math.ceil(maxMinutes / Math.max(searchPlan.length, 1)));
  if (progressState) {
    progressState.search_plan_count = searchPlan.length;
    progressState.per_variant_max_minutes = perVariantMaxMinutes;
  }
  for (let variantIdx = 0; variantIdx < searchPlan.length; variantIdx++) {
    const variant = searchPlan[variantIdx];
    if (progressState) {
      progressState.current_query_index = variantIdx + 1;
      progressState.current_query_total = searchPlan.length;
    }
    const one = await runOneSearchQuery(page, gameName, variant, perVariantMaxMinutes, progressState, outDir, config);
    queryRuns.push({
      query: one.query,
      query_variant_type: one.query_variant_type,
      stop_reason: one.stop_reason,
      rounds: one.rounds,
      candidates_count: one.candidates.length,
      route_fallback_used: one.route_fallback_used,
      active_search_url: one.active_search_url,
      diagnostics: one.diagnostics,
    });
    allStats.push(...one.stats);
    if (progressState) {
      progressState.completed_queries = (progressState.completed_queries || 0) + 1;
      progressState.completed_candidates = map.size;
      progressState.total_candidates = Math.max(progressState.total_candidates || 0, map.size);
      progressState.last_query_stop_reason = one.stop_reason;
      progressState.last_updated_at = new Date().toISOString();
    }
    for (const c of one.candidates) {
      if (!map.has(c.group_url)) map.set(c.group_url, c);
      else map.set(c.group_url, mergeCandidate(map.get(c.group_url), c));
    }
  }

  for (const seed of buildSeedCandidates(gameName, config)) {
    if (!map.has(seed.group_url)) map.set(seed.group_url, seed);
    else map.set(seed.group_url, mergeCandidate(map.get(seed.group_url), seed));
  }

  return {
    game_name: gameName,
    stop_reason: queryRuns.map((x) => `${x.query_variant_type}:${x.stop_reason}`).join('|'),
    rounds: queryRuns.reduce((sum, x) => sum + (x.rounds || 0), 0),
    search_plan: searchPlan,
    per_variant_max_minutes: perVariantMaxMinutes,
    query_runs: queryRuns,
    candidates: Array.from(map.values()),
    stats: allStats,
  };
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const games = args['games-file']
    ? loadGamesFromFile(args['games-file'])
    : (args.games || '')
      .split(',')
      .map((s) => clean(s))
      .filter(Boolean);

  if (!games.length) {
    console.error('Usage: node phase1_collect_candidates.js --games "LINE Rangers,sealm on cross" --out-dir "./runs/xxx" --config "./task_config.json"');
    console.error('   or: node phase1_collect_candidates.js --games-file "./games.json" --out-dir "./runs/xxx" --config "./task_config.json"');
    process.exit(1);
  }

  const outDir = path.resolve(args['out-dir'] || `./runs/${Date.now()}`);
  const maxMinutes = Number(args['max-minutes'] || 90);
  const config = loadConfig(args.config || '');
  const progressReportEveryMinutes = parseProgressReportEveryMinutes(args, config, 30);
  const outCodexProgress = path.resolve(args['out-codex-progress'] || args['progress-report'] || path.join(outDir, 'codex_progress_report.json'));
  fs.mkdirSync(outDir, { recursive: true });

  const progressState = {
    phase: 'phase1',
    out_dir: outDir,
    total_games: games.length,
    current_game_name: '',
    current_game_index: 0,
    completed_games: 0,
    current_query: '',
    current_query_variant_type: '',
    current_round: 0,
    current_query_candidates: 0,
    completed_queries: 0,
    completed_candidates: 0,
    total_candidates: 0,
    last_updated_at: new Date().toISOString(),
  };
  const codexProgressReporter = createCodexProgressReporter({
    phase: 'phase1',
    intervalMinutes: progressReportEveryMinutes,
    outFile: outCodexProgress,
    getProgress: () => ({ ...progressState }),
  });

  const browser = await chromium.connectOverCDP(args.cdp || config.cdp_url || 'http://127.0.0.1:9222');
  const context = browser.contexts()[0] || (await browser.newContext());
  const page = context.pages().find((p) => p.url().includes('facebook.com')) || (await context.newPage());

  try {
    const index = {
      created_at: new Date().toISOString(),
      mode: 'phase1',
      collector_version: '7.0.1',
      games: [],
      out_dir: outDir,
      config_file: args.config ? path.resolve(args.config) : '',
      extraction_policy: {
        high_recall_group_url_collection: true,
        hard_query_token_rejection: false,
        dual_search_route_recovery: true,
        zero_result_diagnostics: config.phase1_zero_result_diagnostics !== false,
      },
      variant_policy: {
        automatic: ['canonical', 'punctuation_normalized', 'compact_spacing'],
        configured_only: ['connector_x', 'configured_variant', 'seed_group_url'],
      },
    };

    for (let gameIdx = 0; gameIdx < games.length; gameIdx++) {
      const gameName = games[gameIdx];
      progressState.current_game_name = gameName;
      progressState.current_game_index = gameIdx + 1;
      progressState.current_query = '';
      progressState.current_query_variant_type = '';
      progressState.current_round = 0;
      progressState.current_query_candidates = 0;
      progressState.completed_candidates = 0;
      progressState.last_updated_at = new Date().toISOString();
      codexProgressReporter.writeSnapshot('game_started');

      const one = await runOneGame(page, gameName, maxMinutes, config, progressState, outDir);
      const slug = slugify(gameName);
      const candidatesFile = path.join(outDir, `phase1_${slug}_candidates.json`);
      const statsFile = path.join(outDir, `phase1_${slug}_stats.json`);

      fs.writeFileSync(candidatesFile, JSON.stringify(one.candidates, null, 2), 'utf8');
      fs.writeFileSync(statsFile, JSON.stringify({ stats: one.stats, query_runs: one.query_runs, search_plan: one.search_plan, per_variant_max_minutes: one.per_variant_max_minutes }, null, 2), 'utf8');

      progressState.completed_games = gameIdx + 1;
      progressState.completed_candidates = one.candidates.length;
      progressState.total_candidates = index.games.reduce((sum, item) => sum + (item.candidates_count || 0), 0) + one.candidates.length;
      progressState.last_game_stop_reason = one.stop_reason;
      progressState.last_updated_at = new Date().toISOString();
      codexProgressReporter.writeSnapshot('game_finished');

      index.games.push({
        game_name: gameName,
        slug,
        stop_reason: one.stop_reason,
        rounds: one.rounds,
        candidates_count: one.candidates.length,
        candidates_file: candidatesFile,
        stats_file: statsFile,
        search_plan: one.search_plan,
        per_variant_max_minutes: one.per_variant_max_minutes,
        query_runs: one.query_runs,
      });
    }

    const indexFile = path.join(outDir, 'phase1_index.json');
    fs.writeFileSync(indexFile, JSON.stringify(index, null, 2), 'utf8');

    progressState.phase1_index = indexFile;
    progressState.current_query = '';
    progressState.current_query_variant_type = '';
    progressState.current_round = 0;
    progressState.last_updated_at = new Date().toISOString();
    codexProgressReporter.writeSnapshot('phase1_finished');

    console.log(JSON.stringify({ ok: true, phase1_index: indexFile, games: index.games }, null, 2));
  } finally {
    codexProgressReporter.stop('phase1_stopped');
    await browser.close();
  }
})();
