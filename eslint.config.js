// ESLint flat config. eslint 10 has no eslintrc support, so this replaces
// .eslintrc.cjs (2026-10-21) with the same rule set: eslint:recommended plus
// typescript-eslint's recommended, the same relaxations, the same ignores.

import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    // eslintrc ignorePatterns matched at any depth (gitignore rules); flat
    // ignores are relative to this file, hence the **/ prefixes.
    ignores: [
      "**/dist/",
      "**/node_modules/",
      "**/tests/",
      // Inline *.test.ts files are excluded from tsconfig (see "exclude"), so the
      // type-aware parser (parserOptions.project) cannot parse them — don't lint them,
      // consistent with the tests/ directory already being ignored.
      "src/**/*.test.ts",
      "**/examples/",
      // research/ became tracked on 2026-08-05 (its scripts are the provenance of
      // constants that ship in src/). It is deliberately outside tsconfig — these
      // are standalone runners, not product code — so the type-aware parser cannot
      // read them and every commit touching one failed lint-staged. Same reasoning
      // as tests/ and src/**/*.test.ts above.
      "**/research/",
      // scripts/*.ts are standalone runners outside tsconfig too (2026-10-21:
      // gen-devtools-devices.ts hit the same parser error), same reasoning.
      "scripts/**/*.ts",
      "**/docs/",
      "**/*.js",
      "**/*.cjs",
      "**/*.mjs",
    ],
  },
  js.configs.recommended,
  ...tsPlugin.configs["flat/recommended"],
  {
    // eslint 9 started reporting unused eslint-disable comments by default.
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    // No node globals (eslintrc env.node): typescript-eslint turns no-undef off
    // for .ts files because tsc already checks names, so they changed nothing.
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Relaxed rules for existing codebase - will tighten over time
      "@typescript-eslint/no-explicit-any": "off",  // TODO: Enable as "warn" and fix
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        // eslint 9 changed the default from "none" to "all"; "none" is what
        // this config has always enforced.
        caughtErrors: "none",
      }],
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "no-case-declarations": "off",
      "no-empty": "off",
      "prefer-const": "warn",
      "no-constant-condition": "off",
      "no-fallthrough": "off",  // process.exit() terminates but ESLint doesn't know
      "no-inner-declarations": "off",  // Allow function declarations in blocks

      // Allow console for CLI tool
      "no-console": "off",

      // Added to eslint:recommended in eslint 10. Off so the upgrade keeps the
      // eslint 8 rule set; turning them on is its own change. On 2026-10-21
      // they reported 17, 10 and 1 errors on src/, and the one
      // no-unassigned-vars hit is a real bug (cognitive/index.ts declares
      // attentionHeatmapBase64 and never assigns it).
      "no-useless-assignment": "off",
      "preserve-caught-error": "off",
      "no-unassigned-vars": "off",
    },
  },
];
