import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { formatDateKey, formatTimeRange } from "../lib/dates";
import { errorMessage, supabase } from "../lib/supabase";
import type { SwapRequest } from "../lib/types";
import type { DayShift } from "./AddShiftModal";
import { CenterModal } from "./CenterModal";
import { Button } from "./ui";

export type OpenRequest = SwapRequest & {
  requester: { display_name: string; email: string | null } | null;
};

type Props = {
  date: string;
  groupName: string;
  requests: OpenRequest[];
  shifts: DayShift[];
  myId: string;
  onClose: () => void;
  onChanged: () => void;
  onAdd: () => void;
  onPickUp: (request: OpenRequest) => void;
};

/** Popup for one day: who's on shift, open posts, and a way to post your own. */
export function DayModal({
  date,
  groupName,
  requests,
  shifts,
  myId,
  onClose,
  onChanged,
  onAdd,
  onPickUp,
}: Props) {
  return (
    <CenterModal
      visible
      title={formatDateKey(date, { weekday: "long", month: "long", day: "numeric" })}
      subtitle={groupName}
      onClose={onClose}
    >
      {shifts.length > 0 ? (
        <View className="rounded-xl bg-peach-50 p-4">
          <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            On shift
          </Text>
          {shifts.map((shift) => (
            <Text key={shift.id} className="py-0.5 text-sm text-slate-700">
              <Text className="font-medium text-slate-900">
                {shift.user_id === myId ? "You" : shift.owner?.display_name ?? "Someone"}
              </Text>
              {" · "}
              {shift.shift_type || "Shift"} · {formatTimeRange(shift.starts_at, shift.ends_at)}
            </Text>
          ))}
        </View>
      ) : null}

      {requests.length === 0 ? (
        <Text className="text-slate-500">No posted shifts for this day.</Text>
      ) : (
        requests.map((request) => (
          <RequestCard
            key={request.id}
            request={request}
            mine={request.user_id === myId}
            onChanged={onChanged}
            onPickUp={() => onPickUp(request)}
          />
        ))
      )}

      <Button title="Post a shift for this day" onPress={onAdd} />
    </CenterModal>
  );
}

function RequestCard({
  request,
  mine,
  onChanged,
  onPickUp,
}: {
  request: OpenRequest;
  mine: boolean;
  onChanged: () => void;
  onPickUp: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const isDrop = request.kind === "drop";
  const name = mine ? "You" : request.requester?.display_name ?? "Someone";

  function markDone() {
    Alert.alert(
      "Mark this trade as done?",
      isDrop
        ? `Confirms you took ${name}'s ${request.shift_type} shift. ${
            request.stars > 0 ? `${request.stars} ${request.stars === 1 ? "star moves" : "stars move"} to you.` : ""
          }`
        : `Confirms you gave ${name} your shift that day.`,
      [
        { text: "Not yet", style: "cancel" },
        {
          text: "Mark done",
          onPress: async () => {
            setBusy(true);
            const { error } = await supabase.rpc("accept_swap_request", {
              p_request_id: request.id,
            });
            setBusy(false);
            if (error) {
              Alert.alert("Couldn't update", errorMessage(error));
              return;
            }
            onChanged();
          },
        },
      ]
    );
  }

  function cancel() {
    Alert.alert("Remove this post?", undefined, [
      { text: "Keep it", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          const { error } = await supabase.rpc("cancel_swap_request", {
            p_request_id: request.id,
          });
          setBusy(false);
          if (error) {
            Alert.alert("Couldn't remove", errorMessage(error));
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
            isDrop ? "bg-red-100" : "bg-green-100"
          }`}
        >
          <Ionicons name={isDrop ? "remove" : "add"} size={16} color={isDrop ? "#dc2626" : "#16a34a"} />
        </View>
        <Text className="flex-1 text-base font-medium text-slate-900">
          {name} {isDrop ? "giving up" : "wants to pick up"} a {request.shift_type || "shift"}
        </Text>
        {isDrop ? (
          <View className="flex-row items-center gap-1">
            <Ionicons name="star" size={14} color="#f59e0b" />
            <Text className="text-sm font-semibold text-slate-900">{request.stars}</Text>
          </View>
        ) : null}
      </View>
      {request.notes ? (
        <Text className="mt-1 text-sm italic text-slate-600">“{request.notes}”</Text>
      ) : null}
      <View className="mt-3 gap-2">
        {mine ? (
          <Button title="Remove my post" variant="danger" onPress={cancel} loading={busy} />
        ) : (
          <>
            <Button
              title={isDrop ? "Pick up" : "Offer my shift"}
              variant="red"
              onPress={onPickUp}
            />
            <Button title="Mark trade as done" variant="secondary" onPress={markDone} loading={busy} />
          </>
        )}
      </View>
    </View>
  );
}
