import { Ionicons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";

type Role = "admin" | "employee";

/**
 * Sign in / sign up. Stub only: Google auth, role selection and the
 * create-group / find-group flows get wired to Supabase later.
 */
export default function SignInScreen() {
  const [role, setRole] = useState<Role>("employee");
  const [notifications, setNotifications] = useState(true);

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Sign in" }} />
      <ScrollView
        className="flex-1 bg-white"
        contentContainerClassName="p-6 gap-8"
      >
        <View className="items-center gap-2 pt-8">
          <View className="h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600">
            <Ionicons name="swap-horizontal" size={32} color="#ffffff" />
          </View>
          <Text className="text-2xl font-bold text-slate-900">
            Swap My Shift
          </Text>
          <Text className="text-center text-slate-500">
            Trade shifts with your group using stars.
          </Text>
        </View>

        <Pressable
          className="flex-row items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4 active:bg-slate-50"
          onPress={() => {}}
        >
          <Ionicons name="logo-google" size={20} color="#0f172a" />
          <Text className="text-base font-semibold text-slate-900">
            Continue with Google
          </Text>
        </Pressable>

        <View className="gap-3">
          <Text className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            I am a
          </Text>
          <View className="flex-row gap-3">
            <RoleCard
              label="Admin"
              hint="Create and run a group"
              selected={role === "admin"}
              onPress={() => setRole("admin")}
            />
            <RoleCard
              label="Employee"
              hint="Join an existing group"
              selected={role === "employee"}
              onPress={() => setRole("employee")}
            />
          </View>
        </View>

        <View className="flex-row items-center justify-between rounded-xl border border-slate-200 p-4">
          <View className="flex-1 pr-4">
            <Text className="text-base font-medium text-slate-900">
              Notifications
            </Text>
            <Text className="text-sm text-slate-500">
              Get told when someone posts or accepts a swap.
            </Text>
          </View>
          <Switch value={notifications} onValueChange={setNotifications} />
        </View>

        <Pressable
          className="rounded-xl bg-indigo-600 px-4 py-4 active:bg-indigo-700"
          onPress={() => router.replace("/")}
        >
          <Text className="text-center text-base font-semibold text-white">
            {role === "admin" ? "Create a group" : "Find my group"}
          </Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

function RoleCard({
  label,
  hint,
  selected,
  onPress,
}: {
  label: string;
  hint: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 rounded-xl border p-4 ${
        selected ? "border-indigo-600 bg-indigo-50" : "border-slate-200"
      }`}
    >
      <Text
        className={`text-base font-semibold ${
          selected ? "text-indigo-700" : "text-slate-900"
        }`}
      >
        {label}
      </Text>
      <Text className="mt-1 text-sm text-slate-500">{hint}</Text>
    </Pressable>
  );
}
