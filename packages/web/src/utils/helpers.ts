/**
 * Pauses the execution for a specified number of milliseconds.
 * @param ms The number of milliseconds to pause.
 * @returns A promise that resolves after the specified number of milliseconds.
 */
export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * from Markdown description to extract title and rich text content
 * description format is usually `# {title} \n\n{content}`
 * @param description Markdown description text
 * @returns an object containing the extracted title and rich text content
 */
export function extractTitleAndDescription(description?: string): {
  title: string;
  description: string;
} {
  if (!description) return { title: "", description: "" };

  // match "#" content until newline
  const titleMatch = description.match(/^#\s+(.*?)(?:\n|$)/);
  let title = "";
  let content = description;

  if (titleMatch && titleMatch[1]) {
    // clean title (remove HTML tags and extra spaces)
    const cleanTitle = titleMatch[1]
      .replace(/<\/?[^>]+(>|$)/g, "") // remove HTML tags
      .trim();

    // handle special case for numeric titles (e.g. "# 1 1" -> "1")
    if (/^[\d\s]+$/.test(cleanTitle)) {
      const firstNumber = cleanTitle.match(/\d+/);
      title = firstNumber ? firstNumber[0] : cleanTitle;
    } else {
      title = cleanTitle;
    }

    // remove title part from content, but keep the rest of the rich text format
    content = description.replace(/^#\s+.*?(?:\n|$)/, "").trim();
  } else {
    // if no title is found, use the first 50 characters of the description as title
    const fallbackTitle = description.replace(/<\/?[^>]+(>|$)/g, "").trim();
    title =
      fallbackTitle.length > 50
        ? `${fallbackTitle.substring(0, 50)}...`
        : fallbackTitle;
  }

  return {
    title,
    description: content,
  };
}
