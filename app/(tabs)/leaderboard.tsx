import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { SectionTitle } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import type { Profile } from "../../lib/types";

type Row = Pick<Profile, "id" | "display_name" | "role"> & { balance: number };

/** Everyone in the group ranked by star balance. */
export default function LeaderboardScreen() {
  const { session, profile } = useAuth();
  const myId = session!.user.id;

  const [rows, setRows] = useState<Row[]>([]);
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [members, balances, group] = await Promise.all([
      supabase.from("profiles").select("id, display_name, role").eq("group_id", profile!.group_id!),
      supabase.from("star_balances").select("user_id, balance"),
      supabase.from("groups").select("name").eq("id", profile!.group_id!).single(),
    ]);
    const balanceById = new Map<string, number>(
      ((balances.data ?? []) as { user_id: string; balance: number }[]).map((b) => [
        b.user_id,
        b.balance,
      ])
    );
    const merged = ((members.data ?? []) as Pick<Profile, "id" | "display_name" | "role">[])
      .map((m) => ({ ...m, balance: balanceById.get(m.id) ?? 0 }))
      .sort((a, b) => b.balance - a.balance || a.display_name.localeCompare(b.display_name));
    setRows(merged);
    setGroupName((group.data as { name: string } | null)?.name ?? "");
    setLoading(false);
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerClassName="p-4"
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <SectionTitle>{groupName || "Your group"}</SectionTitle>
      {rows.map((member, index) => {
        const isMe = member.id === myId;
        return (
          <View
            key={member.id}
            className={`mb-2 flex-row items-center gap-3 rounded-xl p-4 ${
              isMe ? "border border-indigo-200 bg-indigo-50" : "bg-white"
            }`}
          >
            <Text className="w-6 text-base font-semibold text-slate-400">{index + 1}</Text>
            <View className="flex-1">
              <Text className="text-base font-medium text-slate-900">
                {member.display_name}
                {isMe ? " (you)" : ""}
              </Text>
              {member.role === "admin" ? (
                <Text className="text-xs font-medium uppercase tracking-wide text-indigo-600">
                  Admin
                </Text>
              ) : null}
            </View>
            <View className="flex-row items-center gap-1">
              <Ionicons name="star" size={16} color="#f59e0b" />
              <Text className="text-base font-semibold text-slate-900">{member.balance}</Text>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
