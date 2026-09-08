import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Switch, Text, View } from "react-native";

import { type Member, MemberPicker } from "../../components/MemberPicker";
import { Button, Card, Empty, Input, SectionTitle } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { errorMessage, supabase } from "../../lib/supabase";
import type { NotificationPrefs } from "../../lib/types";

type PendingRequest = {
  id: string;
  created_at: string;
  profile: { display_name: string; email: string | null } | null;
};

export default function SettingsScreen() {
  const { session, profile, refreshProfile, signOut } = useAuth();
  const myId = session!.user.id;
  const groupId = profile!.group_id!;
  const isAdmin = profile?.role === "admin";

  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [minStars, setMinStars] = useState("0");
  const [calendarUrl, setCalendarUrl] = useState(profile?.calendar_url ?? "");
  const [savingUrl, setSavingUrl] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [memberCount, setMemberCount] = useState(0);

  const load = useCallback(async () => {
    const [p, g, count] = await Promise.all([
      supabase.from("notification_prefs").select("*").eq("user_id", myId).maybeSingle(),
      supabase.from("groups").select("name").eq("id", groupId).single(),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("group_id", groupId),
    ]);
    const loaded = (p.data as NotificationPrefs | null) ?? {
      user_id: myId,
      enabled: true,
      min_stars: 0,
      notify_pickups: true,
      notify_drops: true,
      channel: "push",
    };
    setPrefs(loaded);
    setMinStars(String(loaded.min_stars));
    setGroupName((g.data as { name: string } | null)?.name ?? "");
    setMemberCount(count.count ?? 0);
  }, [myId, groupId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function updatePrefs(patch: Partial<NotificationPrefs>) {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    const { error } = await supabase.from("notification_prefs").upsert(next);
    if (error) Alert.alert("Couldn't save", errorMessage(error));
  }

  function commitMinStars() {
    const n = Number.parseInt(minStars, 10);
    if (Number.isNaN(n) || n < 0) {
      setMinStars(String(prefs?.min_stars ?? 0));
      return;
    }
    updatePrefs({ min_stars: n });
  }

  async function saveCalendarUrl() {
    setSavingUrl(true);
    const { error } = await supabase
      .from("profiles")
      .update({ calendar_url: calendarUrl.trim() || null })
      .eq("id", myId);
    setSavingUrl(false);
    if (error) {
      Alert.alert("Couldn't save", errorMessage(error));
      return;
    }
    await refreshProfile();
    Alert.alert("Saved", "Shift import from Qgenda is coming soon.");
  }

  return (
    <ScrollView className="flex-1 bg-slate-50" contentContainerClassName="p-4" keyboardShouldPersistTaps="handled">
      <SectionTitle>Notifications</SectionTitle>
      <Card>
        <ToggleRow
          label="Enabled"
          value={prefs?.enabled ?? true}
          onValueChange={(v) => updatePrefs({ enabled: v })}
        />
        <ToggleRow
          label="Pickup requests"
          value={prefs?.notify_pickups ?? true}
          onValueChange={(v) => updatePrefs({ notify_pickups: v })}
        />
        <ToggleRow
          label="Drop requests"
          value={prefs?.notify_drops ?? true}
          onValueChange={(v) => updatePrefs({ notify_drops: v })}
        />
        <View className="flex-row items-center justify-between px-4 py-3">
          <Text className="text-base text-slate-900">Minimum stars</Text>
          <Input
            value={minStars}
            onChangeText={setMinStars}
            onBlur={commitMinStars}
            keyboardType="number-pad"
            className="w-16 py-2 text-right"
          />
        </View>
      </Card>

      <View className="h-6" />
      <SectionTitle>Schedule</SectionTitle>
      <Card>
        <View className="gap-2 p-4">
          <Text className="text-base text-slate-900">Qgenda calendar link</Text>
          <Input
            value={calendarUrl}
            onChangeText={setCalendarUrl}
            placeholder="https://..."
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Text className="text-sm text-slate-500">
            Paste your Qgenda calendar subscription URL to import your shifts.
          </Text>
          <Button
            title="Save link"
            variant="secondary"
            onPress={saveCalendarUrl}
            loading={savingUrl}
            disabled={(calendarUrl.trim() || null) === (profile?.calendar_url ?? null)}
          />
        </View>
      </Card>

      {isAdmin ? <AdminSection myId={myId} groupId={groupId} /> : null}

      <View className="h-6" />
      <SectionTitle>Account</SectionTitle>
      <Card>
        <View className="px-4 py-3">
          <Text className="text-base text-slate-900">{profile?.display_name}</Text>
          <Text className="text-sm text-slate-500">{session!.user.email}</Text>
        </View>
        <View className="px-4 py-3">
          <Text className="text-base text-slate-900">{groupName}</Text>
          <Text className="text-sm text-slate-500">
            {memberCount} {memberCount === 1 ? "member" : "members"} ·{" "}
            {isAdmin ? "you are the admin" : "employee"}
          </Text>
        </View>
        <Pressable
          onPress={() =>
            Alert.alert("Sign out?", undefined, [
              { text: "Cancel", style: "cancel" },
              { text: "Sign out", style: "destructive", onPress: signOut },
            ])
          }
          className="flex-row items-center justify-between px-4 py-3 active:bg-slate-100"
        >
          <Text className="text-base text-rose-600">Sign out</Text>
          <Ionicons name="log-out-outline" size={18} color="#e11d48" />
        </Pressable>
      </Card>
      <View className="h-8" />
    </ScrollView>
  );
}

/** Join approvals, granting stars, and handing off admin. Admin-only. */
function AdminSection({ myId, groupId }: { myId: string; groupId: string }) {
  const { refreshProfile } = useAuth();
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [picker, setPicker] = useState<"grant" | "transfer" | null>(null);
  const [grantTo, setGrantTo] = useState<Member | null>(null);
  const [amount, setAmount] = useState("1");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [reqs, mems] = await Promise.all([
      supabase
        .from("join_requests")
        .select("id, created_at, profile:profiles!join_requests_user_id_fkey(display_name, email)")
        .eq("group_id", groupId)
        .eq("status", "pending")
        .order("created_at"),
      supabase
        .from("profiles")
        .select("id, display_name, role")
        .eq("group_id", groupId)
        .order("display_name"),
    ]);
    setPending((reqs.data as unknown as PendingRequest[]) ?? []);
    setMembers((mems.data as Member[]) ?? []);
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // New join requests show up without a manual refresh.
  useEffect(() => {
    const channel = supabase
      .channel(`join_requests:${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "join_requests", filter: `group_id=eq.${groupId}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, load]);

  async function review(request: PendingRequest, approve: boolean) {
    setBusy(true);
    const { error } = await supabase.rpc("review_join_request", {
      p_request_id: request.id,
      p_approve: approve,
    });
    setBusy(false);
    if (error) {
      Alert.alert("Couldn't update request", errorMessage(error));
      return;
    }
    load();
  }

  async function grant() {
    const n = Number.parseInt(amount, 10);
    if (!grantTo || Number.isNaN(n) || n <= 0) {
      Alert.alert("Pick a member and a positive number of stars");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("grant_stars", {
      p_to_user: grantTo.id,
      p_amount: n,
      p_reason: reason,
    });
    setBusy(false);
    if (error) {
      Alert.alert("Couldn't grant stars", errorMessage(error));
      return;
    }
    Alert.alert("Done", `Gave ${n} ${n === 1 ? "star" : "stars"} to ${grantTo.display_name}.`);
    setGrantTo(null);
    setAmount("1");
    setReason("");
  }

  function transfer(member: Member) {
    setPicker(null);
    Alert.alert(
      `Make ${member.display_name} the admin?`,
      "You'll become an employee and lose access to this section.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Transfer",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.rpc("transfer_admin", { p_to_user: member.id });
            if (error) {
              Alert.alert("Couldn't transfer", errorMessage(error));
              return;
            }
            await refreshProfile();
          },
        },
      ]
    );
  }

  const others = members.filter((m) => m.id !== myId);

  return (
    <>
      <View className="h-6" />
      <SectionTitle>Admin · Join requests</SectionTitle>
      <Card>
        {pending.length === 0 ? <Empty>No pending requests.</Empty> : null}
        {pending.map((request) => (
          <View key={request.id} className="flex-row items-center gap-3 px-4 py-3">
            <View className="flex-1">
              <Text className="text-base text-slate-900">
                {request.profile?.display_name ?? "Unknown"}
              </Text>
              <Text className="text-sm text-slate-500">{request.profile?.email}</Text>
            </View>
            <Pressable
              onPress={() => review(request, false)}
              disabled={busy}
              className="rounded-lg border border-slate-200 px-3 py-2 active:bg-slate-100"
            >
              <Text className="text-sm font-semibold text-slate-700">Deny</Text>
            </Pressable>
            <Pressable
              onPress={() => review(request, true)}
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-3 py-2 active:bg-indigo-700"
            >
              <Text className="text-sm font-semibold text-white">Approve</Text>
            </Pressable>
          </View>
        ))}
      </Card>

      <View className="h-6" />
      <SectionTitle>Admin · Grant stars</SectionTitle>
      <Card>
        <View className="gap-3 p-4">
          <Pressable
            onPress={() => setPicker("grant")}
            className="flex-row items-center justify-between rounded-lg border border-slate-200 px-3 py-3"
          >
            <Text className={grantTo ? "text-base text-slate-900" : "text-base text-slate-400"}>
              {grantTo ? grantTo.display_name : "Choose a member"}
            </Text>
            <Ionicons name="chevron-down" size={18} color="#94a3b8" />
          </Pressable>
          <View className="flex-row gap-3">
            <Input
              value={amount}
              onChangeText={setAmount}
              keyboardType="number-pad"
              className="w-20 text-center"
            />
            <Input
              value={reason}
              onChangeText={setReason}
              placeholder="Reason (optional)"
              className="flex-1"
            />
          </View>
          <Button title="Grant stars" onPress={grant} loading={busy} disabled={!grantTo} />
        </View>
      </Card>

      <View className="h-6" />
      <SectionTitle>Admin · Transfer admin</SectionTitle>
      <Card>
        <Pressable
          onPress={() => setPicker("transfer")}
          className="flex-row items-center gap-3 px-4 py-3 active:bg-slate-100"
        >
          <Ionicons name="swap-horizontal-outline" size={20} color="#4f46e5" />
          <Text className="flex-1 text-base text-slate-900">Hand admin to another member</Text>
          <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
        </Pressable>
      </Card>

      <MemberPicker
        visible={picker !== null}
        title={picker === "grant" ? "Grant stars to" : "New admin"}
        members={picker === "grant" ? members : others}
        onSelect={(member) => {
          if (picker === "grant") {
            setGrantTo(member);
            setPicker(null);
          } else {
            transfer(member);
          }
        }}
        onClose={() => setPicker(null)}
      />
    </>
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
