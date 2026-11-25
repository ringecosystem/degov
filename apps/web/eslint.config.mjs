import pluginQuery from "@tanstack/eslint-plugin-query";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import importPlugin from "eslint-plugin-import";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  ...pluginQuery.configs["flat/recommended"],
  {
    plugins: {
      import: importPlugin,
    },
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/incompatible-library": "warn",
      "import/order": [
        "warn",
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
  // Override default ignores to match Next.js recommendations
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Third-party UI primitives; keep lint noise out
    "src/components/editor/**",
    "src/components/ui/**",
  ]),
]);
