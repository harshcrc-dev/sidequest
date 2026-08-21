import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

// ---------------------------------------------------------------------------
// Supabase browser client. Uses only the public anon key + project URL, which
// are safe to expose. Secrets (service role, OpenAI) never live in the browser.
// Row Level Security enforces per-user access on every table.
// ---------------------------------------------------------------------------

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// True only when the project has been configured with real Supabase credentials.
export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured && import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.warn(
    "[sidequest] Supabase is not configured. Set VITE_SUPABASE_URL and " +
      "VITE_SUPABASE_ANON_KEY in your .env to enable accounts and persistence.",
  );
}

// When unconfigured we still create a client against placeholder values so the
// app can render; any auth/data call will surface a friendly error instead.
// Empty-string env vars count as unconfigured, so use `||` (not `??`).
export const supabase: SupabaseClient<Database> = createClient<Database>(
  url || "https://placeholder.supabase.co",
  anonKey || "public-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
      storageKey: "sidequest.auth",
    },
  },
);
