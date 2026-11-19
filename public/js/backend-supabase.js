import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const BUCKET = "snipes";
const SIGNED_URL_TTL = 60 * 60 * 6;

export function createSupabaseBackend(cfg) {
  const sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  const urlCache = new Map(); // path -> { url, exp }

  async function signed(paths) {
    const now = Date.now();
    const need = [...new Set(paths.filter((p) => p && !(urlCache.get(p)?.exp > now)))];
    if (need.length) {
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(need, SIGNED_URL_TTL);
      if (error) throw error;
      for (const d of data) if (d.signedUrl) urlCache.set(d.path, { url: d.signedUrl, exp: now + (SIGNED_URL_TTL - 300) * 1000 });
    }
    return (p) => (p ? urlCache.get(p)?.url ?? null : null);
  }

  async function uid() {
    const { data } = await sb.auth.getSession();
    return data.session?.user.id ?? null;
  }

  const SNIPE_COLS = "id, sniper_id, photo_path, caption, location, created_at, is_golden, snipe_targets(target_id), reactions(emoji, user_id), comments(count), bounties(points, target_id)";

  async function normalize(rows) {
    const url = await signed(rows.map((r) => r.photo_path));
    return rows.map((r) => {
      const reactions = {};
      for (const x of r.reactions) (reactions[x.emoji] ??= []).push(x.user_id);
      return {
        id: r.id,
        sniper_id: r.sniper_id,
        target_ids: r.snipe_targets.map((t) => t.target_id),
        photo_url: url(r.photo_path),
        photo_path: r.photo_path,
        caption: r.caption,
        location: r.location,
        created_at: r.created_at,
        reactions,
        comment_count: r.comments?.[0]?.count ?? 0,
        golden: !!r.is_golden,
        bounty: r.bounties?.[0] ?? null, // { points, target_id } when this snipe claimed a bounty
      };
    });
  }

  return {
    demo: false,

    async currentUserId() { return uid(); },
    onAuthChange(cb) { sb.auth.onAuthStateChange((_e, session) => cb(session?.user.id ?? null)); },

    async sendCode(email) {
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname } });
      if (error) {
        if (/database error|not_on_roster/i.test(error.message)) throw new Error("That email isn't on the roster yet. Enter the chapter code from the GroupMe.");
        if (error.status === 429 || /rate limit|security purposes/i.test(error.message)) throw new Error("Too many code requests. Wait a minute, then try again.");
        throw error;
      }
    },
    async joinWithCode(email, code) {
      const { data, error } = await sb.rpc("join_with_code", { p_email: email, p_code: code });
      if (error) throw error;
      if (!data) throw new Error("That chapter code isn't right. Check the GroupMe for the current one.");
    },
    async verifyCode(email, token) {
      const { error } = await sb.auth.verifyOtp({ email, token, type: "email" });
      if (error) throw new Error("That code didn't work. Check it or request a new one.");
    },
    async signOut() { await sb.auth.signOut(); },

    async isAdmin() {
      const { data } = await sb.rpc("is_admin");
      return !!data;
    },

    async listMembers() {
      const { data, error } = await sb.from("profiles").select("id, email, display_name, avatar_path, bounty_opt_out, superlative_opt_out").order("display_name");
      if (error) throw error;
      const url = await signed(data.map((p) => p.avatar_path));
      return data.map((p) => ({ ...p, avatar_url: url(p.avatar_path) }));
    },

    async feed({ before, limit = 12, sniperId, targetId } = {}) {
      let q = sb.from("snipes").select(targetId ? SNIPE_COLS.replace("snipe_targets(target_id)", "snipe_targets!inner(target_id)") : SNIPE_COLS)
        .order("created_at", { ascending: false }).limit(limit);
      if (before) q = q.lt("created_at", before);
      if (sniperId) q = q.eq("sniper_id", sniperId);
      if (targetId) q = q.eq("snipe_targets.target_id", targetId);
      const { data, error } = await q;
      if (error) throw error;
      // An !inner filter trims the embedded targets to the one filtered on; refetch full tags.
      if (targetId && data.length) {
        const { data: tags } = await sb.from("snipe_targets").select("snipe_id, target_id").in("snipe_id", data.map((d) => d.id));
        for (const d of data) d.snipe_targets = tags.filter((t) => t.snipe_id === d.id);
      }
      return normalize(data);
    },

    async getSnipe(id) {
      const { data, error } = await sb.from("snipes").select(SNIPE_COLS).eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? (await normalize([data]))[0] : null;
    },

    async createSnipe({ blob, targetIds, caption, location }) {
      const me = await uid();
      const path = `${me}/${crypto.randomUUID()}.jpg`;
      const up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
      if (up.error) throw up.error;
      const { data, error } = await sb.from("snipes")
        .insert({ photo_path: path, caption: caption || null, location: location || null })
        .select("id, is_golden").single();
      if (error) { await sb.storage.from(BUCKET).remove([path]); throw error; }
      if (targetIds.length) {
        const t = await sb.from("snipe_targets").insert(targetIds.map((target_id) => ({ snipe_id: data.id, target_id })));
        if (t.error) throw t.error;
      }
      sb.functions.invoke("notify", { body: { snipe_id: data.id } }).catch(() => {});
      return { id: data.id, golden: !!data.is_golden };
    },

    async deleteSnipe(snipe) {
      const { error } = await sb.from("snipes").delete().eq("id", snipe.id);
      if (error) throw error;
      await sb.storage.from(BUCKET).remove([snipe.photo_path]);
    },

    async setReaction(snipeId, emoji, on) {
      const q = on
        ? sb.from("reactions").insert({ snipe_id: snipeId, emoji })
        : sb.from("reactions").delete().match({ snipe_id: snipeId, emoji, user_id: await uid() });
      const { error } = await q;
      if (error && error.code !== "23505") throw error;
    },

    async listComments(snipeId) {
      const { data, error } = await sb.from("comments").select("id, user_id, body, created_at").eq("snipe_id", snipeId).order("created_at");
      if (error) throw error;
      return data;
    },
    async addComment(snipeId, body) {
      const { error } = await sb.from("comments").insert({ snipe_id: snipeId, body });
      if (error) throw error;
    },
    async deleteComment(id) {
      const { error } = await sb.from("comments").delete().eq("id", id);
      if (error) throw error;
    },

    async leaderboard(since) {
      const { data, error } = await sb.rpc("leaderboard", since ? { since: since.toISOString() } : {});
      if (error) throw error;
      return data;
    },

    async updateProfile({ display_name, avatarBlob }) {
      const me = await uid();
      const patch = {};
      if (display_name) patch.display_name = display_name;
      if (avatarBlob) {
        const path = `${me}/avatar-${Date.now()}.jpg`;
        const up = await sb.storage.from(BUCKET).upload(path, avatarBlob, { contentType: "image/jpeg" });
        if (up.error) throw up.error;
        patch.avatar_path = path;
      }
      const { error } = await sb.from("profiles").update(patch).eq("id", me);
      if (error) throw error;
    },

    async getJoinCode() {
      const { data, error } = await sb.from("chapter_settings").select("join_code").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data?.join_code ?? null;
    },
    async setJoinCode(code) {
      const { error } = await sb.from("chapter_settings").update({ join_code: code }).eq("id", 1);
      if (error) throw error;
    },

    async getBounty() {
      const { data, error } = await sb.rpc("current_bounty");
      if (error) throw error;
      const b = data?.[0];
      return b ? { id: b.bounty_id, target_id: b.bounty_target, started_at: b.bounty_started, points: b.bounty_points } : null;
    },
    async bountyHistory(limit = 15) {
      const { data, error } = await sb.from("bounties")
        .select("id, target_id, status, claimed_by, claim_snipe_id, points, started_at, ended_at")
        .in("status", ["claimed", "escaped"]).order("ended_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return data;
    },
    async bountyBoard(since) {
      const { data, error } = await sb.rpc("bounty_board", since ? { since: since.toISOString() } : {});
      if (error) throw error;
      return data;
    },
    async setBountyOptOut(optOut) {
      const { error } = await sb.from("profiles").update({ bounty_opt_out: optOut }).eq("id", await uid());
      if (error) throw error;
    },

    async superlativeToday() {
      const { data, error } = await sb.rpc("superlative_today");
      if (error) throw error;
      return data?.[0] ?? null;
    },
    async voteSuperlative(nomineeId) {
      const { error } = await sb.rpc("cast_superlative_vote", { p_nominee: nomineeId });
      if (!error) return;
      const m = error.message || "";
      if (/voting_closed/.test(m)) throw new Error("Voting on this one is closed. Results are out!");
      if (/no_self_vote/.test(m)) throw new Error("Nice try. You can't vote for yourself.");
      if (/not_eligible/.test(m)) throw new Error("That brother has opted out of superlatives.");
      throw error;
    },
    async superlativeWeek(ref) {
      const { data, error } = await sb.rpc("superlative_week", ref ? { p_ref: ref } : {});
      if (error) throw error;
      return data ?? [];
    },
    async swapSuperlative() {
      const { error } = await sb.rpc("swap_superlative");
      if (error) throw new Error(/already_has_votes/.test(error.message) ? "People already voted on this one, so it stays." : error.message);
    },
    async setSuperlativeOptOut(optOut) {
      const { error } = await sb.from("profiles").update({ superlative_opt_out: optOut }).eq("id", await uid());
      if (error) throw error;
    },

    async achievements(userId) {
      const { data, error } = await sb.rpc("achievements", { p_user: userId || await uid() });
      if (error) throw error;
      return data ?? [];
    },

    // Senior messages (supabase/senior-ticker.sql). Authors are never sent to members.
    async seniorLive() {
      const { data, error } = await sb.rpc("senior_live");
      if (error) throw error;
      return data ?? [];
    },
    async seniorStatus() {
      const { data, error } = await sb.rpc("senior_status");
      if (error) throw error;
      return data ?? { is_senior: false };
    },
    async seniorPost(body) {
      const { data, error } = await sb.rpc("senior_post", { p_body: body });
      if (error) throw new Error(/too_long/.test(error.message) ? "Keep it to 140 characters." : /empty/.test(error.message) ? "Write something first." : /seniors_only/.test(error.message) ? "Only seniors can post here." : error.message);
      return data;
    },
    async seniorWithdraw() {
      const { error } = await sb.rpc("senior_withdraw");
      if (error) throw error;
    },
    async seniorList() {
      const { data, error } = await sb.rpc("senior_list");
      if (error) throw error;
      return (data ?? []).map((r) => r.user_id);
    },
    async setSenior(userId, on) {
      const { error } = await sb.rpc("set_senior", { p_user: userId, p_on: on });
      if (error) throw error;
    },
    async seniorPostsAdmin() {
      const { data, error } = await sb.rpc("senior_posts_admin");
      if (error) throw error;
      return data ?? [];
    },
    async seniorRemove(id) {
      const { error } = await sb.rpc("senior_remove", { p_id: id });
      if (error) throw error;
    },

    async blackBoxDrop(body) {
      const { error } = await sb.rpc("black_box_drop", { p_body: body });
      if (error) throw new Error(/too_long/.test(error.message) ? "Keep it under 1,000 characters." : /empty/.test(error.message) ? "Write something first." : error.message);
    },
    async blackBoxWaiting() {
      const { data, error } = await sb.rpc("black_box_waiting");
      if (error) throw error;
      return data ?? 0;
    },
    async blackBoxList(includeRead = false) {
      const { data, error } = await sb.rpc("black_box_list", { p_include_read: includeRead });
      if (error) throw error;
      return data ?? [];
    },
    async blackBoxMark(id, read) {
      const { error } = await sb.rpc("black_box_mark", { p_id: id, p_read: read });
      if (error) throw error;
    },
    async blackBoxDelete(id) {
      const { error } = await sb.rpc("black_box_delete", { p_id: id });
      if (error) throw error;
    },

    async listRoster() {
      const { data, error } = await sb.from("allowed_emails").select("email, is_admin, via_code, added_at").order("email");
      if (error) throw error;
      return data;
    },
    async addToRoster(emails, isAdmin = false) {
      const rows = emails.map((email) => ({ email: email.toLowerCase(), is_admin: isAdmin }));
      const { error } = await sb.from("allowed_emails").upsert(rows, { onConflict: "email", ignoreDuplicates: true });
      if (error) throw error;
    },
    async setRosterAdmin(email, isAdmin) {
      const { error } = await sb.from("allowed_emails").update({ is_admin: isAdmin }).eq("email", email);
      if (error) throw error;
    },
    async removeFromRoster(email) {
      const { error } = await sb.from("allowed_emails").delete().eq("email", email);
      if (error) throw error;
    },

    async savePushSubscription(sub) {
      const j = sub.toJSON();
      const { error } = await sb.from("push_subscriptions").upsert(
        { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_id: await uid() },
        { onConflict: "endpoint" },
      );
      if (error) throw error;
    },
    async removePushSubscription(endpoint) {
      await sb.from("push_subscriptions").delete().eq("endpoint", endpoint);
    },

    onNewSnipe(cb) {
      const ch = sb.channel("snipes-feed")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "snipes" }, (p) => cb(p.new))
        .subscribe();
      return () => sb.removeChannel(ch);
    },
  };
}
