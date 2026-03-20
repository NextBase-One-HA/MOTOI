(() => {
  const BEE_KEY = 'glb_bee_origin';
  const DEFAULT_BEE = 'http://127.0.0.1:8888';
  const USER_LEX_KEY = 'glb_user_lexicon_v1';
  const BOOT_KEY = 'glb_dict_bootstrap_v1';
  const USE_BEE_UNKNOWN_KEY = 'glb_use_bee_unknown';
  const TRANSLATE_API_CAP = 8;
  const API_MONTH_KEY = 'glb_translate_api_month';
  const API_USED_KEY = 'glb_translate_api_used';

  // Free tier: no gateway API calls (offline only).
  // Payment-gated mode can be wired later by setting this true after Stripe verification.
  const BEE_API_ENABLED = false;

  // Guaranteed offline translation pairs (bundled demo dictionary only).
  // - en -> es
  // - en -> ja
  // - ja -> en
  // UI is limited so Translate always hits offline.
  const LANGS = [
    { v: 'en', n: 'English' },
    { v: 'es', n: 'Español' },
    { v: 'ja', n: '日本語' }
  ];

  // Scene quick phrases (3 lines each)
  const SCENES = {
    hotel: ["hello", "thank you", "hello"],
    transport: ["thank you", "hello", "thank you"],
    shopping: ["hello", "thank you", "thank you"],
    dining: ["thank you", "hello", "hello"]
  };

  const uiLangSel = document.getElementById('ui-lang');
  const fromSel = document.getElementById('lang-from');
  const toSel = document.getElementById('lang-to');
  const input = document.getElementById('input');
  const out = document.getElementById('out');
  const btn = document.getElementById('btn');
  const speakBtn = document.getElementById('speak');
  const beeOrigin = document.getElementById('bee-origin');
  const beePing = document.getElementById('bee-ping');
  const beePhrases = document.getElementById('bee-phrases');
  const beeComplete = document.getElementById('bee-complete');
  const beeStatus = document.getElementById('bee-status');
  const phraseChips = document.getElementById('phrase-chips');
  const useBeeUnknown = document.getElementById('use-bee-unknown');
  const dictBootstrapBtn = document.getElementById('dict-bootstrap');
  const dictClearBtn = document.getElementById('dict-clear-user');
  const dictMeta = document.getElementById('dict-meta');
  const translateMeta = document.getElementById('translate-meta');

  // Dialogue mode UI
  const dlgEnabled = document.getElementById('dlg-enabled');
  const dlgPanel = document.getElementById('dlg-panel');
  const sceneSel = document.getElementById('scene-sel');
  const sceneChips = document.getElementById('scene-chips');
  const dlgCard = document.getElementById('dlg-card');
  const dlgUserText = document.getElementById('dlg-user-text');
  const dlgOtherText = document.getElementById('dlg-other-text');
  const dlgSideUser = document.getElementById('dlg-side-user');
  const dlgSideOther = document.getElementById('dlg-side-other');
  const dlgTranslateBtn = document.getElementById('dlg-translate');
  const dlgSpeak = document.getElementById('dlg-speak');
  const dlgMeta = document.getElementById('dlg-meta');

  function fill(sel) {
    sel.innerHTML = LANGS.map(x => `<option value="${x.v}">${x.n}</option>`).join('');
  }

  // UI language default = English
  fill(uiLangSel);
  fill(fromSel);
  fill(toSel);
  uiLangSel.value = localStorage.getItem('glb_ui_lang') || 'en';

  // Fix "From" to English for guaranteed hits.
  const fixedFrom = 'en';
  fromSel.value = fixedFrom;
  fromSel.disabled = true;
  localStorage.setItem('glb_from', fixedFrom);

  // "To" is only allowed to be es or ja.
  const savedTo = String(localStorage.getItem('glb_to') || 'es').toLowerCase();
  toSel.value = savedTo === 'ja' ? 'ja' : 'es';

  uiLangSel.addEventListener('change', () => {
    localStorage.setItem('glb_ui_lang', uiLangSel.value);
  });
  toSel.addEventListener('change', () => {
    localStorage.setItem('glb_to', toSel.value === 'ja' ? 'ja' : 'es');
  });

  function getBeeOrigin() {
    const raw = (beeOrigin && beeOrigin.value) || localStorage.getItem(BEE_KEY) || DEFAULT_BEE;
    return String(raw).trim().replace(/\/+$/, '');
  }

  function saveBeeOrigin() {
    const v = String(beeOrigin.value || '').trim() || DEFAULT_BEE;
    beeOrigin.value = v.replace(/\/+$/, '');
    localStorage.setItem(BEE_KEY, beeOrigin.value);
  }

  beeOrigin.value = (localStorage.getItem(BEE_KEY) || DEFAULT_BEE).replace(/\/+$/, '');
  beeOrigin.addEventListener('change', saveBeeOrigin);
  beeOrigin.addEventListener('blur', saveBeeOrigin);

  function setBeeStatus(msg, kind) {
    beeStatus.textContent = msg;
    beeStatus.classList.remove('ok', 'err');
    if (kind === 'ok') beeStatus.classList.add('ok');
    if (kind === 'err') beeStatus.classList.add('err');
  }

  function phraseLine(p) {
    if (typeof p === 'string') return p;
    if (p && typeof p === 'object' && typeof p.text === 'string') return p.text;
    return '';
  }

  async function beeFetch(path, init = {}) {
    const base = getBeeOrigin();
    if (!base) throw new Error('Missing BEE URL');
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 12000);
    const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
    try {
      return await fetch(url, {
        cache: 'no-store',
        ...init,
        signal: ctrl.signal
      });
    } finally {
      clearTimeout(tid);
    }
  }

  function normText(s) {
    try {
      return String(s).normalize('NFKC').trim();
    } catch {
      return String(s).trim();
    }
  }

  function keyTail(from, text) {
    const n = normText(text);
    return /^(en|es|de|fr|pt)$/i.test(from) ? n.toLowerCase() : n;
  }

  function lexKey(from, to, text) {
    return `${from}|${to}|${keyTail(from, text)}`;
  }

  const BUNDLED = {
    'en|es': { hello: 'hola', 'thank you': 'gracias' },
    'en|ja': { hello: 'こんにちは', 'thank you': 'ありがとう' },
    'ja|en': { こんにちは: 'Hello', ありがとう: 'Thank you' }
  };

  function lookupBundled(from, to, text) {
    const row = BUNDLED[`${from}|${to}`];
    if (!row) return null;
    const k = keyTail(from, text);
    if (Object.prototype.hasOwnProperty.call(row, k)) return row[k];
    if (Object.prototype.hasOwnProperty.call(row, normText(text))) return row[normText(text)];
    return null;
  }

  function loadUserLex() {
    try {
      const raw = localStorage.getItem(USER_LEX_KEY);
      const o = raw ? JSON.parse(raw) : {};
      return o && typeof o === 'object' ? o : {};
    } catch {
      return {};
    }
  }

  function saveUserLex(obj) {
    localStorage.setItem(USER_LEX_KEY, JSON.stringify(obj));
    updateDictMeta();
  }

  function calendarMonthKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  /** POST /api/translate のみカウント。Ping・phrases・bootstrap・complete は含めない。 */
  function syncTranslateApiMonth() {
    const m = calendarMonthKey();
    if (localStorage.getItem(API_MONTH_KEY) !== m) {
      localStorage.setItem(API_MONTH_KEY, m);
      localStorage.setItem(API_USED_KEY, '0');
    }
  }

  function getTranslateApiUsage() {
    syncTranslateApiMonth();
    const used = Math.max(0, parseInt(localStorage.getItem(API_USED_KEY) || '0', 10) || 0);
    return {
      month: calendarMonthKey(),
      used,
      remaining: Math.max(0, TRANSLATE_API_CAP - used)
    };
  }

  function recordTranslateApiCall() {
    syncTranslateApiMonth();
    const used = Math.max(0, parseInt(localStorage.getItem(API_USED_KEY) || '0', 10) || 0);
    localStorage.setItem(API_USED_KEY, String(used + 1));
  }

  function updateDictMeta() {
    const n = Object.keys(loadUserLex()).length;
    let bv = '—';
    try {
      const b = localStorage.getItem(BOOT_KEY);
      if (b) bv = String(JSON.parse(b).version ?? '?');
    } catch { /* ignore */ }
    const q = getTranslateApiUsage();
    dictMeta.textContent =
      `User cache: ${n} pair(s) · bootstrap schema v${bv} · ` +
      `translate API: ${q.used}/${TRANSLATE_API_CAP} used (${q.month}), ${q.remaining} left`;
  }

  // Default OFF: avoid sending user-unknown phrases unless explicit consent is given.
  useBeeUnknown.checked = false;
  useBeeUnknown.disabled = true;
  try {
    localStorage.setItem(USE_BEE_UNKNOWN_KEY, '0');
  } catch { /* ignore */ }

  if (!BEE_API_ENABLED) {
    useBeeUnknown.addEventListener('click', (e) => e.preventDefault());
  }

  dictBootstrapBtn.addEventListener('click', async () => {
    if (!BEE_API_ENABLED) {
      setBeeStatus('Free tier: API disabled (offline only).', 'err');
      return;
    }
    saveBeeOrigin();
    setBeeStatus('Fetching empty dict shell…', null);
    try {
      const r = await beeFetch('/api/dict/bootstrap');
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      localStorage.setItem(BOOT_KEY, JSON.stringify(j));
      updateDictMeta();
      setBeeStatus('Bootstrap saved on device (empty entries).', 'ok');
    } catch (e) {
      setBeeStatus(`Bootstrap failed — ${e.message || e}`, 'err');
    }
  });

  dictClearBtn.addEventListener('click', () => {
    if (!window.confirm('Clear user translation cache on this device?')) return;
    localStorage.removeItem(USER_LEX_KEY);
    updateDictMeta();
    setBeeStatus('User cache cleared.', 'ok');
  });

  updateDictMeta();

  async function translateOne(text, from, to) {
    const t = text.trim();
    if (!t) return { text: '', source: 'empty' };
    if (from === to) return { text: t, source: 'same' };

    const hitB = lookupBundled(from, to, text);
    if (hitB != null) return { text: hitB, source: 'bundled' };

    const uk = lexKey(from, to, text);
    const user = loadUserLex();
    if (Object.prototype.hasOwnProperty.call(user, uk)) {
      return { text: user[uk], source: 'user' };
    }

    const online = typeof navigator !== 'undefined' && navigator.onLine;
    if (BEE_API_ENABLED && online && useBeeUnknown.checked) {
      try {
        const r = await beeFetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: t, from, to })
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || r.status);
        const tr = j.translated != null ? String(j.translated) : t;
        user[uk] = tr;
        saveUserLex(user);
        return { text: tr, source: 'gateway' };
      } catch {
        return { text: t, source: 'offline-fallback' };
      }
    }

    return { text: t, source: 'passthrough' };
  }

  beePing.addEventListener('click', async () => {
    if (!BEE_API_ENABLED) {
      setBeeStatus('Free tier: API disabled (offline only).', 'err');
      return;
    }
    saveBeeOrigin();
    setBeeStatus('BEE: pinging…', null);
    phraseChips.innerHTML = '';
    try {
      const r = await beeFetch('/health');
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      if (!j.ok) throw new Error('health not ok');
      setBeeStatus(`BEE: online (${getBeeOrigin()})`, 'ok');
    } catch (e) {
      setBeeStatus(`BEE: unreachable — ${e.message || e}`, 'err');
    }
  });

  beePhrases.addEventListener('click', async () => {
    if (!BEE_API_ENABLED) {
      setBeeStatus('Free tier: API disabled (offline only).', 'err');
      return;
    }
    saveBeeOrigin();
    setBeeStatus('BEE: loading phrases…', null);
    phraseChips.innerHTML = '';
    try {
      const r = await beeFetch('/api/phrases');
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const list = Array.isArray(j.phrases) ? j.phrases : [];
      list.forEach((p) => {
        const line = phraseLine(p);
        if (!line) return;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip';
        b.textContent = line.length > 48 ? `${line.slice(0, 45)}…` : line;
        b.title = line;
        b.addEventListener('click', () => {
          input.value = line;
          input.focus();
        });
        phraseChips.appendChild(b);
      });
      setBeeStatus(`BEE: ${list.length} phrase(s) — tap to paste`, 'ok');
    } catch (e) {
      setBeeStatus(`BEE: phrases failed — ${e.message || e}`, 'err');
    }
  });

  beeComplete.addEventListener('click', async () => {
    if (!BEE_API_ENABLED) {
      setBeeStatus('Free tier: API disabled (offline only).', 'err');
      return;
    }
    saveBeeOrigin();
    setBeeStatus('BEE: /complete …', null);
    try {
      const r = await beeFetch('/complete?case_id=demo-001');
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      out.textContent = JSON.stringify(j, null, 2);
      setBeeStatus('Layer 3: /complete OK (see result above)', 'ok');
    } catch (e) {
      setBeeStatus(`Layer 3: failed — ${e.message || e}`, 'err');
    }
  });

  btn.addEventListener('click', async () => {
    // Dialogue mode has its own translate/flip button.
    if (dlgEnabled && dlgEnabled.checked) return;
    const text = input.value;
    const from = fromSel.value;
    const to = toSel.value;
    translateMeta.textContent = 'Resolving…';
    out.textContent = '';
    const r = await translateOne(text, from, to);
    out.textContent = r.text;
    const extra = r.detail ? ` — ${r.detail}` : '';
    translateMeta.textContent = `Source: ${r.source}${extra}`;
    updateDictMeta();
  });

  // Dialogue mode state machine.
  const dlgState = {
    side: 'user',
    lastTranslated: ''
  };

  function setDlgSide(side) {
    dlgState.side = side;
    dlgCard.dataset.side = side;
    dlgMeta.textContent = '';

    if (side === 'user') {
      dlgUserText.textContent = input.value.trim() || '(empty)';
    } else {
      const translated = dlgState.lastTranslated || out.textContent.trim();
      dlgOtherText.textContent = translated || '(translate first)';
      if (!translated) dlgMeta.textContent = 'Translate first, then flip to Other.';
    }
  }

  function renderSceneChips(scene) {
    const items = SCENES[scene] || [];
    sceneChips.innerHTML = '';
    items.forEach((line) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = line;
      b.title = line;
      b.addEventListener('click', () => {
        input.value = line;
        if (dlgEnabled && dlgEnabled.checked) setDlgSide('user');
      });
      sceneChips.appendChild(b);
    });
  }

  function initScenes() {
    if (!sceneSel || !sceneChips) return;
    sceneSel.innerHTML = Object.keys(SCENES)
      .map((k) => `<option value="${k}">${k}</option>`)
      .join('');
    const saved = localStorage.getItem('glb_scene_sel');
    const initial = saved && SCENES[saved] ? saved : 'hotel';
    sceneSel.value = initial;
    renderSceneChips(initial);
  }

  dlgSideUser.addEventListener('click', () => setDlgSide('user'));
  dlgSideOther.addEventListener('click', () => setDlgSide('other'));

  dlgEnabled.addEventListener('change', () => {
    const on = !!dlgEnabled.checked;
    dlgPanel.style.display = on ? '' : 'none';
    if (on) setDlgSide(dlgState.side);
    localStorage.setItem('glb_dlg_enabled', on ? '1' : '0');
  });

  sceneSel.addEventListener('change', () => {
    const s = String(sceneSel.value || 'hotel');
    localStorage.setItem('glb_scene_sel', s);
    renderSceneChips(s);
    dlgMeta.textContent = 'Tap a chip to paste into the User side.';
  });

  dlgTranslateBtn.addEventListener('click', async () => {
    const t = input.value.trim();
    if (!t) {
      dlgMeta.textContent = 'Write something on the User side first.';
      return;
    }

    dlgMeta.textContent = 'Translating…';
    const from = fromSel.value;
    const to = toSel.value;

    translateMeta.textContent = 'Resolving…';
    out.textContent = '';

    const r = await translateOne(t, from, to);
    out.textContent = r.text;

    const extra = r.detail ? ` — ${r.detail}` : '';
    translateMeta.textContent = `Source: ${r.source}${extra}`;
    updateDictMeta();

    dlgState.lastTranslated = out.textContent.trim();
    setDlgSide('other');

    if (dlgSpeak && dlgSpeak.checked && dlgState.lastTranslated) {
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(dlgState.lastTranslated);
        u.lang = toSel.value;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      }
    }
    dlgMeta.textContent = '';
  });

  // Startup init
  initScenes();
  const savedDlg = localStorage.getItem('glb_dlg_enabled') === '1';
  if (dlgEnabled) {
    dlgEnabled.checked = savedDlg;
    dlgPanel.style.display = savedDlg ? '' : 'none';
  }
  setDlgSide(dlgState.side);

  // TTS (browser built-in)
  speakBtn.addEventListener('click', () => {
    const text = out.textContent.trim();
    if (!text) return;
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    // try set voice lang to target
    u.lang = toSel.value;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  });

  // PWA offline
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();
