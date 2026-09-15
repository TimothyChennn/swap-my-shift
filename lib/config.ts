// Product constants that show up in copy. Edit here, not in screens.

export const APP_NAME = "Shift Swap";

/** Who to contact for support and to buy stars. */
export const SUPPORT_EMAIL = "timodano@gmail.com";
export const STAR_SELLER = { name: "Michael Chen", email: SUPPORT_EMAIL };

export const SHIFT_TYPES = ["Day", "Night", "Swing", "Call"] as const;
export const STAR_OPTIONS = [0, 1, 2, 3, 4, 5] as const;
export const NOTES_MAX_LENGTH = 30;

export const TRADE_DISCLAIMER =
  "Shift Swap does not make changes to your schedule. For official trades, contact the person who posted the shift along with your scheduler/supervisor for approval.";

export const CALENDAR_NOTICE =
  "These are the available shifts. For a trade to be official, contact the person who posted the shift and your scheduler/supervisor for approval.";

export const QGENDA_INSTRUCTIONS =
  'In your Qgenda app, tap the 3 horizontal lines on the left. Then tap "Calendar sync". Copy the URL under "Your Subscription URL".';
