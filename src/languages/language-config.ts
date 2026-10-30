import type { LanguageId, SupportedLanguageId } from "../shared/types";

export type LanguageFamily =
  | "c"
  | "python"
  | "js"
  | "rust"
  | "go"
  | "ruby"
  | "php"
  | "kotlin"
  | "swift"
  | "scala"
  | "sql";

export interface MemberDefinition {
  name: string;
  /** Signature or short description, shown next to the suggestion. */
  detail?: string;
  documentation?: string;
}

export interface SnippetDefinition {
  /** Text the user types to match the snippet. */
  prefix: string;
  /** Inserted text. `$0` marks the final caret position. */
  body: string;
  detail: string;
}

export interface GlobalDefinition {
  name: string;
  kind?: "function" | "builtin" | "constant";
  detail?: string;
}

export interface LanguageDefinition {
  id: LanguageId;
  name: string;
  family: LanguageFamily;
  keywords: readonly string[];
  builtinTypes: readonly string[];
  /** Declaration keywords such as let/const/var/val. */
  declarationKeywords: readonly string[];
  /** Keywords that introduce a named function. */
  functionKeywords: readonly string[];
  /** Keywords that introduce a named type. */
  classKeywords: readonly string[];
  /** Modifiers that may appear before a declaration. */
  modifiers: readonly string[];
  lineComments: readonly string[];
  blockComments: readonly [open: string, close: string][];
  stringDelimiters: readonly string[];
  /** Support Python-style triple quoted strings. */
  tripleQuotedStrings?: boolean;
  /** C/C++ preprocessor lines are skipped. */
  preprocessor?: boolean;
  /** SQL is case-insensitive; most other languages are not. */
  caseSensitive: boolean;
  /** Methods/properties keyed by a normalized base type name. */
  members: Record<string, readonly MemberDefinition[]>;
  /** Alternative base type names, e.g. ArrayList -> List. */
  typeAliases?: Record<string, string>;
  globals?: readonly GlobalDefinition[];
  snippets?: readonly SnippetDefinition[];
}

export function defineLanguage(definition: LanguageDefinition): LanguageDefinition {
  return definition;
}

export function m(name: string, detail?: string): MemberDefinition {
  return detail ? { name, detail } : { name };
}

/** Build a keyword set that also includes every modifier. */
export function keywordSet(definition: LanguageDefinition): Set<string> {
  const set = new Set<string>();
  for (const keyword of definition.keywords) set.add(keyword);
  for (const modifier of definition.modifiers) set.add(modifier);
  for (const keyword of definition.functionKeywords) set.add(keyword);
  for (const keyword of definition.classKeywords) set.add(keyword);
  for (const keyword of definition.declarationKeywords) set.add(keyword);
  return set;
}

export function normalizeTypeName(type: string | undefined): string | undefined {
  if (!type) return undefined;
  let base = type.trim();
  if (!base) return undefined;

  // Drop generic arguments (innermost first so nested generics reduce fully),
  // array suffixes, pointers, references and leading qualifiers.
  while (/<[^<>]*>/.test(base)) base = base.replace(/<[^<>]*>/g, "");
  base = base.replace(/\[[^\]]*\]/g, "");
  base = base.replace(/[&*?]+$/g, "");
  base = base.trim();
  // Keep only the last qualified segment (`std::vector` -> `vector`).
  base = base.split(/::|\./).filter(Boolean).pop() ?? base;
  base = base.replace(
    /^(?:(?:const|volatile|mut|ref|move|out|in|struct|union|enum|class|typename)\s+)+/,
    "",
  );
  base = base.replace(/^[&*]+/, "");
  base = base.replace(/[&*?]+$/g, "").trim();
  return base || undefined;
}
