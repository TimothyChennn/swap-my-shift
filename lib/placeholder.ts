/**
 * Placeholder data so the stub screens have something to render.
 * Delete this file once the screens read from Supabase.
 */

export type SwapKind = "pickup" | "drop";

export type SwapRequest = {
  id: string;
  /** Day of the current month. */
  day: number;
  kind: SwapKind;
  userName: string;
  shiftType: string;
  time: string;
  notes: string;
  stars: number;
};

export const swapRequests: SwapRequest[] = [
  {
    id: "1",
    day: 8,
    kind: "drop",
    userName: "Dana Reyes",
    shiftType: "Night",
    time: "7:00 PM – 7:00 AM",
    notes: "Family thing, happy to owe one.",
    stars: 3,
  },
  {
    id: "2",
    day: 12,
    kind: "pickup",
    userName: "Sam Okafor",
    shiftType: "Day",
    time: "7:00 AM – 7:00 PM",
    notes: "Looking to add a shift this week.",
    stars: 2,
  },
  {
    id: "3",
    day: 12,
    kind: "drop",
    userName: "Priya Nair",
    shiftType: "Swing",
    time: "3:00 PM – 11:00 PM",
    notes: "",
    stars: 4,
  },
  {
    id: "4",
    day: 21,
    kind: "drop",
    userName: "Alex Kim",
    shiftType: "Day",
    time: "7:00 AM – 7:00 PM",
    notes: "Conference travel.",
    stars: 5,
  },
];

export type Member = {
  id: string;
  name: string;
  stars: number;
  isAdmin: boolean;
};

export const members: Member[] = [
  { id: "1", name: "Alex Kim", stars: 14, isAdmin: true },
  { id: "2", name: "Priya Nair", stars: 11, isAdmin: false },
  { id: "3", name: "Dana Reyes", stars: 7, isAdmin: false },
  { id: "4", name: "Sam Okafor", stars: 5, isAdmin: false },
  { id: "5", name: "Jordan Ellis", stars: 2, isAdmin: false },
];

export type StarTransaction = {
  id: string;
  label: string;
  date: string;
  amount: number;
};

export const starTransactions: StarTransaction[] = [
  { id: "1", label: "Picked up Dana's night shift", date: "Aug 28", amount: 3 },
  { id: "2", label: "Granted by Alex Kim", date: "Aug 21", amount: 5 },
  { id: "3", label: "Dropped Aug 14 day shift", date: "Aug 12", amount: -4 },
  { id: "4", label: "Joined the group", date: "Aug 1", amount: 0 },
];

export type Role = "admin" | "employee";

export const currentUser: {
  name: string;
  role: Role;
  groupName: string;
  adminName: string;
  stars: number;
} = {
  name: "Jordan Ellis",
  role: "employee",
  groupName: "Mercy General – Nursing",
  adminName: "Alex Kim",
  stars: 2,
};
