import { Ionicons } from "@expo/vector-icons";
import { ScrollView, Text, View } from "react-native";

import { currentUser, starTransactions } from "../../lib/placeholder";

/** Stars. Balance, recent transactions, and how to get more. */
export default function StarsScreen() {
  return (
    <ScrollView className="flex-1 bg-slate-50" contentContainerClassName="p-4">
      <View className="mb-4 items-center rounded-2xl bg-white p-6">
        <Text className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Your balance
        </Text>
        <View className="mt-2 flex-row items-center gap-2">
          <Ionicons name="star" size={28} color="#f59e0b" />
          <Text className="text-4xl font-bold text-slate-900">
            {currentUser.stars}
          </Text>
        </View>
      </View>

      <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Recent activity
      </Text>
      {starTransactions.map((transaction) => (
        <View
          key={transaction.id}
          className="mb-2 flex-row items-center gap-3 rounded-xl bg-white p-4"
        >
          <View className="flex-1">
            <Text className="text-base font-medium text-slate-900">
              {transaction.label}
            </Text>
            <Text className="text-sm text-slate-500">{transaction.date}</Text>
          </View>
          <Text
            className={`text-base font-semibold ${
              transaction.amount > 0
                ? "text-emerald-600"
                : transaction.amount < 0
                  ? "text-rose-600"
                  : "text-slate-400"
            }`}
          >
            {transaction.amount > 0 ? `+${transaction.amount}` : transaction.amount}
          </Text>
        </View>
      ))}

      <View className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <Text className="text-sm text-slate-500">
          To buy stars, contact {currentUser.adminName}.
        </Text>
      </View>
    </ScrollView>
  );
}
