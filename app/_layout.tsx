import "../global.css";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { AuthProvider, useAuth } from "../lib/auth";

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <RootStack />
    </AuthProvider>
  );
}

/**
 * Signed out -> welcome. Signed in with no group -> onboarding. In a group ->
 * tabs (onboarding stays reachable from Settings to join another group).
 */
function RootStack() {
  const { session, memberships } = useAuth();
  const signedIn = !!session;
  const hasGroup = memberships.length > 0;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn && hasGroup}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="contact"
          options={{ presentation: "modal", headerShown: true, title: "Contact poster" }}
        />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="welcome" />
      </Stack.Protected>
    </Stack>
  );
}
