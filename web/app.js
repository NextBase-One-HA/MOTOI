(() => {
  let stripeRedirectTimer = null;

  const BEE_KEY = 'glb_bee_origin';
  // Quick Tunnel host changes when cloudflared restarts; update for next demo.
  // Default to local NE Gateway so this package works out-of-the-box.
  const BEE_ORIGIN_LIVE = 'http://127.0.0.1:8888';
  const DEFAULT_BEE = BEE_ORIGIN_LIVE;
  const USER_LEX_KEY = 'glb_user_lexicon_v1';
  const BOOT_KEY = 'glb_dict_bootstrap_v1';
  const USE_BEE_UNKNOWN_KEY = 'glb_use_bee_unknown';
  const TRANSLATE_API_CAP = 8;
  const API_MONTH_KEY = 'glb_translate_api_month';
  const API_USED_KEY = 'glb_translate_api_used';
  const DEVICE_ID_KEY = 'glb_device_id_v1';
  /** Payment Link — single source (footer + auto-redirect use this). */
  const STRIPE_CHECKOUT_URL = 'https://buy.stripe.com/dRm3cx7Rj8KA0B1gyHasg01';

  // Guaranteed offline translation pairs (bundled demo dictionary only).
  // - en -> es/ja/fr/de/it/ko/zh
  // - ja -> en
  const LANGS = [
    { v: 'en', n: 'English' },
    { v: 'es', n: 'Español' },
    { v: 'ja', n: '日本語' },
    { v: 'zh', n: '中文' },
    { v: 'ko', n: '한국어' },
    { v: 'fr', n: 'Français' },
    { v: 'de', n: 'Deutsch' },
    { v: 'it', n: 'Italiano' }
  ];

  // Scene quick phrases (3 lines each)
  const SCENES = {
    hotel: ["hello", "thank you", "hello"],
    transport: ["thank you", "hello", "thank you"],
    shopping: ["hello", "thank you", "thank you"],
    dining: ["thank you", "hello", "hello"]
  };

  const UI_LANGS = [
    { v: 'en', n: 'English' },
    { v: 'ja', n: '日本語' },
    { v: 'zh', n: '中文' },
    { v: 'ko', n: '한국어' },
    { v: 'es', n: 'Español' }
  ];

  const STRINGS = {
    en: {
      tagline: 'Type below, tap GLB∞ — show the top line to them.',
      oneLiner: 'They read the language you picked above. You type underneath.',
      step1Title: 'Line to show the other person',
      step1Hint: 'It appears here after step 3.',
      step2Title: 'What you type (your side)',
      step2Hint: 'Try “hello” or “Thank you.”',
      inputPh: 'Type here. Example: Thank you.',
      lblInputA11y: 'Text to translate',
      step3Title: 'Tap the gold button once',
      btn: 'GLB∞ Translate',
      outEmpty: '(Nothing yet — type in step 2, then step 3.)',
      helpSummary: 'Something wrong?',
      helpIntro: 'Use this only if nothing appears after steps 1–2, or the text looks unchanged when it should not.',
      urlLabel: 'Backend link',
      urlPh: 'Only if support gave you a new link',
      urlHint: 'Change it only when asked to, then reload this page.',
      aboutSummary: 'How it works',
      aboutBody:
        'We use a small on-device word list first, then remember new translations on this device. Sentences we have not seen before are sent to our backend automatically until a monthly limit. You do not need to turn anything on for normal use.',
      translating: 'Translating…',
      meta_empty: 'Nothing to translate.',
      meta_same: 'Same language — text unchanged.',
      meta_bundled: 'From the built-in demo list.',
      meta_user: 'From memory on this device.',
      meta_cap_reached: 'Monthly online limit reached — showing original.',
      meta_gateway: 'Translated online.',
      meta_offline_fallback: 'Could not reach the service — showing original.',
      meta_gateway_miss:
        'That phrase isn’t in the demo dictionary yet — showing the original. Try short English like “hello” or “thank you,” or Japanese like ありがとう.',
      meta_passthrough: 'Showing original text.',
      tipAfterFail: '→ Open “Something wrong?” below.',
      displayLang: 'Screen language',
      translateTo: 'Translate to',
      ctaSupport: 'Support (Stripe, optional)',
      stripeNote: '$1.99/mo',
      dictFmt: 'Saved lines: {n} · This month: {used}/{cap} ({left} left)',
      meta_unknown: 'Something unusual happened.',
      beeChecking: 'Checking…',
      beeOk: 'Connected.',
      beeErr: 'Could not connect.',
      dictBootstrapRun: 'Fetching…',
      dictBootstrapOk: 'Saved on this device.',
      dictClearConfirm: 'Clear saved translations on this device?',
      dictCleared: 'Saved translations cleared.',
      stripeAutoTitle: 'Monthly online limit reached',
      stripeAutoBody:
        'Opening secure checkout in a moment — no need to hunt for a link. You can tap below to go immediately.',
      stripeOpenNow: 'Open checkout now',
      stripeStay: 'Not now — stay on this page'
    },
    ja: {
      tagline: '下で打って GLB∞。上の一行を相手に見せられます。',
      oneLiner: '上の言語は「相手が読む言語」。下があなたの入力です。',
      step1Title: '相手に見せる訳（ここに表示）',
      step1Hint: '③を押すとここに出ます。',
      step2Title: '自分が打つ文',
      step2Hint: 'hello や Thank you. でも試せます。',
      inputPh: 'ここに入力。例: Thank you.',
      lblInputA11y: '翻訳したい原文',
      step3Title: '金色のボタンを1回押す',
      btn: 'GLB∞ 翻訳',
      outEmpty: '（まだありません。②で入力し、③を押してください）',
      helpSummary: 'うまくいかないとき',
      helpIntro: '②③を済ませたあと、訳が出ない・おかしいときだけ開いてください。',
      urlLabel: '接続先リンク',
      urlPh: 'サポートから案内があったときだけ貼る',
      urlHint: '変更したらページを再読み込みしてください。',
      aboutSummary: 'しくみ',
      aboutBody:
        '同梱の短い辞書を先に使い、覚えた訳はこの端末に保存します。初めての文は自動でバックエンドへ送り、月に上限まで。通常は追加の操作は不要です。',
      translating: '翻訳中…',
      meta_empty: '入力がありません。',
      meta_same: '同じ言語のためそのままです。',
      meta_bundled: '同梱デモ辞書を使いました。',
      meta_user: 'この端末に保存した訳を使いました。',
      meta_cap_reached: '今月のオンライン上限に達しました。原文を表示しています。',
      meta_gateway: 'オンラインで翻訳しました。',
      meta_offline_fallback: 'サービスに届きませんでした。原文を表示しています。',
      meta_gateway_miss:
        'デモ辞書にまだない表現です。原文のままです。英語の hello / thank you、日本語の ありがとう など短い語を試してください。',
      meta_passthrough: '原文を表示しています。',
      tipAfterFail: '→ 下の「うまくいかないとき」を開いてください。',
      displayLang: '画面の言語',
      translateTo: '訳す言語',
      ctaSupport: '支援（Stripe・任意）',
      stripeNote: '$1.99/月',
      dictFmt: '保存 {n} 件 · 今月 {used}/{cap}（残 {left}）',
      meta_unknown: '想定外の状態です。',
      beeChecking: '確認中…',
      beeOk: '接続できました。',
      beeErr: '接続できませんでした。',
      dictBootstrapRun: '取得中…',
      dictBootstrapOk: 'この端末に保存しました。',
      dictClearConfirm: 'この端末に保存した訳を消しますか？',
      dictCleared: '保存した訳を消しました。',
      stripeAutoTitle: '今月のオンライン枠に達しました',
      stripeAutoBody:
        'まもなく決済ページへ移動します。リンクを探す必要はありません。すぐ開く場合は下のボタンを押してください。',
      stripeOpenNow: 'いますぐ決済ページを開く',
      stripeStay: 'いいえ、この画面にとどまる'
    }
  };
  STRINGS.zh = {
    ...STRINGS.en,
    tagline: '在下方输入，点 GLB∞。把上面一行给对方看。',
    displayLang: '界面语言',
    translateTo: '翻译成'
  };
  STRINGS.ko = { ...STRINGS.en };
  STRINGS.es = { ...STRINGS.en };

  function detectUiLang() {
    try {
      const s = localStorage.getItem('glb_ui_lang');
      if (s && STRINGS[s]) return s;
    } catch { /* ignore */ }
    const n = (typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en')
      .slice(0, 2)
      .toLowerCase();
    return STRINGS[n] ? n : 'en';
  }

  function uiPack() {
    try {
      const el = document.getElementById('ui-lang');
      const v = el && el.value;
      if (v && STRINGS[v]) return STRINGS[v];
    } catch { /* ignore */ }
    return STRINGS[detectUiLang()] || STRINGS.en;
  }

  function txt(key) {
    const p = uiPack();
    return p[key] ?? STRINGS.en[key] ?? key;
  }

  function applyI18n() {
    const sel = document.getElementById('ui-lang');
    if (sel) {
      try {
        localStorage.setItem('glb_ui_lang', sel.value);
      } catch { /* ignore */ }
    }
    document.documentElement.lang = (sel && sel.value) || detectUiLang();
    const set = (id, k) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt(k);
    };
    set('i18n-tagline', 'tagline');
    set('i18n-one-liner', 'oneLiner');
    set('i18n-step1-title', 'step1Title');
    set('i18n-step1-hint', 'step1Hint');
    set('i18n-step2-title', 'step2Title');
    set('i18n-step2-hint', 'step2Hint');
    set('i18n-step3-title', 'step3Title');
    set('lbl-ui-lang', 'displayLang');
    set('lbl-translate-to', 'translateTo');
    set('lbl-input-a11y', 'lblInputA11y');
    set('i18n-help-summary', 'helpSummary');
    set('i18n-help-intro', 'helpIntro');
    set('lbl-bee-origin', 'urlLabel');
    set('i18n-url-hint', 'urlHint');
    set('i18n-about-summary', 'aboutSummary');
    set('i18n-about-body', 'aboutBody');
    const inp = document.getElementById('input');
    if (inp) inp.placeholder = txt('inputPh');
    const b = document.getElementById('btn');
    if (b) b.textContent = txt('btn');
    const o = document.getElementById('out');
    if (o) o.setAttribute('data-empty-hint', txt('outEmpty'));
    const bo = document.getElementById('bee-origin');
    if (bo) bo.setAttribute('placeholder', txt('urlPh'));
    const stripe = document.getElementById('link-stripe');
    if (stripe) {
      stripe.href = STRIPE_CHECKOUT_URL;
      stripe.textContent = `${txt('ctaSupport')} · ${txt('stripeNote')}`;
    }
    applyStripeAutoCopy();
    updateDictMeta();
  }

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

  /** 未登録語はユーザーに選ばせず常に ON（hidden のチェックと同期） */
  function applyUseBeeUnknownDefault() {
    if (!useBeeUnknown) return;
    useBeeUnknown.disabled = false;
    useBeeUnknown.checked = true;
    try {
      localStorage.setItem(USE_BEE_UNKNOWN_KEY, '1');
    } catch { /* ignore */ }
  }

  const dictBootstrapBtn = document.getElementById('dict-bootstrap');
  const dictClearBtn = document.getElementById('dict-clear-user');
  const dictMeta = document.getElementById('dict-meta');
  const translateMeta = document.getElementById('translate-meta');
  const greetingsText = document.getElementById('greetings-text');
  const greetingsSend = document.getElementById('greetings-send');
  const greetingsCount = document.getElementById('greetings-count');
  const greetingsStatus = document.getElementById('greetings-status');
  const greetingsFeed = document.getElementById('greetings-feed');

  const glb150SceneSel = document.getElementById('glb150-scene');
  const glb150TriggerInput = document.getElementById('glb150-trigger');
  const glb150OptionsBtn = document.getElementById('glb150-options');
  const glb150Status = document.getElementById('glb150-status');
  const glb150OptionChips = document.getElementById('glb150-option-chips');
  const GREET_MAX = 280;

  // Keep "advanced" UI collapsed by default (only show title).
  // This avoids clutter after the user expanded it earlier.
  try {
    document.querySelectorAll('details.advanced').forEach((d) => {
      d.open = false;
    });
  } catch { /* ignore */ }

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
  const dlg150Pick = document.getElementById('dlg-150-pick');
  const dlg150Chips = document.getElementById('dlg-150-chips');
  const dlg150Meta = document.getElementById('dlg-150-meta');

  function fill(sel) {
    if (!sel) return;
    sel.innerHTML = LANGS.map(x => `<option value="${x.v}">${x.n}</option>`).join('');
  }

  function fillUiLang(sel) {
    if (!sel) return;
    sel.innerHTML = UI_LANGS.map((x) => `<option value="${x.v}">${x.n}</option>`).join('');
  }

  fillUiLang(uiLangSel);
  fill(fromSel);
  fill(toSel);
  if (uiLangSel) {
    const d = detectUiLang();
    uiLangSel.value = STRINGS[d] ? d : 'en';
  }
  applyI18n();

  applyUseBeeUnknownDefault();

  // Fix "From" to English for guaranteed hits.
  const fixedFrom = 'en';
  if (fromSel) {
    fromSel.value = fixedFrom;
    fromSel.disabled = true;
  }
  localStorage.setItem('glb_from', fixedFrom);

  // Quick UX: default output language without showing a picker.
  const savedTo = String(localStorage.getItem('glb_to') || 'ja').toLowerCase();
  const allowedTo = new Set(LANGS.map(x => x.v));
  if (toSel) toSel.value = allowedTo.has(savedTo) ? savedTo : 'es';

  if (uiLangSel) {
    uiLangSel.addEventListener('change', () => {
      applyI18n();
    });
  }
  if (toSel) {
    toSel.addEventListener('change', () => {
      const v = String(toSel.value || '').toLowerCase();
      localStorage.setItem('glb_to', allowedTo.has(v) ? v : 'es');
      applyI18n();
    });
  }

  function getBeeOrigin() {
    // Remote override: allow passing ?bee=https://<bee-tunnel-host>
    // from the opened URL. This keeps UI simple while still supporting two-tunnel setups.
    try {
      const params = new URLSearchParams(location.search);
      const beeOverride = params.get('bee');
      if (beeOverride) {
        const s = String(beeOverride).trim().replace(/\/+$/, '');
        const u = new URL(s);
        if (u.protocol === 'http:' || u.protocol === 'https:') return s;
      }
    } catch {
      // ignore
    }

    const raw = (beeOrigin && beeOrigin.value) || localStorage.getItem(BEE_KEY) || '';
    const s = String(raw).trim().replace(/\/+$/, '');

    // If user explicitly set an origin, use it (but avoid the common mobile mistake:
    // 127.0.0.1 points to the phone itself, not the PC running the gateway).
    const isLocalHostOrigin = (urlStr) => {
      try {
        const u = new URL(urlStr);
        return u.hostname === '127.0.0.1' || u.hostname === 'localhost';
      } catch {
        return false;
      }
    };

    const pageHost = (() => {
      try {
        if (typeof window === 'undefined') return '';
        const u = new URL(window.location.href);
        return u.hostname || '';
      } catch {
        return '';
      }
    })();
    const pageIsLocal = pageHost === '127.0.0.1' || pageHost === 'localhost';

    if (s) {
      if (!pageIsLocal && isLocalHostOrigin(s)) {
        // On phone / remote page: fall back to gateway on the same host:8888.
      } else {
        // Accept any explicit origin if it wasn't the "mobile localhost" mistake.
        try {
          new URL(s);
          return s;
        } catch {
          // fall through to inference
        }
      }
    }

    // Auto-infer: gateway is assumed to run on the same host as this page, port 8888.
    // This makes the app work on mobile when you open http://PC_IP:8000/index.html.
    try {
      if (typeof window !== 'undefined') {
        const u = new URL(window.location.href);
        if (u.protocol.startsWith('http:') || u.protocol.startsWith('https:')) {
          return `http://${u.hostname}:8888`;
        }
      }
    } catch { /* ignore */ }

    return DEFAULT_BEE;
  }

  function saveBeeOrigin() {
    if (!beeOrigin) return;
    const v = String(beeOrigin.value || '').trim() || DEFAULT_BEE;
    beeOrigin.value = v.replace(/\/+$/, '');
    localStorage.setItem(BEE_KEY, beeOrigin.value);
  }

  if (beeOrigin) {
    beeOrigin.value = (localStorage.getItem(BEE_KEY) || DEFAULT_BEE).replace(/\/+$/, '');
    beeOrigin.addEventListener('change', saveBeeOrigin);
    beeOrigin.addEventListener('blur', saveBeeOrigin);
  }

  function setBeeStatus(msg, kind) {
    if (!beeStatus) return;
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
    return /^(en|es|de|fr|it|pt)$/i.test(from) ? n.toLowerCase() : n;
  }

  function lexKey(from, to, text) {
    return `${from}|${to}|${keyTail(from, text)}`;
  }

  const BUNDLED = {
    'en|es': { hello: 'hola', 'thank you': 'gracias', goodbye: 'adios' },
    'en|ja': { hello: 'こんにちは', 'thank you': 'ありがとう', bad: 'まずい', 'not good': '良くない' },
    'en|fr': { hello: 'Bonjour', 'thank you': 'Merci', goodbye: 'Au revoir' },
    'en|de': { hello: 'Hallo', 'thank you': 'Danke', goodbye: 'Auf Wiedersehen' },
    'en|it': { hello: 'Ciao', 'thank you': 'Grazie', goodbye: 'Arrivederci' },
    'en|ko': { hello: '안녕하세요', 'thank you': '감사합니다', goodbye: '안녕' },
    'en|zh': { hello: '你好', 'thank you': '谢谢', goodbye: '再见' },
    'ja|en': { こんにちは: 'Hello', ありがとう: 'Thank you', まずい: 'Not good. (taste or situation.)' }
  };

  /** Trim stray brackets (e.g. まずい」) so lookups still hit. */
  function stripEdgeBrackets(s) {
    return String(s)
      .replace(/^[\s「『｢\[(']+/u, '')
      .replace(/[\s」』｣\])'.,!?]+$/u, '')
      .trim();
  }

  /** When UI fixes source as English, treat obvious Japanese as ja. */
  function effectiveSourceLang(from, raw) {
    const f = String(from || 'en').toLowerCase();
    const t = String(raw || '').trim();
    if (f !== 'en') return from;
    if (!/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(t)) return from;
    if (/\b[a-zA-Z]{5,}\b/.test(t)) return from;
    return 'ja';
  }

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

  function getDeviceId() {
    try {
      let id = String(localStorage.getItem(DEVICE_ID_KEY) || '').trim();
      if (id) return id;
      id = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
      return id;
    } catch {
      return `dev-ephemeral-${Math.random().toString(36).slice(2, 10)}`;
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

  function fmtDict(s, o) {
    return String(s).replace(/\{(\w+)\}/g, (_, k) => (o[k] != null ? String(o[k]) : `{${k}}`));
  }

  function cancelStripeRedirect() {
    if (stripeRedirectTimer) {
      clearTimeout(stripeRedirectTimer);
      stripeRedirectTimer = null;
    }
  }

  function applyStripeAutoCopy() {
    const elTitle = document.getElementById('stripe-auto-title');
    const elBody = document.getElementById('stripe-auto-body');
    const elGo = document.getElementById('stripe-go-now');
    const elStay = document.getElementById('stripe-stay');
    if (elTitle) elTitle.textContent = txt('stripeAutoTitle');
    if (elBody) elBody.textContent = txt('stripeAutoBody');
    if (elGo) {
      elGo.href = STRIPE_CHECKOUT_URL;
      elGo.textContent = txt('stripeOpenNow');
    }
    if (elStay) elStay.textContent = txt('stripeStay');
  }

  function startStripeAutoRedirect(reason) {
    const panel = document.getElementById('stripe-auto');
    if (!panel) return;
    applyStripeAutoCopy();
    if (sessionStorage.getItem('glb_stripe_stay') === '1') {
      panel.hidden = false;
      return;
    }
    panel.hidden = false;
    cancelStripeRedirect();
    const delay = reason === 'load' ? 2200 : 1600;
    stripeRedirectTimer = setTimeout(() => {
      stripeRedirectTimer = null;
      window.location.assign(STRIPE_CHECKOUT_URL);
    }, delay);
  }

  function syncStripeBannerUsage() {
    const panel = document.getElementById('stripe-auto');
    if (!panel) return;
    const q = getTranslateApiUsage();
    if (q.remaining > 0) {
      panel.hidden = true;
      cancelStripeRedirect();
    }
  }

  function maybeTriggerStripeAuto(r) {
    if (!r || r.source !== 'cap-reached') return;
    startStripeAutoRedirect('cap');
  }

  function updateDictMeta() {
    if (!dictMeta) return;
    const n = Object.keys(loadUserLex()).length;
    const q = getTranslateApiUsage();
    dictMeta.textContent = fmtDict(txt('dictFmt'), {
      n,
      used: q.used,
      cap: TRANSLATE_API_CAP,
      left: q.remaining
    });
    syncStripeBannerUsage();
  }

  if (useBeeUnknown) {
    useBeeUnknown.addEventListener('change', () => {
      applyUseBeeUnknownDefault();
      updateDictMeta();
    });
  }

  if (dictBootstrapBtn) {
    dictBootstrapBtn.addEventListener('click', async () => {
      saveBeeOrigin();
      setBeeStatus(txt('dictBootstrapRun'), null);
      try {
        const r = await beeFetch('/api/dict/bootstrap');
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        localStorage.setItem(BOOT_KEY, JSON.stringify(j));
        updateDictMeta();
        setBeeStatus(txt('dictBootstrapOk'), 'ok');
      } catch (e) {
        setBeeStatus(`${e.message || e}`, 'err');
      }
    });
  }

  if (dictClearBtn) {
    dictClearBtn.addEventListener('click', () => {
      if (!window.confirm(txt('dictClearConfirm'))) return;
      localStorage.removeItem(USER_LEX_KEY);
      updateDictMeta();
      setBeeStatus(txt('dictCleared'), 'ok');
    });
  }

  const stripeGoNow = document.getElementById('stripe-go-now');
  const stripeStayBtn = document.getElementById('stripe-stay');
  if (stripeGoNow) {
    stripeGoNow.addEventListener('click', () => {
      cancelStripeRedirect();
    });
  }
  if (stripeStayBtn) {
    stripeStayBtn.addEventListener('click', () => {
      try {
        sessionStorage.setItem('glb_stripe_stay', '1');
      } catch { /* ignore */ }
      cancelStripeRedirect();
    });
  }

  updateDictMeta();

  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  async function loadGreetings() {
    if (!greetingsFeed || !greetingsStatus) return;
    greetingsStatus.textContent = 'Loading…';
    try {
      const r = await beeFetch('/api/greetings?limit=20');
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || r.status);
      const msgs = Array.isArray(j.messages) ? j.messages : [];
      greetingsFeed.innerHTML = msgs
        .map((m) => {
          const txt = m && m.text != null ? String(m.text) : '';
          const dt = m && m.created_at ? new Date(m.created_at).toLocaleString() : '';
          return `<div class="community-item">
            <div class="community-text">${escapeHtml(txt)}</div>
            <div class="community-meta">${escapeHtml(dt)}</div>
          </div>`;
        })
        .join('');
      greetingsStatus.textContent = `${msgs.length} message(s).`;
    } catch (e) {
      greetingsStatus.textContent = 'Load failed.';
    }
  }

  function updateGreetingsCount() {
    if (!greetingsText || !greetingsCount) return;
    const len = String(greetingsText.value || '').length;
    greetingsCount.textContent = `${len}/${GREET_MAX}`;
  }

  if (greetingsText) {
    greetingsText.addEventListener('input', () => {
      updateGreetingsCount();
    });
    updateGreetingsCount();
  }

  if (greetingsSend && greetingsText) {
    greetingsSend.addEventListener('click', async () => {
      const raw = String(greetingsText.value || '').trim();
      if (!raw) {
        if (greetingsStatus) greetingsStatus.textContent = '一言を書いてね。';
        return;
      }
      greetingsSend.disabled = true;
      if (greetingsStatus) greetingsStatus.textContent = '送信中…';
      try {
        const r = await beeFetch('/api/greetings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: raw })
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || r.status);
        greetingsText.value = '';
        updateGreetingsCount();
        await loadGreetings();
        if (greetingsStatus) greetingsStatus.textContent = '送ったよ。誰かの笑顔につながる。';
      } catch (e) {
        if (greetingsStatus) greetingsStatus.textContent = `送れなかった — ${e.message || e}`;
      } finally {
        greetingsSend.disabled = false;
      }
    });
  }

  if (greetingsFeed) loadGreetings();

  async function loadGlb150Scenes() {
    if (!glb150SceneSel) return;
    try {
      const r = await beeFetch('/api/150/scenes');
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || r.status);
      const scenes = Array.isArray(j.scenes) ? j.scenes : [];
      glb150SceneSel.innerHTML = scenes.map((s) => `<option value="${s}">${s}</option>`).join('');
      glb150SceneSel.value = localStorage.getItem('glb150_scene_sel') || scenes[0] || 'hotel';
    } catch {
      if (glb150SceneSel) {
        // Fallback: keep the UI functional even if the API is unreachable.
        glb150SceneSel.innerHTML = ['hotel', 'transport', 'shopping', 'dining', 'general']
          .map((s) => `<option value="${s}">${s}</option>`)
          .join('');
        glb150SceneSel.value = localStorage.getItem('glb150_scene_sel') || 'hotel';
      }
    }
    if (glb150SceneSel) {
      glb150SceneSel.addEventListener('change', () => {
        try { localStorage.setItem('glb150_scene_sel', glb150SceneSel.value); } catch { /* ignore */ }
      });
    }
  }

  async function loadGlb150Options(trigger, scene) {
    if (!glb150OptionChips || !glb150Status) return;
    glb150OptionChips.innerHTML = '';
    glb150Status.textContent = 'Loading…';
    try {
      const u = `/api/150/options?scene=${encodeURIComponent(scene || 'hotel')}&trigger=${encodeURIComponent(trigger || '')}`;
      const r = await beeFetch(u);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || r.status);
      const opts = Array.isArray(j.options) ? j.options : [];
      glb150OptionChips.innerHTML = opts.map((opt) => {
        const txt = String(opt ?? '');
        return `<button type="button" class="chip">${escapeHtml(txt)}</button>`;
      }).join('');
      glb150Status.textContent = opts.length ? `候補: ${opts.length}` : '候補なし。';
      // Bind click handlers after rendering.
      glb150OptionChips.querySelectorAll('button.chip').forEach((btn) => {
        btn.addEventListener('click', () => {
          const val = String(btn.textContent || '');
          input.value = val;
          input.focus();
        });
      });
    } catch (e) {
      glb150Status.textContent = `候補失敗 — ${e.message || e}`;
    }
  }

  loadGlb150Scenes();
  if (glb150OptionsBtn && glb150TriggerInput) {
    glb150OptionsBtn.addEventListener('click', async () => {
      const trig = String(glb150TriggerInput.value || '').trim();
      const scene = glb150SceneSel ? glb150SceneSel.value : 'hotel';
      if (!trig) {
        if (glb150Status) glb150Status.textContent = 'Triggerを入れて。';
        return;
      }
      await loadGlb150Options(trig, scene);
    });
  }

  async function translateOne(text, from, to) {
    applyUseBeeUnknownDefault();
    const t = stripEdgeBrackets(text.trim()) || text.trim();
    if (!t) return { text: '', source: 'empty' };

    const srcFrom = effectiveSourceLang(from, t);
    if (srcFrom === to) return { text: softenIfNegative(t, t, srcFrom, to), source: 'same', detail: 'from==to' };

    const hitB = lookupBundled(srcFrom, to, t);
    if (hitB != null) return { text: softenIfNegative(hitB, t, srcFrom, to), source: 'bundled', detail: 'bundled demo dictionary hit' };

    const uk = lexKey(srcFrom, to, t);
    const user = loadUserLex();
    if (Object.prototype.hasOwnProperty.call(user, uk)) {
      return { text: softenIfNegative(user[uk], t, srcFrom, to), source: 'user', detail: 'device user cache hit' };
    }

    // navigator.onLine はスマホ回線切替などで false になり得るため、
    // Gateway 呼び出し条件から除外する（失敗時は offline-fallback に落とす）。
    if (useBeeUnknown && useBeeUnknown.checked) {
      try {
        // Hard-stop when monthly cap is exhausted (device local).
        const q = getTranslateApiUsage();
        if (q.remaining <= 0) {
          return { text: softenIfNegative(t, t, srcFrom, to), source: 'cap-reached', detail: 'monthly cap reached (8/device/month)' };
        }
        const r = await beeFetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: t, from: srcFrom, to, device_id: getDeviceId() })
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || r.status);
        // ゲートウェイが辞書ミスを返したら原文を「訳」として保存しない。回数も消費しない。
        if (j.miss === true) {
          return { text: softenIfNegative(t, t, srcFrom, to), source: 'gateway-miss', detail: 'gateway miss' };
        }
        recordTranslateApiCall();
        const tr = j.translated != null ? String(j.translated) : t;
        user[uk] = tr;
        saveUserLex(user);
        return { text: softenIfNegative(tr, t, srcFrom, to), source: 'gateway', detail: 'POST /api/translate OK' };
      } catch {
        return { text: softenIfNegative(t, t, srcFrom, to), source: 'offline-fallback', detail: 'POST /api/translate failed (bee-origin or network)' };
      }
    }

    // BEE call gate didn't pass: either checkbox OFF or navigator offline.
    const gate = [];
    if (!(typeof navigator !== 'undefined' && navigator.onLine)) gate.push('navigator.offline');
    if (!useBeeUnknown || !useBeeUnknown.checked) gate.push('未登録語自動=OFF');
    return { text: softenIfNegative(t, t, srcFrom, to), source: 'passthrough', detail: gate.join(', ') || 'gate blocked' };
  }

  /** User-facing status line (no URLs / jargon). */
  function translateMetaLine(result) {
    const map = {
      empty: 'meta_empty',
      same: 'meta_same',
      bundled: 'meta_bundled',
      user: 'meta_user',
      'cap-reached': 'meta_cap_reached',
      gateway: 'meta_gateway',
      'gateway-miss': 'meta_gateway_miss',
      'offline-fallback': 'meta_offline_fallback',
      passthrough: 'meta_passthrough'
    };
    const k = map[result.source];
    return k ? txt(k) : txt('meta_unknown');
  }

  function metaWithTip(result) {
    const line = translateMetaLine(result);
    if (result.source === 'offline-fallback' || result.source === 'passthrough') {
      return `${line} ${txt('tipAfterFail')}`;
    }
    return line;
  }

  // If the input looks like "anger / hate", rephrase output gently.
  // This is deterministic (no external LLM), so it's safe for demos and offline use.
  function softenIfNegative(outText, rawInput, fromLang, toLang) {
    const src = String(rawInput || '');
    const neg =
      /(怒り|憎しみ|大嫌い|嫌い|ムカつく|腹立つ|イライラ|憎む|殺意|hate|hates|hated|hate\s+you|i\s+hate\s+you|angry|furious|furiously|despise)/i;
    if (!neg.test(src)) return String(outText);

    const gentlePrefix =
      toLang === 'ja' ? '気持ちはわかるよ。落ち着いて伝えるね。' :
      toLang === 'es' ? 'Entiendo cómo te sientes. Lo digo con calma.' :
      toLang === 'fr' ? 'Je comprends. Parlons calmement.' :
      toLang === 'de' ? 'Ich verstehe. Sprechen wir ruhig darüber.' :
      toLang === 'it' ? 'Capisco. Parliamone con calma.' :
      toLang === 'ko' ? '알겠어요. 차분하게 말해볼게요.' :
      toLang === 'zh' ? '我理解你的感受。我们冷静地说。' :
      'I hear you. I’ll say it calmly.';

    let s = String(outText);

    // Minimal word-level dampening (best-effort).
    if (toLang === 'ja') {
      s = s
        .replace(/怒り/g, 'つらさ')
        .replace(/憎しみ/g, 'モヤモヤ')
        .replace(/大嫌い/g, '苦手です')
        .replace(/嫌い/g, '合わないと思う')
        .replace(/ムカつく/g, '気になります')
        .replace(/腹立つ/g, 'つらい')
        .replace(/イライラ/g, 'モヤモヤ');
    } else if (toLang === 'en') {
      s = s
        .replace(/\bhate\b/gi, 'really dislike')
        .replace(/\bangry\b/gi, 'upset')
        .replace(/\bfurious\b/gi, 'really upset')
        .replace(/\bdespise\b/gi, 'really dislike');
    } else if (toLang === 'es') {
      s = s
        .replace(/\bodio\b/gi, 'me siento molesto/a')
        .replace(/\benojad[oa]\b/gi, 'molesto/a')
        .replace(/\bfurioso[oa]?\b/gi, 'muy molesto/a');
    }

    if (s.startsWith(gentlePrefix)) return s;
    return `${gentlePrefix}\n${s}`;
  }

  if (beePing) {
    beePing.addEventListener('click', async () => {
      saveBeeOrigin();
      setBeeStatus('接続確認中…', null);
      if (phraseChips) phraseChips.innerHTML = '';
      try {
        const r = await beeFetch('/health');
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        if (!j.ok) throw new Error('health not ok');
        setBeeStatus(`接続 OK（${getBeeOrigin()}）`, 'ok');
      } catch (e) {
        setBeeStatus(`接続できません — ${e.message || e}`, 'err');
      }
    });
  }

  if (beePhrases && phraseChips) {
    beePhrases.addEventListener('click', async () => {
      saveBeeOrigin();
      setBeeStatus('定型文を読み込み中…', null);
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
        setBeeStatus(`定型文 ${list.length} 件 — タップで貼り付け`, 'ok');
      } catch (e) {
        setBeeStatus(`定型文の取得に失敗 — ${e.message || e}`, 'err');
      }
    });
  }

  if (beeComplete) {
    beeComplete.addEventListener('click', async () => {
      saveBeeOrigin();
      setBeeStatus('/complete 確認中…', null);
      try {
        const r = await beeFetch('/complete?case_id=demo-001');
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        out.textContent = JSON.stringify(j, null, 2);
        setBeeStatus('/complete OK（上の結果を参照）', 'ok');
      } catch (e) {
        setBeeStatus(`/complete 失敗 — ${e.message || e}`, 'err');
      }
    });
  }

  btn.addEventListener('click', async () => {
    const text = input.value;
    const from = fromSel ? fromSel.value : 'en';
    const to = toSel ? toSel.value : 'ja';
    if (translateMeta) translateMeta.textContent = txt('translating');
    out.textContent = '';
    const r = await translateOne(text, from, to);
    out.textContent = r.text;
    if (translateMeta) translateMeta.textContent = metaWithTip(r);
    updateDictMeta();
    maybeTriggerStripeAuto(r);

    // GLB∞ is the main button: translate and immediately flip to "Other".
    // This is the "restaurant-friendly" UX: you read the translated lines on the other face.
    try {
      dlgState.lastTranslated = r.text;
      if (dlgEnabled && dlgPanel) {
        // Ensure the (collapsed) dialogue details is opened so the "flip" is visible.
        const details = dlgEnabled.closest('details.advanced');
        if (details) details.open = true;
        dlgEnabled.checked = true;
        dlgPanel.style.display = '';
        localStorage.setItem('glb_dlg_enabled', '1');
      }
      setDlgSide('other');
    } catch { /* ignore UI flip errors */ }
  });

  // Dialogue mode state machine.
  const dlgState = {
    side: 'user',
    lastTranslated: ''
  };

  function setDlgSide(side) {
    if (!dlgCard) return;
    dlgState.side = side;
    dlgCard.dataset.side = side;
    if (dlgMeta) dlgMeta.textContent = '';

    if (side === 'user') {
      if (dlgUserText) dlgUserText.textContent = input.value.trim() || '（未入力）';
    } else {
      const translated = dlgState.lastTranslated || out.textContent.trim();
      if (dlgOtherText) dlgOtherText.textContent = translated || '（先に GLB∞ で翻訳）';
      if (!translated && dlgMeta) dlgMeta.textContent = 'まず GLB∞ で翻訳してから、相手側を表示してください。';
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

  if (dlgSideUser) dlgSideUser.addEventListener('click', () => setDlgSide('user'));
  if (dlgSideOther) dlgSideOther.addEventListener('click', () => setDlgSide('other'));

  if (dlgEnabled && dlgPanel) {
    dlgEnabled.addEventListener('change', () => {
      const on = !!dlgEnabled.checked;
      dlgPanel.style.display = on ? '' : 'none';
      if (on) setDlgSide(dlgState.side);
      localStorage.setItem('glb_dlg_enabled', on ? '1' : '0');
    });
  }

  async function pick150Options() {
    if (!dlg150Pick || !dlg150Chips || !dlg150Meta) return;
    const trigger = String(input.value || '').trim();
    const scene = String(sceneSel.value || 'hotel');

    if (!trigger) {
      dlg150Meta.textContent = 'User側にトリガー語を入れてね。';
      return;
    }

    dlg150Pick.disabled = true;
    dlg150Chips.innerHTML = '';
    dlg150Meta.textContent = 'GLB150: 読み込み中…';

    try {
      const r = await beeFetch(`/api/150/options?scene=${encodeURIComponent(scene)}&trigger=${encodeURIComponent(trigger)}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || r.status);
      const opts = Array.isArray(j.options) ? j.options : [];
      if (opts.length === 0) {
        dlg150Meta.textContent = 'このトリガーに候補がありません。';
        return;
      }

      dlg150Meta.textContent = `候補 ${opts.length} 件 — タップで選択`;
      opts.forEach((opt) => {
        const line = String(opt);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip';
        b.textContent = line.length > 64 ? `${line.slice(0, 61)}…` : line;
        b.title = line;
        b.addEventListener('click', () => {
          out.textContent = line;
          dlgState.lastTranslated = line;
          setDlgSide('other');
          dlgMeta.textContent = '';

          if (dlgSpeak && dlgSpeak.checked && line) {
            if ('speechSynthesis' in window) {
              const u = new SpeechSynthesisUtterance(line);
              u.lang = toSel.value === 'ja' ? 'ja-JP' : toSel.value === 'es' ? 'es-ES' : 'en-US';
              window.speechSynthesis.cancel();
              window.speechSynthesis.speak(u);
            }
          }
        });
        dlg150Chips.appendChild(b);
      });
    } catch (e) {
      dlg150Meta.textContent = `GLB150 取得失敗 — ${e.message || e}`;
    } finally {
      dlg150Pick.disabled = false;
    }
  }

  if (dlg150Pick) dlg150Pick.addEventListener('click', pick150Options);

  if (sceneSel) {
    sceneSel.addEventListener('change', () => {
      const s = String(sceneSel.value || 'hotel');
      localStorage.setItem('glb_scene_sel', s);
      renderSceneChips(s);
      if (dlgMeta) dlgMeta.textContent = 'チップをタップすると入力欄に入ります。';
    });
  }

  if (dlgTranslateBtn) dlgTranslateBtn.addEventListener('click', async () => {
    const t = input.value.trim();
    if (!t) {
      if (dlgMeta) dlgMeta.textContent = '先に入力欄に文章を書いてください。';
      return;
    }

    if (dlgMeta) dlgMeta.textContent = txt('translating');
    const from = fromSel ? fromSel.value : 'en';
    const to = toSel ? toSel.value : 'ja';

    if (translateMeta) translateMeta.textContent = txt('translating');
    out.textContent = '';

    const r = await translateOne(t, from, to);
    out.textContent = r.text;

    if (translateMeta) translateMeta.textContent = metaWithTip(r);
    updateDictMeta();

    dlgState.lastTranslated = out.textContent.trim();
    setDlgSide('other');

    if (dlgSpeak && dlgSpeak.checked && dlgState.lastTranslated) {
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(dlgState.lastTranslated);
        u.lang = toSel ? toSel.value : 'ja';
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      }
    }
    if (dlgMeta) dlgMeta.textContent = '';
  });

  // Startup init
  initScenes();
  const savedDlg = localStorage.getItem('glb_dlg_enabled') === '1';
  if (dlgEnabled && dlgPanel) {
    dlgEnabled.checked = savedDlg;
    dlgPanel.style.display = savedDlg ? '' : 'none';
  }
  setDlgSide(dlgState.side);

  // TTS (browser built-in)
  if (speakBtn) {
    speakBtn.addEventListener('click', () => {
      const text = out.textContent.trim();
      if (!text) return;
      if (!('speechSynthesis' in window)) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = toSel ? toSel.value : 'ja';
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    });
  }

  syncTranslateApiMonth();
  if (getTranslateApiUsage().remaining <= 0) {
    startStripeAutoRedirect('load');
  }

  // PWA offline
  // Disable Service Worker entirely to avoid "black screen" caused by stale cached HTML/JS on mobile.
  if ('serviceWorker' in navigator) {
    try {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister().catch(() => {}))))
        .catch(() => {});
    } catch {
      // ignore
    }
  }
})();
