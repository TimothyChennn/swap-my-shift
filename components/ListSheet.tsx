import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

export type ListItem = { key: string; label: string; sublabel?: string; selected?: boolean };

type Props = {
  visible: boolean;
  title: string;
  items: ListItem[];
  emptyText?: string;
  onSelect: (key: string) => void;
  onClose: () => void;
};

/** Bottom sheet with a list of choices; used as the app's dropdown. */
export function ListSheet({ visible, title, items, emptyText, onSelect, onClose }: Props) {
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
          {items.length === 0 ? (
            <Text className="text-slate-500">{emptyText ?? "Nothing here yet."}</Text>
          ) : null}
          {items.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => onSelect(item.key)}
              className={`flex-row items-center justify-between rounded-xl border p-4 active:bg-slate-50 ${
                item.selected ? "border-indigo-600 bg-indigo-50" : "border-slate-200"
              }`}
            >
              <View className="flex-1">
                <Text className="text-base font-medium text-slate-900">{item.label}</Text>
                {item.sublabel ? (
                  <Text className="text-sm text-slate-500">{item.sublabel}</Text>
                ) : null}
              </View>
              <Ionicons
                name={item.selected ? "checkmark" : "chevron-forward"}
                size={18}
                color={item.selected ? "#4f46e5" : "#94a3b8"}
              />
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}
