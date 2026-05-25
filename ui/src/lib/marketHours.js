const US_EASTERN_TIMEZONE = "America/New_York";
const TRADING_START_MINUTES = 9 * 60;
const TRADING_END_MINUTES = 16 * 60;
const TRADING_WEEKDAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"]);

/** NYSE full-day closures (America/New_York calendar dates), 2025–2028. */
const NYSE_HOLIDAYS = new Set([
  "2025-01-01",
  "2025-01-20",
  "2025-02-17",
  "2025-04-18",
  "2025-05-26",
  "2025-06-19",
  "2025-07-04",
  "2025-09-01",
  "2025-11-27",
  "2025-12-25",
  "2026-01-01",
  "2026-01-19",
  "2026-02-16",
  "2026-04-03",
  "2026-05-25",
  "2026-06-19",
  "2026-07-03",
  "2026-09-07",
  "2026-11-26",
  "2026-12-25",
  "2027-01-01",
  "2027-01-18",
  "2027-02-15",
  "2027-03-26",
  "2027-05-31",
  "2027-06-18",
  "2027-07-05",
  "2027-09-06",
  "2027-11-25",
  "2027-12-24",
  "2028-01-01",
  "2028-01-17",
  "2028-02-21",
  "2028-04-14",
  "2028-05-29",
  "2028-06-19",
  "2028-07-04",
  "2028-09-04",
  "2028-11-23",
  "2028-12-25",
]);

function getEasternClockParts(date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: US_EASTERN_TIMEZONE,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const partByType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    weekday: String(partByType.weekday || ""),
    year: Number(partByType.year),
    month: Number(partByType.month),
    day: Number(partByType.day),
    hour: Number(partByType.hour),
    minute: Number(partByType.minute),
  };
}

/** @returns {string} YYYY-MM-DD in US Eastern. */
export function getEasternDateKey(date = new Date()) {
  const { year, month, day } = getEasternClockParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isUsEquityHoliday(date = new Date()) {
  return NYSE_HOLIDAYS.has(getEasternDateKey(date));
}

export function isUsEquityTradingDay(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return false;
  }
  const { weekday } = getEasternClockParts(date);
  if (!TRADING_WEEKDAYS.has(weekday)) {
    return false;
  }
  return !isUsEquityHoliday(date);
}

/** Build a Date for a specific Eastern wall-clock moment (handles DST). */
function easternWallClockToDate(year, month, day, hour, minute) {
  const noonUtc = Date.UTC(year, month - 1, day, 12, 0);
  for (let offsetMs = -16 * 60 * 60 * 1000; offsetMs <= 16 * 60 * 60 * 1000; offsetMs += 60 * 1000) {
    const candidate = new Date(noonUtc + offsetMs);
    const parts = getEasternClockParts(candidate);
    if (
      parts.year === year &&
      parts.month === month &&
      parts.day === day &&
      parts.hour === hour &&
      parts.minute === minute
    ) {
      return candidate;
    }
  }
  return new Date(noonUtc);
}

/** @returns {Date|null} Next regular session open (9:00 AM ET); null when session is open. */
export function getNextUsEquitySessionOpen(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }

  const { weekday, hour, minute, year, month, day } = getEasternClockParts(date);
  const totalMinutes = hour * 60 + minute;
  const tradingDay = TRADING_WEEKDAYS.has(weekday) && !isUsEquityHoliday(date);

  if (tradingDay && totalMinutes >= TRADING_START_MINUTES && totalMinutes < TRADING_END_MINUTES) {
    return null;
  }

  if (tradingDay && totalMinutes < TRADING_START_MINUTES) {
    return easternWallClockToDate(year, month, day, 9, 0);
  }

  let probe = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  for (let i = 0; i < 14; i += 1) {
    const parts = getEasternClockParts(probe);
    const dayStart = easternWallClockToDate(parts.year, parts.month, parts.day, 0, 0);
    if (isUsEquityTradingDay(dayStart)) {
      return easternWallClockToDate(parts.year, parts.month, parts.day, 9, 0);
    }
    probe = new Date(probe.getTime() + 24 * 60 * 60 * 1000);
  }
  return null;
}

/**
 * @returns {{ isOpen: boolean, reason: string, nextOpenAt: Date|null }}
 * reason: open | weekend | holiday | before_hours | after_hours
 */
export function getUsMarketStatus(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return { isOpen: false, reason: "weekend", nextOpenAt: null };
  }

  const { weekday, hour, minute } = getEasternClockParts(date);
  const nextOpenAt = getNextUsEquitySessionOpen(date);

  if (!TRADING_WEEKDAYS.has(weekday)) {
    return { isOpen: false, reason: "weekend", nextOpenAt };
  }
  if (isUsEquityHoliday(date)) {
    return { isOpen: false, reason: "holiday", nextOpenAt };
  }

  const totalMinutes = hour * 60 + minute;
  if (totalMinutes < TRADING_START_MINUTES) {
    return { isOpen: false, reason: "before_hours", nextOpenAt };
  }
  if (totalMinutes >= TRADING_END_MINUTES) {
    return { isOpen: false, reason: "after_hours", nextOpenAt };
  }
  return { isOpen: true, reason: "open", nextOpenAt: null };
}

export function formatNextMarketOpenLabel(nextOpenAt) {
  if (!(nextOpenAt instanceof Date) || Number.isNaN(nextOpenAt.getTime())) {
    return "the next trading day";
  }
  return new Intl.DateTimeFormat("en-US", {
    timeZone: US_EASTERN_TIMEZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(nextOpenAt);
}

export function isWithinUsEasternTradingHours(date = new Date()) {
  return getUsMarketStatus(date).isOpen;
}

export const US_EASTERN_TRADING_HOURS_LABEL = "9:00 AM to 4:00 PM ET on US trading days";
