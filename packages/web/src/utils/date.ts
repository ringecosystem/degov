import dayjs from "dayjs";
import duration, { type DurationUnitType } from "dayjs/plugin/duration";
import relativeTime from "dayjs/plugin/relativeTime";
dayjs.extend(duration);
dayjs.extend(relativeTime);

export const dayjsHumanize = (num: number, unit: string = "seconds") => {
  return dayjs.duration(num, unit as DurationUnitType).humanize();
};
/**
 * get ordinal suffix (st, nd, rd, th)
 */
function getOrdinalSuffix(day: number): string {
  if (day > 3 && day < 21) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

/**
 * format date to friendly format (e.g. "Jan 7th, 2025")
 * @param dateString ISO format date string (e.g. "2025-02-24T11:43:58.708143Z")
 * @returns formatted date string
 */
export function formatFriendlyDate(dateString: string): string {
  if (!dateString) return "";
  const date = dayjs(dateString);
  if (!date.isValid()) {
    console.error(`Invalid date string: "${dateString}"`);
    return "";
  }
  const day = date.date();
  const suffix = getOrdinalSuffix(day);

  return date.format(`MMM D[${suffix}], YYYY`);
}

/**
 * Format Unix timestamp (seconds) to friendly date format
 * @param timestamp Unix timestamp in seconds
 * @returns formatted date string (e.g. "Jan 7th, 2025")
 */
export function formatTimestampToFriendlyDate(
  timestamp?: number | string
): string {
  if (!timestamp) return "";

  const timestampNum =
    typeof timestamp === "string" ? parseInt(timestamp, 10) : timestamp;

  if (isNaN(timestampNum)) {
    console.error(`Invalid timestamp: "${timestamp}"`);
    return "";
  }

  const date = dayjs.unix(timestampNum / 1000);

  if (!date.isValid()) {
    console.error(`Invalid date from timestamp: "${timestamp}"`);
    return "";
  }

  const day = date.date();
  const suffix = getOrdinalSuffix(day);

  return date.format(`MMM D[${suffix}], YYYY`);
}

/**
 * Format Unix timestamp (milliseconds) to day and time format
 * @param timestamp Unix timestamp in milliseconds
 * @returns formatted date string (e.g. "Tue Feb 25, 09:02 pm")
 */
export function formatTimestampToDayTime(timestamp?: number | string): string {
  if (!timestamp) return "";
  const timestampNum =
    typeof timestamp === "string" ? parseInt(timestamp, 10) : timestamp;
  if (isNaN(timestampNum)) {
    console.error(`Invalid timestamp: "${timestamp}"`);
    return "";
  }
  // Convert milliseconds to seconds for dayjs.unix()
  const date = dayjs.unix(timestampNum / 1000);
  if (!date.isValid()) {
    console.error(`Invalid date from timestamp: "${timestamp}"`);
    return "";
  }
  return date.format("ddd MMM D, hh:mm a");
}

/**
 * Calculate and format the time remaining until a given timestamp
 * @param endTime Timestamp in milliseconds for the end time
 * @returns Formatted string like "in 8 days", "in 3 hours", or "ended"
 */
export function getTimeRemaining(endTime: number): string {
  const now = dayjs();
  const end = dayjs(endTime);

  if (end.isBefore(now)) {
    return "";
  }

  const diffDays = end.diff(now, "day");
  if (diffDays >= 1) {
    return `in ${diffDays} ${diffDays === 1 ? "day" : "days"}`;
  }

  const diffHours = end.diff(now, "hour");
  if (diffHours >= 1) {
    return `in ${diffHours} ${diffHours === 1 ? "hour" : "hours"}`;
  }

  const diffMinutes = end.diff(now, "minute");
  return `in ${diffMinutes} ${diffMinutes === 1 ? "minute" : "minutes"}`;
}
