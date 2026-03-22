const US_EASTERN_TIMEZONE = "America/New_York";
const TRADING_START_MINUTES = 9 * 60;
const TRADING_END_MINUTES = 16 * 60;
const TRADING_WEEKDAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"]);

function getEasternClockParts(date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: US_EASTERN_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const partByType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    weekday: String(partByType.weekday || ""),
    hour: Number(partByType.hour),
    minute: Number(partByType.minute),
  };
}

export function isWithinUsEasternTradingHours(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return false;
  }
  const { weekday, hour, minute } = getEasternClockParts(date);
  if (!TRADING_WEEKDAYS.has(weekday)) {
    return false;
  }
  const totalMinutes = hour * 60 + minute;
  return totalMinutes >= TRADING_START_MINUTES && totalMinutes < TRADING_END_MINUTES;
}

export const US_EASTERN_TRADING_HOURS_LABEL = "9:00 AM to 4:00 PM ET";
