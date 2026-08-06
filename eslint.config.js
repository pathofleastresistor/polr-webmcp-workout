import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "build/**",
      ".react-router/**",
      ".wrangler/**",
      "node_modules/**",
      "drizzle/**",
      "worker-configuration.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // `configs.flat` holds the flat-config variants; the top-level `configs`
  // entries are still legacy-shaped in eslint-plugin-react-hooks v7.
  reactHooks.configs.flat["recommended-latest"],
  {
    languageOptions: {
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    rules: {
      // Unused args are allowed when prefixed with `_`, which keeps required
      // signatures (middleware, route handlers) readable.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      // `any` erases the type safety the contracts layer exists to provide.
      "@typescript-eslint/no-explicit-any": "error",
      eqeqeq: ["error", "smart"],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // Build-time scripts run in Node, not in the Worker runtime.
    files: ["scripts/**/*.mjs", "*.config.ts", "*.config.js"],
    languageOptions: { globals: globals.node },
    rules: { "no-console": "off" },
  },
);
