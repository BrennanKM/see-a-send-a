// In-memory stand-in for Supabase so the app can be tried before any setup.
// Nothing is saved: a reload resets everything.

const NAMES = ["Brennan Martin", "Jake Alvarez", "Marcus Chen", "Tyler Brooks", "Owen Patel", "Luke Harrington",
  "Diego Ramirez", "Sam Whitaker", "Noah Kim", "Chris Dalton", "Ethan Wu", "Ryan O'Neill"];
const PLACES = ["Library steps", "Outside the UC", "Parking structure", "Dining hall", "Business school lawn", "Gym", "", ""];
const CAPTIONS = ["Caught lacking 📸", "Thought you could hide?", "Mid-bite. No mercy.", "Walking like he owns the place",
  "Zoomed in 10x for this one", "Didn't even see me", "", "Clock in, brother"];
const EMOJI = ["🎯", "🔥", "😂", "💀", "👀"];

function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }

// A long-lens "snipe" scene: sky, campus buildings, a tiny figure far away.
function scene(seed) {
  const r = rng(seed * 7919 + 13);
  const c = document.createElement("canvas");
  c.width = 900; c.height = 1125;
  const g = c.getContext("2d");
  const hue = 190 + r() * 40;
  const sky = g.createLinearGradient(0, 0, 0, 700);
  sky.addColorStop(0, `hsl(${hue} 60% ${55 + r() * 15}%)`);
  sky.addColorStop(1, `hsl(${hue + 20} 50% 85%)`);
  g.fillStyle = sky; g.fillRect(0, 0, 900, 1125);
  for (let i = 0; i < 6; i++) {
    const x = r() * 900, w = 120 + r() * 260, h = 180 + r() * 380;
    g.fillStyle = `hsl(${20 + r() * 20} ${25 + r() * 20}% ${55 + r() * 20}%)`;
    g.fillRect(x - w / 2, 720 - h, w, h);
    g.fillStyle = "rgba(40,50,70,.35)";
    for (let wy = 720 - h + 30; wy < 690; wy += 50) for (let wx = x - w / 2 + 18; wx < x + w / 2 - 20; wx += 40) g.fillRect(wx, wy, 18, 26);
  }
  g.fillStyle = `hsl(${95 + r() * 30} 35% 42%)`; g.fillRect(0, 720, 900, 405);
  g.fillStyle = "hsl(35 15% 72%)";
  g.beginPath(); g.moveTo(380, 720); g.lineTo(520, 720); g.lineTo(760, 1125); g.lineTo(140, 1125); g.fill();
  for (let i = 0; i < 4; i++) {
    const tx = r() * 900, ty = 700 + r() * 40;
    g.fillStyle = "hsl(28 30% 28%)"; g.fillRect(tx - 6, ty - 60, 12, 70);
    g.fillStyle = `hsl(${100 + r() * 30} 40% 30%)`; g.beginPath(); g.arc(tx, ty - 90, 50 + r() * 20, 0, 7); g.fill();
  }
  const px = 330 + r() * 240, py = 820 + r() * 120, s = 0.9 + r() * 0.5;
  g.fillStyle = `hsl(${r() * 360} 55% 45%)`;
  g.fillRect(px - 13 * s, py - 62 * s, 26 * s, 42 * s);
  g.fillStyle = "hsl(220 25% 22%)";
  g.fillRect(px - 12 * s, py - 22 * s, 10 * s, 36 * s); g.fillRect(px + 2 * s, py - 22 * s, 10 * s, 36 * s);
  g.fillStyle = "hsl(28 45% 62%)"; g.beginPath(); g.arc(px, py - 74 * s, 11 * s, 0, 7); g.fill();
  // lens vignette + grain for the zoomed-in look
  const v = g.createRadialGradient(450, 560, 250, 450, 560, 760);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.45)");
  g.fillStyle = v; g.fillRect(0, 0, 900, 1125);
  const img = g.getImageData(0, 0, 900, 1125);
  for (let i = 0; i < img.data.length; i += 4) { const n = (r() - 0.5) * 22; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  g.putImageData(img, 0, 0);
  return c.toDataURL("image/jpeg", 0.8);
}

export function createDemoBackend() {
  const members = NAMES.map((n, i) => ({ id: `u${i}`, email: n.split(" ")[0].toLowerCase() + "@example.edu", display_name: n, avatar_url: null, bounty_opt_out: false, superlative_opt_out: false }));
  const roster = members.map((m, i) => ({ email: m.email, is_admin: i === 0, added_at: new Date().toISOString() }));
  const r = rng(42);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const now = Date.now();
  let snipes = [], comments = [];
  for (let i = 0; i < 14; i++) {
    const sniper = pick(members);
    let target = pick(members); while (target === sniper) target = pick(members);
    const targets = [target.id];
    if (r() < 0.2) { const t2 = pick(members); if (t2 !== sniper && t2 !== target) targets.push(t2.id); }
    const reactions = {};
    for (const e of EMOJI) { const n = Math.floor(r() * (e === "🎯" ? 7 : 4)); if (n) reactions[e] = members.slice().sort(() => r() - 0.5).slice(0, n).map((m) => m.id).filter((id) => id !== "u0"); }
    const id = `s${i}`;
    snipes.push({ id, sniper_id: sniper.id, target_ids: targets, photo_url: null, _seed: i + 1, caption: pick(CAPTIONS), location: pick(PLACES),
      created_at: new Date(now - (i * 9 + r() * 8) * 3600e3 - 20 * 60e3).toISOString(), reactions });
    const nc = Math.floor(r() * 4);
    for (let k = 0; k < nc; k++) comments.push({ id: `c${i}-${k}`, snipe_id: id, user_id: pick(members).id,
      body: pick(["LMAOOO", "he had no idea", "the zoom on this 💀", "revenge incoming", "certified snipe", "bro was locked in"]),
      created_at: new Date(now - i * 9 * 3600e3 + (k + 1) * 600e3).toISOString() });
  }
  // Rolling bounty, same rules as supabase/bounty.sql.
  const value = (started) => Math.min(10, 3 + Math.floor((Date.now() - new Date(started)) / 864e5));
  let bounty = { id: "b0", target_id: "u4", started_at: new Date(now - 2.3 * 864e5).toISOString() };
  const bountyLog = [
    { id: "bh1", target_id: "u7", status: "claimed", claimed_by: "u2", claim_snipe_id: "s3", points: 5, ended_at: new Date(now - 2.3 * 864e5).toISOString() },
    { id: "bh2", target_id: "u9", status: "escaped", claimed_by: null, points: null, ended_at: new Date(now - 6 * 864e5).toISOString() },
  ];
  snipes.find((x) => x.id === "s3").bounty = { points: 5, target_id: "u7" };
  snipes.find((x) => x.id === "s6").golden = true; // a past Golden Snipe to look at
  let goldenTarget = 2, goldenSeen = 0, goldenDone = false; // demo: 2nd snipe you post turns gold
  const startBounty = (exclude) => {
    const pool = members.filter((m) => !m.bounty_opt_out && !exclude.includes(m.id));
    bounty = pool.length ? { id: `b${Date.now()}`, target_id: pool[Math.floor(Math.random() * pool.length)].id, started_at: new Date().toISOString() } : null;
  };
  // Daily superlatives, same rules as supabase/superlatives.sql (local time instead of Pacific).
  const SL_PROMPTS = [["Most likely to show up late to chapter", "bad"], ["Most likely to become a CEO", "good"],
    ["Most likely to survive a zombie apocalypse", "fun"], ["Most likely to reply-all by accident", "bad"],
    ["Best hype person before an interview", "good"], ["Most likely to accidentally go viral", "fun"],
    ["Most likely to fall asleep in class", "bad"], ["Most likely to remember everyone's birthday", "good"],
    ["Most likely to have 400 unread emails", "bad"], ["Most likely to own a boat", "fun"],
    ["Best playlist", "good"], ["Most likely to text the wrong person", "bad"], ["Most likely to have a podcast", "fun"],
    ["Most likely to give a TED talk", "good"]];
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const dow = (s) => ((parse(s).getDay() + 6) % 7) + 1; // Mon=1 … Sun=7
  const revealAt = (s) => { const d = parse(addDays(s, (7 - dow(s)) % 7)); d.setHours(18, 0, 0, 0); return d.toISOString(); };
  const slDays = {}, slVotes = {}; // day -> prompt index; day -> { voter: nominee }
  const today = () => iso(new Date());
  // Seed: last week fully voted (so results show), plus earlier days this week.
  for (let i = 1; i <= 13; i++) {
    const d = addDays(today(), -i);
    slDays[d] = i % SL_PROMPTS.length;
    slVotes[d] = {};
    for (const v of members.slice(1)) if (r() < 0.8) {
      let n = members[Math.floor(Math.pow(r(), 1.8) * members.length)];
      if (n.id === v.id) n = members[0];
      slVotes[d][v.id] = n.id;
    }
  }
  const ensureDay = (d) => (slDays[d] ??= Object.keys(slDays).length % SL_PROMPTS.length, slVotes[d] ??= {}, slDays[d]);
  const slRow = (d) => {
    const [prompt, tone] = SL_PROMPTS[ensureDay(d)];
    const votes = slVotes[d], revealed = Date.now() >= new Date(revealAt(d));
    const counts = {}; for (const n of Object.values(votes)) counts[n] = (counts[n] || 0) + 1;
    return { day: d, prompt, tone, revealed, reveal_at: revealAt(d), total_votes: Object.keys(votes).length, my_vote: votes[me] ?? null,
      results: revealed ? Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([nominee_id, n]) => ({ nominee_id, votes: n })) : null };
  };
  const photo = (s) => (s.photo_url ??= scene(s._seed));
  let me = null;
  const seniors = new Set(["u0", "u3"]);
  const liveSP = (x) => !x.removed_at && new Date(x.expires_at) > new Date();
  const seniorPosts = [
    { id: "sp1", author_id: "u3", body: "Whoever keeps leaving the chapter room unlocked: we know. Fix it.", created_at: new Date(Date.now() - 3 * 36e5).toISOString(), expires_at: new Date(Date.now() + 21 * 36e5).toISOString(), removed_at: null },
  ];
  const blackBox = [
    { id: "bb1", body: "Whoever keeps leaving the chapter room fridge door open: we know. We will find you.", dropped_on: iso(new Date(now - 2 * 864e5)), read_at: null },
    { id: "bb2", body: "Shoutout to the person who brought donuts to the last meeting. You're the real MVP.", dropped_on: iso(new Date(now - 864e5)), read_at: null },
    { id: "bb3", body: "Can we please do a beach day before it gets cold", dropped_on: iso(new Date(now - 6 * 864e5)), read_at: new Date(now - 5 * 864e5).toISOString() },
  ];
  let joinCode = "DSP-DEMO";
  const authCbs = [];
  const newCbs = [];
  const wait = (ms = 150) => new Promise((res) => setTimeout(res, ms));
  const view = (s) => ({ ...s, photo_url: photo(s), comment_count: comments.filter((c) => c.snipe_id === s.id).length });

  return {
    demo: true,
    async currentUserId() { return me; },
    onAuthChange(cb) { authCbs.push(cb); },
    async sendCode(email) {
      await wait();
      if (!email.includes("@")) throw new Error("Enter a valid email.");
    },
    async joinWithCode(email, code) {
      await wait();
      if (code.trim().toLowerCase() !== joinCode?.toLowerCase()) throw new Error(`Wrong chapter code (demo code is ${joinCode}).`);
      if (!roster.some((x) => x.email === email)) roster.push({ email, is_admin: false, via_code: true, added_at: new Date().toISOString() });
    },
    async getJoinCode() { return joinCode; },
    async setJoinCode(code) { joinCode = code; },
    async verifyCode(_email, code) {
      await wait();
      if (!/^\d{6,10}$/.test(code)) throw new Error("In demo mode any digits work.");
      me = "u0"; authCbs.forEach((cb) => cb(me));
    },
    async signOut() { me = null; authCbs.forEach((cb) => cb(null)); },
    async isAdmin() { return me === "u0"; },
    async listMembers() { return members.map((m) => ({ ...m })).sort((a, b) => a.display_name.localeCompare(b.display_name)); },
    async feed({ before, limit = 12, sniperId, targetId } = {}) {
      await wait();
      return snipes
        .filter((s) => (!before || s.created_at < before) && (!sniperId || s.sniper_id === sniperId) && (!targetId || s.target_ids.includes(targetId)))
        .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit).map(view);
    },
    async getSnipe(id) { const s = snipes.find((x) => x.id === id); return s ? view(s) : null; },
    async createSnipe({ blob, targetIds, caption, location }) {
      await wait(600);
      const s = { id: `s${Date.now()}`, sniper_id: me, target_ids: targetIds, photo_url: URL.createObjectURL(blob), caption, location,
        created_at: new Date().toISOString(), reactions: {}, bounty: null, golden: false };
      if (!goldenDone && ++goldenSeen === goldenTarget) { s.golden = true; goldenDone = true; }
      if (bounty && targetIds.includes(bounty.target_id)) {
        const pts = value(bounty.started_at);
        bountyLog.unshift({ id: bounty.id, target_id: bounty.target_id, status: "claimed", claimed_by: me, claim_snipe_id: s.id, points: pts, ended_at: s.created_at });
        s.bounty = { points: pts, target_id: bounty.target_id };
        startBounty([bounty.target_id, me]);
      }
      snipes.unshift(s);
      newCbs.forEach((cb) => cb(s));
      return { id: s.id, golden: s.golden };
    },
    async deleteSnipe(s) {
      snipes = snipes.filter((x) => x.id !== s.id);
      const i = bountyLog.findIndex((b) => b.claim_snipe_id === s.id); if (i >= 0) bountyLog.splice(i, 1);
    },
    async getBounty() { return bounty && { ...bounty, points: value(bounty.started_at) }; },
    async bountyHistory(limit = 15) { return bountyLog.slice(0, limit); },
    async bountyBoard(since) {
      const by = {};
      for (const b of bountyLog) if (b.status === "claimed" && (!since || new Date(b.ended_at) >= since)) {
        by[b.claimed_by] ??= { user_id: b.claimed_by, points: 0, claims: 0 };
        by[b.claimed_by].points += b.points; by[b.claimed_by].claims++;
      }
      for (const s of snipes) if (s.golden && (!since || new Date(s.created_at) >= since)) {
        by[s.sniper_id] ??= { user_id: s.sniper_id, points: 0, claims: 0 };
        by[s.sniper_id].points += 5;
      }
      return Object.values(by);
    },
    async superlativeToday() {
      const row = slRow(today());
      return { day: row.day, prompt: row.prompt, tone: row.tone, votes: row.total_votes, my_vote: row.my_vote,
        voting_open: Date.now() < new Date(row.reveal_at), reveal_at: row.reveal_at };
    },
    async voteSuperlative(nomineeId) {
      await wait();
      if (nomineeId === me) throw new Error("Nice try. You can't vote for yourself.");
      ensureDay(today()); slVotes[today()][me] = nomineeId;
    },
    async superlativeWeek(ref) {
      const d = ref || today(), mon = addDays(d, -(dow(d) - 1));
      return Array.from({ length: 7 }, (_, i) => addDays(mon, i)).filter((x) => x <= today() && (x === today() || slDays[x] !== undefined)).map(slRow);
    },
    async swapSuperlative() {
      if (Object.keys(slVotes[today()] || {}).length) throw new Error("People already voted on this one, so it stays.");
      slDays[today()] = (slDays[today()] + 1) % SL_PROMPTS.length;
    },
    async setSuperlativeOptOut(optOut) { members.find((m) => m.id === me).superlative_opt_out = optOut; },
    // Demo: the snipe/bounty/golden achievements, computed the same way as supabase/achievements.sql.
    async achievements(userId = me) {
      const mine = snipes.filter((s) => s.sniper_id === userId).sort((a, b) => a.created_at.localeCompare(b.created_at));
      const day = (iso) => iso.slice(0, 10), out = [];
      const add = (key, at) => at && out.push({ key, earned_at: at });
      add("first_blood", mine[0]?.created_at);
      add("sharpshooter", mine[9]?.created_at);
      add("night_owl", mine.find((s) => { const h = new Date(s.created_at).getHours(); return h >= 2 && h < 5; })?.created_at);
      const perDay = {}, perPair = {};
      for (const s of mine) {
        if (++(perDay[day(s.created_at)] ??= { n: 0 }).n === 3) add("hat_trick", s.created_at);
        for (const t of s.target_ids) if (++(perPair[t + day(s.created_at)] ??= { n: 0 }).n === 2) add("double_tap", s.created_at);
      }
      const claims = bountyLog.filter((b) => b.status === "claimed" && b.claimed_by === userId);
      add("bounty_hunter", claims[2]?.ended_at);
      add("midas", mine.find((s) => s.golden)?.created_at);
      const hits = snipes.filter((s) => s.target_ids.includes(userId) && s.sniper_id !== userId);
      add("most_wanted", hits.length >= 10 ? hits[9].created_at : null);
      const seen = new Set();
      return out.filter((a) => !seen.has(a.key) && seen.add(a.key)).sort((a, b) => a.earned_at.localeCompare(b.earned_at));
    },
    // Demo version of supabase/ticker.sql (a subset of the same items).
    async ticker() {
      const name = (id) => members.find((m) => m.id === id)?.display_name ?? "Someone";
      const sorted = snipes.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
      const todayN = snipes.filter((s) => s.created_at.slice(0, 10) === iso(new Date())).length;
      const items = [{ icon: "🎯", href: "#/", text: todayN ? `${todayN} snipe${todayN === 1 ? "" : "s"} so far today` : "No snipes yet today. Someone get it started." }];
      const last = sorted[0];
      if (last) items.push({ icon: "⏱️", href: `#/snipe/${last.id}`, text: `Latest: ${name(last.sniper_id)} sniped ${last.target_ids.map(name).join(" & ")}` });
      const week = snipes.filter((s) => Date.now() - new Date(s.created_at) < 7 * 864e5), by = {};
      for (const s of week) by[s.sniper_id] = (by[s.sniper_id] || 0) + 1;
      const top = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] >= 2) items.push({ icon: "🔥", href: `#/u/${top[0]}`, text: `Top sniper this week: ${name(top[0])} (${top[1]})` });
      if (bounty) items.push({ icon: "🏆", href: "#/bounty", text: `Bounty: ${name(bounty.target_id)} is worth ${value(bounty.started_at)} pts` });
      const d = slRow(iso(new Date()));
      items.push({ icon: "🗳️", href: "#/daily", text: `Today's Daily: ${d.prompt} · ${d.total_votes} vote${d.total_votes === 1 ? "" : "s"}` });
      const g = snipes.find((s) => s.golden && Date.now() - new Date(s.created_at) < 7 * 864e5);
      items.push(g ? { icon: "✨", href: `#/snipe/${g.id}`, text: `${name(g.sniper_id)} hit this week's Golden Snipe` } : { icon: "✨", href: "#/", text: "This week's Golden Snipe is still out there…" });
      items.push({ icon: "👑", href: "#/daily", text: `${name("u4")} was voted most likely to show up late to chapter` });
      items.push({ icon: "📈", href: "#/leaders", text: `${snipes.length} snipes all time` });
      return items;
    },
    // Senior messages: same rules as supabase/senior-ticker.sql. u0 (you) and u3 start as seniors.
    async seniorLive() { return seniorPosts.filter(liveSP).map(({ id, body }) => ({ id, body })); },
    async seniorStatus() {
      if (!seniors.has(me)) return { is_senior: false };
      const p = seniorPosts.find((x) => x.author_id === me && liveSP(x));
      return { is_senior: true, post: p ? { id: p.id, body: p.body, expires_at: p.expires_at } : null };
    },
    async seniorPost(body) {
      await wait();
      if (!seniors.has(me)) throw new Error("Only seniors can post here.");
      const b = body.replace(/\s+/g, " ").trim();
      if (!b) throw new Error("Write something first.");
      if (b.length > 140) throw new Error("Keep it to 140 characters.");
      seniorPosts.filter((x) => x.author_id === me && liveSP(x)).forEach((x) => (x.removed_at = new Date().toISOString()));
      const p = { id: `sp${Date.now()}`, author_id: me, body: b, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 864e5).toISOString(), removed_at: null };
      seniorPosts.push(p);
      return { id: p.id, body: p.body, expires_at: p.expires_at };
    },
    async seniorWithdraw() { seniorPosts.filter((x) => x.author_id === me && liveSP(x)).forEach((x) => (x.removed_at = new Date().toISOString())); },
    async seniorList() { if (me !== "u0") throw new Error("admins_only"); return [...seniors]; },
    async setSenior(userId, on) {
      if (me !== "u0") throw new Error("admins_only");
      if (on) seniors.add(userId);
      else { seniors.delete(userId); seniorPosts.filter((x) => x.author_id === userId && liveSP(x)).forEach((x) => (x.removed_at = new Date().toISOString())); }
    },
    async seniorPostsAdmin() { if (me !== "u0") throw new Error("admins_only"); return seniorPosts.filter(liveSP).map(({ id, body, author_id, created_at, expires_at }) => ({ id, body, author_id, created_at, expires_at })); },
    async seniorRemove(id) { const p = seniorPosts.find((x) => x.id === id); if (p) p.removed_at = new Date().toISOString(); },
    // Black box: no author stored, same as supabase/black-box.sql.
    async blackBoxDrop(body) {
      await wait();
      const b = body.trim();
      if (!b) throw new Error("Write something first.");
      blackBox.push({ id: `bb${Math.random().toString(36).slice(2)}`, body: b, dropped_on: iso(new Date()), read_at: null });
    },
    async blackBoxWaiting() { return blackBox.filter((n) => !n.read_at).length; },
    async blackBoxList(includeRead = false) {
      if (me !== "u0") throw new Error("admins_only");
      return blackBox.filter((n) => includeRead || !n.read_at).sort((a, b) => !!a.read_at - !!b.read_at || a.dropped_on.localeCompare(b.dropped_on));
    },
    async blackBoxMark(id, read) { const n = blackBox.find((x) => x.id === id); if (n) n.read_at = read ? new Date().toISOString() : null; },
    async blackBoxDelete(id) { const i = blackBox.findIndex((x) => x.id === id); if (i >= 0) blackBox.splice(i, 1); },
    async setBountyOptOut(optOut) {
      members.find((m) => m.id === me).bounty_opt_out = optOut;
      if (optOut && bounty?.target_id === me) startBounty([me]);
    },
    async setReaction(snipeId, emoji, on) {
      const s = snipes.find((x) => x.id === snipeId);
      const list = (s.reactions[emoji] ??= []);
      if (on && !list.includes(me)) list.push(me);
      if (!on) s.reactions[emoji] = list.filter((u) => u !== me);
    },
    async listComments(snipeId) { await wait(); return comments.filter((c) => c.snipe_id === snipeId).sort((a, b) => a.created_at.localeCompare(b.created_at)); },
    async addComment(snipeId, body) { comments.push({ id: `c${Date.now()}`, snipe_id: snipeId, user_id: me, body, created_at: new Date().toISOString() }); },
    async deleteComment(id) { comments = comments.filter((c) => c.id !== id); },
    async leaderboard(since) {
      await wait();
      const recent = snipes.filter((s) => !since || new Date(s.created_at) >= since);
      return members.map((m) => ({ user_id: m.id, snipes: recent.filter((s) => s.sniper_id === m.id).length,
        sniped: recent.filter((s) => s.target_ids.includes(m.id)).length }));
    },
    async updateProfile({ display_name, avatarBlob }) {
      const m = members.find((x) => x.id === me);
      if (display_name) m.display_name = display_name;
      if (avatarBlob) m.avatar_url = URL.createObjectURL(avatarBlob);
    },
    async listRoster() { return roster.slice().sort((a, b) => a.email.localeCompare(b.email)); },
    async addToRoster(emails, isAdmin = false) {
      for (const e of emails) if (!roster.some((x) => x.email === e)) roster.push({ email: e.toLowerCase(), is_admin: isAdmin, added_at: new Date().toISOString() });
    },
    async setRosterAdmin(email, isAdmin) { roster.find((x) => x.email === email).is_admin = isAdmin; },
    async removeFromRoster(email) { roster.splice(roster.findIndex((x) => x.email === email), 1); },
    async savePushSubscription() {},
    async removePushSubscription() {},
    onNewSnipe(cb) { newCbs.push(cb); return () => {}; },
  };
}
