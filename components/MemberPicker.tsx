import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import type { Profile } from "../lib/types";

export type Member = Pick<Profile, "id" | "display_name" | "role">;

type Props = {
  visible: boolean;
  title: string;
  members: Member[];
  onSelect: (member: Member) => void;
  onClose: () => void;
};

/** Bottom sheet listing group members; used by the admin actions. */
export function MemberPicker({ visible, title, members, onSelect, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40" onPress={onClose} />
      <View className="max-h-[70%] rounded-t-3xl bg-white">
        <View className="flex-row items-center justify-between px-5 pt-5">
          <Text className="text-lg font-semibold text-slate-900">{title}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={22} color="#64748b" />
          </Pressable>
        </View>
        <ScrollView contentContainerClassName="p-5 pb-10 gap-2">
          {members.length === 0 ? (
            <Text className="text-slate-500">No other members yet.</Text>
          ) : null}
          {members.map((member) => (
            <Pressable
              key={member.id}
              onPress={() => onSelect(member)}
              className="flex-row items-center justify-between rounded-xl border border-slate-200 p-4 active:bg-slate-50"
            >
              <Text className="text-base font-medium text-slate-900">
                {member.display_name}
              </Text>
              <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}
