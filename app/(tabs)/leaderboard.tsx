import { Ionicons } from "@expo/vector-icons";
import { ScrollView, Text, View } from "react-native";

import { currentUser, members } from "../../lib/placeholder";

/** Leaderboard. Group members ranked by star balance. */
export default function LeaderboardScreen() {
  const ranked = [...members].sort((a, b) => b.stars - a.stars);

  return (
    <ScrollView className="flex-1 bg-slate-50" contentContainerClassName="p-4">
      <Text className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {currentUser.groupName}
      </Text>

      {ranked.map((member, index) => {
        const isMe = member.name === currentUser.name;
        return (
          <View
            key={member.id}
            className={`mb-2 flex-row items-center gap-3 rounded-xl p-4 ${
              isMe ? "border border-indigo-200 bg-indigo-50" : "bg-white"
            }`}
          >
            <Text className="w-6 text-base font-semibold text-slate-400">
              {index + 1}
            </Text>
            <View className="flex-1">
              <Text className="text-base font-medium text-slate-900">
                {member.name}
                {isMe ? " (you)" : ""}
              </Text>
              {member.isAdmin ? (
                <Text className="text-xs font-medium uppercase tracking-wide text-indigo-600">
                  Admin
                </Text>
              ) : null}
            </View>
            <View className="flex-row items-center gap-1">
              <Ionicons name="star" size={16} color="#f59e0b" />
              <Text className="text-base font-semibold text-slate-900">
                {member.stars}
              </Text>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
