// Sends a push notification to every brother when a snipe is posted.
// The app calls this right after a successful post with { snipe_id }.
// Secrets needed (Supabase → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:you@school.edu)
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};


const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const pub = Deno.env.get("VAPID_PUBLIC_KEY"), priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return json({ error: "VAPID secrets not set" }, 500);
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com", pub, priv);

  const url = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  const { snipe_id } = await req.json().catch(() => ({}));
  if (!snipe_id) return json({ error: "snipe_id required" }, 400);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Claim the snipe so each one notifies at most once.
  const { data: snipe } = await admin
    .from("snipes")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", snipe_id)
    .eq("sniper_id", user.id)
    .is("notified_at", null)
    .select("id, sniper_id, caption, is_golden, snipe_targets(target_id)")
    .maybeSingle();
  if (!snipe) return json({ sent: 0, skipped: "not yours or already sent" });

  const targetIds: string[] = snipe.snipe_targets.map((t: { target_id: string }) => t.target_id);
  const { data: people } = await admin
    .from("profiles")
    .select("id, display_name")
    .in("id", [snipe.sniper_id, ...targetIds]);
  const name = (id: string) => people?.find((p) => p.id === id)?.display_name ?? "Someone";
  const sniper = name(snipe.sniper_id);
  const targets = targetIds.map(name);
  const targetText = targets.length === 0 ? "a brother"
    : targets.length === 1 ? targets[0]
    : targets.slice(0, -1).join(", ") + " & " + targets.at(-1);

  // Did this snipe claim the bounty? If so, who has it now?
  const { data: claim } = await admin.from("bounties").select("target_id, points").eq("claim_snipe_id", snipe.id).maybeSingle();
  const { data: nextB } = claim
    ? await admin.from("bounties").select("target_id").eq("status", "active").maybeSingle()
    : { data: null };
  let nextName = "";
  if (nextB) {
    const { data: np } = await admin.from("profiles").select("display_name").eq("id", nextB.target_id).maybeSingle();
    nextName = np?.display_name ?? "";
  }

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("endpoint, user_id, p256dh, auth")
    .neq("user_id", snipe.sniper_id);

  let sent = 0;
  await Promise.all((subs ?? []).map(async (s) => {
    const caught = targetIds.includes(s.user_id);
    const isNextBounty = nextB && nextB.target_id === s.user_id;
    let title: string, body: string, url = "/#/snipe/" + snipe.id;
    if (isNextBounty) {
      title = "👀 There's a bounty on you";
      body = sniper + " just claimed the last one. Whoever snipes you first gets the points.";
      url = "/#/bounty";
    } else if (snipe.is_golden) {
      title = caught ? "✨ You got Golden Sniped!" : "✨ " + sniper + " hit the Golden Snipe";
      body = caught ? sniper + " caught you on this week's Golden Snipe (+5 for them)." : sniper + " sniped " + targetText + " for +5 🏆. Tap to see it.";
    } else if (caught) {
      title = claim ? "🏆 " + sniper + " claimed your bounty" : "🎯 You got sniped!";
      body = sniper + " caught you" + (claim ? " for +" + claim.points + " pts." : snipe.caption ? ": “" + snipe.caption + "”" : ".");
    } else if (claim) {
      title = "🏆 " + sniper + " claimed the bounty on " + targetText + " (+" + claim.points + ")";
      body = nextName ? "New bounty: " + nextName + ". Go get them." : "Tap to see the snipe";
    } else {
      title = "🎯 " + sniper + " sniped " + targetText;
      body = snipe.caption || "Tap to see the snipe";
    }
    const payload = JSON.stringify({ title, body, url, tag: "snipe-" + snipe.id });
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 12 });
      sent++;
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
    }
  }));

  return json({ sent });
});
