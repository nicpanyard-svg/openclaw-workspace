import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  { files: ["scripts/**/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "_pdf_review/**",
    "tmp/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
