import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
  disabled?: boolean;
  icon?: ComponentProps<typeof Ionicons>["name"];
};

export function Button({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  icon,
}: ButtonProps) {
  const inactive = disabled || loading;
  const box = {
    primary: "bg-indigo-600 active:bg-indigo-700",
    secondary: "bg-white border border-slate-200 active:bg-slate-50",
    danger: "bg-white border border-rose-200 active:bg-rose-50",
  }[variant];
  const text = {
    primary: "text-white",
    secondary: "text-slate-900",
    danger: "text-rose-600",
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      className={`flex-row items-center justify-center rounded-xl px-4 py-3.5 ${box} ${
        inactive ? "opacity-50" : ""
      }`}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? "#fff" : "#4f46e5"} />
      ) : (
        <>
          {icon ? (
            <Ionicons
              name={icon}
              size={20}
              color={variant === "primary" ? "#fff" : "#0f172a"}
              style={{ marginRight: 10 }}
            />
          ) : null}
          <Text className={`text-base font-semibold ${text}`}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Input(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor="#94a3b8"
      {...props}
      className={`rounded-lg border border-slate-200 bg-white px-3 py-3 text-base text-slate-900 ${
        props.className ?? ""
      }`}
    />
  );
}

export function SectionTitle({ children }: { children: string }) {
  return (
    <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </Text>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return (
    <View className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white">
      {children}
    </View>
  );
}

export function Empty({ children }: { children: string }) {
  return <Text className="px-4 py-3 text-slate-500">{children}</Text>;
}

export function Centered({ children }: { children: React.ReactNode }) {
  return (
    <View className="flex-1 items-center justify-center bg-slate-50 p-6">
      {children}
    </View>
  );
}
