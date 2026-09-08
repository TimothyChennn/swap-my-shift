import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { formatDateKey } from "../lib/dates";
import { errorMessage, supabase } from "../lib/supabase";
import type { SwapKind, SwapRequest } from "../lib/types";
import { Button, Input } from "./ui";

export type OpenRequest = SwapRequest & {
  requester: { display_name: string } | null;
};

type Props = {
  date: string | null;
  requests: OpenRequest[];
  myId: string;
  onClose: () => void;
  /** Called after any successful write so the parent can refetch. */
  onChanged: () => void;
};

/**
 * Bottom sheet for one day: its open requests (accept / cancel) and a form
 * to post a new one.
 */
export function DaySheet({ date, requests, myId, onClose, onChanged }: Props) {
  const [posting, setPosting] = useState(false);

  function close() {
    setPosting(false);
    onClose();
  }

  return (
    <Modal
      visible={date !== null}
      transparent
      animationType="slide"
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <Pressable className="flex-1 bg-black/40" onPress={close} />
        <View className="max-h-[85%] rounded-t-3xl bg-white">
          <View className="flex-row items-center justify-between px-5 pt-5">
            <Text className="text-lg font-semibold text-slate-900">
              {date ? formatDateKey(date, { weekday: "long", month: "long", day: "numeric" }) : ""}
            </Text>
            <Pressable onPress={close} hitSlop={12}>
              <Ionicons name="close" size={22} color="#64748b" />
            </Pressable>
          </View>

          <ScrollView
            contentContainerClassName="p-5 pb-10 gap-3"
            keyboardShouldPersistTaps="handled"
          >
            {posting && date ? (
              <PostRequestForm
                date={date}
                onCancel={() => setPosting(false)}
                onPosted={() => {
                  setPosting(false);
                  onChanged();
                }}
              />
            ) : (
              <>
                {requests.length === 0 ? (
                  <Text className="text-slate-500">No open requests for this day.</Text>
                ) : (
                  requests.map((request) => (
                    <RequestCard
                      key={request.id}
                      request={request}
                      mine={request.user_id === myId}
                      onChanged={onChanged}
                    />
                  ))
                )}
                <Button title="Post a request" onPress={() => setPosting(true)} />
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function RequestCard({
  request,
  mine,
  onChanged,
}: {
  request: OpenRequest;
  mine: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const isDrop = request.kind === "drop";
  const name = mine ? "You" : request.requester?.display_name ?? "Someone";

  function accept() {
    Alert.alert(
      isDrop ? "Cover this shift?" : "Give up your shift?",
      isDrop
        ? `You'll work ${name === "You" ? "your" : `${name}'s`} ${request.shift_type} shift and receive ${request.stars} stars.`
        : `${name} will take your ${request.shift_type} shift and you'll receive ${request.stars} stars.`,
      [
        { text: "Not now", style: "cancel" },
        {
          text: "Accept",
          onPress: async () => {
            setBusy(true);
            const { error } = await supabase.rpc("accept_swap_request", {
              p_request_id: request.id,
            });
            setBusy(false);
            if (error) {
              Alert.alert("Couldn't accept", errorMessage(error));
              return;
            }
            onChanged();
          },
        },
      ]
    );
  }

  function cancel() {
    Alert.alert("Cancel this request?", undefined, [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel request",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          const { error } = await supabase.rpc("cancel_swap_request", {
            p_request_id: request.id,
          });
          setBusy(false);
          if (error) {
            Alert.alert("Couldn't cancel", errorMessage(error));
            return;
          }
          onChanged();
        },
      },
    ]);
  }

  return (
    <View className="rounded-xl border border-slate-200 p-4">
      <View className="flex-row items-center gap-2">
        <View
          className={`h-7 w-7 items-center justify-center rounded-full ${
            isDrop ? "bg-amber-50" : "bg-emerald-50"
          }`}
        >
          <Ionicons
            name={isDrop ? "remove" : "add"}
            size={16}
            color={isDrop ? "#b45309" : "#047857"}
          />
        </View>
        <Text className="flex-1 text-base font-medium text-slate-900">
          {name} {isDrop ? "wants to drop" : "wants to pick up"} a {request.shift_type || "shift"}
        </Text>
        <View className="flex-row items-center gap-1">
          <Ionicons name="star" size={14} color="#f59e0b" />
          <Text className="text-sm font-semibold text-slate-900">{request.stars}</Text>
        </View>
      </View>
      {request.shift_time ? (
        <Text className="mt-2 text-sm text-slate-500">{request.shift_time}</Text>
      ) : null}
      {request.notes ? (
        <Text className="mt-1 text-sm text-slate-500">{request.notes}</Text>
      ) : null}
      <View className="mt-3">
        {mine ? (
          <Button title="Cancel request" variant="danger" onPress={cancel} loading={busy} />
        ) : (
          <Button
            title={isDrop ? "Cover this shift" : "Give them my shift"}
            onPress={accept}
            loading={busy}
          />
        )}
      </View>
    </View>
  );
}

function PostRequestForm({
  date,
  onCancel,
  onPosted,
}: {
  date: string;
  onCancel: () => void;
  onPosted: () => void;
}) {
  const [kind, setKind] = useState<SwapKind>("drop");
  const [shiftType, setShiftType] = useState("");
  const [shiftTime, setShiftTime] = useState("");
  const [notes, setNotes] = useState("");
  const [stars, setStars] = useState("1");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const starCount = Number.parseInt(stars, 10);
    if (Number.isNaN(starCount) || starCount < 0) {
      Alert.alert("Stars must be a whole number");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("post_swap_request", {
      p_kind: kind,
      p_date: date,
      p_shift_type: shiftType,
      p_shift_time: shiftTime,
      p_notes: notes,
      p_stars: starCount,
    });
    setBusy(false);
    if (error) {
      Alert.alert("Couldn't post", errorMessage(error));
      return;
    }
    onPosted();
  }

  return (
    <View className="gap-3">
      <View className="flex-row overflow-hidden rounded-lg border border-slate-200">
        <KindTab
          label="Drop a shift"
          selected={kind === "drop"}
          onPress={() => setKind("drop")}
        />
        <KindTab
          label="Pick up a shift"
          selected={kind === "pickup"}
          onPress={() => setKind("pickup")}
        />
      </View>
      <Text className="text-sm text-slate-500">
        {kind === "drop"
          ? "You have a shift you want someone else to cover. Whoever takes it gets the stars."
          : "You want an extra shift. Whoever gives you theirs gets the stars."}
      </Text>

      <Field label="Shift type">
        <Input value={shiftType} onChangeText={setShiftType} placeholder="Day, Night, Swing…" />
      </Field>
      <Field label="Time">
        <Input value={shiftTime} onChangeText={setShiftTime} placeholder="7:00 AM – 7:00 PM" />
      </Field>
      <Field label="Stars offered">
        <Input value={stars} onChangeText={setStars} keyboardType="number-pad" />
      </Field>
      <Field label="Notes">
        <Input
          value={notes}
          onChangeText={setNotes}
          placeholder="Anything the other person should know"
          multiline
        />
      </Field>

      <Button title="Post request" onPress={submit} loading={busy} />
      <Button title="Back" variant="secondary" onPress={onCancel} />
    </View>
  );
}

function KindTab({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 items-center py-2.5 ${selected ? "bg-indigo-600" : "bg-white"}`}
    >
      <Text className={`text-sm font-semibold ${selected ? "text-white" : "text-slate-700"}`}>
        {label}
      </Text>
    </Pressable>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-1">
      <Text className="text-sm font-medium text-slate-700">{label}</Text>
      {children}
    </View>
  );
}
