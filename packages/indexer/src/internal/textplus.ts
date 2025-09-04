import {
  createOpenRouter,
  OpenRouterProvider,
} from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod";

export interface ExtractTextInfo {
  title: string;
}

// Zod schema remains the same
export const AnalysisResultSchema = z.object({
  title: z.string().describe("The title of description"),
});

export class TextPlus {
  private _openrouter: OpenRouterProvider | undefined;

  constructor() {}

  private openrouter(): OpenRouterProvider | undefined {
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) {
      console.warn(
        "OPENROUTER_API_KEY is not set. AI features will be disabled."
      );
      return undefined;
    }

    if (!this._openrouter) {
      this._openrouter = createOpenRouter({
        apiKey: OPENROUTER_API_KEY,
      });
    }
    return this._openrouter;
  }

  private aiModel(): string {
    return (
      process.env.OPENROUTER_DEFAULT_MODEL || "google/gemini-2.5-flash-preview"
    );
  }

  /**
   * from Markdown description to extract title and rich text content
   * description format is usually `# {title} \n\n{content}`
   * @param description Markdown description text
   * @returns an object containing the extracted title and rich text content
   */
  _extractTitleSimplify(description?: string): string {
    if (!description || !description.trim()) {
      return "";
    }

    const titleMatch = description.match(/^\s*#\s+(.+?)\s*$/m);
    if (titleMatch && titleMatch[1]) {
      return titleMatch[1].trim();
    }

    return "";
  }

  _extractTitleFullback(description?: string): string {
    if (!description || !description.trim()) {
      return "";
    }

    const cleanText = description
      .replace(/<\/?[^>]+(>|$)/g, "")
      .replace(/^\s*#+\s+/gm, "")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/!?\[(.*?)\]\(.*?\)/g, "$1")
      .replace(/^\s*[-*_]{3,}\s*$/gm, "")
      .replace(/^\s*>\s?/gm, "")
      .trim();

    const firstLine = cleanText.split("\n")[0]?.trim();

    if (!firstLine) {
      return "";
    }

    const maxLength = 50;
    return firstLine.length > maxLength
      ? `${firstLine.substring(0, maxLength)}...`
      : firstLine;
  }

  async extractInfo(description: string): Promise<ExtractTextInfo> {
    const openrouter = this.openrouter();
    let title: string | undefined;
    if (openrouter) {
      try {
        const aiResp = await generateObject({
          model: openrouter(this.aiModel()),
          schema: AnalysisResultSchema,
          system: `
## Role
You are an experienced Content Strategist and master Copywriter, skilled at distilling complex information into captivating titles that reflect the core message. Your objective is to generate the required titles for the content provided.

## Task
Based on the provided "Original Content" and "Specific Requirements," extract and generate a professional title.
And you must return the content in pure JSON format as required.

## Basic Requirements

- The title must contain the core theme.
- The title will be used for: A blog post.
- If the user provides specific requirements, they take precedence.
- The returned content must be a raw JSON string.
- If the original content does not specify a date, do not include year, month, or day information in the title to avoid inaccuracies and prevent misleading the reader.

## Output Format

Return a single JSON object with these fields:

{
  "title": "string"
}
          `,
          prompt: `
${description}
---
Extract a title from the content above, following these rules in order:

1. **Priority 1**: Extract the first H1 heading (e.g., \`<h1>...\`</h1>\` or \`# ...\`) from the content.
2. **Priority 2**: If no H1 heading exists, use the first line of the content, provided it effectively summarizes the main topic.
3. **Priority 3**: If both of the above methods fail, generate a concise title by summarizing the content.
          `,
        });
        // Ensure the title from AI is valid before assigning
        if (aiResp.object.title && aiResp.object.title.trim()) {
          title = aiResp.object.title.trim();
        }
      } catch (e) {
        console.error(
          "Error generating title with AI. Falling back to local extraction.",
          e
        );
        // AI failed, title is still ""
      }
    }

    if (!title) {
      title = this._extractTitleSimplify(description);
      console.log("Extracted title simplify:", title);
    }

    // If the title is still empty (because AI failed, returned nothing, or was never called),
    // use the local extraction method.
    if (!title) {
      console.log(
        "No suitable title was found. Using local fallback extractor."
      );
      title = this._extractTitleFullback(description);
    }

    return {
      title,
    };
  }
}
