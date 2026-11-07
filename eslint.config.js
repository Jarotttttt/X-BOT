import js from "@eslint/js";

const nodeGlobals = {
  Buffer: "readonly",
  AbortController: "readonly",
  console: "readonly",
  fetch: "readonly",
  process: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  URL: "readonly",
  Uint8Array: "readonly",
  Float32Array: "readonly",
  globalThis: "readonly",
};

export default [
  {
    ignores: ["node_modules/**", "data/**"],
    languageOptions: {
      globals: nodeGlobals,
    },
    rules: {
      "no-unused-vars": ["error", { vars: "all", args: "after-used", ignoreRestSiblings: false }],
      "no-unreachable": "error",
      "no-constant-condition": "error",
      "no-unused-expressions": "error",
      "no-empty": "error",
    },
  },
  js.configs.recommended,
];
