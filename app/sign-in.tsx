import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../components/ui";
import { signInWithGoogle } from "../lib/auth";
import { errorMessage, supabase } from "../lib/supabase";

export default function SignInScreen() {
  const [notifications, setNotifications] = useState(true);
  const [busy, setBusy] = useState(false);

  async function handleGoogle() {
    setBusy(true);
    try {
      const signedIn = await signInWithGoogle();
      if (!signedIn) return;
      // The prefs row is created by a database trigger on sign-up; record
      // the toggle now that we have a user to attach it to.
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        await supabase
          .from("notification_prefs")
          .upsert({ user_id: data.user.id, enabled: notifications });
      }
    } catch (error) {
      Alert.alert("Couldn't sign in", errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 justify-center gap-8 p-6">
        <View className="items-center gap-2">
          <View className="h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600">
            <Ionicons name="swap-horizontal" size={32} color="#ffffff" />
          </View>
          <Text className="text-2xl font-bold text-slate-900">Swap My Shift</Text>
          <Text className="text-center text-slate-500">
            Trade shifts with your group using stars.
          </Text>
        </View>

        <View className="flex-row items-center justify-between rounded-xl border border-slate-200 p-4">
          <View className="flex-1 pr-4">
            <Text className="text-base font-medium text-slate-900">Notifications</Text>
            <Text className="text-sm text-slate-500">
              Get told when someone posts or accepts a swap.
            </Text>
          </View>
          <Switch value={notifications} onValueChange={setNotifications} />
        </View>

        <Button
          title="Continue with Google"
          variant="secondary"
          icon="logo-google"
          onPress={handleGoogle}
          loading={busy}
        />
      </View>
    </SafeAreaView>
  );
}
