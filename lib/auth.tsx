import type { Session } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { supabase } from "./supabase";
import type { Profile } from "./types";

type AuthState = {
  /** undefined while the stored session is still being read. */
  session: Session | null | undefined;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const userId = session?.user.id ?? null;

  const refreshProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    setProfile((data as Profile | null) ?? null);
  }, [userId]);

  // Restore the stored session, then follow auth changes.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, next) => setSession(next)
    );
    return () => subscription.subscription.unsubscribe();
  }, []);

  // Load the profile whenever the signed-in user changes, and keep it fresh
  // so an approved join request moves the user into the app on its own.
  useEffect(() => {
    if (session === undefined) return;
    setProfileLoaded(false);
    refreshProfile().finally(() => setProfileLoaded(true));
    if (!userId) return;

    const channel = supabase
      .channel(`profile:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${userId}`,
        },
        () => refreshProfile()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session === undefined, userId, refreshProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  // Hold the whole tree until we know both the session and the profile;
  // otherwise the navigator would flash the wrong screen.
  const ready = session !== undefined && (session === null || profileLoaded);

  return (
    <AuthContext.Provider value={{ session, profile, refreshProfile, signOut }}>
      {ready ? children : null}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

/**
 * Google sign-in through the system browser. Works in Expo Go and dev builds.
 * Returns false if the user closed the browser without finishing.
 */
export async function signInWithGoogle(): Promise<boolean> {
  // exp://.../--/auth/callback in Expo Go, swapmyshift://auth/callback in a build.
  const redirectTo = Linking.createURL("auth/callback");

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") return false;

  const params = parseAuthParams(result.url);
  if (params.error_description || params.error) {
    throw new Error(params.error_description ?? params.error);
  }

  if (params.code) {
    // PKCE flow (supabase-js default).
    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(params.code);
    if (exchangeError) throw exchangeError;
    return true;
  }

  if (params.access_token && params.refresh_token) {
    // Implicit flow, in case the project is configured that way.
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (sessionError) throw sessionError;
    return true;
  }

  throw new Error("Sign-in finished without a session. Check the redirect URL settings in Supabase.");
}

/** Reads both `?query` and `#fragment` params from a redirect URL. */
function parseAuthParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const [beforeHash, hash = ""] = url.split("#");
  const query = beforeHash.split("?")[1] ?? "";
  for (const part of [query, hash]) {
    new URLSearchParams(part).forEach((value, key) => {
      out[key] = value;
    });
  }
  return out;
}
