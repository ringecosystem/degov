import {
  createOpenRouter,
  OpenRouterProvider,
} from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod";
import * as cheerio from "cheerio";
import { marked } from "marked";

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
    console.log(OPENROUTER_API_KEY);
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
   * Extracts info from the description using a local fallback mechanism.
   * This method follows the same priority rules as the AI prompt.
   * @param description The text content to analyze.
   * @returns A string containing the extracted info, or an empty string if none is found.
   */
  private async _extractTitleLocally(description: string): Promise<string> {
    let content = description?.trim();
    if (!content) {
      return "";
    }

    content = await marked.parse(content);

    const $ = cheerio.load(content);
    const h1FromHtml = $("h1").first().text()?.trim();
    if (h1FromHtml) {
      return h1FromHtml;
    }

    const h2FromHtml = $("h2").first().text()?.trim();
    if (h2FromHtml) {
      return h2FromHtml;
    }

    const firstLine = content.split("\n").find((line) => line.trim() !== "");
    if (firstLine) {
      return firstLine.trim();
    }

    return "";
  }

  async extractInfo(description: string): Promise<ExtractTextInfo> {
    const openrouter = this.openrouter();
    let title = "";

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

    // **Fallback Logic Trigger**
    // If the title is still empty (because AI failed, returned nothing, or was never called),
    // use the local extraction method.
    if (!title) {
      console.log(
        "AI did not provide a title. Using local fallback extractor."
      );
      title = await this._extractTitleLocally(description);
    }

    return {
      title,
    };
  }
}
