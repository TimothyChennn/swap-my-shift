import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Linking, ScrollView, Text, TextInput, View } from "react-native";

import { Button, Input, SectionTitle } from "../components/ui";
import { useAuth } from "../lib/auth";
import { APP_NAME, TRADE_DISCLAIMER } from "../lib/config";
import { formatDateKey } from "../lib/dates";
import { supabase } from "../lib/supabase";
import type { SwapRequest } from "../lib/types";

type Loaded = SwapRequest & {
  requester: { display_name: string; email: string | null } | null;
  group: { name: string } | null;
};

/** Drafts an email to the person who posted a shift; sends via the Mail app. */
export default function ContactScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, profile } = useAuth();
  const [request, setRequest] = useState<Loaded | null | undefined>(undefined);
  const [message, setMessage] = useState("");
  const [emails, setEmails] = useState("");

  useEffect(() => {
    (async () => {
      const [{ data }, prefs] = await Promise.all([
        supabase
          .from("swap_requests")
          .select("*, requester:profiles!swap_requests_user_id_fkey(display_name, email), group:groups(name)")
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("notification_prefs")
          .select("supervisor_emails_enabled, supervisor_emails")
          .eq("user_id", session!.user.id)
          .maybeSingle(),
      ]);
      const loaded = (data as unknown as Loaded | null) ?? null;
      setRequest(loaded);
      if (!loaded) return;

      const when = formatDateKey(loaded.date, { weekday: "long", month: "long", day: "numeric" });
      const stars = loaded.stars === 1 ? "1 star" : `${loaded.stars} stars`;
      setMessage(
        loaded.kind === "drop"
          ? `Hi ${loaded.requester?.display_name ?? ""},\n\nI am interested in picking up your ${loaded.shift_type} shift on ${when} that you posted on ${APP_NAME} for ${stars}.\n\nThanks,\n${profile?.display_name ?? ""}`
          : `Hi ${loaded.requester?.display_name ?? ""},\n\nI can give you my ${loaded.shift_type} shift on ${when} that you asked to pick up on ${APP_NAME}.\n\nThanks,\n${profile?.display_name ?? ""}`
      );

      // Pre-fill the poster and, if the user set them, their scheduler/supervisor.
      const list = [loaded.requester?.email ?? ""];
      const p = prefs.data as { supervisor_emails_enabled: boolean; supervisor_emails: string } | null;
      if (p?.supervisor_emails_enabled && p.supervisor_emails.trim()) list.push(p.supervisor_emails.trim());
      setEmails(list.filter(Boolean).join(", "));
    })();
  }, [id]);

  async function send() {
    const to = emails
      .split(/[,\s]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (to.length === 0) {
      Alert.alert("Enter at least one email address");
      return;
    }
    const subject = `${APP_NAME}: ${request?.shift_type ?? "shift"} on ${request ? formatDateKey(request.date) : ""}`;
    const url = `mailto:${to.join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    const ok = await Linking.canOpenURL(url);
    if (!ok) {
      Alert.alert("No mail app", "Copy the message and send it from your email app.");
      return;
    }
    await Linking.openURL(url);
    router.back();
  }

  if (request === undefined) return null;
  if (request === null) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Text className="text-slate-500">This post is no longer available.</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-slate-50" contentContainerClassName="p-4 gap-4" keyboardShouldPersistTaps="handled">
      <View className="rounded-xl bg-peach-100 p-4">
        <Text className="text-base font-semibold text-slate-900">
          {formatDateKey(request.date, { weekday: "long", month: "long", day: "numeric" })}
        </Text>
        <Text className="text-sm text-slate-600">
          {request.group?.name} · {request.shift_type}
          {request.kind === "drop" ? ` · ${request.stars} ★` : ""} · posted by{" "}
          {request.requester?.display_name}
        </Text>
      </View>

      <View>
        <SectionTitle>Message</SectionTitle>
        <TextInput
          value={message}
          onChangeText={setMessage}
          multiline
          className="min-h-[160px] rounded-lg border border-slate-200 bg-white px-3 py-3 text-base text-slate-900"
          textAlignVertical="top"
        />
      </View>

      <View>
        <SectionTitle>Enter emails of person to send this message to</SectionTitle>
        <Input
          value={emails}
          onChangeText={setEmails}
          placeholder="name@example.com, scheduler@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />
        <Text className="mt-1 text-xs text-slate-500">
          Pre-filled with the poster's email and your scheduler/supervisor from group settings.
        </Text>
      </View>

      <Text className="text-sm text-red-600">{TRADE_DISCLAIMER}</Text>

      <Button title="Send email" onPress={send} />
      <Button title="Back" variant="secondary" onPress={() => router.back()} />
    </ScrollView>
  );
}
