import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { SectionTitle } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import type { Role } from "../../lib/types";

type Row = { id: string; display_name: string; role: Role; balance: number };
type MemberRow = { user_id: string; role: Role; profile: { display_name: string } | null };

/** Everyone in the current group ranked by star balance. */
export default function LeaderboardScreen() {
  const { session, currentGroup } = useAuth();
  const myId = session!.user.id;
  const group = currentGroup!;

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [members, balances] = await Promise.all([
      supabase
        .from("memberships")
        .select("user_id, role, profile:profiles(display_name)")
        .eq("group_id", group.group_id),
      supabase.from("star_balances").select("user_id, balance").eq("group_id", group.group_id),
    ]);
    const balanceById = new Map<string, number>(
      ((balances.data ?? []) as { user_id: string; balance: number }[]).map((b) => [b.user_id, b.balance])
    );
    const merged = ((members.data ?? []) as unknown as MemberRow[])
      .map((m) => ({
        id: m.user_id,
        display_name: m.profile?.display_name ?? "Member",
        role: m.role,
        balance: balanceById.get(m.user_id) ?? 0,
      }))
      .sort((a, b) => b.balance - a.balance || a.display_name.localeCompare(b.display_name));
    setRows(merged);
    setLoading(false);
  }, [group.group_id]);

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
      <SectionTitle>{group.group.name}</SectionTitle>
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
                <Text className="text-xs font-medium uppercase tracking-wide text-indigo-600">Admin</Text>
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
