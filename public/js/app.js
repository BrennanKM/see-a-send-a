import { CONFIG } from "../config.js";
import { compressImage, squareAvatar } from "./images.js";

// ?demo on localhost forces fake data, for trying changes without touching the real chapter.
const forceDemo = location.hostname === "localhost" && new URLSearchParams(location.search).has("demo");
const backend = CONFIG.SUPABASE_URL && !forceDemo
  ? (await import("./backend-supabase.js")).createSupabaseBackend(CONFIG)
  : (await import("./backend-demo.js")).createDemoBackend();

const EMOJI = ["🎯", "🔥", "😂", "💀", "👀"];
const $app = document.getElementById("app");
const state = { me: null, isAdmin: false, members: new Map(), memberList: [], unsubNew: null, bounty: null, sl: null };

// ── Utilities ───────────────────────────────────────────────
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const member = (id) => state.members.get(id) ?? { id, display_name: "Former brother", avatar_url: null };
const first = (id) => member(id).display_name.split(" ")[0];
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function ago(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function avatar(id, cls = "") {
  const m = member(id);
  if (m.avatar_url) return `<span class="av ${cls}"><img src="${esc(m.avatar_url)}" alt=""></span>`;
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  h = Math.round((h % 1000) * 137.508) % 360;
  const initials = m.display_name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return `<span class="av ${cls}" style="background:hsl(${h} 45% 38%)">${esc(initials)}</span>`;
}

function joinNames(ids) {
  const links = ids.map((id) => `<a href="#/u/${id}">${esc(member(id).display_name)}</a>`);
  if (links.length <= 1) return links[0] ?? "a brother";
  return `${links.slice(0, -1).join(", ")} &amp; ${links.at(-1)}`;
}

function since(iso) {
  const m = Math.max(0, (Date.now() - new Date(iso)) / 60e3);
  if (m < 60) return `${Math.floor(m)}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h ${Math.floor(m % 60)}m`;
  return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
}

async function loadSuperlative() {
  try { state.sl = await backend.superlativeToday(); } catch { state.sl = null; }
  document.querySelector('.nav a[data-tab="daily"]')?.classList.toggle("dot", !!state.sl?.voting_open && !state.sl?.my_vote);
  return state.sl;
}

async function loadBounty() {
  try { state.bounty = await backend.getBounty(); } catch { state.bounty = null; }
  document.querySelector('.nav a[data-tab="bounty"]')?.classList.toggle("hot", state.bounty?.target_id === state.me);
  return state.bounty;
}

let toastTimer;
function toast(msg) {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = "toast"; el.textContent = msg;
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2600);
}

const icons = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  wanted: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 15.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
  ballot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 3.1a4 4 0 0 1 0 7.8M22 21a7 7 0 0 0-5-6.7"/></svg>',
};

// ── Boot & auth ─────────────────────────────────────────────
async function loadMembers() {
  state.memberList = await backend.listMembers();
  state.members = new Map(state.memberList.map((m) => [m.id, m]));
}

async function enterApp(uid) {
  state.me = uid;
  try { localStorage.removeItem(PENDING_KEY); } catch {}
  $app.innerHTML = '<div class="boot"><div class="spinner"></div></div>';
  try {
    await loadMembers();
    state.isAdmin = await backend.isAdmin();
    await loadBounty();
  } catch (e) {
    $app.innerHTML = `<div class="login"><p class="err">Couldn't load the chapter: ${esc(e.message)}</p><button class="btn" onclick="location.reload()">Try again</button></div>`;
    return;
  }
  if (!state.members.has(uid)) {
    $app.innerHTML = `<div class="login"><h1 class="hero">Not on the <span>roster</span>.</h1><p class="lede">Your account isn't on the chapter roster anymore. Ask an admin to add you back.</p><button class="btn" id="so">Sign out</button></div>`;
    document.getElementById("so").onclick = () => backend.signOut();
    return;
  }
  renderShell();
  navStack.length = 0; navStack.push(location.hash || "#/"); // fresh history for this sign-in
  route();
  maybeAskName();
  setTimeout(checkAchievements, 1800);
  checkBlackout();
  state.unsubNew?.();
  state.unsubNew = backend.onNewSnipe((row) => {
    if (row.sniper_id === state.me) return;
    setTimeout(checkBlackout, 4000); // tags are saved just after the snipe row, so wait for them
    if (location.hash === "" || location.hash === "#/") showNewBanner();
  });
}

// Catch "sandiego.edi" / "sandieog.edu" before a code goes to an address that doesn't exist.
const KNOWN_DOMAINS = ["sandiego.edu", "gmail.com", "icloud.com", "yahoo.com", "outlook.com", "hotmail.com", "me.com"];
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function suggestEmail(addr) {
  const [user, domain] = addr.split("@");
  if (!user || !domain || KNOWN_DOMAINS.includes(domain)) return null;
  const best = KNOWN_DOMAINS.map((k) => [k, editDistance(domain, k)]).sort((x, y) => x[1] - y[1])[0];
  return best[1] <= 2 ? `${user}@${best[0]}` : null;
}

const PENDING_KEY = "pending-signin";
function pendingSignin() {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING_KEY) || "null");
    return p && Date.now() - p.at < 15 * 60e3 ? p.email : null;
  } catch { return null; }
}

// New accounts get a name made from their email ("Brennankingmartin"). Ask once for a real one.
function maybeAskName() {
  const m = member(state.me), key = `named-${state.me}`;
  try { if (localStorage.getItem(key)) return; } catch {}
  const autoName = (m.email || "").split("@")[0].split(".")[0].toLowerCase();
  if (!autoName || m.display_name.trim().toLowerCase() !== autoName) return; // they've already picked a name
  const { el, close } = sheet("Welcome 👋", `
    <p style="margin:0 0 14px;color:var(--muted)">What should brothers call you? This is the name they'll see when they tag you.</p>
    <div class="field"><label for="nm">Full name</label><input class="input" id="nm" maxlength="40" autocomplete="name" autocapitalize="words" placeholder="First Last"></div>
    <p class="err" id="nme"></p>`, '<button class="btn primary block" id="nms">Save</button>');
  const input = el.querySelector("#nm");
  el.querySelector("#nms").onclick = async () => {
    const name = input.value.trim().replace(/\s+/g, " ");
    if (name.length < 2) { el.querySelector("#nme").textContent = "Enter your name."; return; }
    try {
      await backend.updateProfile({ display_name: name });
      try { localStorage.setItem(key, "1"); } catch {}
      await loadMembers(); refreshMeButton(); close(); route(); toast(`Welcome, ${name.split(" ")[0]} 🎯`);
    } catch (x) { el.querySelector("#nme").textContent = x.message; }
  };
}

function renderLogin() {
  state.me = null;
  // Always land on the feed after signing in, not whatever screen you signed out from.
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  const iosBrowser = isIOS() && !isStandalone() && !backend.demo;
  $app.innerHTML = `
    <form class="login" id="login">
      ${iosBrowser ? `<div class="notice tip"><div class="ico">📲</div><div class="body"><b>Add to your Home Screen first</b>
        Tap <b style="display:inline">Share</b> → <b style="display:inline">Add to Home Screen</b>, then open the app from your Home Screen and sign in there. Signing in here won't carry over to the app.</div></div>` : ""}
      <h1 class="hero">See a<br>Send <span>a.</span></h1>
      <p class="lede">${esc(CONFIG.CHAPTER)} brothers only. Enter your email and we'll send you a sign-in code.</p>
      <div id="email-step">
        <div class="field">
          <label for="email">Email</label>
          <input class="input" id="email" type="email" autocomplete="email" inputmode="email" placeholder="you@school.edu" required>
        </div>
        <div class="field">
          <label for="join">Chapter code <span style="text-transform:none;letter-spacing:0;font-weight:500">· first time only</span></label>
          <input class="input" id="join" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="On the QR card, or ask a brother">
        </div>
      </div>
      <div class="field" id="code-step" hidden>
        <label for="code">Code</label>
        <input class="input code-input" id="code" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" placeholder="${"•".repeat(CONFIG.OTP_LENGTH)}">
      </div>
      <button class="btn primary block" id="go">Send code</button>
      <p class="err" id="login-err"></p>
      <div id="fix-email" hidden style="margin:-4px 0 10px"></div>
      <button type="button" class="btn block" id="resend" hidden style="margin-top:4px">Resend code</button>
      <p class="fine" id="resend-hint" hidden style="color:var(--muted);font-size:13px;margin:10px 0 0">Not there? Check Junk, and in Outlook check <b>Other</b> too. Codes come from snipes@juniorjobhunt.com.</p>
      <button type="button" class="linkish" id="restart" hidden>Use a different email</button>
      ${backend.demo ? `<p class="lede" style="margin-top:18px">Demo mode: any email, any ${CONFIG.OTP_LENGTH} digits. Chapter code: DSP-DEMO.</p>` : ""}
    </form>`;
  const f = document.getElementById("login"), email = f.querySelector("#email"), code = f.querySelector("#code");
  const go = f.querySelector("#go"), err = f.querySelector("#login-err");
  let sent = false;
  const resend = f.querySelector("#resend"), resendHint = f.querySelector("#resend-hint");
  let cooldown;
  const startCooldown = (secs = 45) => {
    clearInterval(cooldown);
    resend.hidden = false; resend.disabled = true;
    let left = secs;
    const tick = () => {
      if (!document.body.contains(resend)) return clearInterval(cooldown);
      resend.textContent = left > 0 ? `Resend code (${left}s)` : "Resend code";
      resend.disabled = left > 0;
      if (left-- <= 0) { clearInterval(cooldown); resendHint.hidden = false; }
    };
    tick(); cooldown = setInterval(tick, 1000);
  };
  resend.onclick = async () => {
    err.textContent = "";
    try {
      await backend.sendCode(email.value.trim().toLowerCase());
      try { localStorage.setItem(PENDING_KEY, JSON.stringify({ email: email.value.trim().toLowerCase(), at: Date.now() })); } catch {}
      toast("New code sent"); startCooldown(60);
    } catch (x) { err.textContent = x.message; }
  };
  const showCodeStep = (addr) => {
    sent = true;
    startCooldown();
    email.value = addr;
    f.querySelector("#email-step").hidden = true;
    f.querySelector("#code-step").hidden = false;
    f.querySelector("#restart").hidden = false;
    f.querySelector(".lede").textContent = `Sent to ${addr}. Enter the code from the email. Check spam if it's not there in a minute.`;
    go.textContent = "Sign in";
  };
  // iOS often reloads a Home Screen app while you're in Mail getting the code. Pick up where you left off.
  const pending = pendingSignin();
  if (pending) showCodeStep(pending);
  f.onsubmit = async (e) => {
    e.preventDefault();
    err.textContent = ""; go.disabled = true;
    try {
      if (!sent) {
        const addr = email.value.trim().toLowerCase();
        const fix = suggestEmail(addr), fixBox = f.querySelector("#fix-email");
        if (fix && fixBox.dataset.ignored !== addr) {
          fixBox.hidden = false;
          fixBox.innerHTML = `<p style="margin:0 0 8px">Did you mean <b>${esc(fix)}</b>?</p>
            <div style="display:flex;gap:8px"><button type="button" class="btn small primary" id="fix-yes">Yes, fix it</button><button type="button" class="btn small" id="fix-no">No, it's right</button></div>`;
          fixBox.querySelector("#fix-yes").onclick = () => { email.value = fix; fixBox.hidden = true; f.requestSubmit(); };
          fixBox.querySelector("#fix-no").onclick = () => { fixBox.dataset.ignored = addr; fixBox.hidden = true; f.requestSubmit(); };
          return;
        }
        const join = f.querySelector("#join").value.trim();
        // A wrong code shouldn't lock out someone who's already on the roster, so only report it if sign-in fails too.
        let joinErr = null;
        if (join) await backend.joinWithCode(addr, join).catch((x) => { joinErr = x; });
        try { await backend.sendCode(addr); }
        catch (x) { throw joinErr && /roster/i.test(x.message) ? joinErr : x; }
        try { localStorage.setItem(PENDING_KEY, JSON.stringify({ email: addr, at: Date.now() })); } catch {}
        showCodeStep(addr);
        code.focus();
      } else {
        await backend.verifyCode(email.value.trim().toLowerCase(), code.value.replace(/\D/g, ""));
        try { localStorage.removeItem(PENDING_KEY); } catch {}
      }
    } catch (ex) {
      err.textContent = ex.message;
    } finally { go.disabled = false; }
  };
  code.oninput = () => {
    code.value = code.value.replace(/\D/g, "").slice(0, CONFIG.OTP_LENGTH);
    if (code.value.length === CONFIG.OTP_LENGTH) f.requestSubmit();
  };
  f.querySelector("#restart").onclick = () => { try { localStorage.removeItem(PENDING_KEY); } catch {} renderLogin(); };
}

function renderShell() {
  $app.innerHTML = `
    <header class="topbar">
      <a class="wordmark" href="#/"><span class="dot"></span>See a Send a <small>${esc(CONFIG.CHAPTER)}</small></a>
      <div style="display:flex;gap:8px;align-items:center">
        ${backend.demo ? '<span class="pill">Demo</span>' : ""}
        <a class="icon-btn" href="#/settings" aria-label="Settings">${icons.gear}</a>
        <a class="me-btn" href="#/u/${state.me}" aria-label="My profile">${avatar(state.me, "sm")}</a>
      </div>
    </header>
    <div class="ticker" id="ticker" hidden><div class="ticker-track" id="ticker-track"></div></div>
    <div id="scroller"><div class="ptr" id="ptr"></div><main id="view"></main></div>
    <nav class="nav">
      <a href="#/" data-tab="feed">${icons.home}Feed</a>
      <a href="#/leaders" data-tab="leaders">${icons.trophy}Leaders</a>
      <button class="shutter" id="shutter" aria-label="Snipe someone">${icons.camera}</button>
      <a href="#/bounty" data-tab="bounty">${icons.wanted}Bounty</a>
      <a href="#/daily" data-tab="daily">${icons.ballot}Daily</a>
    </nav>`;
  document.getElementById("shutter").onclick = openCamera;
  setupScopeEgg(document.querySelector(".wordmark .dot"));
  // Tapping the tab you're already on scrolls to the top, or refreshes if you're already there.
  document.querySelector(".nav").addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a || a.getAttribute("href") !== (location.hash || "#/")) return;
    e.preventDefault();
    const sc = scroller();
    if (sc.scrollTop > 4) sc.scrollTo({ top: 0, behavior: "smooth" }); else route();
  });
  setupPullToRefresh(scroller(), document.getElementById("ptr"));
  loadBounty();
  loadSuperlative();
  loadTicker();
  setupTickerPause();
}

// ── Ticker ─────────────────────────────────────────────────
// A news-style crawl of live chapter stats under the header. Stats come from the
// `ticker` database function; refreshed every few minutes and after posting/voting.
let tickerTimer = null, tickerFade = null;
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

async function loadTicker() {
  const box = document.getElementById("ticker"), track = document.getElementById("ticker-track");
  if (!box) return;
  clearTimeout(tickerTimer);
  tickerTimer = setTimeout(loadTicker, 5 * 60e3);
  let items, senior = [];
  try {
    // Either half can fail on its own; show whatever loaded.
    [items, senior] = await Promise.all([backend.ticker().catch(() => []), backend.seniorLive?.().catch(() => []) ?? []]);
  } catch { return; }
  items = items || [];
  if (!items.length && !senior.length) { box.hidden = true; return; }
  // Keep the "today" count first; shuffle the rest so it feels fresh each refresh.
  const [lead, ...rest] = items.length ? items : [senior.map(seniorTick).shift()];
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  // Spread senior messages evenly through the stats so they keep coming around.
  const sen = (items.length ? senior : senior.slice(1)).map(seniorTick);
  const list = [lead];
  const gap = Math.max(1, Math.round(rest.length / (sen.length + 1)));
  rest.forEach((t, i) => { list.push(t); if ((i + 1) % gap === 0 && sen.length) list.push(sen.shift()); });
  list.push(...sen);
  const html = list.map(tickHTML).join('<span class="tick-sep">•</span>');
  box.hidden = false;
  clearInterval(tickerFade);
  if (reduceMotion()) {
    // No scrolling: show one item at a time.
    let i = 0;
    const show = () => { track.innerHTML = tickHTML(list[i++ % list.length]); };
    track.classList.add("static"); show(); tickerFade = setInterval(show, 4500);
    return;
  }
  track.classList.remove("static");
  // Two copies back to back make the loop seamless; speed stays ~45px/s however long the content is.
  track.innerHTML = `<div class="ticker-run">${html}<span class="tick-sep">•</span></div><div class="ticker-run" aria-hidden="true">${html}<span class="tick-sep">•</span></div>`;
  requestAnimationFrame(() => {
    const w = track.firstElementChild?.getBoundingClientRect().width || 600;
    track.style.setProperty("--ticker-dur", `${Math.max(20, w / 45)}s`);
  });
}

// Senior messages: anonymous, in gold, under a rotating "official" label.
const SENIOR_LABELS = ["Public service announcement", "Message from your elders", "Word from the top",
  "The elders have spoken", "Senior advisory", "Hear ye, hear ye"];
function seniorTick(p) {
  let h = 0; for (const c of String(p.id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { senior: true, label: SENIOR_LABELS[h % SENIOR_LABELS.length], text: p.body };
}
function tickHTML(t) {
  if (t.senior) return `<span class="tick senior"><span class="tick-icon">📢</span><b>${esc(t.label)}:</b> ${esc(t.text)}</span>`;
  return `<a class="tick" href="${esc(t.href || "#/")}"><span class="tick-icon">${esc(t.icon)}</span>${esc(t.text)}</a>`;
}

function setupTickerPause() {
  const box = document.getElementById("ticker");
  if (!box) return;
  const pause = () => box.classList.add("paused"), play = () => box.classList.remove("paused");
  box.addEventListener("pointerdown", pause);
  box.addEventListener("pointerup", play);
  box.addEventListener("pointercancel", play);
  box.addEventListener("pointerleave", play);
}

const scroller = () => document.getElementById("scroller");
function refreshMeButton() { const b = document.querySelector(".me-btn"); if (b) b.innerHTML = avatar(state.me, "sm"); }

// Easter egg: tap the gold dot by the logo 7 times quickly to look through a sniper scope
// trained on the newest snipe's photo. Drag to aim, tap to close. If there's no photo to show
// (empty feed, offline, photo won't load) it falls back to zooming the current screen.
function setupScopeEgg(dot) {
  let taps = 0, timer;
  dot.addEventListener("click", (e) => {
    e.preventDefault(); e.stopPropagation();
    dot.classList.remove("blip"); void dot.offsetWidth; dot.classList.add("blip");
    dot.classList.toggle("warm", ++taps >= 4);
    clearTimeout(timer);
    timer = setTimeout(() => { taps = 0; dot.classList.remove("warm"); }, 1200);
    if (taps >= 7) { taps = 0; dot.classList.remove("warm"); openScope(); }
  });
}

let scopeLoading = false;
async function openScope() {
  if (scopeLoading || document.querySelector(".scope")) return;
  scopeLoading = true;
  try {
    // Same members-only query as the feed (RLS + short-lived signed photo URL), just limit 1.
    const latest = await backend.feed({ limit: 1 }).then((r) => r[0] ?? null).catch(() => null);
    let layer = null;
    if (latest?.photo_url) {
      layer = document.createElement("div");
      layer.className = "scope-target";
      const img = new Image();
      img.alt = "";
      img.src = latest.photo_url;
      layer.append(img);
      // Wait for the photo so the crosshair never lands on a blank screen; give up after 4s.
      const loaded = await Promise.race([
        img.decode().then(() => true, () => false),
        new Promise((r) => setTimeout(() => r(false), 4000)),
      ]);
      if (!loaded) layer = null;
    }
    showScope(layer ? latest : null, layer);
  } finally {
    scopeLoading = false;
  }
}

function showScope(snipe, layer) {
  if (document.querySelector(".scope")) return;
  const zoomEl = layer || $app; // magnify the newest snipe, or the screen as a fallback
  const range = 120 + Math.floor(Math.random() * 380), wind = (Math.random() * 6).toFixed(1);
  const names = snipe ? snipe.target_ids.map((id) => member(id).display_name) : [];
  const tag = snipe ? `<div class="scope-tag">TARGET: ${esc(names.length ? names.join(" + ") : "Unknown")} · ${esc(ago(snipe.created_at))}</div>` : "";
  const o = document.createElement("div");
  o.className = "scope";
  o.setAttribute("role", "dialog");
  o.setAttribute("aria-label", "Sniper scope. Tap to close.");
  o.innerHTML = `<div class="scope-lens"><div class="scope-cross"></div><div class="scope-dot"></div></div>
    ${tag}<div class="scope-hud"><span>RNG ${range} YD</span><span>WIND ${wind} MPH</span><span>${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></div>
    <div class="scope-hint">Drag to aim · tap to close</div>`;
  if (layer) document.body.append(layer);
  document.body.append(o);
  let x = innerWidth / 2, y = innerHeight * (layer ? 0.45 : 0.42);
  const place = () => {
    o.style.setProperty("--x", x + "px"); o.style.setProperty("--y", y + "px");
    zoomEl.style.transformOrigin = `${x}px ${y}px`; // magnify whatever is under the crosshair
  };
  place();
  zoomEl.classList.add("scoped");
  requestAnimationFrame(() => requestAnimationFrame(() => zoomEl.classList.add("zoomed")));
  navigator.vibrate?.(25);
  let start = null, moved = false;
  o.addEventListener("pointerdown", (e) => { start = [e.clientX, e.clientY, x, y]; moved = false; o.setPointerCapture(e.pointerId); });
  o.addEventListener("pointermove", (e) => {
    if (!start) return;
    const dx = e.clientX - start[0], dy = e.clientY - start[1];
    if (Math.hypot(dx, dy) > 6) moved = true;
    x = Math.max(0, Math.min(innerWidth, start[2] + dx));
    y = Math.max(0, Math.min(innerHeight, start[3] + dy));
    place();
  });
  o.addEventListener("pointerup", () => { if (!moved) close(); start = null; });
  const onKey = (e) => { if (e.key === "Escape") close(); };
  addEventListener("keydown", onKey);
  function close() {
    removeEventListener("keydown", onKey);
    zoomEl.classList.remove("zoomed");
    o.classList.add("closing");
    layer?.classList.add("closing");
    setTimeout(() => { o.remove(); layer?.remove(); $app.classList.remove("scoped"); $app.style.transformOrigin = ""; }, 450);
  }
}

// Easter egg: the further you pull, the more the app pushes back.
const OVERPULL = [
  [330, "I'm telling Nationals."],
  [270, "Brother. Let go."],
  [210, "You're stretching it, brother."],
  [150, "Okay, that's far enough."],
];
function pullMessage(pull, threshold) {
  for (const [at, msg] of OVERPULL) if (pull > at) return msg;
  return pull > threshold ? "Release to refresh" : "Pull to refresh";
}

function setupPullToRefresh(sc, ptr) {
  const THRESHOLD = 70;
  let startY = null, pull = 0;
  const reset = () => { ptr.style.transition = "height .2s"; ptr.style.height = "0px"; ptr.classList.remove("ready"); startY = null; pull = 0; };
  sc.addEventListener("touchstart", (e) => {
    if (sc.scrollTop > 0 || document.querySelector(".overlay, .compose")) return;
    startY = e.touches[0].clientY; ptr.style.transition = "none";
  }, { passive: true });
  sc.addEventListener("touchmove", (e) => {
    if (startY === null) return;
    pull = Math.max(0, (e.touches[0].clientY - startY) * 0.5);
    if (pull > 0 && sc.scrollTop <= 0) {
      // Rubber-bands past 90px so over-pulling feels stretchy.
      ptr.style.height = (pull < 90 ? pull : Math.min(150, 90 + (pull - 90) * 0.35)) + "px";
      ptr.classList.toggle("ready", pull > THRESHOLD);
      ptr.innerHTML = `<span><span class="arrow">↓</span> ${pullMessage(pull, THRESHOLD)}</span>`;
    }
  }, { passive: true });
  sc.addEventListener("touchend", async () => {
    if (startY === null) return;
    if (pull > THRESHOLD) {
      ptr.style.transition = "height .2s"; ptr.style.height = "48px"; ptr.innerHTML = '<div class="spinner"></div>';
      await Promise.all([refreshAll(), new Promise((r) => setTimeout(r, 400))]);
    }
    reset();
  });
}

// Re-sign photo/avatar links and redraw the current screen.
async function refreshAll() {
  try { await loadMembers(); } catch {}
  await Promise.all([loadBounty(), loadSuperlative()]);
  await route();
  checkAchievements();
  loadTicker();
}

function setTab(tab) {
  document.querySelectorAll(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.tab === tab));
}

// ── Navigation history ─────────────────────────────────────
// Home Screen apps on iPhone have no browser back button or swipe-back, so the app keeps
// its own stack. Going back returns to the exact screen *and* scroll position you left.
const navStack = [location.hash || "#/"];
const scrollMemory = new Map(); // hash -> { top, cards }
let replacingNav = false;

function onHashChange() {
  const h = location.hash || "#/";
  const sc = scroller();
  if (sc) scrollMemory.set(navStack.at(-1), { top: sc.scrollTop, cards: document.querySelectorAll("#feed .card").length });
  let restore = null;
  if (replacingNav) { navStack[navStack.length - 1] = h; replacingNav = false; }
  else if (navStack.length > 1 && navStack.at(-2) === h) { navStack.pop(); restore = scrollMemory.get(h) ?? null; } // back (in-app or hardware)
  else { navStack.push(h); if (navStack.length > 60) navStack.splice(0, navStack.length - 60); }
  route(restore);
}
addEventListener("hashchange", onHashChange);

function goBack(fallback = "#/") {
  if (navStack.length > 1) return history.back();
  // Opened straight onto this screen (e.g. from a notification): go to its parent instead.
  replacingNav = true;
  location.replace(location.pathname + location.search + fallback);
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-back]");
  if (!b) return;
  e.preventDefault();
  goBack(b.dataset.back);
});
if (backend.demo) window.__navStack = navStack; // test hook, demo mode only
const backBtn = (fallback) => `<button type="button" class="back" data-back="${fallback}">‹ Back</button>`;

// ── Router ─────────────────────────────────────────────────
let routeToken = 0;
async function route(restore = null) {
  if (!state.me) return;
  const view = document.getElementById("view");
  if (!view) return;
  const token = ++routeToken;
  const [, name, arg] = (location.hash.slice(1) || "/").split("/");
  document.querySelector(".new-banner")?.remove();
  if (scroller()) scroller().scrollTop = 0;
  const alive = () => token === routeToken;
  await renderRoute(view, name, arg, alive, restore);
  if (restore && alive() && scroller()) scroller().scrollTop = restore.top;
}

function renderRoute(view, name, arg, alive, restore) {
  if (!name) { setTab("feed"); return renderFeed(view, alive, restore?.cards ?? 0); }
  if (name === "leaders") { setTab("leaders"); return renderLeaders(view, alive); }
  if (name === "bounty") { setTab("bounty"); return renderBounty(view, alive); }
  if (name === "brothers") { setTab(""); return renderBrothers(view); }
  if (name === "daily") { setTab("daily"); return renderDaily(view, alive); }
  if (name === "u") { setTab(""); return renderProfile(view, arg, alive); }
  if (name === "snipe") { setTab(""); return renderSnipePage(view, arg, alive); }
  if (name === "settings") { setTab(""); return renderSettings(view); }
  if (name === "blackbox") { setTab(""); return renderBlackBox(view, alive); }
  if (name === "roster" && state.isAdmin) { setTab(""); return renderRoster(view, alive); }
  replacingNav = true;
  location.replace(location.pathname + location.search + "#/");
}

// ── Feed ───────────────────────────────────────────────────
function cardHTML(s) {
  const mine = s.sniper_id === state.me;
  const reacts = EMOJI.map((e) => {
    const who = s.reactions[e] ?? [];
    const on = who.includes(state.me);
    return `<button class="chip ${on ? "on" : who.length ? "" : "ghost"}" data-act="react" data-emoji="${e}">${e}${who.length ? `<span class="n">${who.length}</span>` : ""}</button>`;
  }).join("");
  return `
    <article class="card ${s.golden ? "golden" : ""}" data-id="${s.id}">
      <header class="card-head">
        <a href="#/u/${s.sniper_id}">${avatar(s.sniper_id)}</a>
        <div class="who">
          <div class="line"><a href="#/u/${s.sniper_id}">${esc(member(s.sniper_id).display_name)}</a> <span class="verb">sniped</span> ${joinNames(s.target_ids)}</div>
          <div class="meta">${ago(s.created_at)}${s.location ? ` · ${esc(s.location)}` : ""}</div>
        </div>
        ${mine || state.isAdmin ? '<button class="more" data-act="menu" aria-label="More">⋯</button>' : ""}
      </header>
      <div class="photo" data-act="photo">
        ${s.bounty ? `<span class="stamp bounty-stamp">🏆 Bounty claimed · +${s.bounty.points}</span>` : ""}
        ${s.golden ? `<span class="stamp golden-stamp">✨ Golden Snipe · +5</span>` : ""}
        <img src="${esc(s.photo_url)}" alt="Snipe of ${esc(s.target_ids.map((id) => member(id).display_name).join(", "))}" loading="lazy" decoding="async">
      </div>
      <div class="react-row">${reacts}<button class="chip comments" data-act="comments">💬 <span class="n">${s.comment_count || ""}</span></button></div>
      ${s.caption ? `<p class="caption"><b>${esc(first(s.sniper_id))}</b>${esc(s.caption)}</p>` : ""}
    </article>`;
}

// Delegated handlers shared by every view that shows cards.
function wireCards(root, snipes, onDeleted) {
  const find = (el) => snipes.get(el.closest(".card")?.dataset.id);
  let lastTap = 0;
  root.addEventListener("click", async (ev) => {
    const t = ev.target.closest("[data-act]");
    if (!t) return;
    const s = find(t);
    if (!s) return;
    const act = t.dataset.act;
    if (act === "react") return toggleReact(t.closest(".card"), s, t.dataset.emoji);
    if (act === "comments") return openComments(s, t.closest(".card"));
    if (act === "menu") return openCardMenu(s, t.closest(".card"), onDeleted);
    if (act === "photo") {
      const now = Date.now();
      if (now - lastTap < 320) {
        lastTap = 0;
        // React first: that redraws the card, so the burst has to go on the *new* card or it vanishes instantly.
        if (!(s.reactions["🎯"] ?? []).includes(state.me)) toggleReact(t.closest(".card"), s, "🎯");
        const card = root.querySelector(`.card[data-id="${s.id}"]`), photo = card?.querySelector(".photo");
        if (!photo) return;
        const crit = Math.random() < 0.02; // easter egg: 1 in 50 double-taps is a critical hit
        const b = document.createElement("div");
        b.className = crit ? "burst crit" : "burst";
        b.innerHTML = crit ? '<span class="crit-text">CRITICAL<br>HIT</span>💥' : "🎯";
        photo.append(b); setTimeout(() => b.remove(), crit ? 1400 : 800);
        if (crit) { card.classList.add("crit-shake"); setTimeout(() => card.classList.remove("crit-shake"), 500); navigator.vibrate?.([15, 30, 40]); }
      } else lastTap = now;
    }
  });
}

async function toggleReact(card, s, emoji) {
  const list = (s.reactions[emoji] ??= []);
  const on = !list.includes(state.me);
  s.reactions[emoji] = on ? [...list, state.me] : list.filter((u) => u !== state.me);
  card.outerHTML = cardHTML(s);
  try { await backend.setReaction(s.id, emoji, on); }
  catch {
    s.reactions[emoji] = list;
    document.querySelector(`.card[data-id="${s.id}"]`)?.replaceWith(htmlToEl(cardHTML(s)));
    toast("Couldn't save that reaction");
  }
}

function htmlToEl(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }

function installNotice() {
  if (!isIOS() || isStandalone() || localStorage.getItem("hide-install")) return "";
  return `<div class="notice" id="install-notice"><div class="ico">📲</div><div class="body"><b>Add this to your Home Screen</b>
    Tap <b style="display:inline">Share</b> then <b style="display:inline">Add to Home Screen</b>. It opens like a real app and can send you snipe alerts.
    <div class="actions"><button class="btn small" data-dismiss="hide-install">Got it</button></div></div></div>`;
}

function pushNotice() {
  if (!pushSupported() || Notification.permission !== "default" || localStorage.getItem("hide-push")) return "";
  return `<div class="notice" id="push-notice"><div class="ico">🔔</div><div class="body"><b>Get snipe alerts</b>
    Find out the second someone posts, and especially when it's you.
    <div class="actions"><button class="btn small primary" id="push-yes">Turn on</button><button class="btn small" data-dismiss="hide-push">Not now</button></div></div></div>`;
}

function bountyNotice() {
  if (state.bounty?.target_id !== state.me) return "";
  return `<a class="notice wanted-notice" href="#/bounty"><div class="ico">👀</div><div class="body"><b>There's a bounty on you</b>
    Worth ${state.bounty.points} pts to whoever snipes you first. Watch your back. ›</div></a>`;
}

// Sunday 6 PM Pacific through Monday: point people at the reveal until they've looked.
function pacificNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "short", hour: "numeric", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { weekday: parts.weekday, hour: Number(parts.hour), date: `${parts.year}-${parts.month}-${parts.day}` };
}
function revealKey() {
  const p = pacificNow();
  if (p.weekday === "Sun" && p.hour >= 18) return `seen-reveal-${p.date}`;
  if (p.weekday === "Mon") { const d = new Date(p.date + "T12:00:00"); d.setDate(d.getDate() - 1); return `seen-reveal-${d.toISOString().slice(0, 10)}`; }
  return null;
}
function revealNotice() {
  const key = revealKey();
  try { if (!key || localStorage.getItem(key)) return ""; } catch { return ""; }
  return `<a class="notice reveal-notice" href="#/daily"><div class="ico">🏆</div><div class="body"><b>This week's superlatives are in</b>See who the chapter voted for. ›</div></a>`;
}

async function renderFeed(view, alive, initialCount = 0) {
  view.innerHTML = `${revealNotice()}${bountyNotice()}${installNotice() || pushNotice()}<div class="feed" id="feed"></div><div class="sentinel"></div><div class="loading-more"><div class="spinner"></div></div>`;
  view.querySelectorAll("[data-dismiss]").forEach((b) => b.onclick = () => { localStorage.setItem(b.dataset.dismiss, "1"); b.closest(".notice").remove(); });
  const py = view.querySelector("#push-yes");
  if (py) py.onclick = async () => { if (await enablePush()) view.querySelector("#push-notice")?.remove(); };

  const feed = view.querySelector("#feed"), loader = view.querySelector(".loading-more");
  const snipes = new Map();
  let oldest = null, done = false, busy = false;
  wireCards(feed, snipes, () => { if (!feed.children.length) showEmpty(); });
  const showEmpty = () => { feed.innerHTML = `<div class="empty"><div class="big">🎯</div>No snipes yet.<br>See a brother? Send a pic.</div>`; };

  let pageSize = Math.min(60, Math.max(10, initialCount));
  async function more() {
    if (busy || done) return;
    busy = true;
    try {
      const size = pageSize; pageSize = 10;
      const page = await backend.feed({ before: oldest, limit: size });
      if (!alive()) return;
      page.forEach((s) => snipes.set(s.id, s));
      feed.insertAdjacentHTML("beforeend", page.map(cardHTML).join(""));
      if (page.length) oldest = page.at(-1).created_at;
      if (page.length < size) { done = true; loader.remove(); if (!snipes.size) showEmpty(); }
    } catch (e) {
      loader.innerHTML = `<p class="err">${esc(e.message)}</p>`;
      done = true;
    } finally { busy = false; }
  }
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) more(); }, { root: scroller(), rootMargin: "800px" });
  io.observe(view.querySelector(".sentinel"));
  await more();
}

function showNewBanner() {
  if (document.querySelector(".new-banner")) return;
  const b = document.createElement("button");
  b.className = "new-banner"; b.textContent = "🎯 New snipe · tap to see";
  b.onclick = () => { b.remove(); route(); };
  document.body.append(b);
}

// ── Single snipe ───────────────────────────────────────────
async function renderSnipePage(view, id, alive) {
  view.innerHTML = '<div class="loading-more"><div class="spinner"></div></div>';
  const s = await backend.getSnipe(id).catch(() => null);
  if (!alive()) return;
  if (!s) { view.innerHTML = `<div class="page">${backBtn("#/")}</div><div class="empty"><div class="big">🫥</div>That snipe is gone.</div>`; return; }
  view.innerHTML = `<div class="page" style="padding-bottom:6px">${backBtn("#/")}</div><div class="feed" id="single"></div>`;
  const box = view.querySelector("#single");
  box.innerHTML = cardHTML(s);
  // Wire the fresh container, not #view: #view outlives this screen, so listeners on it would stack up.
  wireCards(box, new Map([[s.id, s]]), () => goBack("#/"));
}

// ── Card menu & comments ───────────────────────────────────
function sheet(title, bodyHTML, footHTML = "") {
  const o = document.createElement("div");
  o.className = "overlay";
  o.innerHTML = `<div class="sheet" role="dialog" aria-label="${esc(title)}"><div class="sheet-head">${esc(title)}<button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="sheet-body">${bodyHTML}</div>${footHTML ? `<div class="sheet-foot">${footHTML}</div>` : ""}</div>`;
  const close = () => { o.remove(); removeEventListener("hashchange", close); };
  o.addEventListener("click", (e) => { if (e.target === o || e.target.closest("[data-close]")) close(); });
  addEventListener("hashchange", close);
  document.body.append(o);
  return { el: o, close };
}

function openCardMenu(s, card, onDeleted) {
  const { el, close } = sheet("Snipe", `<div class="menu-list"><button class="btn danger block" id="del">Delete snipe</button></div>`);
  el.querySelector(".sheet-body").style.padding = "8px";
  el.querySelector("#del").onclick = async () => {
    if (!confirm("Delete this snipe for everyone?")) return;
    try {
      await backend.deleteSnipe(s);
      card.remove(); close(); toast("Snipe deleted"); onDeleted?.();
    } catch (e) { toast(e.message); }
  };
}

async function openComments(s, card) {
  const { el } = sheet("Comments", '<div class="loading-more"><div class="spinner"></div></div>',
    `<form id="cf" style="display:flex;gap:8px;width:100%"><input class="input" id="ci" placeholder="Talk your talk…" maxlength="500" autocomplete="off"><button class="btn primary">Send</button></form>`);
  const body = el.querySelector(".sheet-body");
  async function load() {
    const list = await backend.listComments(s.id);
    s.comment_count = list.length;
    const n = card?.querySelector(".comments .n"); if (n) n.textContent = list.length || "";
    body.innerHTML = list.length ? list.map((c) => `
      <div class="comment" data-cid="${c.id}">
        <a href="#/u/${c.user_id}">${avatar(c.user_id, "sm")}</a>
        <div class="c-body"><b>${esc(member(c.user_id).display_name)}</b>${esc(c.body)}
          <div class="c-meta">${ago(c.created_at)}${c.user_id === state.me || state.isAdmin ? '<button data-del>Delete</button>' : ""}</div></div>
      </div>`).join("") : '<div class="empty" style="padding:30px">No comments. Say something.</div>';
    body.scrollTop = body.scrollHeight;
  }
  body.addEventListener("click", async (e) => {
    const d = e.target.closest("[data-del]"); if (!d) return;
    await backend.deleteComment(d.closest(".comment").dataset.cid).catch((x) => toast(x.message));
    load();
  });
  const form = el.querySelector("#cf"), input = el.querySelector("#ci");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = input.value.trim(); if (!text) return;
    input.value = "";
    try { await backend.addComment(s.id, text); await load(); }
    catch (x) { input.value = text; toast(x.message); }
  };
  await load().catch((x) => { body.innerHTML = `<p class="err">${esc(x.message)}</p>`; });
}

// ── Compose (camera → tag → post) ──────────────────────────
const cameraInput = document.getElementById("camera-input");
let preselect = null;
function openCamera(targetId = null) { preselect = typeof targetId === "string" ? targetId : null; cameraInput.value = ""; cameraInput.click(); }
cameraInput.addEventListener("change", async () => {
  const file = cameraInput.files[0]; if (!file) return;
  try { openCompose(await compressImage(file), preselect); }
  catch { toast("Couldn't read that photo"); }
});

function openCompose(blob, preselectId = null) {
  document.querySelector(".compose")?.remove();
  const url = URL.createObjectURL(blob);
  const picked = new Set(preselectId && preselectId !== state.me ? [preselectId] : []);
  const bountyId = state.bounty?.target_id;
  const el = document.createElement("div");
  el.className = "compose";
  el.innerHTML = `
    <div class="compose-head"><button class="btn small" id="cancel">Cancel</button><b>New snipe</b><span style="width:70px"></span></div>
    <div class="compose-body">
      <div class="compose-photo"><img src="${url}" alt="Your snipe"><button class="btn small retake" id="retake">Change</button></div>
      <div class="field"><label>Who'd you catch?</label>
        <input class="input" id="who" placeholder="Search brothers" autocomplete="off">
        <div class="picker" id="picker"></div></div>
      <div class="field"><label for="cap">Caption</label><input class="input" id="cap" maxlength="280" placeholder="Caught lacking…"></div>
      <div class="field"><label for="loc">Where</label><input class="input" id="loc" maxlength="60" placeholder="Library steps (optional)"></div>
    </div>
    <div class="compose-foot"><button class="btn primary block" id="post" disabled>Tag who you sniped</button><p class="err" id="post-err"></p></div>`;
  document.body.append(el);
  const picker = el.querySelector("#picker"), who = el.querySelector("#who"), post = el.querySelector("#post");
  const others = state.memberList.filter((m) => m.id !== state.me);
  function drawPicker() {
    const q = who.value.trim().toLowerCase();
    const list = others.filter((m) => picked.has(m.id) || !q || m.display_name.toLowerCase().includes(q));
    list.sort((a, b) => picked.has(b.id) - picked.has(a.id) || (b.id === bountyId) - (a.id === bountyId));
    picker.innerHTML = list.map((m) => `<button type="button" class="pick ${picked.has(m.id) ? "on" : ""}" data-id="${m.id}">${avatar(m.id)}${esc(m.display_name)}${m.id === bountyId ? " 🏆" : ""}</button>`).join("")
      || '<span class="sub" style="color:var(--muted)">No brother by that name.</span>';
    post.disabled = !picked.size;
    post.textContent = !picked.size ? "Tag who you sniped" : picked.has(bountyId) ? `Claim the bounty 🏆 +${state.bounty.points}` : "Send it 🎯";
  }
  picker.onclick = (e) => {
    const b = e.target.closest(".pick"); if (!b) return;
    picked.has(b.dataset.id) ? picked.delete(b.dataset.id) : picked.add(b.dataset.id);
    who.value = ""; drawPicker();
  };
  who.oninput = drawPicker;
  drawPicker();
  const close = () => { URL.revokeObjectURL(url); el.remove(); };
  el.querySelector("#cancel").onclick = close;
  el.querySelector("#retake").onclick = () => { close(); openCamera(preselectId); };
  post.onclick = async () => {
    post.disabled = true; post.textContent = "Sending…";
    try {
      const created = await backend.createSnipe({ blob, targetIds: [...picked], caption: el.querySelector("#cap").value.trim(), location: el.querySelector("#loc").value.trim() });
      close();
      const claimed = picked.has(bountyId) ? state.bounty.points : 0;
      await loadBounty();
      if (created?.golden) celebrateGolden(claimed);
      else toast(claimed ? `🏆 Bounty claimed! +${claimed} pts` : "Sniped. 🎯");
      setTimeout(checkAchievements, created?.golden ? 3500 : 1200);
      setTimeout(loadTicker, 1500);
      if (location.hash === "" || location.hash === "#/") route(); else location.hash = "#/";
    } catch (e) {
      el.querySelector("#post-err").textContent = e.message;
      post.disabled = false; post.textContent = "Try again";
    }
  };
}

// The Golden Snipe: full-screen moment for whoever hits this week's secret number.
function celebrateGolden(bountyPts = 0) {
  const o = document.createElement("div");
  o.className = "golden-pop";
  o.innerHTML = `<div class="golden-burst">${Array.from({ length: 18 }, (_, i) => `<i style="--a:${i * 20}deg;--d:${0.15 + (i % 5) * 0.08}s"></i>`).join("")}</div>
    <div class="golden-card"><div class="golden-icon">✨</div><div class="golden-title">GOLDEN SNIPE</div>
      <p>You hit this week's secret Golden Snipe.</p><div class="golden-pts">+${5 + bountyPts} 🏆</div>
      ${bountyPts ? `<p class="sub">Golden +5 and the bounty +${bountyPts}. Absolute cinema.</p>` : ""}
      <button class="btn primary block">Let's go</button></div>`;
  document.body.append(o);
  navigator.vibrate?.([30, 60, 30, 60, 90]);
  const close = () => o.remove();
  o.querySelector("button").onclick = close;
  o.addEventListener("click", (e) => { if (e.target === o) close(); });
}

// ── Achievements ───────────────────────────────────────────
// Hidden until earned. Keys must match supabase/achievements.sql.
const ACHIEVEMENTS = [
  ["first_blood", "🎯", "First Blood", "Posted your first snipe."],
  ["sharpshooter", "🔭", "Sharpshooter", "Posted 10 snipes."],
  ["hat_trick", "🎩", "Hat Trick", "3 snipes in one day."],
  ["double_tap", "🔁", "Double Tap", "Sniped the same brother twice in one day."],
  ["night_owl", "🦉", "Night Owl", "Posted a snipe between 2 and 5 AM."],
  ["speedrun", "⚡", "Speedrun", "Claimed a bounty within 10 minutes of it starting."],
  ["bounty_hunter", "🤠", "Bounty Hunter", "Claimed 3 bounties."],
  ["midas", "✨", "Midas Touch", "Hit a Golden Snipe."],
  ["most_wanted", "🧲", "Magnet", "Got sniped 10 times."],
  ["ghost", "👻", "Ghost", "Went 30 days without getting sniped."],
  ["civic_duty", "🗳️", "Civic Duty", "Voted in the Daily 7 days in a row."],
  ["chapters_choice", "👑", "Chapter's Choice", "Won a daily superlative."],
  ["self_aware", "🪞", "Self-Aware", "Voted most likely to get sniped this week… then got sniped that week."],
].map(([key, icon, name, desc]) => ({ key, icon, name, desc }));
const achievementInfo = (key) => ACHIEVEMENTS.find((a) => a.key === key);

// Compare what the server says you've earned with what this device has already celebrated.
// Easter egg: one brother's screen goes fully black for 30 seconds each time he gets sniped.
// Matched by a SHA-256 of his lowercased display name so the name isn't sitting in the source.
// Only snipes after BLACKOUT_SINCE count. Reloading mid-blackout resumes the remaining time.
const BLACKOUT_NAME_HASH = "2c1438b6f507d766543893a22fa00e8744eb4e9fcb9509e91bc9304535fc3dc1";
const BLACKOUT_SINCE = "2026-11-07T23:45:00Z";
const BLACKOUT_MS = 30_000;
let blackoutChecking = false;
async function isBlackoutTarget() {
  const name = state.me && member(state.me).display_name;
  if (!name || !crypto.subtle) return false;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(name.trim().toLowerCase().replace(/\s+/g, " ")));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("") === BLACKOUT_NAME_HASH;
}
async function checkBlackout() {
  if (blackoutChecking || !state.me) return;
  blackoutChecking = true;
  try {
    if (!(await isBlackoutTarget())) return;
    const untilKey = `bo-until-${state.me}`, seenKey = `bo-seen-${state.me}`;
    let until = 0, seen = [];
    try { until = +localStorage.getItem(untilKey) || 0; seen = JSON.parse(localStorage.getItem(seenKey) || "[]"); } catch {}
    const list = await backend.feed({ targetId: state.me, limit: 10 }).catch(() => []);
    const fresh = list.filter((s) => s.created_at > BLACKOUT_SINCE && !seen.includes(s.id));
    if (fresh.length) {
      until = Date.now() + BLACKOUT_MS; // several new snipes at once still means one 30s blackout
      try {
        localStorage.setItem(seenKey, JSON.stringify([...fresh.map((s) => s.id), ...seen].slice(0, 50)));
        localStorage.setItem(untilKey, String(until));
      } catch {}
    }
    if (until > Date.now()) showBlackout(until);
  } finally {
    blackoutChecking = false;
  }
}
function showBlackout(until) {
  if (document.querySelector(".blackout")) return;
  const o = document.createElement("div");
  o.className = "blackout";
  o.setAttribute("aria-hidden", "true");
  for (const t of ["pointerdown", "click", "touchstart", "touchmove", "wheel", "keydown"]) o.addEventListener(t, (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
  document.body.append(o);
  document.activeElement?.blur?.();
  setTimeout(() => {
    o.classList.add("lifting");
    setTimeout(() => o.remove(), 600);
    try { localStorage.removeItem(`bo-until-${state.me}`); } catch {}
  }, Math.max(0, until - Date.now()));
}

async function checkAchievements() {
  if (!state.me) return;
  let earned;
  try { earned = await backend.achievements(state.me); } catch { return; }
  const key = `ach-seen-${state.me}`;
  let seen = null;
  try { seen = JSON.parse(localStorage.getItem(key) || "null"); } catch {}
  const now = earned.map((a) => a.key);
  try { localStorage.setItem(key, JSON.stringify(now)); } catch {}
  if (seen === null) { // first time this device sees achievements: one summary, not a flood
    if (now.length) achievementBanner(null, now.length);
    return;
  }
  const fresh = now.filter((k) => !seen.includes(k));
  fresh.forEach((k, i) => setTimeout(() => achievementBanner(k), i * 2600));
}

function achievementBanner(key, count = 0) {
  const a = key && achievementInfo(key);
  if (key && !a) return;
  const b = document.createElement("a");
  b.className = "ach-banner";
  b.href = `#/u/${state.me}`;
  b.innerHTML = a
    ? `<span class="ach-banner-icon">${a.icon}</span><span><small>Achievement unlocked</small><b>${esc(a.name)}</b></span>`
    : `<span class="ach-banner-icon">🏅</span><span><small>Achievements are here</small><b>You've already earned ${count}. See your profile.</b></span>`;
  b.addEventListener("click", () => b.remove());
  document.body.append(b);
  navigator.vibrate?.(20);
  setTimeout(() => b.classList.add("out"), 3600);
  setTimeout(() => b.remove(), 4100);
}

function openAchievement(a, earnedAt, whose) {
  sheet(a ? a.name : "Hidden achievement", a
    ? `<div class="ach-detail"><div class="ach-detail-icon">${a.icon}</div><p>${esc(a.desc)}</p>
       <p class="sub">${whose === state.me ? "You earned" : `${esc(first(whose))} earned`} this ${esc(new Date(earnedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }))}.</p></div>`
    : `<div class="ach-detail"><div class="ach-detail-icon">❔</div><p>Nobody's telling. Keep playing to find this one.</p></div>`);
}

// ── Leaderboard ────────────────────────────────────────────
function periodStart(p) {
  const now = new Date();
  if (p === "week") return new Date(now - 7 * 864e5);
  if (p === "semester") return now.getMonth() >= 7 ? new Date(now.getFullYear(), 7, 1) : new Date(now.getFullYear(), 0, 1);
  return null;
}

const lb = { period: localStorage.getItem("lb-period") || "semester", kind: "snipes" };
async function renderLeaders(view, alive) {
  view.innerHTML = `<div class="page">
    <div class="page-head"><h1>Leaderboard</h1><a class="linkish" href="#/brothers">All brothers ›</a></div>
    <div class="seg" id="kind"><button data-v="snipes">🎯 Snipers</button><button data-v="bounty">🏆 Bounty</button><button data-v="sniped">👀 Sniped</button></div>
    <div class="seg" id="period"><button data-v="week">This week</button><button data-v="semester">Semester</button><button data-v="all">All time</button></div>
    <div id="board"><div class="loading-more"><div class="spinner"></div></div></div></div>`;
  const draw = async () => {
    view.querySelectorAll("#kind button").forEach((b) => b.classList.toggle("on", b.dataset.v === lb.kind));
    view.querySelectorAll("#period button").forEach((b) => b.classList.toggle("on", b.dataset.v === lb.period));
    const board = view.querySelector("#board");
    const k = lb.kind;
    const rows = await (k === "bounty"
      ? backend.bountyBoard(periodStart(lb.period)).then((b) => state.memberList.map((m) => ({ user_id: m.id, bounty: Number(b.find((x) => x.user_id === m.id)?.points ?? 0) })))
      : backend.leaderboard(periodStart(lb.period))).catch((e) => { board.innerHTML = `<p class="err">${esc(e.message)}</p>`; });
    if (!rows || !alive()) return;
    const ranked = rows.filter((r) => state.members.has(r.user_id)).map((r) => ({ id: r.user_id, n: Number(r[k]) }))
      .sort((a, b) => b.n - a.n || member(a.id).display_name.localeCompare(member(b.id).display_name));
    const max = Math.max(1, ranked[0]?.n ?? 1);
    const top = ranked.filter((r) => r.n > 0).slice(0, 3);
    if (!top.length) { board.innerHTML = `<div class="empty"><div class="big">${{ snipes: "🎯", sniped: "👀", bounty: "🏆" }[k]}</div>${k === "bounty" ? "No bounties claimed yet for this stretch." : "Nobody on the board yet for this stretch."}</div>`; return; }
    const spot = (r, i) => r ? `<a class="spot ${i === 0 ? "first" : ""}" href="#/u/${r.id}"><span class="medal">${["🥇", "🥈", "🥉"][i]}</span>${avatar(r.id)}<span class="nm">${esc(first(r.id))}</span><span class="ct">${r.n}${k === "bounty" ? "<small> pts</small>" : ""}</span></a>` : "<span></span>";
    board.innerHTML = `
      <div class="podium">${spot(top[1], 1)}${spot(top[0], 0)}${spot(top[2], 2)}</div>
      <div class="rank-list">${ranked.map((r, i) => `
        <a class="rank ${r.id === state.me ? "me" : ""}" href="#/u/${r.id}">
          <span class="pos">${i + 1}</span>${avatar(r.id)}
          <span class="nm">${esc(member(r.id).display_name)}<div class="bar" style="width:${(r.n / max) * 100}%"></div></span>
          <span class="ct">${r.n}</span></a>`).join("")}</div>`;
  };
  view.querySelector("#kind").onclick = (e) => { const b = e.target.closest("button"); if (b) { lb.kind = b.dataset.v; draw(); } };
  view.querySelector("#period").onclick = (e) => { const b = e.target.closest("button"); if (b) { lb.period = b.dataset.v; localStorage.setItem("lb-period", lb.period); draw(); } };
  await draw();
}

// ── Bounty ─────────────────────────────────────────────────
async function renderBounty(view, alive) {
  view.innerHTML = '<div class="loading-more"><div class="spinner"></div></div>';
  const [b, history, board] = await Promise.all([
    loadBounty(),
    backend.bountyHistory(12).catch(() => []),
    backend.bountyBoard(periodStart("semester")).catch(() => []),
  ]);
  if (!alive()) return;
  const mine = b?.target_id === state.me;
  const escapesIn = b ? Math.max(0, 7 * 864e5 - (Date.now() - new Date(b.started_at))) : 0;
  const poster = !b
    ? `<div class="wanted"><div class="wanted-label">NO BOUNTY</div><p class="sub" style="margin:8px 0 0">Not enough brothers in the pool yet. It starts automatically once there are.</p></div>`
    : `<div class="wanted ${mine ? "is-me" : ""}">
        <div class="wanted-label">${mine ? "THAT'S YOU" : "WANTED"}</div>
        <a href="#/u/${b.target_id}">${avatar(b.target_id, "xl")}</a>
        <div class="wanted-name">${esc(member(b.target_id).display_name)}</div>
        <div class="wanted-meta">On the run for ${since(b.started_at)}</div>
        <div class="reward"><span>Reward</span><b>${b.points} pts</b><small>${b.points < 10 ? "+1 for every day they stay hidden (max 10)" : "Max reward"}</small></div>
        ${mine
          ? `<p class="wanted-tip">Whoever snipes you first gets the points, then the bounty moves to someone else. Stay sharp.</p>`
          : `<button class="btn primary block" id="hunt">🎯 Snipe ${esc(first(b.target_id))}</button>`}
        <div class="sub" style="margin-top:10px">${escapesIn > 0 ? `Escapes in ${since(new Date(Date.now() - escapesIn).toISOString())} if nobody gets them` : "Escaping any minute"}</div>
      </div>`;
  const historyRows = history.map((h) => h.status === "claimed"
    ? `<a class="row" href="${h.claim_snipe_id ? `#/snipe/${h.claim_snipe_id}` : "#/bounty"}">${avatar(h.claimed_by, "sm")}<div class="grow"><b>${esc(first(h.claimed_by))}</b> claimed ${esc(first(h.target_id))}<div class="sub">${ago(h.ended_at)}</div></div><span class="ct-gold">+${h.points}</span></a>`
    : `<div class="row">${avatar(h.target_id, "sm")}<div class="grow"><b>${esc(first(h.target_id))}</b> escaped 🏃<div class="sub">Survived 7 days · ${ago(h.ended_at)}</div></div></div>`).join("");
  const hunters = board.filter((r) => state.members.has(r.user_id)).sort((a, c) => c.points - a.points).slice(0, 5);
  view.innerHTML = `<div class="page">
    <h1>Bounty</h1>
    ${poster}
    <div class="section-label" style="margin-top:22px">Recent bounties</div>
    ${historyRows ? `<div class="group">${historyRows}</div>` : `<div class="empty" style="padding:20px">No bounties claimed yet. Be the first.</div>`}
    ${hunters.length ? `<div class="section-label">Top bounty hunters · semester</div>
      <div class="rank-list" style="margin-bottom:18px">${hunters.map((r, i) => `<a class="rank ${r.user_id === state.me ? "me" : ""}" href="#/u/${r.user_id}"><span class="pos">${i + 1}</span>${avatar(r.user_id)}<span class="nm">${esc(member(r.user_id).display_name)}<div class="sub" style="color:var(--muted);font-size:12px">${r.claims} claimed</div></span><span class="ct">${r.points}<small> pts</small></span></a>`).join("")}</div>` : ""}
    <div class="section-label">How it works</div>
    <div class="group how"><div class="row"><div class="grow sub">
      One brother has the bounty at a time. Post the first snipe that tags them and you collect the reward. Then the bounty jumps to someone new at random.<br><br>
      The reward starts at 3 pts and grows by 1 every day they stay hidden. If nobody gets them in 7 days, they escape and it moves on.<br><br>
      Don't want to be picked? Turn it off in Settings.</div></div></div>
  </div>`;
  view.querySelector("#hunt")?.addEventListener("click", () => openCamera(b.target_id));
}

// ── Daily superlatives ─────────────────────────────────────
const dayName = (iso, opts = { weekday: "long" }) => new Date(iso + "T12:00:00").toLocaleDateString(undefined, opts);
const revealLabel = (iso) => new Date(iso).toLocaleString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit" });

function resultCard(d) {
  const res = d.results ?? [];
  if (!res.length) return `<div class="sl-result"><div class="sl-result-q">${esc(d.prompt)}</div><div class="sub">No votes</div></div>`;
  const top = res[0].votes, winners = res.filter((r) => r.votes === top), rest = res.filter((r) => r.votes !== top);
  return `<div class="sl-result">
    <div class="sl-result-day">${esc(dayName(d.day))}</div>
    <div class="sl-result-q">${esc(d.prompt)}</div>
    <div class="sl-winners">${winners.map((w) => `<a href="#/u/${w.nominee_id}" class="sl-winner">${avatar(w.nominee_id)}<span><b>${esc(member(w.nominee_id).display_name)}</b><small>${w.votes} vote${w.votes === 1 ? "" : "s"}${winners.length > 1 ? " · tie" : ""}</small></span><span class="sl-crown">🏆</span></a>`).join("")}</div>
    ${rest.length ? `<div class="sl-runners">Runner-up: ${rest.map((r) => `${esc(first(r.nominee_id))} (${r.votes})`).join(", ")}</div>` : ""}
    <div class="sl-total">${d.total_votes} total vote${d.total_votes === 1 ? "" : "s"}</div>
  </div>`;
}

async function renderDaily(view, alive) {
  view.innerHTML = '<div class="loading-more"><div class="spinner"></div></div>';
  const today = await loadSuperlative();
  const [thisWeek, lastWeek] = await Promise.all([
    backend.superlativeWeek(null).catch(() => []),
    today ? backend.superlativeWeek(new Date(new Date(today.day + "T12:00:00") - 7 * 864e5).toISOString().slice(0, 10)).catch(() => []) : [],
  ]);
  if (!alive()) return;
  if (!today) { view.innerHTML = '<div class="empty"><div class="big">🗳️</div>Couldn\'t load today\'s question. Pull down to retry.</div>'; return; }

  const thisWeekRevealed = thisWeek.some((d) => d.revealed);
  const shownResults = thisWeekRevealed ? thisWeek.filter((d) => d.revealed) : lastWeek.filter((d) => d.revealed);
  const eligible = state.memberList.filter((m) => m.id !== state.me && !m.superlative_opt_out);
  let pick = null, changing = false;

  const earlier = thisWeek.filter((d) => d.day !== today.day && !d.revealed);
  view.innerHTML = `<div class="page">
    <div class="page-head"><h1>Daily</h1><span class="sub" style="color:var(--muted)">🔒 Votes are anonymous</span></div>
    <div class="sl-card" id="sl-card"></div>
    ${thisWeekRevealed ? "" : earlier.length ? `<div class="section-label" style="margin-top:22px">Earlier this week</div>
      <div class="group">${earlier.map((d) => `<div class="row"><div class="grow"><div class="sub">${esc(dayName(d.day))}</div>${esc(d.prompt)}</div>
        <span class="sl-badge ${d.my_vote ? "on" : ""}">${d.my_vote ? "Voted" : "Missed"}</span></div>`).join("")}</div>` : ""}
    <div class="section-label" style="margin-top:22px">${thisWeekRevealed ? "🎉 This week's winners" : "Last week's winners"}</div>
    ${shownResults.length ? `<div class="sl-results">${shownResults.map(resultCard).join("")}</div>` : `<div class="empty" style="padding:20px">No results yet. The first reveal is ${esc(revealLabel(today.reveal_at))}.</div>`}
  </div>`;
  if (thisWeekRevealed) { const k = revealKey(); try { if (k) localStorage.setItem(k, "1"); } catch {} }

  const card = view.querySelector("#sl-card");
  function drawCard() {
    const voted = today.my_vote && !changing;
    const closed = !today.voting_open;
    card.innerHTML = `
      <div class="sl-kicker">${closed ? "VOTING CLOSED" : "TODAY"} · ${esc(dayName(today.day, { weekday: "short", month: "short", day: "numeric" }))}</div>
      <div class="sl-prompt">${esc(today.prompt)}</div>
      ${closed ? `<p class="sub" style="margin:0">Results are out below.</p>`
        : voted ? `<div class="sl-voted">You voted for ${avatar(today.my_vote, "sm")}<b>${esc(member(today.my_vote).display_name)}</b><button class="linkish" id="sl-change">Change</button></div>`
        : `<input class="input" id="sl-q" placeholder="Search brothers" autocomplete="off" style="margin-top:4px">
           <div class="picker sl-picker" id="sl-pick"></div>
           <button class="btn primary block" id="sl-vote" disabled>Pick someone</button>`}
      <div class="sl-meta">${today.votes} vote${today.votes === 1 ? "" : "s"} so far · Winners revealed ${esc(revealLabel(today.reveal_at))}</div>
      ${state.isAdmin && !today.votes && !closed ? '<button class="linkish" id="sl-swap" style="margin-top:6px">Swap this question (admin)</button>' : ""}`;
    card.querySelector("#sl-change")?.addEventListener("click", () => { changing = true; pick = today.my_vote; drawCard(); });
    card.querySelector("#sl-swap")?.addEventListener("click", async () => {
      try { await backend.swapSuperlative(); toast("New question"); route(); } catch (x) { toast(x.message); }
    });
    const q = card.querySelector("#sl-q");
    if (!q) return;
    const box = card.querySelector("#sl-pick"), btn = card.querySelector("#sl-vote");
    const draw = () => {
      const t = q.value.trim().toLowerCase();
      const list = eligible.filter((m) => m.id === pick || !t || m.display_name.toLowerCase().includes(t));
      list.sort((a, b) => (b.id === pick) - (a.id === pick));
      box.innerHTML = list.map((m) => `<button type="button" class="pick ${m.id === pick ? "on" : ""}" data-id="${m.id}">${avatar(m.id)}${esc(m.display_name)}</button>`).join("")
        || '<span class="sub" style="color:var(--muted)">No brother by that name.</span>';
      btn.disabled = !pick;
      btn.textContent = pick ? `Vote for ${first(pick)}` : "Pick someone";
    };
    box.onclick = (e) => { const b = e.target.closest(".pick"); if (!b) return; pick = b.dataset.id; q.value = ""; draw(); };
    q.oninput = draw; draw();
    btn.onclick = async () => {
      btn.disabled = true; btn.textContent = "Voting…";
      try {
        await backend.voteSuperlative(pick);
        if (!today.my_vote) today.votes++;
        today.my_vote = pick; changing = false; state.sl = today;
        document.querySelector('.nav a[data-tab="daily"]')?.classList.remove("dot");
        toast("Vote locked in 🤫"); drawCard();
        setTimeout(checkAchievements, 1500);
        loadTicker();
      } catch (x) { toast(x.message); draw(); }
    };
  }
  drawCard();
}

// ── Black box ──────────────────────────────────────────────
// Anonymous notes for chapter. Hidden at the bottom of Settings. Notes are saved with no
// name and no time (only the date); only admins can open the box.
async function renderBlackBox(view, alive) {
  view.innerHTML = `<div class="page bb-page">${backBtn("#/settings")}
    <div class="bb-hero"><div class="bb-box"><span></span></div><h1>Black box</h1>
      <p>Say anything. It's anonymous: your name is never saved with what you write, not even for admins. Officers open the box and read it out at chapter.</p></div>
    <textarea class="input bb-input" id="bb-text" maxlength="1000" placeholder="Drop it in…"></textarea>
    <div class="bb-row"><span class="sub" id="bb-count">0 / 1000</span><button class="btn primary" id="bb-drop" disabled>Drop it in</button></div>
    <p class="bb-waiting" id="bb-waiting"></p>
    <div id="bb-admin"></div>
  </div>`;
  const ta = view.querySelector("#bb-text"), btn = view.querySelector("#bb-drop"), count = view.querySelector("#bb-count");
  const waiting = async () => {
    const n = await backend.blackBoxWaiting().catch(() => null);
    if (!alive() || n === null) return;
    view.querySelector("#bb-waiting").textContent = n ? `📦 ${n} note${n === 1 ? "" : "s"} waiting for chapter` : "📦 The box is empty";
  };
  ta.oninput = () => { count.textContent = `${ta.value.length} / 1000`; btn.disabled = !ta.value.trim(); };
  btn.onclick = async () => {
    btn.disabled = true; btn.textContent = "Dropping…";
    try {
      await backend.blackBoxDrop(ta.value);
      ta.value = ""; ta.oninput();
      const box = view.querySelector(".bb-box"); box.classList.remove("gulp"); void box.offsetWidth; box.classList.add("gulp");
      toast("In the box. 🔒 Nobody knows it was you.");
      waiting(); if (state.isAdmin) drawAdmin();
    } catch (x) { toast(x.message); btn.disabled = false; }
    btn.textContent = "Drop it in";
  };
  waiting();

  async function drawAdmin() {
    if (!state.isAdmin) return;
    const box = view.querySelector("#bb-admin");
    let notes;
    try { notes = await backend.blackBoxList(true); } catch { return; }
    if (!alive()) return;
    const unread = notes.filter((n) => !n.read_at), read = notes.filter((n) => n.read_at);
    box.innerHTML = `<div class="section-label" style="margin-top:26px">Officers only</div>
      <button class="btn primary block" id="bb-read" ${unread.length ? "" : "disabled"}>📖 Read at chapter (${unread.length})</button>
      ${unread.length ? `<p class="sub" style="color:var(--muted);margin:8px 2px 0">Delete anything that shouldn't be read out loud before you start.</p>
        <div class="group bb-list">${unread.map(noteRow).join("")}</div>` : ""}
      ${read.length ? `<details class="bb-read-old"><summary>Already read (${read.length})</summary><div class="group bb-list">${read.map(noteRow).join("")}</div></details>` : ""}`;
    box.querySelector("#bb-read").onclick = () => readAtChapter(unread, () => { drawAdmin(); waiting(); });
    box.onclick = async (e) => {
      const b = e.target.closest("[data-bb]"); if (!b) return;
      const id = b.closest("[data-id]").dataset.id;
      if (b.dataset.bb === "del") { if (!confirm("Delete this note for good?")) return; await backend.blackBoxDelete(id).catch((x) => toast(x.message)); }
      if (b.dataset.bb === "unread") await backend.blackBoxMark(id, false).catch((x) => toast(x.message));
      drawAdmin(); waiting();
    };
  }
  const noteRow = (n) => `<div class="row bb-note" data-id="${n.id}"><div class="grow"><div class="sub">${esc(new Date(n.dropped_on + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }))}</div>${esc(n.body)}</div>
    ${n.read_at ? '<button class="btn small" data-bb="unread">Unread</button>' : ""}<button class="btn small danger" data-bb="del" aria-label="Delete note">✕</button></div>`;
  drawAdmin();
}

// Full-screen, one note at a time, big type — for reading aloud. Each note is marked read as you pass it.
function readAtChapter(notes, onDone) {
  if (!notes.length) return;
  let i = 0;
  const marks = []; // wait for every "mark read" to save before refreshing the list
  const o = document.createElement("div");
  o.className = "bb-reader";
  const draw = () => {
    const n = notes[i];
    o.innerHTML = `<div class="bb-reader-top"><span>${i + 1} of ${notes.length}</span><button class="icon-btn" data-x aria-label="Close">✕</button></div>
      <div class="bb-reader-body"><p>${esc(n.body)}</p></div>
      <div class="bb-reader-foot"><button class="btn block" data-prev ${i ? "" : "disabled"}>Back</button><button class="btn primary block" data-next>${i === notes.length - 1 ? "Done 🔒" : "Next"}</button></div>`;
    marks.push(backend.blackBoxMark(n.id, true).catch(() => {}));
  };
  const close = () => { o.remove(); removeEventListener("hashchange", close); Promise.all(marks).then(() => onDone?.()); };
  o.addEventListener("click", (e) => {
    if (e.target.closest("[data-x]")) return close();
    if (e.target.closest("[data-prev]") && i > 0) { i--; draw(); }
    else if (e.target.closest("[data-next]")) { if (i < notes.length - 1) { i++; draw(); } else close(); }
  });
  addEventListener("hashchange", close);
  document.body.append(o);
  draw();
}

// ── Brothers directory ─────────────────────────────────────
function renderBrothers(view) {
  view.innerHTML = `<div class="page">${backBtn("#/leaders")}<h1>Brothers</h1>
    <input class="input" id="q" placeholder="Search ${state.memberList.length} brothers" autocomplete="off" style="margin-bottom:10px">
    <div class="rank-list" id="list"></div></div>`;
  const list = view.querySelector("#list"), q = view.querySelector("#q");
  const draw = () => {
    const t = q.value.trim().toLowerCase();
    list.innerHTML = state.memberList.filter((m) => !t || m.display_name.toLowerCase().includes(t))
      .map((m) => `<a class="rank ${m.id === state.me ? "me" : ""}" href="#/u/${m.id}">${avatar(m.id)}<span class="nm">${esc(m.display_name)}</span><span class="sub" style="color:var(--muted)">›</span></a>`).join("");
  };
  q.oninput = draw; draw();
}

// ── Profile ────────────────────────────────────────────────
// Seniors' box at the top of their own profile: one anonymous ticker message, live for 24h.
async function renderSeniorBox(box, alive) {
  let st;
  try { st = await backend.seniorStatus(); } catch { return; }
  if (!alive() || !st?.is_senior) return;
  const left = (iso) => {
    const m = Math.max(0, Math.round((new Date(iso) - Date.now()) / 60e3));
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m left` : `${m}m left`;
  };
  const draw = (post, editing = false) => {
    if (post && !editing) {
      box.innerHTML = `<div class="senior-box">
        <div class="sb-head"><span>📢 Your message is live</span><span class="sb-time">${left(post.expires_at)}</span></div>
        <p class="sb-live">“${esc(post.body)}”</p>
        <div class="sb-sub">Scrolling in everyone's ticker. Nobody can see it's from you.</div>
        <div class="sb-actions"><button class="btn small" id="sb-replace">Replace it</button><button class="btn small danger" id="sb-down">Take it down</button></div>
      </div>`;
      box.querySelector("#sb-replace").onclick = () => draw(post, true);
      box.querySelector("#sb-down").onclick = async () => {
        if (!confirm("Take your message off the ticker?")) return;
        try { await backend.seniorWithdraw(); draw(null); loadTicker(); toast("Taken down"); } catch (x) { toast(x.message); }
      };
      return;
    }
    box.innerHTML = `<div class="senior-box">
      <div class="sb-head"><span>📢 Message from your elders</span><span class="pill">Seniors only</span></div>
      <div class="sb-sub">Anonymous. It scrolls across everyone's feed for 24 hours.${post ? " Posting replaces your current message." : ""}</div>
      <textarea class="input" id="sb-text" maxlength="140" rows="3" placeholder="Say what needs to be said…"></textarea>
      <div class="sb-actions"><span class="sb-count" id="sb-count">140</span>
        ${post ? '<button class="btn small" id="sb-cancel">Cancel</button>' : ""}
        <button class="btn small primary" id="sb-post" disabled>Post to the ticker</button></div>
      <p class="err" id="sb-err"></p>
    </div>`;
    const ta = box.querySelector("#sb-text"), btn = box.querySelector("#sb-post"), count = box.querySelector("#sb-count");
    ta.oninput = () => {
      const n = ta.value.trim().length;
      count.textContent = 140 - ta.value.length;
      count.classList.toggle("low", ta.value.length > 120);
      btn.disabled = !n;
    };
    box.querySelector("#sb-cancel")?.addEventListener("click", () => draw(post));
    btn.onclick = async () => {
      btn.disabled = true;
      box.querySelector("#sb-err").textContent = "";
      try {
        const p = await backend.seniorPost(ta.value);
        draw(p); loadTicker(); toast("📢 It's on the ticker");
      } catch (x) { box.querySelector("#sb-err").textContent = x.message; btn.disabled = false; }
    };
  };
  draw(st.post || null);
}

async function renderProfile(view, id, alive) {
  if (!state.members.has(id)) { view.innerHTML = `<div class="page">${backBtn("#/")}</div><div class="empty"><div class="big">🫥</div>No brother here.</div>`; return; }
  const m = member(id), isMe = id === state.me;
  view.innerHTML = `
    <div class="page" style="padding-bottom:0">${backBtn("#/")}</div>
    ${isMe ? '<div id="senior-box"></div>' : ""}
    <div class="profile-head">
      ${avatar(id, "lg")}
      <h1>${esc(m.display_name)}</h1>
      ${isMe ? '<button class="btn small" id="edit">Edit profile</button>' : ""}
      <div class="stats"><div class="stat"><div class="v" id="st-s">–</div><div class="l">Snipes</div></div>
        <div class="stat"><div class="v" id="st-d">–</div><div class="l">Sniped</div></div>
        <div class="stat"><div class="v" id="st-r">–</div><div class="l">🏆 Pts</div></div></div>
      ${state.bounty?.target_id === id ? `<a class="pill wanted-pill" href="#/bounty">🏆 Current bounty · ${state.bounty.points} pts</a>` : ""}
    </div>
    <div class="page ach-wrap"><div class="section-label" id="ach-label">Achievements</div><div class="ach-grid" id="ach-grid"></div></div>
    <div class="seg profile-tabs" id="ptabs"><button data-v="by" class="on">${isMe ? "My snipes" : "Their snipes"}</button><button data-v="of">Caught in</button></div>
    <div id="pgrid"><div class="loading-more"><div class="spinner"></div></div></div>`;
  if (isMe) view.querySelector("#edit").onclick = openEditProfile;
  if (isMe) renderSeniorBox(view.querySelector("#senior-box"), alive);
  backend.leaderboard(null).then((rows) => {
    if (!alive()) return;
    const r = rows.find((x) => x.user_id === id) ?? { snipes: 0, sniped: 0 };
    view.querySelector("#st-s").textContent = r.snipes;
    view.querySelector("#st-d").textContent = r.sniped;
  }).catch(() => {});
  backend.bountyBoard(null).then((rows) => {
    if (alive()) view.querySelector("#st-r").textContent = rows.find((x) => x.user_id === id)?.points ?? 0;
  }).catch(() => {});
  backend.achievements(id).then((earned) => {
    if (!alive()) return;
    const got = new Map(earned.map((a) => [a.key, a.earned_at]));
    view.querySelector("#ach-label").textContent = `Achievements · ${got.size} of ${ACHIEVEMENTS.length}`;
    // Earned first (in the order they were earned), then mystery tiles for the rest.
    const order = [...earned.map((a) => achievementInfo(a.key)).filter(Boolean), ...ACHIEVEMENTS.filter((a) => !got.has(a.key))];
    const grid = view.querySelector("#ach-grid");
    grid.innerHTML = order.map((a) => got.has(a.key)
      ? `<button class="ach on" data-key="${a.key}"><span class="ach-icon">${a.icon}</span><span class="ach-name">${esc(a.name)}</span></button>`
      : `<button class="ach" data-key=""><span class="ach-icon">?</span><span class="ach-name">???</span></button>`).join("");
    grid.onclick = (e) => {
      const b = e.target.closest(".ach"); if (!b) return;
      const k = b.dataset.key;
      openAchievement(k ? achievementInfo(k) : null, got.get(k), id);
    };
  }).catch(() => { view.querySelector(".ach-wrap")?.remove(); });
  const grid = async (mode) => {
    view.querySelectorAll("#ptabs button").forEach((b) => b.classList.toggle("on", b.dataset.v === mode));
    const box = view.querySelector("#pgrid");
    const list = await backend.feed(mode === "by" ? { sniperId: id, limit: 60 } : { targetId: id, limit: 60 }).catch(() => []);
    if (!alive()) return;
    box.innerHTML = list.length
      ? `<div class="grid">${list.map((s) => `<a href="#/snipe/${s.id}" class="${s.golden ? "golden-thumb" : ""}"><img src="${esc(s.photo_url)}" alt="" loading="lazy"></a>`).join("")}</div>`
      : `<div class="empty">${mode === "by" ? (isMe ? "You haven't sniped anyone yet. Hit the button." : `${esc(first(id))} hasn't sniped anyone yet.`) : (isMe ? "Nobody's caught you… yet." : `Nobody's caught ${esc(first(id))} yet.`)}</div>`;
  };
  view.querySelector("#ptabs").onclick = (e) => { const b = e.target.closest("button"); if (b) grid(b.dataset.v); };
  await grid("by");
}

function openEditProfile() {
  const m = member(state.me);
  let newAvatar = null;
  const { el, close } = sheet("Edit profile", `
    <div style="display:grid;justify-items:center;gap:10px;margin:6px 0 18px">
      <div id="av-prev">${avatar(state.me, "lg")}</div>
      <button class="btn small" id="av-pick">Change photo</button></div>
    <div class="field"><label for="dn">Name</label><input class="input" id="dn" maxlength="40" value="${esc(m.display_name)}"></div>
    <p class="err" id="pe"></p>`, '<button class="btn primary block" id="save">Save</button>');
  const avInput = document.getElementById("avatar-input");
  el.querySelector("#av-pick").onclick = () => { avInput.value = ""; avInput.click(); };
  avInput.onchange = async () => {
    const f = avInput.files[0]; if (!f) return;
    newAvatar = await squareAvatar(f);
    el.querySelector("#av-prev").innerHTML = `<span class="av lg"><img src="${URL.createObjectURL(newAvatar)}" alt=""></span>`;
  };
  el.querySelector("#save").onclick = async () => {
    const name = el.querySelector("#dn").value.trim();
    if (!name) { el.querySelector("#pe").textContent = "Name can't be empty."; return; }
    const btn = el.querySelector("#save"); btn.disabled = true;
    try {
      await backend.updateProfile({ display_name: name !== m.display_name ? name : null, avatarBlob: newAvatar });
      await loadMembers(); refreshMeButton();
      close(); route(); toast("Profile updated");
    } catch (e) { el.querySelector("#pe").textContent = e.message; btn.disabled = false; }
  };
}

// ── Settings & notifications ───────────────────────────────
function pushSupported() { return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; }

function b64ToBytes(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function currentSub() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

async function enablePush() {
  if (!pushSupported()) {
    toast(isIOS() && !isStandalone() ? "Add the app to your Home Screen first, then turn on alerts." : "This browser can't do notifications.");
    return false;
  }
  if (!CONFIG.VAPID_PUBLIC_KEY) { toast("Notifications aren't set up yet (see README)."); return false; }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") { toast("Notifications are blocked. Allow them in Settings."); return false; }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(CONFIG.VAPID_PUBLIC_KEY) });
    await backend.savePushSubscription(sub);
    toast("Snipe alerts on 🔔");
    return true;
  } catch (e) { toast(`Couldn't turn on alerts: ${e.message}`); return false; }
}

async function disablePush() {
  const sub = await currentSub();
  if (sub) { await backend.removePushSubscription(sub.endpoint); await sub.unsubscribe(); }
  toast("Snipe alerts off");
}

async function renderSettings(view) {
  const sub = await currentSub().catch(() => null);
  const pushOn = !!sub && Notification.permission === "granted";
  view.innerHTML = `<div class="page">${backBtn("#/")}<h1>Settings</h1>
    <div class="section-label">Notifications</div>
    <div class="group">
      <div class="row"><div class="grow">Snipe alerts<div class="sub">${pushSupported() ? "Get pinged when a brother posts, or catches you." : isIOS() ? "Add to Home Screen first (Share → Add to Home Screen)." : "Not supported in this browser."}</div></div>
        <button class="switch ${pushOn ? "on" : ""}" id="push" role="switch" aria-checked="${pushOn}" aria-label="Snipe alerts" ${pushSupported() ? "" : "disabled"}></button></div>
    </div>
    <div class="section-label">Bounty</div>
    <div class="group">
      <div class="row"><div class="grow">Put me in the bounty pool<div class="sub">When on, you can be randomly picked as the bounty. You can still claim bounties either way.</div></div>
        <button class="switch ${member(state.me).bounty_opt_out ? "" : "on"}" id="bpool" role="switch" aria-checked="${!member(state.me).bounty_opt_out}" aria-label="Bounty pool"></button></div>
    </div>
    <div class="section-label">Daily superlatives</div>
    <div class="group">
      <div class="row"><div class="grow">Let people vote for me<div class="sub">When off, you won't show up as an option. You can still vote.</div></div>
        <button class="switch ${member(state.me).superlative_opt_out ? "" : "on"}" id="slopt" role="switch" aria-checked="${!member(state.me).superlative_opt_out}" aria-label="Superlative votes"></button></div>
    </div>
    <div class="section-label">Chapter</div>
    <div class="group"><a class="row" href="#/brothers"><div class="grow">Brothers<div class="sub">Everyone in the app</div></div>›</a></div>
    <div class="section-label">Account</div>
    <div class="group">
      <a class="row" href="#/u/${state.me}">${avatar(state.me, "sm")}<div class="grow">${esc(member(state.me).display_name)}<div class="sub ellip">${esc(member(state.me).email ?? "")}</div></div>›</a>
      ${state.isAdmin ? `<a class="row" href="#/roster"><div class="grow">Chapter roster<div class="sub">Who can sign in · admins only</div></div>›</a>` : ""}
      <button class="row" id="signout" style="width:100%;color:var(--danger);font-weight:600">Sign out</button>
    </div>
    <a class="bb-door" href="#/blackbox" aria-label="Black box"><span class="bb-cube"></span>black box</a>
  </div>`;
  const sw = view.querySelector("#push");
  sw.onclick = async () => {
    sw.disabled = true;
    const on = sw.classList.contains("on") ? (await disablePush(), false) : await enablePush();
    sw.classList.toggle("on", on); sw.setAttribute("aria-checked", on); sw.disabled = false;
  };
  const bp = view.querySelector("#bpool");
  bp.onclick = async () => {
    const optOut = bp.classList.contains("on");
    bp.disabled = true;
    try {
      await backend.setBountyOptOut(optOut);
      member(state.me).bounty_opt_out = optOut;
      bp.classList.toggle("on", !optOut); bp.setAttribute("aria-checked", !optOut);
      await loadBounty();
      toast(optOut ? "You're out of the bounty pool" : "You're in the bounty pool 🎯");
    } catch (x) { toast(x.message); }
    bp.disabled = false;
  };
  const so = view.querySelector("#slopt");
  so.onclick = async () => {
    const optOut = so.classList.contains("on");
    so.disabled = true;
    try {
      await backend.setSuperlativeOptOut(optOut);
      member(state.me).superlative_opt_out = optOut;
      so.classList.toggle("on", !optOut); so.setAttribute("aria-checked", !optOut);
      toast(optOut ? "You're out of superlatives" : "You're back in superlatives");
    } catch (x) { toast(x.message); }
    so.disabled = false;
  };
  view.querySelector("#signout").onclick = async () => { await disablePush().catch(() => {}); await backend.signOut(); };
}

// ── Roster (admins) ────────────────────────────────────────
async function renderRoster(view, alive) {
  view.innerHTML = `<div class="page">${backBtn("#/settings")}<h1>Chapter roster</h1>
    <p style="color:var(--muted);margin-top:-6px">Only these emails can sign in. Removing someone locks them out right away.</p>
    <div class="section-label">Chapter join code</div>
    <div class="group"><div class="row" style="flex-wrap:wrap">
      <div class="grow"><div id="jc-show" style="font-weight:800;font-size:18px;letter-spacing:.04em">…</div>
        <div class="sub">Anyone who signs in with this code is added to the roster. Share it in the GroupMe; change it if it leaks.</div></div>
      <div style="display:flex;gap:8px"><button class="btn small" id="jc-new">New code</button><button class="btn small" id="jc-off">Turn off</button></div>
    </div></div>
    <div class="section-label">Live senior messages <span style="text-transform:none;letter-spacing:0;font-weight:500">· only admins see who wrote them</span></div>
    <div class="group" id="sp-list"><div class="row"><span class="sub">Loading…</span></div></div>
    <div class="field"><label for="add">Add brothers by email</label>
      <textarea class="input" id="add" placeholder="Paste emails, one per line or comma-separated"></textarea></div>
    <button class="btn primary block" id="add-btn">Add to roster</button><p class="err" id="rerr"></p>
    <div class="section-label" id="count" style="margin-top:14px"></div><div class="group" id="rlist"></div></div>`;
  const listEl = view.querySelector("#rlist");
  const jcShow = view.querySelector("#jc-show"), jcOff = view.querySelector("#jc-off");
  const drawCode = (c) => {
    jcShow.textContent = c || "Off: only emails listed below can join";
    jcShow.style.color = c ? "var(--gold)" : "var(--muted)";
    jcOff.hidden = !c;
  };
  backend.getJoinCode().then((c) => alive() && drawCode(c)).catch((x) => { jcShow.textContent = x.message; });
  view.querySelector("#jc-new").onclick = async () => {
    const custom = prompt("New chapter code (6+ characters). Leave blank for a random one.", "");
    if (custom === null) return;
    const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const code = custom.trim() || `${CONFIG.CHAPTER}-SNIPE-` + Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => abc[b % abc.length]).join("");
    if (code.length < 6 || code.length > 40) { toast("Codes need 6–40 characters"); return; }
    try { await backend.setJoinCode(code); drawCode(code); toast("New code saved. The old one stops working now."); }
    catch (x) { toast(x.message); }
  };
  jcOff.onclick = async () => {
    if (!confirm("Turn off the join code? New brothers will need to be added by email.")) return;
    try { await backend.setJoinCode(null); drawCode(null); toast("Join code off"); } catch (x) { toast(x.message); }
  };
  const spList = view.querySelector("#sp-list");
  const drawSP = async () => {
    let posts;
    try { posts = await backend.seniorPostsAdmin(); } catch { spList.innerHTML = '<div class="row"><span class="sub">Not set up yet.</span></div>'; return; }
    if (!alive()) return;
    spList.innerHTML = posts.length ? posts.map((p) => `
      <div class="row" data-id="${esc(p.id)}"><div class="grow"><div>“${esc(p.body)}”</div>
        <div class="sub">${esc(member(p.author_id).display_name)} · ${ago(p.created_at)} · ends ${new Date(p.expires_at).toLocaleTimeString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}</div></div>
        <button class="btn small danger" data-act="sp-rm">Remove</button></div>`).join("")
      : '<div class="row"><span class="sub">None right now.</span></div>';
  };
  spList.onclick = async (e) => {
    const b = e.target.closest('[data-act="sp-rm"]'); if (!b) return;
    if (!confirm("Take this message off the ticker for everyone?")) return;
    try { await backend.seniorRemove(b.closest(".row").dataset.id); await drawSP(); loadTicker(); toast("Removed"); } catch (x) { toast(x.message); }
  };
  drawSP();
  let seniorIds = new Set();
  const draw = async () => {
    const [rows, sIds] = await Promise.all([backend.listRoster(), backend.seniorList().catch(() => null)]);
    if (!alive()) return;
    seniorIds = new Set(sIds || []);
    const byEmail = new Map(state.memberList.map((m) => [m.email, m.id]));
    const joined = new Set(state.memberList.map((m) => m.email));
    view.querySelector("#count").textContent = `${rows.length} on roster · ${rows.filter((r) => joined.has(r.email)).length} signed up`;
    listEl.innerHTML = rows.map((r) => `
      <div class="row" data-email="${esc(r.email)}"><div class="grow">${byEmail.has(r.email) ? `<div class="ellip">${esc(member(byEmail.get(r.email)).display_name)}</div><div class="sub ellip">${esc(r.email)}</div>` : `<div class="ellip">${esc(r.email)}</div>`}
        <div class="sub">${joined.has(r.email) ? "Signed up" : "Hasn't signed in yet"}${r.via_code ? " · Joined with code" : ""}${r.is_admin ? " · Admin" : ""}${seniorIds.has(byEmail.get(r.email)) ? " · Senior" : ""}</div></div>
        ${sIds && byEmail.has(r.email) ? `<button class="btn small ${seniorIds.has(byEmail.get(r.email)) ? "on-gold" : ""}" data-act="senior" data-uid="${esc(byEmail.get(r.email))}" aria-pressed="${seniorIds.has(byEmail.get(r.email))}">Senior</button>` : ""}
        <button class="btn small ${r.is_admin ? "on-gold" : ""}" data-act="admin" aria-pressed="${!!r.is_admin}">Admin</button>
        <button class="btn small danger" data-act="rm" aria-label="Remove ${esc(r.email)}">✕</button></div>`).join("");
  };
  listEl.onclick = async (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const email = b.closest(".row").dataset.email;
    if (b.dataset.act === "senior") {
      const on = !seniorIds.has(b.dataset.uid);
      try { await backend.setSenior(b.dataset.uid, on); await draw(); if (!on) { drawSP(); loadTicker(); } toast(on ? "Marked as senior" : "No longer a senior"); }
      catch (x) { toast(x.message); }
      return;
    }
    if (email === member(state.me).email) { toast("You can't change your own access here."); return; }
    try {
      if (b.dataset.act === "rm") { if (!confirm(`Remove ${email} from the roster?`)) return; await backend.removeFromRoster(email); }
      else await backend.setRosterAdmin(email, b.getAttribute("aria-pressed") !== "true");
      await draw();
    } catch (x) { toast(x.message); }
  };
  view.querySelector("#add-btn").onclick = async () => {
    const ta = view.querySelector("#add"), err = view.querySelector("#rerr");
    const emails = [...new Set(ta.value.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))];
    const bad = emails.filter((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
    if (!emails.length) return;
    if (bad.length) { err.textContent = `Not valid: ${bad.join(", ")}`; return; }
    err.textContent = "";
    try { await backend.addToRoster(emails); ta.value = ""; toast(`Added ${emails.length}`); await draw(); }
    catch (x) { err.textContent = x.message; }
  };
  await draw().catch((x) => { listEl.innerHTML = `<p class="err" style="padding:14px">${esc(x.message)}</p>`; });
}

// ── App lifecycle & iOS polish ─────────────────────────────
let hiddenAt = 0;
// Home Screen apps on iPhone are paused, not restarted, so they can run old code for days.
// On resume, compare the deployed version with the one we loaded and reload if it changed.
let loadedVersion = null;
const fetchVersion = () => fetch("version.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => j?.v ?? null).catch(() => null);
fetchVersion().then((v) => { loadedVersion = v; });
async function checkForUpdate() {
  const v = await fetchVersion();
  if (!v || !loadedVersion || v === loadedVersion) return;
  // Never yank someone out of writing a post, comment, or message.
  const busy = document.querySelector(".compose, .overlay") || [...document.querySelectorAll("textarea, input")].some((el) => el.value && el.offsetParent);
  if (busy) return;
  location.reload();
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  checkForUpdate();
  if (state.me) checkBlackout();
  // Signed photo links last 6h; refresh anything older than 20 min unless the person is mid-post.
  if (state.me && hiddenAt && Date.now() - hiddenAt > 20 * 60e3 && !document.querySelector(".compose, .overlay")) refreshAll();
});

// Block pinch-zoom (iOS ignores user-scalable=no).
for (const t of ["gesturestart", "gesturechange"]) document.addEventListener(t, (e) => e.preventDefault(), { passive: false });

// Keep sheets above the on-screen keyboard and put the page back where it was afterwards.
if (window.visualViewport) {
  const vv = window.visualViewport;
  const onVV = () => {
    const kb = Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
    document.documentElement.style.setProperty("--kb", kb + "px");
    document.body.classList.toggle("kb-open", kb > 120);
  };
  vv.addEventListener("resize", onVV); vv.addEventListener("scroll", onVV);
}
document.addEventListener("focusout", () => setTimeout(() => {
  if (!document.activeElement?.matches?.("input, textarea")) window.scrollTo(0, 0);
}, 60));

// ── Start ──────────────────────────────────────────────────
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
navigator.serviceWorker?.addEventListener("message", (e) => { if (e.data?.url) location.hash = "#" + (e.data.url.split("#")[1] ?? "/"); });

backend.onAuthChange((uid) => {
  if (uid && uid !== state.me) enterApp(uid);
  else if (!uid && state.me) renderLogin();
});
const uid = await backend.currentUserId();
if (uid && uid !== state.me) enterApp(uid);
else if (!uid && !state.me) renderLogin();
