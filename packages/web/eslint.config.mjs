import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import importPlugin from "eslint-plugin-import";
import typescriptEslintPlugin from "@typescript-eslint/eslint-plugin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  
  {
    plugins: {
      import: importPlugin,
      "@typescript-eslint": typescriptEslintPlugin,
    },
    rules: {
      "import/order": [
        "error",
        {
          groups: [
            "builtin", 
            "external", 
            "internal", 
            "parent", 
            "sibling", 
            "index", 
            "object", 
            "type", 
          ],
          pathGroups: [
            {
              pattern: "@/**",
              group: "internal",
              position: "after",
            },
          ],
          "newlines-between": "always", 
          alphabetize: {
            order: "asc", 
            caseInsensitive: true, 
          },
        },
      ],
      
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports", 
          disallowTypeAnnotations: true, 
          fixStyle: "separate-type-imports", 
        },
      ],
    },
  },
];

export default eslintConfig;
