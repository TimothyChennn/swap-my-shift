import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Input, SectionTitle } from "../components/ui";
import { useAuth } from "../lib/auth";
import { errorMessage, supabase } from "../lib/supabase";
import type { Group, Role } from "../lib/types";

type Pending = { id: string; group_id: string; group: { name: string } | null };

/**
 * Join or create a group. Shown on its own until the user has a group, and
 * reachable from Settings afterwards to add another one.
 */
export default function OnboardingScreen() {
  const { session, memberships, refresh, signOut } = useAuth();
  const userId = session!.user.id;
  const hasGroups = memberships.length > 0;

  const [role, setRole] = useState<Role>("employee");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Pick<Group, "id" | "name">[]>([]);
  const [pending, setPending] = useState<Pending[] | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  async function loadPending() {
    const { data } = await supabase
      .from("join_requests")
      .select("id, group_id, group:groups(name)")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at");
    setPending((data as unknown as Pending[]) ?? []);
  }

  useEffect(() => {
    loadPending();
  }, [userId]);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("groups")
        .select("id, name")
        .ilike("name", `%${term}%`)
        .order("name")
        .limit(10);
      setResults((data as Pick<Group, "id" | "name">[]) ?? []);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  async function createGroup() {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("create_group", { p_name: query.trim() });
      if (error) throw error;
      await refresh();
      if (hasGroups) router.back();
    } catch (error) {
      Alert.alert("Couldn't create group", errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function requestJoin(group: Pick<Group, "id" | "name">) {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("request_join", { p_group_id: group.id });
      if (error) throw error;
      setQuery("");
      await loadPending();
      if (hasGroups) {
        Alert.alert("Request sent", `The admin of ${group.name} will need to approve you.`);
        router.back();
      }
    } catch (error) {
      Alert.alert("Couldn't send request", errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(p: Pending) {
    const { error } = await supabase.rpc("withdraw_join_request", { p_group_id: p.group_id });
    if (error) {
      Alert.alert("Couldn't withdraw", errorMessage(error));
      return;
    }
    loadPending();
  }

  if (pending === undefined) return null;

  const term = query.trim();
  const memberOf = new Set(memberships.map((m) => m.group_id));
  const pendingFor = new Set(pending.map((p) => p.group_id));
  const exactMatch = results.some((g) => g.name.toLowerCase() === term.toLowerCase());

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerClassName="p-6 gap-6" keyboardShouldPersistTaps="handled">
        <View className="flex-row items-start justify-between">
          <View className="flex-1 gap-1">
            <Text className="text-2xl font-bold text-slate-900">
              {hasGroups ? "Add a group" : "Set up your group"}
            </Text>
            <Text className="text-slate-500">
              Signed in as {session!.user.email}.{" "}
              {!hasGroups ? (
                <Text className="text-indigo-600" onPress={signOut}>
                  Not you?
                </Text>
              ) : null}
            </Text>
          </View>
          {hasGroups ? (
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="close" size={24} color="#64748b" />
            </Pressable>
          ) : null}
        </View>

        {pending.length > 0 ? (
          <View className="gap-2">
            <SectionTitle>Waiting for approval</SectionTitle>
            {pending.map((p) => (
              <View
                key={p.id}
                className="flex-row items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4"
              >
                <View className="flex-1 pr-3">
                  <Text className="text-base font-medium text-slate-900">{p.group?.name}</Text>
                  <Text className="text-sm text-slate-500">
                    The admin has to approve you. You'll be let in automatically.
                  </Text>
                </View>
                <Pressable onPress={() => withdraw(p)}>
                  <Text className="text-sm font-semibold text-rose-600">Withdraw</Text>
                </Pressable>
              </View>
            ))}
            {!hasGroups ? (
              <Button title="Check again" variant="secondary" onPress={refresh} />
            ) : null}
          </View>
        ) : null}

        <View className="gap-3">
          <SectionTitle>I want to</SectionTitle>
          <View className="flex-row gap-3">
            <RoleCard
              label="Create a group"
              hint="You'll be the admin"
              selected={role === "admin"}
              onPress={() => setRole("admin")}
            />
            <RoleCard
              label="Join a group"
              hint="Ask the admin to let you in"
              selected={role === "employee"}
              onPress={() => setRole("employee")}
            />
          </View>
        </View>

        <View className="gap-3">
          <SectionTitle>{role === "admin" ? "Group name" : "Find your group"}</SectionTitle>
          <View className="flex-row items-center rounded-lg border border-slate-200 bg-white px-3">
            <Ionicons name="search" size={18} color="#94a3b8" />
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder={role === "admin" ? "e.g. Mercy General Nursing" : "Search by group name"}
              autoCapitalize="words"
              autoCorrect={false}
              className="flex-1 border-0 bg-transparent"
            />
          </View>

          {role === "admin" ? (
            <>
              {exactMatch ? (
                <Text className="text-sm text-amber-700">
                  A group called "{term}" already exists. Pick another name, or switch to Join.
                </Text>
              ) : null}
              <Button
                title={term ? `Create "${term}"` : "Create group"}
                onPress={createGroup}
                disabled={!term || exactMatch}
                loading={busy}
              />
              <Text className="text-center text-sm text-slate-500">
                You'll be the admin and start with 10 stars.
              </Text>
            </>
          ) : (
            <View className="gap-2">
              {term && results.length === 0 ? (
                <Text className="text-sm text-slate-500">No groups match "{term}".</Text>
              ) : null}
              {results.map((group) => {
                const state = memberOf.has(group.id)
                  ? "Joined"
                  : pendingFor.has(group.id)
                    ? "Requested"
                    : null;
                return (
                  <View
                    key={group.id}
                    className="flex-row items-center justify-between rounded-xl border border-slate-200 p-4"
                  >
                    <Text className="flex-1 text-base font-medium text-slate-900">{group.name}</Text>
                    {state ? (
                      <Text className="text-sm text-slate-400">{state}</Text>
                    ) : (
                      <Pressable
                        onPress={() => requestJoin(group)}
                        disabled={busy}
                        className="rounded-lg bg-indigo-600 px-3 py-2 active:bg-indigo-700"
                      >
                        <Text className="text-sm font-semibold text-white">Request to join</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
              {!term ? (
                <Text className="text-sm text-slate-500">Ask your admin for the exact group name.</Text>
              ) : null}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
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
      <Text className={`text-base font-semibold ${selected ? "text-indigo-700" : "text-slate-900"}`}>
        {label}
      </Text>
      <Text className="mt-1 text-sm text-slate-500">{hint}</Text>
    </Pressable>
  );
}
