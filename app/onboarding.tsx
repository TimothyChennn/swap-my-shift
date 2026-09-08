import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Input, SectionTitle } from "../components/ui";
import { useAuth } from "../lib/auth";
import { errorMessage, supabase } from "../lib/supabase";
import type { Group, JoinStatus, Role } from "../lib/types";

type LatestRequest = {
  id: string;
  status: JoinStatus;
  group: { name: string } | null;
};

/**
 * First run after sign-in: pick a role, then either create a group (admin)
 * or search for one and ask to join (employee). Shown until the profile has
 * a group_id, which the admin's approval sets.
 */
export default function OnboardingScreen() {
  const { session, refreshProfile, signOut } = useAuth();
  const userId = session!.user.id;

  const [role, setRole] = useState<Role>("employee");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Pick<Group, "id" | "name">[]>([]);
  const [latest, setLatest] = useState<LatestRequest | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  async function loadLatestRequest() {
    const { data } = await supabase
      .from("join_requests")
      .select("id, status, group:groups(name)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setLatest((data as LatestRequest | null) ?? null);
  }

  useEffect(() => {
    loadLatestRequest();
  }, [userId]);

  // Search groups by name as the user types.
  useEffect(() => {
    const term = query.trim();
    if (term.length === 0) {
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
      await refreshProfile();
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
      setShowSearch(false);
      await loadLatestRequest();
    } catch (error) {
      Alert.alert("Couldn't send request", errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function checkAgain() {
    setBusy(true);
    await Promise.all([refreshProfile(), loadLatestRequest()]);
    setBusy(false);
  }

  if (latest === undefined) return null;

  // Waiting on an admin.
  if (latest?.status === "pending" && !showSearch) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 justify-center gap-6 p-6">
          <View className="items-center gap-2">
            <Ionicons name="hourglass-outline" size={40} color="#4f46e5" />
            <Text className="text-2xl font-bold text-slate-900">Request sent</Text>
            <Text className="text-center text-slate-500">
              Waiting for the admin of{" "}
              <Text className="font-semibold text-slate-900">{latest.group?.name}</Text>{" "}
              to approve you. You'll be let in automatically.
            </Text>
          </View>
          <Button title="Check again" onPress={checkAgain} loading={busy} />
          <Button
            title="Pick a different group"
            variant="secondary"
            onPress={() => setShowSearch(true)}
          />
          <Pressable onPress={signOut} className="items-center py-2">
            <Text className="text-slate-500">Sign out</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const term = query.trim();
  const exactMatch = results.some((g) => g.name.toLowerCase() === term.toLowerCase());

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView
        contentContainerClassName="p-6 gap-6"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-1">
          <Text className="text-2xl font-bold text-slate-900">Set up your group</Text>
          <Text className="text-slate-500">
            Signed in as {session!.user.email}.{" "}
            <Text className="text-indigo-600" onPress={signOut}>
              Not you?
            </Text>
          </Text>
        </View>

        {latest?.status === "denied" ? (
          <View className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <Text className="text-amber-800">
              Your request to join {latest.group?.name} was denied. You can try another group.
            </Text>
          </View>
        ) : null}

        <View className="gap-3">
          <SectionTitle>I am a</SectionTitle>
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
                  A group called "{term}" already exists. Pick another name, or switch to
                  Employee to join it.
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
              {results.map((group) => (
                <View
                  key={group.id}
                  className="flex-row items-center justify-between rounded-xl border border-slate-200 p-4"
                >
                  <Text className="flex-1 text-base font-medium text-slate-900">
                    {group.name}
                  </Text>
                  <Pressable
                    onPress={() => requestJoin(group)}
                    disabled={busy}
                    className="rounded-lg bg-indigo-600 px-3 py-2 active:bg-indigo-700"
                  >
                    <Text className="text-sm font-semibold text-white">Request to join</Text>
                  </Pressable>
                </View>
              ))}
              {!term ? (
                <Text className="text-sm text-slate-500">
                  Ask your admin for the exact group name.
                </Text>
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
