import { formatUnits } from "viem";

import { DECIMAL } from "@/config/base";

/**
 * Formats a number according to its magnitude, returning both abbreviated and full formats.
 * @param {number} num - The number to format.
 * @param {number} decimals - Number of decimal places
 * @returns {[string, string]} - An array containing shortFormat and longFormat.
 */
export function formatNumberForDisplay(
  num: number,
  decimals: number = 2
): [string, string] {
  if (typeof num !== "number") {
    throw new Error("Invalid input: Input must be a number.");
  }

  if (decimals < 0 || !Number.isInteger(decimals)) {
    throw new Error("Invalid decimals: Must be a non-negative integer.");
  }

  const absNum = Math.abs(num);

  // Full format with specified decimal places
  const longFormat = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);

  // Abbreviated format with specified decimal places
  let shortFormat = "";
  if (absNum >= 1e12) {
    shortFormat = (num / 1e12).toFixed(decimals) + "T";
  } else if (absNum >= 1e9) {
    shortFormat = (num / 1e9).toFixed(decimals) + "B";
  } else if (absNum >= 1e6) {
    shortFormat = (num / 1e6).toFixed(decimals) + "M";
  } else if (absNum >= 1e3) {
    shortFormat = (num / 1e3).toFixed(decimals) + "K";
  } else {
    shortFormat = num.toFixed(decimals);
  }

  return [shortFormat, longFormat];
}

export function formatBigIntForDisplay(
  value: bigint,
  decimals: number
): string {
  const numberValue = Number(formatUnits(value ?? 0n, decimals));
  return formatNumberForDisplay(numberValue)[0];
}

/**
 * Formats a BigInt number with decimals into two display formats
 * @param {bigint} value - The BigInt value to format
 * @param {number} decimals - Number of decimal places
 * @returns {[string, string]} - [original formatted value, fixed decimal formatted value]
 */
export function formatBigIntWithDecimals(
  value: bigint,
  valueDecimals: number,
  decimals: number = DECIMAL
): [string, string] {
  if (typeof value !== "bigint") {
    return ["0", "0"];
  }

  // Format original value using viem's formatUnits
  const originalFormat = formatUnits(value, valueDecimals);

  // Convert to number and format with fixed decimals
  const numberValue = Number(originalFormat);
  const fixedValue = numberValue.toFixed(decimals);

  // Format with thousand separators
  const formattedFixed = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(fixedValue));

  return [originalFormat, formattedFixed];
}
