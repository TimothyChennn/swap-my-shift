import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import { SwapRequest, swapRequests } from "../../lib/placeholder";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * Home. Month calendar on top, list of open requests below.
 * Tapping a day opens the day sheet. All data is placeholder for now.
 */
export default function HomeScreen() {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const today = useMemo(() => new Date(), []);
  const monthLabel = today.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const firstWeekday = new Date(
    today.getFullYear(),
    today.getMonth(),
    1
  ).getDay();
  const daysInMonth = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    0
  ).getDate();

  // Leading blanks so the 1st lands on the right weekday.
  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const requestsForDay = (day: number) =>
    swapRequests.filter((r) => r.day === day);

  return (
    <>
      <ScrollView className="flex-1 bg-slate-50">
        <View className="m-4 rounded-2xl bg-white p-4">
          <Text className="mb-3 text-lg font-semibold text-slate-900">
            {monthLabel}
          </Text>

          <View className="flex-row">
            {WEEKDAYS.map((label, i) => (
              <View key={i} className="flex-1 items-center py-1">
                <Text className="text-xs font-medium text-slate-400">
                  {label}
                </Text>
              </View>
            ))}
          </View>

          <View className="flex-row flex-wrap">
            {cells.map((day, i) => {
              if (day === null) {
                return <View key={`blank-${i}`} className="h-12 w-[14.28%]" />;
              }
              const dayRequests = requestsForDay(day);
              const isToday = day === today.getDate();
              return (
                <Pressable
                  key={day}
                  onPress={() => setSelectedDay(day)}
                  className="h-12 w-[14.28%] items-center justify-center"
                >
                  <View
                    className={`h-8 w-8 items-center justify-center rounded-full ${
                      isToday ? "bg-indigo-600" : ""
                    }`}
                  >
                    <Text
                      className={
                        isToday
                          ? "text-sm font-semibold text-white"
                          : "text-sm text-slate-900"
                      }
                    >
                      {day}
                    </Text>
                  </View>
                  <View className="mt-0.5 h-3 flex-row gap-0.5">
                    {dayRequests.some((r) => r.kind === "pickup") && (
                      <Badge kind="pickup" />
                    )}
                    {dayRequests.some((r) => r.kind === "drop") && (
                      <Badge kind="drop" />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="px-4 pb-8">
          <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Open requests
          </Text>
          {swapRequests.map((request) => (
            <RequestRow
              key={request.id}
              request={request}
              onPress={() => setSelectedDay(request.day)}
            />
          ))}
        </View>
      </ScrollView>

      <DaySheet
        day={selectedDay}
        requests={selectedDay === null ? [] : requestsForDay(selectedDay)}
        onClose={() => setSelectedDay(null)}
      />
    </>
  );
}

function Badge({ kind }: { kind: "pickup" | "drop" }) {
  return (
    <View
      className={`h-3 w-3 items-center justify-center rounded-full ${
        kind === "pickup" ? "bg-emerald-100" : "bg-amber-100"
      }`}
    >
      <Text
        className={`text-[9px] font-bold leading-none ${
          kind === "pickup" ? "text-emerald-700" : "text-amber-700"
        }`}
      >
        {kind === "pickup" ? "+" : "−"}
      </Text>
    </View>
  );
}

function RequestRow({
  request,
  onPress,
}: {
  request: SwapRequest;
  onPress: () => void;
}) {
  const isPickup = request.kind === "pickup";
  return (
    <Pressable
      onPress={onPress}
      className="mb-2 flex-row items-center gap-3 rounded-xl bg-white p-4 active:bg-slate-100"
    >
      <View
        className={`h-10 w-10 items-center justify-center rounded-full ${
          isPickup ? "bg-emerald-50" : "bg-amber-50"
        }`}
      >
        <Ionicons
          name={isPickup ? "add" : "remove"}
          size={20}
          color={isPickup ? "#047857" : "#b45309"}
        />
      </View>
      <View className="flex-1">
        <Text className="text-base font-medium text-slate-900">
          {request.userName} · {request.shiftType}
        </Text>
        <Text className="text-sm text-slate-500">
          Day {request.day} · {request.time}
        </Text>
      </View>
      <View className="flex-row items-center gap-1">
        <Ionicons name="star" size={14} color="#f59e0b" />
        <Text className="text-sm font-semibold text-slate-900">
          {request.stars}
        </Text>
      </View>
    </Pressable>
  );
}

function DaySheet({
  day,
  requests,
  onClose,
}: {
  day: number | null;
  requests: SwapRequest[];
  onClose: () => void;
}) {
  return (
    <Modal
      visible={day !== null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable className="flex-1 bg-black/40" onPress={onClose} />
      <View className="rounded-t-3xl bg-white p-5 pb-10">
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="text-lg font-semibold text-slate-900">
            Day {day}
          </Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={22} color="#64748b" />
          </Pressable>
        </View>

        {requests.length === 0 ? (
          <Text className="mb-4 text-slate-500">No open requests.</Text>
        ) : (
          requests.map((request) => (
            <View
              key={request.id}
              className="mb-2 rounded-xl border border-slate-200 p-4"
            >
              <Text className="text-base font-medium text-slate-900">
                {request.kind === "pickup" ? "Wants to pick up" : "Wants to drop"}
                {" · "}
                {request.shiftType}
              </Text>
              <Text className="text-sm text-slate-500">{request.time}</Text>
              {request.notes ? (
                <Text className="mt-1 text-sm text-slate-500">
                  {request.notes}
                </Text>
              ) : null}
              <Text className="mt-2 text-sm font-semibold text-slate-900">
                {request.stars} stars · {request.userName}
              </Text>
            </View>
          ))
        )}

        <Pressable className="mt-2 rounded-xl bg-indigo-600 px-4 py-4 active:bg-indigo-700">
          <Text className="text-center text-base font-semibold text-white">
            Post a request
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}
