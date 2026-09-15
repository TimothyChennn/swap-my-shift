import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { NOTES_MAX_LENGTH, SHIFT_TYPES, STAR_OPTIONS } from "../lib/config";
import { formatDateKey, formatTimeRange, fromDateKey, toDateKey } from "../lib/dates";
import { errorMessage, supabase } from "../lib/supabase";
import type { Shift, SwapKind } from "../lib/types";
import { CenterModal } from "./CenterModal";
import { Button, Input } from "./ui";

export type DayShift = Pick<Shift, "id" | "user_id" | "starts_at" | "ends_at" | "shift_type"> & {
  owner: { display_name: string } | null;
};

type Props = {
  /** Initial date; the user can step it with the arrows. */
  date: string;
  groupId: string;
  groupName: string;
  myId: string;
  /** All loaded shifts keyed by date, to offer the user's real shift(s). */
  shiftsByDate: Map<string, DayShift[]>;
  onClose: () => void;
  onPosted: () => void;
};

/** Popup to post a shift you want to give up or pick up. */
export function AddShiftModal({
  date: initialDate,
  groupId,
  groupName,
  myId,
  shiftsByDate,
  onClose,
  onPosted,
}: Props) {
  const [date, setDate] = useState(initialDate);
  const [kind, setKind] = useState<SwapKind>("drop");
  const [type, setType] = useState<string>(SHIFT_TYPES[0]);
  const [customType, setCustomType] = useState("");
  const [starChoice, setStarChoice] = useState<number | "other">(1);
  const [customStars, setCustomStars] = useState("");
  const [notes, setNotes] = useState("");
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const myShifts = (shiftsByDate.get(date) ?? []).filter((s) => s.user_id === myId);

  function stepDate(days: number) {
    const d = fromDateKey(date);
    d.setDate(d.getDate() + days);
    setDate(toDateKey(d));
    setShiftId(null);
  }

  function chooseShift(shift: DayShift | null) {
    setShiftId(shift?.id ?? null);
    if (!shift) return;
    const known = SHIFT_TYPES.find((t) => t.toLowerCase() === shift.shift_type.toLowerCase());
    if (known) {
      setType(known);
    } else {
      setType("other");
      setCustomType(shift.shift_type || formatTimeRange(shift.starts_at, shift.ends_at));
    }
  }

  async function submit() {
    const shiftType = type === "other" ? customType.trim() : type;
    if (!shiftType) {
      Alert.alert("Pick a shift type");
      return;
    }
    let stars = 0;
    if (kind === "drop") {
      stars = starChoice === "other" ? Number.parseInt(customStars, 10) : starChoice;
      if (Number.isNaN(stars) || stars < 0) {
        Alert.alert("Stars must be a whole number");
        return;
      }
    }
    setBusy(true);
    const { error } = await supabase.rpc("post_swap_request", {
      p_group_id: groupId,
      p_kind: kind,
      p_date: date,
      p_shift_type: shiftType,
      p_notes: notes.trim(),
      p_stars: stars,
      p_shift_id: kind === "drop" ? shiftId : null,
    });
    setBusy(false);
    if (error) {
      Alert.alert("Couldn't post", errorMessage(error));
      return;
    }
    onPosted();
  }

  return (
    <CenterModal visible title="Post a shift" subtitle={groupName} onClose={onClose}>
      <View className="flex-row items-center justify-between rounded-xl bg-peach-100 px-3 py-2">
        <Pressable onPress={() => stepDate(-1)} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color="#334155" />
        </Pressable>
        <View className="items-center">
          <Text className="text-base font-semibold text-slate-900">
            {formatDateKey(date, { weekday: "short", month: "long", day: "numeric" })}
          </Text>
          <Text className="text-xs text-slate-500">{groupName}</Text>
        </View>
        <Pressable onPress={() => stepDate(1)} hitSlop={10}>
          <Ionicons name="chevron-forward" size={22} color="#334155" />
        </Pressable>
      </View>
      <Text className="text-xs text-slate-500">
        Tip: you can also tap any day on the calendar to post for that day.
      </Text>

      <View className="flex-row overflow-hidden rounded-lg border border-slate-200">
        <KindTab label="Give up a shift" selected={kind === "drop"} onPress={() => setKind("drop")} />
        <KindTab label="Pick up a shift" selected={kind === "pickup"} onPress={() => setKind("pickup")} />
      </View>
      <Text className="text-sm text-slate-600">
        {kind === "drop"
          ? "You have a shift you want to give up. You can give stars to sweeten the offer."
          : "You want to pick up a shift."}
      </Text>

      {kind === "drop" && myShifts.length > 0 ? (
        <Field label="Which of your shifts?">
          <View className="flex-row flex-wrap gap-2">
            {myShifts.map((shift) => (
              <Chip
                key={shift.id}
                label={`${shift.shift_type || "Shift"} · ${formatTimeRange(shift.starts_at, shift.ends_at)}`}
                selected={shiftId === shift.id}
                onPress={() => chooseShift(shift)}
              />
            ))}
            <Chip label="Not listed" selected={shiftId === null} onPress={() => chooseShift(null)} />
          </View>
        </Field>
      ) : null}

      <Field label="Shift type">
        <View className="flex-row flex-wrap gap-2">
          {SHIFT_TYPES.map((t) => (
            <Chip key={t} label={t} selected={type === t} onPress={() => setType(t)} />
          ))}
          <Chip label="Other" selected={type === "other"} onPress={() => setType("other")} />
        </View>
        {type === "other" ? (
          <Input
            value={customType}
            onChangeText={setCustomType}
            placeholder="e.g. 3p–11p, Backup"
            maxLength={30}
          />
        ) : null}
      </Field>

      {kind === "drop" ? (
        <Field label="Stars offered">
          <View className="flex-row flex-wrap gap-2">
            {STAR_OPTIONS.map((n) => (
              <Chip
                key={n}
                label={String(n)}
                selected={starChoice === n}
                onPress={() => setStarChoice(n)}
              />
            ))}
            <Chip
              label="Other"
              selected={starChoice === "other"}
              onPress={() => setStarChoice("other")}
            />
          </View>
          {starChoice === "other" ? (
            <Input
              value={customStars}
              onChangeText={setCustomStars}
              keyboardType="number-pad"
              placeholder="Number of stars"
            />
          ) : null}
        </Field>
      ) : null}

      <Field label={`Notes (${notes.length}/${NOTES_MAX_LENGTH})`}>
        <Input
          value={notes}
          onChangeText={setNotes}
          maxLength={NOTES_MAX_LENGTH}
          placeholder="Why you're trading, briefly"
        />
      </Field>

      <Button title="Post" onPress={submit} loading={busy} />
    </CenterModal>
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

export function Chip({
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
      className={`rounded-full border px-3 py-1.5 ${
        selected ? "border-indigo-600 bg-indigo-50" : "border-slate-200 bg-white"
      }`}
    >
      <Text className={`text-sm ${selected ? "font-semibold text-indigo-700" : "text-slate-700"}`}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-slate-700">{label}</Text>
      {children}
    </View>
  );
}
