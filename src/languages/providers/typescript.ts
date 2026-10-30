import { defineLanguage } from "../language-config";
import {
  jsBuiltinTypes,
  jsGlobals,
  jsKeywords,
  jsMembers,
} from "./javascript";

const tsKeywords = [
  ...jsKeywords,
  "interface", "type", "enum", "namespace", "declare", "abstract", "implements",
  "private", "protected", "public", "readonly", "override", "satisfies", "keyof",
  "infer", "is", "asserts", "unique", "symbol", "unknown", "never", "any", "string",
  "number", "boolean", "bigint", "object", "void",
] as const;

export const typescriptLanguage = defineLanguage({
  id: "typescript",
  name: "TypeScript",
  family: "js",
  keywords: tsKeywords,
  builtinTypes: [
    ...jsBuiltinTypes,
    "any", "unknown", "never", "void", "interface", "type", "enum", "Record",
    "Partial", "Required", "Readonly", "Pick", "Omit", "Exclude", "Extract",
    "ReturnType", "Parameters", "Awaited", "NonNullable",
  ],
  declarationKeywords: ["let", "const", "var"],
  functionKeywords: ["function"],
  classKeywords: ["class", "interface", "enum", "type", "namespace"],
  modifiers: [
    "async", "static", "get", "set", "export", "default", "public", "private",
    "protected", "readonly", "abstract", "override", "declare",
  ],
  lineComments: ["//"],
  blockComments: [["/*", "*/"]],
  stringDelimiters: ['"', "'", "`"],
  caseSensitive: true,
  members: jsMembers,
  globals: [
    ...jsGlobals,
    { name: "Partial", detail: "Partial<T>" },
    { name: "Required", detail: "Required<T>" },
    { name: "Readonly", detail: "Readonly<T>" },
    { name: "Record", detail: "Record<K, V>" },
    { name: "Pick", detail: "Pick<T, K>" },
    { name: "Omit", detail: "Omit<T, K>" },
    { name: "Exclude", detail: "Exclude<T, U>" },
    { name: "Extract", detail: "Extract<T, U>" },
    { name: "ReturnType", detail: "ReturnType<T>" },
    { name: "Awaited", detail: "Awaited<T>" },
  ],
  snippets: [
    { prefix: "fori", body: "for (let i = 0; i < n; i++) {\n    $0\n}", detail: "Indexed for loop" },
    { prefix: "foreach", body: "for (const item of items) {\n    $0\n}", detail: "For-of loop" },
    { prefix: "interface", body: "interface Name {\n    $0\n}", detail: "Interface declaration" },
    { prefix: "type", body: "type Name = {\n    $0\n};", detail: "Type alias" },
    { prefix: "func", body: "function solve($0): void {\n    \n}", detail: "Typed function" },
    { prefix: "arrow", body: "const solve = ($0): void => {\n    \n};", detail: "Typed arrow function" },
  ],
});
