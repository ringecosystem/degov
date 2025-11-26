import BigNumber from "bignumber.js";
import { clamp, take } from "lodash-es";
import { formatUnits } from "viem";

import { DECIMAL } from "@/config/base";

/**
 * toFixed that automatically removes trailing zeros
 * @param {number} num - The number to format
 * @param {number} decimals - Maximum number of decimal places
 * @returns {string} - Formatted number string without trailing zeros
 */
export function toFixedTrimZeros(num: number, decimals: number): string {
  return parseFloat(num.toFixed(decimals)).toString();
}

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
    shortFormat = toFixedTrimZeros(num / 1e12, decimals) + "T";
  } else if (absNum >= 1e9) {
    shortFormat = toFixedTrimZeros(num / 1e9, decimals) + "B";
  } else if (absNum >= 1e6) {
    shortFormat = toFixedTrimZeros(num / 1e6, decimals) + "M";
  } else if (absNum >= 1e3) {
    shortFormat = toFixedTrimZeros(num / 1e3, decimals) + "K";
  } else {
    shortFormat = toFixedTrimZeros(num, decimals);
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
  const fixedValue = toFixedTrimZeros(numberValue, decimals);

  // Format with thousand separators
  const formattedFixed = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(fixedValue));

  return [originalFormat, formattedFixed];
}

/**
 * Currency formatter: keeps at least two decimals but expands until two significant decimals appear.
 * @param value numeric amount
 * @returns formatted USD string
 */
export function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) {
    return "$0.00";
  }

  const amount = new BigNumber(value);
  if (!amount.isFinite()) {
    return "$0.00";
  }

  const absolute = amount.abs();
  const decimals = clamp(absolute.decimalPlaces() ?? 0, 0, 18);
  const fractionPart =
    decimals > 0
      ? absolute
          .toFixed(decimals, BigNumber.ROUND_DOWN)
          .split(".")[1] ?? ""
      : "";
  const meaningfulPositions = take(
    [...fractionPart]
      .map((digit, index) => (digit !== "0" ? index + 1 : 0))
      .filter(Boolean),
    2
  );
  const lastMeaningful =
    meaningfulPositions[meaningfulPositions.length - 1] ?? 0;
  const fractionDigits =
    decimals === 0
      ? 2
      : clamp(
          Math.max(lastMeaningful, 2),
          2,
          Math.max(decimals, 2)
        );

  const formatted = absolute.toFormat(
    fractionDigits,
    BigNumber.ROUND_HALF_UP,
    {
      decimalSeparator: ".",
      groupSeparator: ",",
      groupSize: 3,
    }
  );

  return `${amount.isNegative() ? "-" : ""}$${formatted}`;
}

/**
 * Currency formatter with fixed decimals, used when consumers need an exact digit count.
 * @param value numeric amount
 * @param decimals desired decimal digits (0-18)
 */
export function formatCurrencyFixed(
  value: number,
  decimals: number = 2
): string {
  const digits = Number.isFinite(decimals)
    ? clamp(Math.floor(decimals), 0, 18)
    : 2;
  const formatAmount = (amount: BigNumber): string => {
    const formatted = amount
      .abs()
      .toFormat(digits, BigNumber.ROUND_HALF_UP, {
        decimalSeparator: ".",
        groupSeparator: ",",
        groupSize: 3,
      });

    return `${amount.isNegative() ? "-" : ""}$${formatted}`;
  };

  if (!Number.isFinite(value)) {
    return formatAmount(new BigNumber(0));
  }

  const amount = new BigNumber(value);
  if (!amount.isFinite()) {
    return formatAmount(new BigNumber(0));
  }

  return formatAmount(amount);
}

/**
 * Format integer-like values with locale separators, returning fallback when value is missing.
 */
export function formatInteger(
  value?: number | string | null,
  fallback: string = "-"
): string {
  if (value === null || value === undefined) {
    return fallback;
  }

  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return new Intl.NumberFormat().format(numericValue);
}
