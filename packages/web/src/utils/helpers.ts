/**
 * Pauses the execution for a specified number of milliseconds.
 * @param ms The number of milliseconds to pause.
 * @returns A promise that resolves after the specified number of milliseconds.
 */
export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * from Markdown description extract title
 * description format is usually `# {title} \n\n{content}`
 * @param description Markdown description text
 * @returns Extracted title
 */
export function extractTitleFromDescription(description?: string): string {
  if (!description) return "";

  // match "#" content until newline
  const titleMatch = description.match(/^#\s+(.*?)(?:\n|$)/);

  if (titleMatch && titleMatch[1]) {
    // clean title (remove HTML tags and extra spaces)
    const cleanTitle = titleMatch[1]
      .replace(/<\/?[^>]+(>|$)/g, "") // remove HTML tags
      .trim();

    // handle special case for numeric titles (e.g. "# 1 1" -> "1")
    if (/^[\d\s]+$/.test(cleanTitle)) {
      const firstNumber = cleanTitle.match(/\d+/);
      return firstNumber ? firstNumber[0] : cleanTitle;
    }

    return cleanTitle;
  }

  // if no title is found, return the first 50 characters of description as title
  const fallbackTitle = description.replace(/<\/?[^>]+(>|$)/g, "").trim();
  return fallbackTitle.length > 50
    ? `${fallbackTitle.substring(0, 50)}...`
    : fallbackTitle;
}
