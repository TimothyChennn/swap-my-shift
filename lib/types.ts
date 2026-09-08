// Row shapes for the tables the app reads. Kept by hand and small on purpose;
// keep in sync with supabase/migrations.

export type Role = "admin" | "employee";
export type SwapKind = "pickup" | "drop";
export type SwapStatus = "open" | "accepted" | "cancelled";
export type JoinStatus = "pending" | "approved" | "denied";

export type Profile = {
  id: string;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
  push_token: string | null;
  group_id: string | null;
  role: Role | null;
  calendar_url: string | null;
  calendar_synced_at: string | null;
  calendar_error: string | null;
};

export type Shift = {
  id: string;
  group_id: string;
  user_id: string;
  starts_at: string;
  ends_at: string;
  shift_type: string;
  source: "import" | "manual";
  external_id: string | null;
};

export type Group = {
  id: string;
  name: string;
  admin_id: string;
  created_at: string;
};

export type JoinRequest = {
  id: string;
  group_id: string;
  user_id: string;
  status: JoinStatus;
  created_at: string;
};

export type SwapRequest = {
  id: string;
  group_id: string;
  user_id: string;
  shift_id: string | null;
  kind: SwapKind;
  /** YYYY-MM-DD */
  date: string;
  shift_type: string;
  shift_time: string;
  notes: string;
  stars: number;
  status: SwapStatus;
  accepted_by: string | null;
  created_at: string;
};

export type StarTransaction = {
  id: string;
  group_id: string;
  from_user: string | null;
  to_user: string;
  amount: number;
  reason: string;
  created_at: string;
};

export type NotificationPrefs = {
  user_id: string;
  enabled: boolean;
  min_stars: number;
  notify_pickups: boolean;
  notify_drops: boolean;
  channel: "push" | "email" | "both";
};
