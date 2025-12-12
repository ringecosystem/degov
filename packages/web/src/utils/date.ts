import dayjs from "dayjs";
import duration, { type DurationUnitType } from "dayjs/plugin/duration";
import relativeTime from "dayjs/plugin/relativeTime";
dayjs.extend(duration);
dayjs.extend(relativeTime);

export const dayjsHumanize = (num: number, unit: string = "seconds") => {
  return dayjs.duration(num, unit as DurationUnitType).humanize();
};
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

/**
 * Format timestamp to custom time ago format based on client requirements
 * @param timestamp Unix timestamp in milliseconds (as string)
 * @returns Custom formatted time ago string
 */
export function formatTimeAgo(timestamp: string) {
  if (!timestamp) return "";

  const timestampNum = Number(timestamp);
  if (isNaN(timestampNum)) {
    console.error(`Invalid timestamp: "${timestamp}"`);
    return "";
  }

  // Handle both seconds and milliseconds timestamps
  const isMilliseconds = timestampNum > 10000000000;
  const date = isMilliseconds ? dayjs(timestampNum) : dayjs.unix(timestampNum);
  const now = dayjs();

  if (!date.isValid()) {
    console.error(`Invalid date from timestamp: "${timestamp}"`);
    return "";
  }

  // If date is in the future, return formatted date
  if (date.isAfter(now)) {
    if (date.year() === now.year()) {
      return date.format("MMM D");
    } else {
      return date.format("MMM D, YYYY");
    }
  }

  // Calculate differences
  const diffMinutes = now.diff(date, "minute");
  const diffHours = now.diff(date, "hour");
  const diffDays = now.diff(date, "day");
  const diffWeeks = now.diff(date, "week");
  const diffMonths = now.diff(date, "month");

  // Different year - show "MMM D, YYYY" format (e.g., "Mar 20, 2024")
  if (date.year() !== now.year()) {
    return date.format("MMM D, YYYY");
  }

  // More than 1 month - show "MMM D" format for current year (e.g., "Apr 20")
  if (diffMonths >= 1) {
    return date.format("MMM D");
  }

  // 3 weeks ago
  if (diffWeeks === 3) {
    return "three weeks ago";
  }

  // 2 weeks ago
  if (diffWeeks === 2) {
    return "two weeks ago";
  }

  // 1 week ago
  if (diffWeeks === 1) {
    return "one week ago";
  }

  // More than 3 weeks but less than 1 month
  if (diffDays >= 21) {
    return "last month";
  }

  // Yesterday
  if (diffDays === 1) {
    return "yesterday";
  }

  // More than 1 day but less than 1 week - show days
  if (diffDays >= 2) {
    return `${diffDays} days ago`;
  }

  // Less than 24 hours - show hours
  if (diffHours >= 1) {
    return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;
  }

  // Less than 1 hour - show minutes
  if (diffMinutes >= 1) {
    return `${diffMinutes} ${diffMinutes === 1 ? "minute" : "minutes"} ago`;
  }

  return dayjs().from(date);
}
