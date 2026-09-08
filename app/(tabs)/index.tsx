import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { DaySheet, type DayShift, type OpenRequest } from "../../components/DaySheet";
import { SectionTitle } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { formatDateKey, monthCells, toDateKey } from "../../lib/dates";
import { supabase, syncShifts } from "../../lib/supabase";

const SYNC_INTERVAL_MS = 60 * 60 * 1000;

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/** Home: month calendar with +/− badges, open requests below, day sheet on tap. */
export default function HomeScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const myId = session!.user.id;
  const groupId = profile!.group_id!;

  const [requests, setRequests] = useState<OpenRequest[]>([]);
  const [shifts, setShifts] = useState<DayShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("swap_requests")
      .select("*, requester:profiles!swap_requests_user_id_fkey(display_name)")
      .eq("status", "open")
      .order("date")
      .order("created_at");
    setRequests((data as OpenRequest[]) ?? []);
    setLoading(false);
  }, []);

  const today = toDateKey(new Date());
  const shown = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + monthOffset, 1);
  }, [monthOffset]);

  const loadShifts = useCallback(async () => {
    const from = new Date(shown.getFullYear(), shown.getMonth(), -7);
    const to = new Date(shown.getFullYear(), shown.getMonth() + 1, 7);
    const { data } = await supabase
      .from("shifts")
      .select("id, user_id, starts_at, ends_at, shift_type, owner:profiles!shifts_user_id_fkey(display_name)")
      .gte("starts_at", from.toISOString())
      .lt("starts_at", to.toISOString())
      .order("starts_at");
    setShifts((data as unknown as DayShift[]) ?? []);
  }, [shown]);

  useFocusEffect(
    useCallback(() => {
      load();
      loadShifts();
    }, [load, loadShifts])
  );

  // Pull the user's Qgenda feed if it hasn't been synced in the last hour.
  useFocusEffect(
    useCallback(() => {
      if (!profile?.calendar_url) return;
      const last = profile.calendar_synced_at ? Date.parse(profile.calendar_synced_at) : 0;
      if (Date.now() - last < SYNC_INTERVAL_MS) return;
      syncShifts()
        .catch(() => {
          // The failure reason is stored on the profile; Settings shows it.
        })
        .finally(() => {
          refreshProfile();
          loadShifts();
        });
    }, [profile?.calendar_url, profile?.calendar_synced_at, refreshProfile, loadShifts])
  );

  // Refresh when anyone in the group posts, accepts, or cancels.
  useEffect(() => {
    const channel = supabase
      .channel(`swap_requests:${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "swap_requests",
          filter: `group_id=eq.${groupId}`,
        },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, load]);

  const cells = monthCells(shown.getFullYear(), shown.getMonth());
  const monthLabel = shown.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const byDate = useMemo(() => {
    const map = new Map<string, OpenRequest[]>();
    for (const r of requests) {
      map.set(r.date, [...(map.get(r.date) ?? []), r]);
    }
    return map;
  }, [requests]);

  const shiftsByDate = useMemo(() => {
    const map = new Map<string, DayShift[]>();
    for (const shift of shifts) {
      const key = toDateKey(new Date(shift.starts_at));
      map.set(key, [...(map.get(key) ?? []), shift]);
    }
    return map;
  }, [shifts]);

  const upcoming = requests.filter((r) => r.date >= today);

  return (
    <>
      <ScrollView
        className="flex-1 bg-slate-50"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        <View className="m-4 rounded-2xl bg-white p-4">
          <View className="mb-3 flex-row items-center justify-between">
            <Pressable onPress={() => setMonthOffset((o) => o - 1)} hitSlop={12}>
              <Ionicons name="chevron-back" size={22} color="#475569" />
            </Pressable>
            <Text className="text-lg font-semibold text-slate-900">{monthLabel}</Text>
            <Pressable onPress={() => setMonthOffset((o) => o + 1)} hitSlop={12}>
              <Ionicons name="chevron-forward" size={22} color="#475569" />
            </Pressable>
          </View>

          <View className="flex-row">
            {WEEKDAYS.map((label, i) => (
              <View key={i} className="flex-1 items-center py-1">
                <Text className="text-xs font-medium text-slate-400">{label}</Text>
              </View>
            ))}
          </View>

          <View className="flex-row flex-wrap">
            {cells.map((key, i) => {
              if (key === null) {
                return <View key={`blank-${i}`} className="h-12 w-[14.28%]" />;
              }
              const dayRequests = byDate.get(key) ?? [];
              const isToday = key === today;
              const working = (shiftsByDate.get(key) ?? []).some((s) => s.user_id === myId);
              return (
                <Pressable
                  key={key}
                  onPress={() => setSelectedDate(key)}
                  className="h-12 w-[14.28%] items-center justify-center"
                >
                  <View
                    className={`h-8 w-8 items-center justify-center rounded-full ${
                      isToday ? "bg-indigo-600" : working ? "bg-indigo-50" : ""
                    }`}
                  >
                    <Text
                      className={
                        isToday
                          ? "text-sm font-semibold text-white"
                          : working
                            ? "text-sm font-semibold text-indigo-700"
                            : "text-sm text-slate-900"
                      }
                    >
                      {Number(key.slice(-2))}
                    </Text>
                  </View>
                  <View className="mt-0.5 h-3 flex-row gap-0.5">
                    {dayRequests.some((r) => r.kind === "pickup") && <Badge kind="pickup" />}
                    {dayRequests.some((r) => r.kind === "drop") && <Badge kind="drop" />}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="px-4 pb-8">
          <SectionTitle>Open requests</SectionTitle>
          {!loading && upcoming.length === 0 ? (
            <Text className="text-slate-500">
              Nothing open right now. Tap a day to post one.
            </Text>
          ) : null}
          {upcoming.map((request) => (
            <RequestRow
              key={request.id}
              request={request}
              mine={request.user_id === myId}
              onPress={() => setSelectedDate(request.date)}
            />
          ))}
        </View>
      </ScrollView>

      <DaySheet
        date={selectedDate}
        requests={selectedDate ? byDate.get(selectedDate) ?? [] : []}
        shifts={selectedDate ? shiftsByDate.get(selectedDate) ?? [] : []}
        myId={myId}
        onClose={() => setSelectedDate(null)}
        onChanged={load}
      />
    </>
  );
}

function Badge({ kind }: { kind: "pickup" | "drop" }) {
  const pickup = kind === "pickup";
  return (
    <View
      className={`h-3 w-3 items-center justify-center rounded-full ${
        pickup ? "bg-emerald-100" : "bg-amber-100"
      }`}
    >
      <Text
        className={`text-[9px] font-bold leading-none ${
          pickup ? "text-emerald-700" : "text-amber-700"
        }`}
      >
        {pickup ? "+" : "−"}
      </Text>
    </View>
  );
}

function RequestRow({
  request,
  mine,
  onPress,
}: {
  request: OpenRequest;
  mine: boolean;
  onPress: () => void;
}) {
  const pickup = request.kind === "pickup";
  const name = mine ? "You" : request.requester?.display_name ?? "Someone";
  return (
    <Pressable
      onPress={onPress}
      className="mb-2 flex-row items-center gap-3 rounded-xl bg-white p-4 active:bg-slate-100"
    >
      <View
        className={`h-10 w-10 items-center justify-center rounded-full ${
          pickup ? "bg-emerald-50" : "bg-amber-50"
        }`}
      >
        <Ionicons
          name={pickup ? "add" : "remove"}
          size={20}
          color={pickup ? "#047857" : "#b45309"}
        />
      </View>
      <View className="flex-1">
        <Text className="text-base font-medium text-slate-900">
          {name} · {request.shift_type || (pickup ? "pick up" : "drop")}
        </Text>
        <Text className="text-sm text-slate-500">
          {formatDateKey(request.date)}
          {request.shift_time ? ` · ${request.shift_time}` : ""}
        </Text>
      </View>
      {!pickup ? (
        <View className="flex-row items-center gap-1">
          <Ionicons name="star" size={14} color="#f59e0b" />
          <Text className="text-sm font-semibold text-slate-900">{request.stars}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
