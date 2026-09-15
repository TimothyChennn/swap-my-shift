import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, Switch, Text, View } from "react-native";

import { useAuth } from "../lib/auth";
import { QGENDA_INSTRUCTIONS, TRADE_DISCLAIMER } from "../lib/config";
import { errorMessage, supabase, syncShifts } from "../lib/supabase";
import type { Membership, NotificationPrefs, Role } from "../lib/types";
import { Chip } from "./AddShiftModal";
import { CenterModal } from "./CenterModal";
import { ListSheet } from "./ListSheet";
import { Button, Input } from "./ui";

type Member = { user_id: string; role: Role; profile: { display_name: string } | null };
type PendingRequest = {
  id: string;
  profile: { display_name: string; email: string | null } | null;
};

const MIN_STARS = [0, 1, 2, 3, 4, 5] as const;

type Props = { membership: Membership; onClose: () => void };

/** "Settings for X Group": notifications, Qgenda import, admin tools, leave. */
export function GroupSettingsModal({ membership, onClose }: Props) {
  const { session, refresh } = useAuth();
  const myId = session!.user.id;
  const groupId = membership.group_id;
  const isAdmin = membership.role === "admin";

  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [emails, setEmails] = useState("");
  const [calendarUrl, setCalendarUrl] = useState(membership.calendar_url ?? "");
  const [savingUrl, setSavingUrl] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    supabase
      .from("notification_prefs")
      .select("*")
      .eq("user_id", myId)
      .eq("group_id", groupId)
      .maybeSingle()
      .then(({ data }) => {
        const loaded = (data as NotificationPrefs | null) ?? {
          user_id: myId,
          group_id: groupId,
          enabled: true,
          notify_offers: true,
          min_stars: 0,
          supervisor_emails_enabled: false,
          supervisor_emails: "",
        };
        setPrefs(loaded);
        setEmails(loaded.supervisor_emails);
      });
  }, [myId, groupId]);

  async function updatePrefs(patch: Partial<NotificationPrefs>) {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    const { error } = await supabase.from("notification_prefs").upsert(next);
    if (error) Alert.alert("Couldn't save", errorMessage(error));
  }

  async function saveCalendarUrl() {
    setSavingUrl(true);
    const { error } = await supabase.rpc("save_calendar_url", {
      p_group_id: groupId,
      p_url: calendarUrl,
    });
    setSavingUrl(false);
    if (error) {
      Alert.alert("Couldn't save", errorMessage(error));
      return;
    }
    await refresh();
    if (calendarUrl.trim()) await runSync();
  }

  async function runSync() {
    setSyncing(true);
    try {
      const count = await syncShifts(groupId);
      Alert.alert("Synced", `Imported ${count} ${count === 1 ? "shift" : "shifts"} from Qgenda.`);
    } catch (error) {
      Alert.alert("Couldn't sync", errorMessage(error));
    } finally {
      setSyncing(false);
      await refresh();
    }
  }

  const enabled = prefs?.enabled ?? true;

  return (
    <CenterModal visible title={`Settings for ${membership.group.name} Group`} onClose={onClose}>
      {/* Notifications */}
      <GreyRow label="Notifications">
        <Switch value={enabled} onValueChange={(v) => updatePrefs({ enabled: v })} />
      </GreyRow>
      <View className="rounded-lg bg-amber-50 px-3 py-2">
        <Text className="text-sm text-amber-800">
          Not active yet: your choices are saved, but nothing sends notifications in this test
          version.
        </Text>
      </View>
      <View className={`gap-3 ${enabled ? "" : "opacity-40"}`} pointerEvents={enabled ? "auto" : "none"}>
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-base text-slate-900">If someone is offering a shift</Text>
            <Text className="text-sm text-slate-500">Notify me</Text>
          </View>
          <Switch
            value={prefs?.notify_offers ?? true}
            onValueChange={(v) => updatePrefs({ notify_offers: v })}
          />
        </View>
        <View className="gap-1.5">
          <Text className="text-base text-slate-900">Only notify me if stars are being offered</Text>
          <View className="flex-row flex-wrap gap-2">
            {MIN_STARS.map((n) => (
              <Chip
                key={n}
                label={n === 0 ? "Any" : `${n}+`}
                selected={(prefs?.min_stars ?? 0) === n}
                onPress={() => updatePrefs({ min_stars: n })}
              />
            ))}
          </View>
        </View>
        <View className="flex-row items-center justify-between">
          <Text className="flex-1 pr-3 text-base text-slate-900">
            Email of scheduler/supervisor to request trade
          </Text>
          <Switch
            value={prefs?.supervisor_emails_enabled ?? false}
            onValueChange={(v) => updatePrefs({ supervisor_emails_enabled: v })}
          />
        </View>
        {prefs?.supervisor_emails_enabled ? (
          <Input
            value={emails}
            onChangeText={setEmails}
            onBlur={() => updatePrefs({ supervisor_emails: emails.trim() })}
            placeholder="Enter email(s) separated by commas"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
        ) : null}
        <Text className="text-sm text-red-600">{TRADE_DISCLAIMER}</Text>
      </View>

      {/* Import calendar */}
      <GreyRow label="Import calendar" />
      <Text className="text-base text-slate-900">Paste your Qgenda calendar URL</Text>
      <Input
        value={calendarUrl}
        onChangeText={setCalendarUrl}
        placeholder="https://..."
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <Text className="text-sm text-slate-500">Instructions: {QGENDA_INSTRUCTIONS}</Text>
      <Button
        title="Save link"
        variant="secondary"
        onPress={saveCalendarUrl}
        loading={savingUrl}
        disabled={(calendarUrl.trim() || null) === (membership.calendar_url ?? null)}
      />
      {membership.calendar_url ? (
        <>
          <Text className="text-sm text-slate-500">
            {membership.calendar_error
              ? `Last sync failed: ${membership.calendar_error}`
              : membership.calendar_synced_at
                ? `Last synced ${new Date(membership.calendar_synced_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}. Syncs again automatically when you open the calendar.`
                : "Not synced yet."}
          </Text>
          <Button title="Sync now" onPress={runSync} loading={syncing} />
        </>
      ) : null}

      {isAdmin ? <AdminTools groupId={groupId} myId={myId} /> : null}

      <GreyRow label="Membership" />
      <LeaveButton membership={membership} onLeft={onClose} />
    </CenterModal>
  );
}

function AdminTools({ groupId, myId }: { groupId: string; myId: string }) {
  const { refresh } = useAuth();
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
        .select("id, profile:profiles!join_requests_user_id_fkey(display_name, email)")
        .eq("group_id", groupId)
        .eq("status", "pending")
        .order("created_at"),
      supabase
        .from("memberships")
        .select("user_id, role, profile:profiles(display_name)")
        .eq("group_id", groupId),
    ]);
    setPending((reqs.data as unknown as PendingRequest[]) ?? []);
    setMembers((mems.data as unknown as Member[]) ?? []);
  }, [groupId]);

  useEffect(() => {
    load();
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
      p_group_id: groupId,
      p_to_user: grantTo.user_id,
      p_amount: n,
      p_reason: reason,
    });
    setBusy(false);
    if (error) {
      Alert.alert("Couldn't grant stars", errorMessage(error));
      return;
    }
    Alert.alert("Done", `Gave ${n} ${n === 1 ? "star" : "stars"} to ${grantTo.profile?.display_name}.`);
    setGrantTo(null);
    setAmount("1");
    setReason("");
  }

  function transfer(member: Member) {
    setPicker(null);
    Alert.alert(
      `Make ${member.profile?.display_name} the admin?`,
      "You'll become an employee of this group.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Transfer",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.rpc("transfer_admin", {
              p_group_id: groupId,
              p_to_user: member.user_id,
            });
            if (error) {
              Alert.alert("Couldn't transfer", errorMessage(error));
              return;
            }
            await refresh();
          },
        },
      ]
    );
  }

  const asItems = (list: Member[]) =>
    list.map((m) => ({ key: m.user_id, label: m.profile?.display_name ?? "Member" }));

  return (
    <>
      <GreyRow label="Admin · Join requests" />
      {pending.length === 0 ? <Text className="text-slate-500">No pending requests.</Text> : null}
      {pending.map((request) => (
        <View key={request.id} className="flex-row items-center gap-3">
          <View className="flex-1">
            <Text className="text-base text-slate-900">{request.profile?.display_name ?? "Unknown"}</Text>
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
            className="rounded-lg bg-green-600 px-3 py-2 active:bg-green-700"
          >
            <Text className="text-sm font-semibold text-white">Approve</Text>
          </Pressable>
        </View>
      ))}

      <GreyRow label="Admin · Grant stars" />
      <Pressable
        onPress={() => setPicker("grant")}
        className="flex-row items-center justify-between rounded-lg border border-slate-200 px-3 py-3"
      >
        <Text className={grantTo ? "text-base text-slate-900" : "text-base text-slate-400"}>
          {grantTo ? grantTo.profile?.display_name : "Choose a member"}
        </Text>
        <Ionicons name="chevron-down" size={18} color="#94a3b8" />
      </Pressable>
      <View className="flex-row gap-3">
        <Input value={amount} onChangeText={setAmount} keyboardType="number-pad" className="w-20 text-center" />
        <Input value={reason} onChangeText={setReason} placeholder="Reason (optional)" className="flex-1" />
      </View>
      <Button title="Grant stars" onPress={grant} loading={busy} disabled={!grantTo} />

      <GreyRow label="Admin · Transfer admin" />
      <Button title="Hand admin to another member" variant="secondary" onPress={() => setPicker("transfer")} />

      <ListSheet
        visible={picker !== null}
        title={picker === "grant" ? "Grant stars to" : "New admin"}
        items={asItems(picker === "grant" ? members : members.filter((m) => m.user_id !== myId))}
        emptyText="No other members yet."
        onSelect={(key) => {
          const member = members.find((m) => m.user_id === key);
          if (!member) return;
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

function LeaveButton({ membership, onLeft }: { membership: Membership; onLeft: () => void }) {
  const { refresh } = useAuth();
  const isAdmin = membership.role === "admin";

  function leave() {
    Alert.alert(
      `Leave ${membership.group.name}?`,
      isAdmin
        ? "If you're the only member this deletes the group. Otherwise transfer admin first."
        : "You'll lose access to this group's calendar and your open posts will be removed. Your stars stay with the group.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.rpc("leave_group", { p_group_id: membership.group_id });
            if (error) {
              Alert.alert("Couldn't leave", errorMessage(error));
              return;
            }
            onLeft();
            await refresh();
          },
        },
      ]
    );
  }

  return <Button title="Leave group" variant="danger" onPress={leave} />;
}

function GreyRow({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <View className="-mx-5 flex-row items-center justify-between bg-slate-100 px-5 py-2.5">
      <Text className="text-sm font-semibold uppercase tracking-wide text-slate-600">{label}</Text>
      {children}
    </View>
  );
}
