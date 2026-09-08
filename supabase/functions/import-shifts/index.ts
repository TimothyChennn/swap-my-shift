// Imports shifts from each user's Qgenda calendar subscription (ICS feed)
// into the shifts table.
//
// Called two ways:
// - By the app with the user's JWT: imports just that user.
// - By a cron job with the service role key: imports everyone with a link.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

import { parseIcs } from "./ics.ts";

type Target = { id: string; group_id: string; calendar_url: string };
type Result = { user_id: string; imported?: number; error?: string };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  let targets: Target[];

  if (token && token === serviceKey) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, group_id, calendar_url")
      .not("calendar_url", "is", null)
      .not("group_id", "is", null);
    if (error) return json({ error: error.message }, 500);
    targets = data as Target[];
  } else {
    const { data: userData } = await admin.auth.getUser(token);
    if (!userData.user) return json({ error: "Not signed in" }, 401);
    const { data } = await admin
      .from("profiles")
      .select("id, group_id, calendar_url")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!data?.calendar_url) return json({ error: "Save your Qgenda link first" }, 400);
    if (!data.group_id) return json({ error: "Join a group first" }, 400);
    targets = [data as Target];
  }

  const results: Result[] = [];
  for (const target of targets) results.push(await importFor(admin, target));
  return json({ results });
});

async function importFor(admin: SupabaseClient, target: Target): Promise<Result> {
  try {
    const url = target.calendar_url.trim().replace(/^webcal:\/\//i, "https://");
    const response = await fetch(url, { headers: { "User-Agent": "SwapMyShift/1.0" } });
    if (!response.ok) throw new Error(`Calendar link returned HTTP ${response.status}`);
    const events = parseIcs(await response.text());
    if (events.length === 0 && !/BEGIN:VCALENDAR/i.test(await response.clone().text().catch(() => ""))) {
      throw new Error("That link doesn't look like a calendar feed");
    }

    // One row per UID; a feed occasionally repeats an instance.
    const byUid = new Map<string, (typeof events)[number]>();
    for (const event of events) byUid.set(event.uid, event);
    const rows = [...byUid.values()].map((event) => ({
      user_id: target.id,
      group_id: target.group_id,
      starts_at: event.start.toISOString(),
      ends_at: event.end.toISOString(),
      shift_type: event.summary,
      source: "import",
      external_id: event.uid,
    }));

    if (rows.length > 0) {
      const { error } = await admin
        .from("shifts")
        .upsert(rows, { onConflict: "user_id,external_id" });
      if (error) throw error;
    }

    // Drop imported shifts that fell out of the feed (cancelled or re-keyed).
    const { data: existing, error: existingError } = await admin
      .from("shifts")
      .select("id, external_id")
      .eq("user_id", target.id)
      .eq("source", "import");
    if (existingError) throw existingError;
    const stale = (existing ?? [])
      .filter((row) => !byUid.has(row.external_id))
      .map((row) => row.id);
    for (let i = 0; i < stale.length; i += 200) {
      const { error } = await admin.from("shifts").delete().in("id", stale.slice(i, i + 200));
      if (error) throw error;
    }

    await admin
      .from("profiles")
      .update({ calendar_synced_at: new Date().toISOString(), calendar_error: null })
      .eq("id", target.id);
    return { user_id: target.id, imported: rows.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from("profiles")
      .update({ calendar_synced_at: new Date().toISOString(), calendar_error: message })
      .eq("id", target.id);
    return { user_id: target.id, error: message };
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
