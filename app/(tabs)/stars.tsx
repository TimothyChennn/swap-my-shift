import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { SectionTitle } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { formatTimestamp } from "../../lib/dates";
import { supabase } from "../../lib/supabase";
import type { StarTransaction } from "../../lib/types";

type Tx = StarTransaction & {
  from_profile: { display_name: string } | null;
  to_profile: { display_name: string } | null;
};

/** Your balance, your transactions, and who to ask for more. */
export default function StarsScreen() {
  const { session, profile } = useAuth();
  const myId = session!.user.id;

  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [adminName, setAdminName] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [bal, txs, group] = await Promise.all([
      supabase.from("star_balances").select("balance").eq("user_id", myId).maybeSingle(),
      supabase
        .from("star_transactions")
        .select(
          "*, from_profile:profiles!star_transactions_from_user_fkey(display_name), to_profile:profiles!star_transactions_to_user_fkey(display_name)"
        )
        .or(`from_user.eq.${myId},to_user.eq.${myId}`)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("groups")
        .select("admin:profiles!groups_admin_id_fkey(display_name)")
        .eq("id", profile!.group_id!)
        .single(),
    ]);
    setBalance((bal.data as { balance: number } | null)?.balance ?? 0);
    setTransactions((txs.data as Tx[]) ?? []);
    setAdminName(
      (group.data as { admin: { display_name: string } | null } | null)?.admin?.display_name ?? ""
    );
    setLoading(false);
  }, [myId, profile]);

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
      <View className="mb-4 items-center rounded-2xl bg-white p-6">
        <Text className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Your balance
        </Text>
        <View className="mt-2 flex-row items-center gap-2">
          <Ionicons name="star" size={28} color="#f59e0b" />
          <Text className="text-4xl font-bold text-slate-900">{balance}</Text>
        </View>
      </View>

      <SectionTitle>Recent activity</SectionTitle>
      {!loading && transactions.length === 0 ? (
        <Text className="text-slate-500">No star activity yet.</Text>
      ) : null}
      {transactions.map((tx) => {
        const incoming = tx.to_user === myId;
        const other = incoming
          ? tx.from_profile?.display_name ?? adminName
          : tx.to_profile?.display_name ?? "";
        return (
          <View key={tx.id} className="mb-2 flex-row items-center gap-3 rounded-xl bg-white p-4">
            <View className="flex-1">
              <Text className="text-base font-medium text-slate-900">{tx.reason}</Text>
              <Text className="text-sm text-slate-500">
                {formatTimestamp(tx.created_at)}
                {other ? ` · ${incoming ? "from" : "to"} ${other}` : ""}
              </Text>
            </View>
            <Text
              className={`text-base font-semibold ${
                incoming ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {incoming ? `+${tx.amount}` : `-${tx.amount}`}
            </Text>
          </View>
        );
      })}

      <View className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <Text className="text-sm text-slate-500">
          {profile?.role === "admin"
            ? "You grant stars from Settings."
            : `To buy stars, contact ${adminName || "your admin"}.`}
        </Text>
      </View>
    </ScrollView>
  );
}
