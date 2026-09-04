import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { currentUser, members } from "../../lib/placeholder";

/**
 * Settings. Notification prefs, Qgenda calendar link, and an admin-only
 * section. Nothing persists yet.
 */
export default function SettingsScreen() {
  const [enabled, setEnabled] = useState(true);
  const [notifyPickups, setNotifyPickups] = useState(true);
  const [notifyDrops, setNotifyDrops] = useState(true);
  const [minStars, setMinStars] = useState("0");
  const [calendarUrl, setCalendarUrl] = useState("");

  // Stub-only: lets you see the admin section before roles come from Supabase.
  const [previewAdmin, setPreviewAdmin] = useState(false);
  const isAdmin = currentUser.role === "admin" || previewAdmin;

  return (
    <ScrollView className="flex-1 bg-slate-50" contentContainerClassName="p-4">
      <Section title="Notifications">
        <ToggleRow label="Enabled" value={enabled} onValueChange={setEnabled} />
        <ToggleRow
          label="Pickup requests"
          value={notifyPickups}
          onValueChange={setNotifyPickups}
        />
        <ToggleRow
          label="Drop requests"
          value={notifyDrops}
          onValueChange={setNotifyDrops}
        />
        <View className="flex-row items-center justify-between px-4 py-3">
          <Text className="text-base text-slate-900">Minimum stars</Text>
          <TextInput
            value={minStars}
            onChangeText={setMinStars}
            keyboardType="number-pad"
            className="w-16 rounded-lg border border-slate-200 px-3 py-2 text-right text-base text-slate-900"
          />
        </View>
      </Section>

      <Section title="Schedule">
        <View className="gap-2 p-4">
          <Text className="text-base text-slate-900">Qgenda calendar link</Text>
          <TextInput
            value={calendarUrl}
            onChangeText={setCalendarUrl}
            placeholder="https://..."
            autoCapitalize="none"
            className="rounded-lg border border-slate-200 px-3 py-3 text-base text-slate-900"
          />
          <Text className="text-sm text-slate-500">
            Paste your Qgenda calendar subscription URL to import your shifts.
          </Text>
        </View>
      </Section>

      {isAdmin ? (
        <Section title="Admin">
          <LinkRow icon="person-add-outline" label="Pending join requests" />
          <LinkRow icon="star-outline" label="Grant stars to a member" />
          <LinkRow icon="swap-horizontal-outline" label="Transfer admin" />
        </Section>
      ) : null}

      <Section title="Account">
        <View className="px-4 py-3">
          <Text className="text-base text-slate-900">{currentUser.name}</Text>
          <Text className="text-sm text-slate-500">
            {currentUser.groupName} · {members.length} members
          </Text>
        </View>
        <Link href="/sign-in" asChild>
          <Pressable className="flex-row items-center justify-between px-4 py-3 active:bg-slate-100">
            <Text className="text-base text-slate-900">Sign in screen</Text>
            <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
          </Pressable>
        </Link>
      </Section>

      <View className="mb-8 mt-2 flex-row items-center justify-between rounded-xl border border-dashed border-slate-300 px-4 py-3">
        <Text className="text-sm text-slate-500">
          Preview admin section (stub only)
        </Text>
        <Switch value={previewAdmin} onValueChange={setPreviewAdmin} />
      </View>
    </ScrollView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-6">
      <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </Text>
      <View className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white">
        {children}
      </View>
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View className="flex-row items-center justify-between px-4 py-3">
      <Text className="text-base text-slate-900">{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

function LinkRow({
  icon,
  label,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
}) {
  return (
    <Pressable className="flex-row items-center gap-3 px-4 py-3 active:bg-slate-100">
      <Ionicons name={icon} size={20} color="#4f46e5" />
      <Text className="flex-1 text-base text-slate-900">{label}</Text>
      <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
    </Pressable>
  );
}
