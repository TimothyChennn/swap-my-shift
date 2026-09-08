// Installs a localStorage polyfill backed by SQLite so sessions persist.
import "expo-sqlite/localStorage/install";

import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env."
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Only refresh tokens while the app is in the foreground.
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

/** Turns a Supabase/Postgres error into something short enough for an Alert. */
export function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/**
 * Imports the current user's shifts from their saved Qgenda link.
 * Resolves with the number imported; throws with a readable message.
 */
export async function syncShifts(): Promise<number> {
  const { data, error } = await supabase.functions.invoke<{
    results?: { imported?: number; error?: string }[];
    error?: string;
  }>("import-shifts");
  if (error) {
    // The function body carries the real reason on 4xx responses.
    const body = await (error as { context?: Response }).context?.json().catch(() => null);
    throw new Error(body?.error ?? errorMessage(error));
  }
  const result = data?.results?.[0];
  if (!result) throw new Error(data?.error ?? "Sync failed");
  if (result.error) throw new Error(result.error);
  return result.imported ?? 0;
}
