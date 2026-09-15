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
import type { Membership, Profile } from "./types";

type AuthState = {
  /** undefined while the stored session is still being read. */
  session: Session | null | undefined;
  profile: Profile | null;
  /** Every group the user belongs to, oldest first. */
  memberships: Membership[];
  /** The group being viewed: profile.current_group_id, else the first one. */
  currentGroup: Membership | null;
  setCurrentGroup: (groupId: string) => Promise<void>;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loaded, setLoaded] = useState(false);

  const userId = session?.user.id ?? null;

  const refresh = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setMemberships([]);
      return;
    }
    const [p, m] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase
        .from("memberships")
        .select("*, group:groups(id, name, admin_id)")
        .eq("user_id", userId)
        .order("created_at"),
    ]);
    setProfile((p.data as Profile | null) ?? null);
    setMemberships((m.data as unknown as Membership[]) ?? []);
  }, [userId]);

  // Restore the stored session, then follow auth changes.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) =>
      setSession(next)
    );
    return () => subscription.subscription.unsubscribe();
  }, []);

  // Load profile + memberships for the signed-in user and keep them fresh,
  // so an approved join request moves the user into the group on its own.
  useEffect(() => {
    if (session === undefined) return;
    setLoaded(false);
    refresh().finally(() => setLoaded(true));
    if (!userId) return;

    const channel = supabase
      .channel(`me:${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
        () => refresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "memberships", filter: `user_id=eq.${userId}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session === undefined, userId, refresh]);

  const setCurrentGroup = useCallback(
    async (groupId: string) => {
      const { error } = await supabase.rpc("set_current_group", { p_group_id: groupId });
      if (error) throw error;
      await refresh();
    },
    [refresh]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const currentGroup =
    memberships.find((m) => m.group_id === profile?.current_group_id) ?? memberships[0] ?? null;

  const ready = session !== undefined && (session === null || loaded);

  return (
    <AuthContext.Provider
      value={{ session, profile, memberships, currentGroup, setCurrentGroup, refresh, signOut }}
    >
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
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
    if (exchangeError) throw exchangeError;
    return true;
  }

  if (params.access_token && params.refresh_token) {
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (sessionError) throw sessionError;
    return true;
  }

  throw new Error(
    "Sign-in finished without a session. Check the redirect URL settings in Supabase."
  );
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
