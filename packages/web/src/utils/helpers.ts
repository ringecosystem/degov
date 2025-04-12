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

// parse description to extract main text and signature content
export const parseDescription = (
  text?: string
): {
  mainText: string;
  signatureContent?: string[];
} => {
  if (!text) return { mainText: "" };

  const signaturePattern = /<signature>([\s\S]*?)<\/signature>/;
  const signatureMatch = text.match(signaturePattern);

  if (signatureMatch) {
    // extract signature content
    const signatureContent = signatureMatch[1]?.trim();

    // remove signature tag, get main text
    const mainText = text.replace(signaturePattern, "").trim();

    try {
      const signatureContentJson = JSON.parse(signatureContent);
      return {
        mainText,
        signatureContent: Array.isArray(signatureContentJson)
          ? signatureContentJson
          : [],
      };
    } catch (error) {
      console.error("Failed to parse signature content:", error);
      return { mainText };
    }
  }

  // no signature tag, all as main text
  return { mainText: text };
};

export const formatFunctionSignature = (signature: string): string => {
  if (!signature) return "";

  const match = signature.match(/([^(]+)\(/);
  if (match) {
    return `${match[1]}(..)`;
  }
  return signature;
};

export function extractMethodNameFromSignature(
  signature: string
): string | undefined {
  const match = signature.match(/^([a-zA-Z0-9_]+)\(/);
  return match ? match[1] : undefined;
}

interface ParamEntry {
  name: string;
  value: string;
}

/**
 * parse solidity function signature and match params, return {name: type, value: paramValue}[]
 */
export function parseSolidityFunctionParams(
  funcSignature: string,
  params: Record<string, string>
): ParamEntry[] {
  const paramTypesMatch = funcSignature.match(/\(([^)]*)\)/);
  if (!paramTypesMatch) {
    throw new Error("Invalid function signature");
  }

  const paramParts = paramTypesMatch[1].split(",").map((s) => s.trim());

  const paramTypes = paramParts.map((part) => {
    const typeMatch = part.match(/^(bytes|bytes|address|u?int\d+)/);
    return typeMatch ? typeMatch[1] : "unknown";
  });

  const paramValues = Object.values(params);

  return paramTypes.map((type, index) => ({
    name: type,
    value: paramValues[index],
  }));
}

export function simplifyFunctionSignature(fullSignature: string): string {
  // remove modifiers (e.g. `external payable`)
  const signatureWithoutModifiers = fullSignature.replace(
    /\)\s*(external|public|private|internal|payable)*\s*$/,
    ")"
  );

  // extract function name and params part
  const [funcName, paramsPart] = signatureWithoutModifiers.split("(");
  const params = paramsPart.split(")")[0];

  // handle no params case
  if (!params) return `${funcName.trim()}()`;

  // split params and extract type
  const simplifiedParams = params
    .split(",")
    .map((param) => param.trim().split(/\s+/)[0]) // get first word (type)
    .join(",");

  return `${funcName.trim()}(${simplifiedParams})`;
}

/**
 * Recursively process all standard properties in an object, converting them to uppercase
 * Handles all possible cases of missing properties or nested objects
 * @param obj The object to process
 * @returns A copy of the processed object
 */
export function processStandardProperties<T>(obj: T): T {
  // If input is not an object or is null, return it directly
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }

  // Create a shallow copy of the object to avoid modifying the original
  const result = Array.isArray(obj) ? ([...obj] as unknown as T) : { ...obj };

  // Iterate over all properties of the object
  Object.entries(result as Record<string, unknown>).forEach(([key, value]) => {
    if (key === "standard" && typeof value === "string") {
      // If the standard property is a string, convert it to uppercase
      (result as Record<string, unknown>)[key] = value.toUpperCase();
    } else if (typeof value === "object" && value !== null) {
      // If the property is a nested object or array, recursively process it
      (result as Record<string, unknown>)[key] =
        processStandardProperties(value);
    }
  });

  return result;
}
