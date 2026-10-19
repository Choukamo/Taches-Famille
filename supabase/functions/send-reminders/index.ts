// Edge Function : envoie les notifications (nouvelle tâche, rappels, résultat de roulette).
// Appelée toutes les 5 min par pg_cron (header x-cron-secret) et juste après la
// création d'une tâche par l'appli (JWT utilisateur + task_id).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const TZ = "Europe/Paris";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

type Member = {
  id: string; name: string; avail_start: string; avail_end: string;
  alternating: boolean; present_week_start: string | null;
};
type Assignee = { task_id: string; member_id: string; last_notified_at: string | null; notify_count: number };
type Task = {
  id: string; title: string; note: string | null; created_by: string; scheduled_date: string;
  interval_minutes: number; mode: "direct" | "roulette"; candidates: string[]; status: string;
  roulette_notified_at: string | null; created_at: string; task_assignees: Assignee[];
};
type Sub = { id: string; member_id: string; endpoint: string; p256dh: string; auth: string };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function parisParts(d: Date) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
  });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(d)) p[x.type] = x.value;
  const hour = Number(p.hour) % 24;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: hour * 60 + Number(p.minute),
    weekday: p.weekday,
  };
}

function mondayOf(dateStr: string): Date {
  const d = new Date(dateStr + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // lundi = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d;
}

export function isPresentOn(m: Member, dateStr: string): boolean {
  if (!m.alternating || !m.present_week_start) return true;
  const weeks = Math.round((mondayOf(dateStr).getTime() - mondayOf(m.present_week_start).getTime()) / (7 * 86400000));
  return ((weeks % 2) + 2) % 2 === 0;
}

function toMinutes(t: string): number {
  const [h, mi] = t.split(":").map(Number);
  return h * 60 + mi;
}

export function isAvailableNow(m: Member, now: Date): boolean {
  const { date, minutes } = parisParts(now);
  if (!isPresentOn(m, date)) return false;
  const start = toMinutes(m.avail_start), end = toMinutes(m.avail_end);
  if (start === end) return true;
  if (start < end) return minutes >= start && minutes < end;
  return minutes >= start || minutes < end; // fenêtre qui passe minuit
}

function frDate(dateStr: string, today: string): string {
  if (dateStr === today) return "aujourd'hui";
  const d = new Date(dateStr + "T12:00:00Z");
  const t = new Date(today + "T12:00:00Z");
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff === 1) return "demain";
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(d);
}

function listNames(ids: string[], members: Map<string, Member>): string {
  const names = ids.map((i) => members.get(i)?.name ?? "?");
  if (names.length <= 1) return names.join("");
  return names.slice(0, -1).join(", ") + " et " + names[names.length - 1];
}

async function sendTo(memberId: string, subs: Sub[], payload: Record<string, unknown>) {
  const mine = subs.filter((s) => s.member_id === memberId);
  let sent = 0;
  for (const s of mine) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 3600, urgency: "high" },
      );
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      console.error("push failed", s.endpoint.slice(0, 40), code, (e as Error).message);
      if (code === 404 || code === 410) {
        await admin.from("push_subscriptions").delete().eq("id", s.id);
      }
    }
  }
  return sent;
}

type Trade = {
  id: string; from_member: string; to_member: string; requested: string[]; offered: string[]; message: string | null;
  status: "pending" | "accepted" | "declined" | "cancelled"; notified_at: string | null; result_notified_at: string | null;
};

async function processTrades(onlyTradeId: string | null, members: Map<string, Member>, subs: Sub[], now: Date, summary: string[], logs: Record<string, unknown>[]) {
  let q = admin.from("trades").select("*")
    .or("and(status.eq.pending,notified_at.is.null),and(status.in.(accepted,declined),result_notified_at.is.null)");
  if (onlyTradeId) q = q.eq("id", onlyTradeId);
  const { data, error } = await q;
  if (error) throw error;
  const trades = (data ?? []) as Trade[];
  if (!trades.length) return;
  const ids = [...new Set(trades.flatMap((t) => [...t.requested, ...t.offered]))];
  const { data: tasksRaw } = await admin.from("tasks").select("id, title").in("id", ids);
  const titles = new Map<string, string>((tasksRaw ?? []).map((t: { id: string; title: string }) => [t.id, t.title]));
  const list = (arr: string[]) => arr.map((i) => titles.get(i) ?? "?").join(", ");

  for (const tr of trades) {
    const from = members.get(tr.from_member), to = members.get(tr.to_member);
    if (!from || !to) continue;
    if (tr.status === "pending") {
      if (!isAvailableNow(to, now)) continue;
      const title = `${from.name} te propose un échange`;
      const body = tr.offered.length
        ? `${from.name} prend : ${list(tr.requested)}. En échange tu fais : ${list(tr.offered)}.`
        : `${from.name} se propose de faire à ta place : ${list(tr.requested)}.`;
      const sent = await sendTo(to.id, subs, { title, body, tag: `trade-${tr.id}`, url: `./?trade=${tr.id}` });
      await admin.from("trades").update({ notified_at: now.toISOString() }).eq("id", tr.id);
      logs.push({ member_id: to.id, task_id: null, kind: "trade", title, body });
      summary.push(`trade ${to.name} (${sent} appareil(s))`);
    } else {
      if (!isAvailableNow(from, now)) continue;
      const ok = tr.status === "accepted";
      const title = ok ? `${to.name} a accepté ton échange` : `${to.name} a refusé ton échange`;
      const body = ok ? `Tu fais maintenant : ${list(tr.requested)}.` : `Pas d'échange pour : ${list(tr.requested)}.`;
      const sent = await sendTo(from.id, subs, { title, body, tag: `trade-${tr.id}`, url: `./` });
      await admin.from("trades").update({ result_notified_at: now.toISOString() }).eq("id", tr.id);
      logs.push({ member_id: from.id, task_id: null, kind: ok ? "trade_accepted" : "trade_declined", title, body });
      summary.push(`trade-${tr.status} ${from.name} (${sent} appareil(s))`);
    }
  }
}

async function process(onlyTaskId: string | null, onlyTradeId: string | null = null) {
  const now = new Date();
  const { date: today } = parisParts(now);

  const [{ data: membersRaw }, { data: subsRaw }] = await Promise.all([
    admin.from("members").select("*"),
    admin.from("push_subscriptions").select("*"),
  ]);
  const members = new Map<string, Member>((membersRaw ?? []).map((m: Member) => [m.id, m]));
  const subs = (subsRaw ?? []) as Sub[];

  let q = admin.from("tasks").select("*, task_assignees(*)").eq("status", "open");
  if (onlyTaskId) q = q.eq("id", onlyTaskId);
  const { data: tasksRaw, error } = await q;
  if (error) throw error;
  const tasks = (tasksRaw ?? []) as Task[];

  const summary: string[] = [];
  const logs: Record<string, unknown>[] = [];

  for (const t of tasks) {
    const creator = members.get(t.created_by)?.name ?? "Quelqu'un";
    const assigneeIds = t.task_assignees.map((a) => a.member_id);
    const when = frDate(t.scheduled_date, today);

    for (const a of t.task_assignees) {
      const m = members.get(a.member_id);
      if (!m || !isAvailableNow(m, now)) continue;

      let kind: "new" | "reminder" | null = null;
      if (!a.last_notified_at) kind = "new";
      else if (t.scheduled_date <= today) {
        const elapsed = (now.getTime() - new Date(a.last_notified_at).getTime()) / 60000;
        if (elapsed >= t.interval_minutes - 1) kind = "reminder";
      }
      if (!kind) continue;

      let title: string, body: string;
      if (kind === "new") {
        if (t.mode === "roulette") {
          title = `La roulette t'a choisi : ${t.title}`;
          body = `Tirage parmi ${listNames(t.candidates, members)}. À faire ${when}.`;
        } else {
          title = `Nouvelle tâche : ${t.title}`;
          body = `${creator} te demande de le faire ${when}.`;
        }
      } else {
        title = `Rappel : ${t.title}`;
        body = `Toujours à faire. Appuie sur « C'est fait » quand c'est terminé.`;
      }
      const payload = { title, body, tag: `task-${t.id}`, url: `./?task=${t.id}` };
      const sent = await sendTo(m.id, subs, payload);
      await admin.from("task_assignees")
        .update({ last_notified_at: now.toISOString(), notify_count: a.notify_count + 1 })
        .eq("task_id", t.id).eq("member_id", m.id);
      logs.push({ member_id: m.id, task_id: t.id, kind, title, body });
      summary.push(`${kind} ${m.name} "${t.title}" (${sent} appareil(s))`);
    }

    if (t.mode === "roulette" && !t.roulette_notified_at) {
      const winners = listNames(assigneeIds, members);
      const title = `Roulette : ${winners}`;
      const body = `${winners} ${assigneeIds.length > 1 ? "ont été tirés" : "a été tiré"} au sort pour « ${t.title} » (parmi ${listNames(t.candidates, members)}).`;
      const payload = { title, body, tag: `roulette-${t.id}`, url: `./?task=${t.id}` };
      for (const m of members.values()) {
        if (assigneeIds.includes(m.id)) continue;
        if (!isAvailableNow(m, now)) continue;
        const sent = await sendTo(m.id, subs, payload);
        logs.push({ member_id: m.id, task_id: t.id, kind: "roulette", title, body });
        summary.push(`roulette ${m.name} (${sent} appareil(s))`);
      }
      await admin.from("tasks").update({ roulette_notified_at: now.toISOString() }).eq("id", t.id);
    }
  }

  await processTrades(onlyTradeId, members, subs, now, summary, logs);

  if (logs.length) await admin.from("notifications").insert(logs);
  return summary;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const cronHeader = req.headers.get("x-cron-secret");
    let onlyTaskId: string | null = null;
    let onlyTradeId: string | null = null;

    if (CRON_SECRET && cronHeader === CRON_SECRET) {
      // appel planifié : tout traiter
    } else {
      const auth = req.headers.get("Authorization") ?? "";
      const jwt = auth.replace(/^Bearer\s+/i, "");
      const { data: { user }, error } = await admin.auth.getUser(jwt);
      if (error || !user) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: cors });
      const { data: dev } = await admin.from("devices").select("member_id").eq("auth_uid", user.id).maybeSingle();
      if (!dev) return new Response(JSON.stringify({ error: "Pas membre" }), { status: 403, headers: cors });
      const body = await req.json().catch(() => ({}));
      if (!body.task_id && !body.trade_id) return new Response(JSON.stringify({ error: "task_id ou trade_id manquant" }), { status: 400, headers: cors });
      if (body.task_id) onlyTaskId = String(body.task_id);
      if (body.trade_id) onlyTradeId = String(body.trade_id);
    }

    const summary = await process(onlyTaskId, onlyTradeId);
    return new Response(JSON.stringify({ ok: true, summary }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: cors });
  }
});
