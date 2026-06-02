/**
 * Convert an address to a short address
 * @param address - The address to convert
 * @returns The short address
 */
export function formatShortAddress(text?: string) {
  if (!text) return "";
  return text?.length > 16 ? `${text?.slice(0, 7)}...${text?.slice(-6)}` : text;
}
