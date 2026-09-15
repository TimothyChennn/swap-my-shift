import { Ionicons } from "@expo/vector-icons";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
};

/** Centered popup card. Tapping the dim backdrop closes it. */
export function CenterModal({ visible, title, subtitle, onClose, children }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <Pressable
          className="flex-1 items-center justify-center bg-black/50 p-5"
          onPress={onClose}
        >
          <Pressable onPress={() => {}} className="max-h-[88%] w-full rounded-2xl bg-white">
            <View className="flex-row items-start justify-between border-b border-slate-100 px-5 py-4">
              <View className="flex-1 pr-3">
                <Text className="text-lg font-semibold text-slate-900">{title}</Text>
                {subtitle ? <Text className="text-sm text-slate-500">{subtitle}</Text> : null}
              </View>
              <Pressable onPress={onClose} hitSlop={12}>
                <Ionicons name="close" size={22} color="#64748b" />
              </Pressable>
            </View>
            <ScrollView contentContainerClassName="p-5 gap-3" keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
