import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

import { Chip } from "../../components/AddShiftModal";
import { GroupSettingsModal } from "../../components/GroupSettingsModal";
import { Button, Card, Input, SectionTitle } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { APP_NAME } from "../../lib/config";
import { errorMessage, supabase } from "../../lib/supabase";
import type { Membership, NotifyChannel } from "../../lib/types";

const CHANNELS: { value: NotifyChannel; label: string }[] = [
  { value: "push", label: "Push" },
  { value: "email", label: "Email" },
  { value: "both", label: "Both" },
];

export default function SettingsScreen() {
  const { session, profile, memberships, refresh, signOut } = useAuth();
  const myId = session!.user.id;

  const [name, setName] = useState(profile?.display_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [open, setOpen] = useState<Membership | null>(null);

  async function saveProfile(patch: { display_name?: string; phone?: string | null; notify_channel?: NotifyChannel }) {
    const { error } = await supabase.from("profiles").update(patch).eq("id", myId);
    if (error) {
      Alert.alert("Couldn't save", errorMessage(error));
      return;
    }
    await refresh();
  }

  // Keep the modal's membership fresh (sync status, role) while it's open.
  const openMembership = open ? memberships.find((m) => m.group_id === open.group_id) ?? null : null;

  return (
    <ScrollView className="flex-1 bg-slate-50" contentContainerClassName="p-4" keyboardShouldPersistTaps="handled">
      <SectionTitle>Account</SectionTitle>
      <Card>
        <Row label="Name">
          <Input
            value={name}
            onChangeText={setName}
            onBlur={() => name.trim() && name.trim() !== profile?.display_name && saveProfile({ display_name: name.trim() })}
            className="flex-1 py-2 text-right"
          />
        </Row>
        <Row label="Email">
          <Text className="flex-1 text-right text-base text-slate-500">{session!.user.email}</Text>
        </Row>
        <Row label="Phone">
          <Input
            value={phone}
            onChangeText={setPhone}
            onBlur={() => (phone.trim() || null) !== (profile?.phone ?? null) && saveProfile({ phone: phone.trim() || null })}
            placeholder="Optional"
            keyboardType="phone-pad"
            className="flex-1 py-2 text-right"
          />
        </Row>
        <View className="gap-2 px-4 py-3">
          <Text className="text-base text-slate-900">Preferred way of being notified</Text>
          <Text className="text-xs text-amber-700">Not active yet in this test version.</Text>
          <View className="flex-row gap-2">
            {CHANNELS.map((c) => (
              <Chip
                key={c.value}
                label={c.label}
                selected={(profile?.notify_channel ?? "push") === c.value}
                onPress={() => saveProfile({ notify_channel: c.value })}
              />
            ))}
          </View>
        </View>
      </Card>

      <View className="h-6" />
      <SectionTitle>Group settings</SectionTitle>
      <Card>
        {memberships.map((m) => (
          <Pressable
            key={m.group_id}
            onPress={() => setOpen(m)}
            className="flex-row items-center justify-between px-4 py-3 active:bg-slate-100"
          >
            <View className="flex-1">
              <Text className="text-base text-slate-900">{m.group.name}</Text>
              <Text className="text-sm text-slate-500">{m.role === "admin" ? "Admin" : "Employee"}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
          </Pressable>
        ))}
        <Pressable
          onPress={() => router.push("/onboarding")}
          className="flex-row items-center gap-2 px-4 py-3 active:bg-slate-100"
        >
          <Ionicons name="add-circle-outline" size={20} color="#4f46e5" />
          <Text className="text-base text-indigo-700">Join or create another group</Text>
        </Pressable>
      </Card>

      <View className="h-8" />
      <Button
        title={`Sign out of ${APP_NAME}`}
        variant="danger"
        onPress={() =>
          Alert.alert("Sign out?", undefined, [
            { text: "Cancel", style: "cancel" },
            { text: "Sign out", style: "destructive", onPress: signOut },
          ])
        }
      />
      <View className="h-8" />

      {openMembership ? (
        <GroupSettingsModal membership={openMembership} onClose={() => setOpen(null)} />
      ) : null}
    </ScrollView>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="flex-row items-center justify-between gap-3 px-4 py-2">
      <Text className="text-base text-slate-900">{label}</Text>
      {children}
    </View>
  );
}
