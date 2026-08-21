import { supabase, isSupabaseConfigured } from "../lib/supabase";
import type { Pace } from "../types";
import type { Location } from "../types/location";
import type { Json, ProfileRow } from "../types/database";

// Typed shape of the free-form profiles.preferences jsonb column.
export interface ProfilePreferences {
  interests?: string[];
  pace?: Pace;
  budget?: string;
  travelStyle?: string;
  tripDuration?: string;
  home?: Location;
}

export interface Profile {
  id: string;
  isAdmin: boolean;
  fullName: string;
  avatarUrl: string | null;
  homeCity: string | null;
  homeCountry: string | null;
  homeLat: number | null;
  homeLng: number | null;
  onboardingCompleted: boolean;
  preferences: ProfilePreferences;
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    isAdmin: row.is_admin,
    fullName: row.full_name ?? "Traveller",
    avatarUrl: row.avatar_url,
    homeCity: row.home_city,
    homeCountry: row.home_country,
    homeLat: row.home_lat,
    homeLng: row.home_lng,
    onboardingCompleted: row.onboarding_completed,
    preferences: (row.preferences as ProfilePreferences) ?? {},
  };
}

// A friendly, user-facing message for any auth/db failure. Raw Supabase and
// Postgres errors are logged but never surfaced to the UI.
export class AuthError extends Error {}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STRONG_PASSWORD = /^(?=\S{12,72}$)(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s]).*$/;

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalized)) throw new AuthError("Enter a valid email address.");
  return normalized;
}

export function validateNewPassword(password: string): string | null {
  return STRONG_PASSWORD.test(password)
    ? null
    : "Use 12 or more characters with uppercase, lowercase, a number and a symbol.";
}

function guardConfigured() {
  if (!isSupabaseConfigured) {
    throw new AuthError(
      "Accounts aren't set up yet. Add your Supabase keys to enable sign in.",
    );
  }
}

export const authService = {
  async signUp(name: string, email: string, password: string): Promise<{ authenticated: boolean }> {
    guardConfigured();
    const passwordError = validateNewPassword(password);
    if (passwordError) throw new AuthError(passwordError);
    const { data, error } = await supabase.auth.signUp({
      email: normalizeEmail(email),
      password,
      options: {
        data: { full_name: name.trim() || "Traveller" },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[auth] signUp", error.message);
      if (/already registered|already exists/i.test(error.message)) {
        throw new AuthError("An account with this email already exists.");
      }
      if (/password/i.test(error.message)) {
        throw new AuthError(passwordError ?? "Please choose a stronger password.");
      }
      if (/invalid|email/i.test(error.message)) {
        throw new AuthError("That email address doesn't look right.");
      }
      throw new AuthError("We couldn't create your account right now. Please try again.");
    }
    const authenticated = Boolean(
      data.session?.access_token && data.user?.email && data.user.email_confirmed_at,
    );
    return { authenticated };
  },

  async signIn(email: string, password: string): Promise<void> {
    guardConfigured();
    if (!password) throw new AuthError("Password is required.");
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    });
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[auth] signIn", error.message);
      if (/confirm/i.test(error.message)) {
        throw new AuthError("Please confirm your email address, then sign in.");
      }
      if (/invalid/i.test(error.message)) {
        throw new AuthError("Incorrect email or password.");
      }
      throw new AuthError("We couldn't sign you in right now. Please try again.");
    }
    if (!data.session?.access_token || !data.user?.email || !data.user.email_confirmed_at) {
      await supabase.auth.signOut();
      throw new AuthError("Confirm your email address before signing in.");
    }
  },

  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[auth] signOut", error.message);
    }
  },

  async resetPassword(email: string): Promise<void> {
    guardConfigured();
    const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[auth] resetPassword", error.message);
      throw new AuthError("We couldn't send a reset email right now. Please try again.");
    }
  },

  async updatePassword(newPassword: string): Promise<void> {
    guardConfigured();
    const passwordError = validateNewPassword(newPassword);
    if (passwordError) throw new AuthError(passwordError);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[auth] updatePassword", error.message);
      throw new AuthError("We couldn't update your password. Please try again.");
    }
  },

  async requireVerifiedUser(expectedUserId?: string): Promise<string> {
    guardConfigured();
    // getUser validates the stored access token against Supabase Auth instead
    // of trusting local storage claims alone.
    const { data, error } = await supabase.auth.getUser();
    const user = data.user;
    if (
      error ||
      !user?.id ||
      !user.email ||
      !user.email_confirmed_at ||
      (expectedUserId && user.id !== expectedUserId)
    ) {
      throw new AuthError("Your secure session has expired. Sign in again.");
    }
    return user.id;
  },

  async fetchProfile(userId: string): Promise<Profile | null> {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return toProfile(data);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[auth] fetchProfile", error);
      return null;
    }
  },

  async updateProfile(userId: string, patch: Partial<ProfileRow>): Promise<Profile | null> {
    guardConfigured();
    try {
      const { data, error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", userId)
        .select("*")
        .single();
      if (error) throw error;
      return toProfile(data);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[auth] updateProfile", error);
      throw new AuthError("We couldn't save your changes right now. Please try again.");
    }
  },

  async mergePreferences(patch: ProfilePreferences): Promise<Profile | null> {
    guardConfigured();
    try {
      const { data, error } = await supabase
        .rpc("merge_profile_preferences", { p_patch: patch as unknown as Json })
        .single();
      if (error) throw error;
      return toProfile(data);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[auth] mergePreferences", error);
      throw new AuthError("We couldn't save your preferences right now. Please try again.");
    }
  },
};
