import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { authService, type Profile, type ProfilePreferences } from "../services/auth";

// A slim, UI-facing view of the authenticated user.
export interface AppUser {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
}

interface AuthValue {
  user: AppUser | null;
  profile: Profile | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithProvider: (provider: "google" | "apple") => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<{ authenticated: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  updatePreferences: (prefs: ProfilePreferences) => Promise<void>;
  saveProfile: (patch: {
    fullName?: string;
    homeCity?: string | null;
    homeCountry?: string | null;
    homeLat?: number | null;
    homeLng?: number | null;
    onboardingCompleted?: boolean;
    preferences?: ProfilePreferences;
  }) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

function toAppUser(supUser: SupabaseUser | null, profile: Profile | null): AppUser | null {
  if (!supUser) return null;
  const metaName = (supUser.user_metadata?.full_name as string | undefined) ?? "";
  return {
    id: supUser.id,
    name: profile?.fullName || metaName || supUser.email?.split("@")[0] || "Traveller",
    email: supUser.email ?? "",
    isAdmin: profile?.isAdmin ?? false,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [supUser, setSupUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const loadProfile = useCallback(async (id: string) => {
    const p = await authService.fetchProfile(id);
    if (mounted.current) setProfile(p);
  }, []);

  // Establish the session on startup and keep it in sync with Supabase.
  useEffect(() => {
    mounted.current = true;

    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    const apply = async (session: Session | null) => {
      let sessionUser = session?.user ?? null;
      if (session?.access_token && sessionUser) {
        const { data, error } = await supabase.auth.getUser();
        if (error || data.user?.id !== sessionUser.id) sessionUser = null;
        else sessionUser = data.user;
      }
      const nextUser =
          session?.access_token &&
          sessionUser?.email && sessionUser.email_confirmed_at
          ? sessionUser
          : null;
      setSupUser(nextUser);
      if (nextUser) await loadProfile(nextUser.id);
      else setProfile(null);
      if (mounted.current) setLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => void apply(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // Run validation after the auth callback returns to avoid holding the
      // Supabase auth lock while making another Auth request.
      setTimeout(() => void apply(session), 0);
    });

    return () => {
      mounted.current = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    await authService.signIn(email, password);
  }, []);

  const signInWithProvider = useCallback(async (provider: "google" | "apple") => {
    await authService.signInWithProvider(provider);
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    return authService.signUp(name, email, password);
  }, []);

  const signOut = useCallback(async () => {
    await authService.signOut();
    setSupUser(null);
    setProfile(null);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await authService.resetPassword(email);
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    await authService.updatePassword(newPassword);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (supUser) await loadProfile(supUser.id);
  }, [supUser, loadProfile]);

  const saveProfile = useCallback<AuthValue["saveProfile"]>(
    async (patch) => {
      if (!supUser) return;
      const updated = await authService.updateProfile(supUser.id, {
        full_name: patch.fullName,
        home_city: patch.homeCity,
        home_country: patch.homeCountry,
        home_lat: patch.homeLat,
        home_lng: patch.homeLng,
        onboarding_completed: patch.onboardingCompleted,
        preferences: patch.preferences as never,
      });
      if (updated && mounted.current) setProfile(updated);
    },
    [supUser],
  );

  const updatePreferences = useCallback(
    async (prefs: ProfilePreferences) => {
      if (!supUser) return;
      await authService.requireVerifiedUser(supUser.id);
      const updated = await authService.mergePreferences(prefs);
      if (updated && mounted.current) setProfile(updated);
    },
    [supUser],
  );

  const user = useMemo(() => toAppUser(supUser, profile), [supUser, profile]);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      profile,
      loading,
      configured: isSupabaseConfigured,
      signIn,
      signInWithProvider,
      signUp,
      signOut,
      resetPassword,
      updatePassword,
      updatePreferences,
      saveProfile,
      refreshProfile,
    }),
    [
      user,
      profile,
      loading,
      signIn,
      signInWithProvider,
      signUp,
      signOut,
      resetPassword,
      updatePassword,
      updatePreferences,
      saveProfile,
      refreshProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
