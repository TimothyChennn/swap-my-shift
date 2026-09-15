import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AddShiftModal, type DayShift } from "../../components/AddShiftModal";
import { DayModal, type OpenRequest } from "../../components/DayModal";
import { ListSheet } from "../../components/ListSheet";
import { SectionTitle } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { CALENDAR_NOTICE } from "../../lib/config";
import { formatDateKey, monthCells, toDateKey } from "../../lib/dates";
import { errorMessage, supabase, syncShifts } from "../../lib/supabase";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const SYNC_INTERVAL_MS = 60 * 60 * 1000;

/** Calendar: group switcher, month grid with +/− badges, posted shifts below. */
export default function CalendarScreen() {
  const { session, memberships, currentGroup, setCurrentGroup, refresh } = useAuth();
  const myId = session!.user.id;
  const group = currentGroup!;
  const groupId = group.group_id;

  const [requests, setRequests] = useState<OpenRequest[]>([]);
  const [shifts, setShifts] = useState<DayShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthOffset, setMonthOffset] = useState(0);
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [addDate, setAddDate] = useState<string | null>(null);
  const [groupPicker, setGroupPicker] = useState(false);

  const today = toDateKey(new Date());
  const shown = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + monthOffset, 1);
  }, [monthOffset]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("swap_requests")
      .select("*, requester:profiles!swap_requests_user_id_fkey(display_name, email)")
      .eq("group_id", groupId)
      .eq("status", "open")
      .order("date")
      .order("created_at");
    setRequests((data as unknown as OpenRequest[]) ?? []);
    setLoading(false);
  }, [groupId]);

  const loadShifts = useCallback(async () => {
    const from = new Date(shown.getFullYear(), shown.getMonth(), -7);
    const to = new Date(shown.getFullYear(), shown.getMonth() + 1, 7);
    const { data } = await supabase
      .from("shifts")
      .select("id, user_id, starts_at, ends_at, shift_type, owner:profiles!shifts_user_id_fkey(display_name)")
      .eq("group_id", groupId)
      .gte("starts_at", from.toISOString())
      .lt("starts_at", to.toISOString())
      .order("starts_at");
    setShifts((data as unknown as DayShift[]) ?? []);
  }, [groupId, shown]);

  useFocusEffect(
    useCallback(() => {
      load();
      loadShifts();
    }, [load, loadShifts])
  );

  // Pull this group's Qgenda feed if it hasn't been synced in the last hour.
  useFocusEffect(
    useCallback(() => {
      if (!group.calendar_url) return;
      const last = group.calendar_synced_at ? Date.parse(group.calendar_synced_at) : 0;
      if (Date.now() - last < SYNC_INTERVAL_MS) return;
      syncShifts(groupId)
        .catch(() => {
          // The reason is stored on the membership; group settings shows it.
        })
        .finally(() => {
          refresh();
          loadShifts();
        });
    }, [group.calendar_url, group.calendar_synced_at, groupId, refresh, loadShifts])
  );

  // Refresh when anyone in the group posts, accepts, or removes a shift.
  useEffect(() => {
    const channel = supabase
      .channel(`swap_requests:${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "swap_requests", filter: `group_id=eq.${groupId}` },
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
    for (const r of requests) map.set(r.date, [...(map.get(r.date) ?? []), r]);
    return map;
  }, [requests]);

  const shiftsByDate = useMemo(() => {
    const map = new Map<string, DayShift[]>();
    for (const s of shifts) {
      const key = toDateKey(new Date(s.starts_at));
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return map;
  }, [shifts]);

  const upcoming = requests.filter((r) => r.date >= today);

  function openContact(request: OpenRequest) {
    router.push({ pathname: "/contact", params: { id: request.id } });
  }

  async function switchGroup(id: string) {
    setGroupPicker(false);
    if (id === groupId) return;
    try {
      await setCurrentGroup(id);
      setLoading(true);
    } catch (error) {
      Alert.alert("Couldn't switch group", errorMessage(error));
    }
  }

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-slate-50">
      {/* Header: group switcher + Add */}
      <View className="flex-row items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <Pressable onPress={() => setGroupPicker(true)} className="flex-1 flex-row items-center gap-1 pr-3">
          <View className="flex-1">
            <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Calendar
            </Text>
            <Text className="text-lg font-bold text-slate-900" numberOfLines={1}>
              {group.group.name}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={18} color="#64748b" />
        </Pressable>
        <Pressable
          onPress={() => setAddDate(today)}
          className="flex-row items-center gap-1 rounded-full bg-green-600 px-4 py-2 active:bg-green-700"
        >
          <Ionicons name="add" size={18} color="#ffffff" />
          <Text className="text-sm font-bold text-white">Add</Text>
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        <View className="m-4 rounded-2xl bg-peach-100 p-4">
          <View className="mb-3 flex-row items-center justify-between">
            <Pressable onPress={() => setMonthOffset((o) => o - 1)} hitSlop={12}>
              <Ionicons name="chevron-back" size={22} color="#334155" />
            </Pressable>
            <Text className="text-lg font-semibold text-slate-900">{monthLabel}</Text>
            <View className="flex-row items-center gap-3">
              {monthOffset !== 0 ? (
                <Pressable
                  onPress={() => setMonthOffset(0)}
                  className="rounded-full bg-white px-3 py-1"
                >
                  <Text className="text-xs font-semibold text-indigo-700">Today</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => setMonthOffset((o) => o + 1)} hitSlop={12}>
                <Ionicons name="chevron-forward" size={22} color="#334155" />
              </Pressable>
            </View>
          </View>

          <View className="flex-row">
            {WEEKDAYS.map((label, i) => (
              <View key={i} className="flex-1 items-center py-1">
                <Text className="text-xs font-semibold text-slate-500">{label}</Text>
              </View>
            ))}
          </View>

          <View className="flex-row flex-wrap">
            {cells.map((key, i) => {
              if (key === null) return <View key={`blank-${i}`} className="h-12 w-[14.28%]" />;
              const dayRequests = byDate.get(key) ?? [];
              const isToday = key === today;
              const working = (shiftsByDate.get(key) ?? []).some((s) => s.user_id === myId);
              return (
                <Pressable
                  key={key}
                  onPress={() => setDayOpen(key)}
                  className="h-12 w-[14.28%] items-center justify-center"
                >
                  <View
                    className={`h-8 w-8 items-center justify-center rounded-full ${
                      isToday ? "bg-indigo-600" : working ? "bg-white" : ""
                    }`}
                  >
                    <Text
                      className={
                        isToday
                          ? "text-sm font-bold text-white"
                          : working
                            ? "text-sm font-bold text-indigo-700"
                            : "text-sm text-slate-900"
                      }
                    >
                      {Number(key.slice(-2))}
                    </Text>
                  </View>
                  <View className="mt-0.5 h-3.5 flex-row gap-0.5">
                    {dayRequests.some((r) => r.kind === "pickup") && <Badge kind="pickup" />}
                    {dayRequests.some((r) => r.kind === "drop") && <Badge kind="drop" />}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1">
            <Legend color="bg-red-600" label="Giving up a shift" />
            <Legend color="bg-green-600" label="Wants to pick up" />
            <Legend color="bg-white" label="You work" />
          </View>
        </View>

        <Text className="mx-4 mb-3 text-sm font-semibold text-red-600">{CALENDAR_NOTICE}</Text>

        <View className="px-4 pb-8">
          <SectionTitle>Posted shifts</SectionTitle>
          {!loading && upcoming.length === 0 ? (
            <Text className="text-slate-500">
              Nothing posted yet. Tap the green Add button, or tap a day.
            </Text>
          ) : null}
          {upcoming.map((request) => (
            <RequestRow
              key={request.id}
              request={request}
              mine={request.user_id === myId}
              onPress={() => setDayOpen(request.date)}
              onPickUp={() => openContact(request)}
            />
          ))}
        </View>
      </ScrollView>

      <ListSheet
        visible={groupPicker}
        title="Switch group"
        items={memberships.map((m) => ({
          key: m.group_id,
          label: m.group.name,
          sublabel: m.role === "admin" ? "Admin" : undefined,
          selected: m.group_id === groupId,
        }))}
        onSelect={switchGroup}
        onClose={() => setGroupPicker(false)}
      />

      {dayOpen ? (
        <DayModal
          date={dayOpen}
          groupName={group.group.name}
          requests={byDate.get(dayOpen) ?? []}
          shifts={shiftsByDate.get(dayOpen) ?? []}
          myId={myId}
          onClose={() => setDayOpen(null)}
          onChanged={load}
          onAdd={() => {
            setAddDate(dayOpen);
            setDayOpen(null);
          }}
          onPickUp={(request) => {
            setDayOpen(null);
            openContact(request);
          }}
        />
      ) : null}

      {addDate ? (
        <AddShiftModal
          date={addDate}
          groupId={groupId}
          groupName={group.group.name}
          myId={myId}
          shiftsByDate={shiftsByDate}
          onClose={() => setAddDate(null)}
          onPosted={() => {
            setAddDate(null);
            load();
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

function Badge({ kind }: { kind: "pickup" | "drop" }) {
  const pickup = kind === "pickup";
  return (
    <View
      className={`h-3.5 w-3.5 items-center justify-center rounded-full ${
        pickup ? "bg-green-600" : "bg-red-600"
      }`}
    >
      <Text className="text-[10px] font-black leading-none text-white">{pickup ? "+" : "−"}</Text>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className={`h-2.5 w-2.5 rounded-full border border-slate-300 ${color}`} />
      <Text className="text-xs text-slate-600">{label}</Text>
    </View>
  );
}

function RequestRow({
  request,
  mine,
  onPress,
  onPickUp,
}: {
  request: OpenRequest;
  mine: boolean;
  onPress: () => void;
  onPickUp: () => void;
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
          pickup ? "bg-green-100" : "bg-red-100"
        }`}
      >
        <Ionicons name={pickup ? "add" : "remove"} size={22} color={pickup ? "#16a34a" : "#dc2626"} />
      </View>
      <View className="flex-1">
        <Text className="text-base font-medium text-slate-900">
          {name} · {request.shift_type || (pickup ? "pick up" : "give up")}
          {!pickup ? ` · ${request.stars} ★` : ""}
        </Text>
        <Text className="text-sm text-slate-500">{formatDateKey(request.date)}</Text>
        {request.notes ? (
          <Text className="mt-0.5 text-sm italic text-slate-600">“{request.notes}”</Text>
        ) : null}
      </View>
      {mine ? (
        <Text className="text-xs font-semibold uppercase text-slate-400">Yours</Text>
      ) : (
        <Pressable
          onPress={onPickUp}
          className="rounded-full bg-red-600 px-3 py-2 active:bg-red-700"
        >
          <Text className="text-xs font-bold text-white">{pickup ? "Offer" : "Pick up"}</Text>
        </Pressable>
      )}
    </Pressable>
  );
}
