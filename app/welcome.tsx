import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, Linking, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../components/ui";
import { signInWithGoogle } from "../lib/auth";
import { SUPPORT_EMAIL } from "../lib/config";
import { errorMessage } from "../lib/supabase";

const POINTS = [
  "Post shifts (days, nights, calls, etc.) that you want to give up.",
  "Incentivize by offering stars.",
  "Trade your extra stars for money.",
  "Syncs with Qgenda.",
  "Set up notifications and get alerted when someone offers stars.",
];

/** Splash for signed-out users. Anyone with a session skips straight to the calendar. */
export default function WelcomeScreen() {
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      Alert.alert("Couldn't sign in", errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-peach-50">
      <ScrollView contentContainerClassName="flex-grow justify-center gap-8 p-6">
        <View className="items-center gap-3">
          <View className="h-20 w-20 items-center justify-center rounded-3xl bg-indigo-600">
            <Ionicons name="swap-horizontal" size={40} color="#ffffff" />
          </View>
          <Text className="text-4xl font-black tracking-widest text-slate-900">SHIFT SWAP</Text>
          <Text className="text-center text-base text-slate-700">
            Shift Swap is a modern bulletin board for you to share work shifts that you want to
            swap or pick up.
          </Text>
        </View>

        <View className="gap-3 rounded-2xl bg-white p-5">
          {POINTS.map((point) => (
            <View key={point} className="flex-row gap-3">
              <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
              <Text className="flex-1 text-base text-slate-800">{point}</Text>
            </View>
          ))}
          <Text className="pt-1 text-sm text-slate-500">
            For more info, contact{" "}
            <Text
              className="text-indigo-600 underline"
              onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
            >
              {SUPPORT_EMAIL}
            </Text>
          </Text>
        </View>

        <Button title="Log on / Sign up" icon="logo-google" onPress={signIn} loading={busy} />
      </ScrollView>
    </SafeAreaView>
  );
}
