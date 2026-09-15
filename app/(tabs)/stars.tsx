import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Linking, RefreshControl, ScrollView, Text, View } from "react-native";

import { SectionTitle } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { STAR_SELLER } from "../../lib/config";
import { formatTimestamp } from "../../lib/dates";
import { supabase } from "../../lib/supabase";
import type { StarTransaction } from "../../lib/types";

type Tx = StarTransaction & {
  from_profile: { display_name: string } | null;
  to_profile: { display_name: string } | null;
};

/** Your star activity in the current group, and how to get more. */
export default function StarsScreen() {
  const { session, currentGroup } = useAuth();
  const myId = session!.user.id;
  const group = currentGroup!;

  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("star_transactions")
      .select(
        "*, from_profile:profiles!star_transactions_from_user_fkey(display_name), to_profile:profiles!star_transactions_to_user_fkey(display_name)"
      )
      .eq("group_id", group.group_id)
      .or(`from_user.eq.${myId},to_user.eq.${myId}`)
      .order("created_at", { ascending: false })
      .limit(50);
    setTransactions((data as unknown as Tx[]) ?? []);
    setLoading(false);
  }, [myId, group.group_id]);

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
      <Text className="mb-4 text-xl font-bold text-slate-900">
        Your Stars · <Text className="text-indigo-700">{group.group.name}</Text>
      </Text>

      <View className="mb-4 gap-2 rounded-xl bg-white p-4">
        <Text className="text-base text-slate-800">
          Stars can be traded for shifts. In the future, stars can also be exchangeable for awards.
        </Text>
        <Text className="text-base text-slate-800">
          You can purchase more stars from {STAR_SELLER.name}.{" "}
          <Text
            className="text-indigo-600 underline"
            onPress={() => Linking.openURL(`mailto:${STAR_SELLER.email}`)}
          >
            {STAR_SELLER.email}
          </Text>
        </Text>
        <Text className="text-sm text-slate-500">
          These are the stars for {group.group.name}. The stars can not be moved between groups.
        </Text>
      </View>

      <SectionTitle>Activity</SectionTitle>
      {!loading && transactions.length === 0 ? (
        <Text className="text-slate-500">No star activity in this group yet.</Text>
      ) : null}
      {transactions.map((tx) => {
        const incoming = tx.to_user === myId;
        const other = incoming ? tx.from_profile?.display_name : tx.to_profile?.display_name;
        return (
          <View key={tx.id} className="mb-2 flex-row items-center gap-3 rounded-xl bg-white p-4">
            <View className="flex-1">
              <Text className="text-base font-medium text-slate-900">{tx.reason}</Text>
              <Text className="text-sm text-slate-500">
                {formatTimestamp(tx.created_at)}
                {other ? ` · ${incoming ? "from" : "to"} ${other}` : ""}
              </Text>
            </View>
            <Text className={`text-base font-semibold ${incoming ? "text-green-600" : "text-red-600"}`}>
              {incoming ? `+${tx.amount}` : `-${tx.amount}`}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}
