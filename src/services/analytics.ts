import { supabase, isSupabaseConfigured } from "../lib/supabase";

export interface SiteSettings {
  id: string;
  site_name: string;
  announcement: string;
  maintenance_mode: boolean;
  updated_at: string;
}

export interface TrafficSummary {
  views: number;
  visitors: number;
  signups: number;
  savedTrips: number;
  generations: number;
  topPaths: Array<{ path: string; views: number }>;
  recentViews: Array<{ path: string; created_at: string }>;
}

function sessionId(): string {
  const key = "sidequest.analytics.session";
  try {
    const current = sessionStorage.getItem(key);
    if (current) return current;
    const created = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}-${Math.random()}`;
    sessionStorage.setItem(key, created);
    return created;
  } catch {
    return "anonymous-session-0000";
  }
}

export async function recordPageView(path = window.location.pathname): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from("page_views").insert({
    path: path.slice(0, 200),
    referrer: document.referrer.slice(0, 500) || null,
    session_id: sessionId().slice(0, 128),
  });
  if (error) console.warn("[analytics] page view", error.message);
}

export async function fetchSiteSettings(): Promise<SiteSettings | null> {
  const { data, error } = await supabase.from("site_settings").select("*").eq("id", "default").maybeSingle();
  if (error) throw error;
  return data as SiteSettings | null;
}

export async function updateSiteSettings(patch: Pick<SiteSettings, "site_name" | "announcement" | "maintenance_mode">): Promise<SiteSettings> {
  const { data, error } = await supabase
    .from("site_settings")
    .update(patch)
    .eq("id", "default")
    .select("*")
    .single();
  if (error) throw error;
  return data as SiteSettings;
}

export async function fetchTrafficSummary(): Promise<TrafficSummary> {
  const [views, visitors, signups, savedTrips, generations, pathRows, recentRows] = await Promise.all([
    supabase.from("page_views").select("id", { count: "exact", head: true }),
    supabase.from("page_views").select("session_id"),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("trips").select("id", { count: "exact", head: true }),
    supabase.from("ai_generations").select("id", { count: "exact", head: true }),
    supabase.from("page_views").select("path"),
    supabase.from("page_views").select("path, created_at").order("created_at", { ascending: false }).limit(12),
  ]);
  const response = [views, visitors, signups, savedTrips, generations, pathRows, recentRows].find((result) => result.error);
  if (response?.error) throw response.error;
  const counts = new Map<string, number>();
  for (const row of (pathRows.data ?? []) as Array<{ path: string }>) counts.set(row.path, (counts.get(row.path) ?? 0) + 1);
  return {
    views: views.count ?? 0,
    visitors: new Set((visitors.data ?? []).map((row) => (row as { session_id: string }).session_id)).size,
    signups: signups.count ?? 0,
    savedTrips: savedTrips.count ?? 0,
    generations: generations.count ?? 0,
    topPaths: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([path, count]) => ({ path, views: count })),
    recentViews: (recentRows.data ?? []) as Array<{ path: string; created_at: string }>,
  };
}
