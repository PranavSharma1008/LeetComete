import type { LanguageId, SupportedLanguageId } from "../shared/types";
import {
  normalizeTypeName,
  type LanguageDefinition,
  type MemberDefinition,
} from "./language-config";
import { javaLanguage } from "./providers/java";
import { cLanguage } from "./providers/c";
import { cppLanguage } from "./providers/cpp";
import { pythonLanguage } from "./providers/python";
import { javascriptLanguage } from "./providers/javascript";
import { typescriptLanguage } from "./providers/typescript";
import { csharpLanguage } from "./providers/csharp";
import { goLanguage } from "./providers/go";
import { rustLanguage } from "./providers/rust";
import { kotlinLanguage } from "./providers/kotlin";
import { swiftLanguage } from "./providers/swift";
import { rubyLanguage } from "./providers/ruby";
import { phpLanguage } from "./providers/php";
import { scalaLanguage } from "./providers/scala";
import { sqlLanguage } from "./providers/sql";

const definitions: Record<SupportedLanguageId, LanguageDefinition> = {
  java: javaLanguage,
  c: cLanguage,
  cpp: cppLanguage,
  python: pythonLanguage,
  javascript: javascriptLanguage,
  typescript: typescriptLanguage,
  csharp: csharpLanguage,
  go: goLanguage,
  rust: rustLanguage,
  kotlin: kotlinLanguage,
  swift: swiftLanguage,
  ruby: rubyLanguage,
  php: phpLanguage,
  scala: scalaLanguage,
  sql: sqlLanguage,
};

/** Fallback used when the platform gives us no language hint. */
export const plaintextLanguage: LanguageDefinition = {
  id: "plaintext",
  name: "Plain text",
  family: "c",
  keywords: [],
  builtinTypes: [],
  declarationKeywords: [],
  functionKeywords: [],
  classKeywords: [],
  modifiers: [],
  lineComments: ["//", "#"],
  blockComments: [["/*", "*/"]],
  stringDelimiters: ['"', "'", "`"],
  caseSensitive: true,
  members: {},
};

export function getLanguageDefinition(language: LanguageId): LanguageDefinition {
  if (language === "plaintext") return plaintextLanguage;
  return definitions[language] ?? plaintextLanguage;
}

export function getSupportedLanguageDefinition(
  language: SupportedLanguageId,
): LanguageDefinition {
  return definitions[language];
}

export function allLanguageDefinitions(): LanguageDefinition[] {
  return Object.values(definitions);
}

/**
 * Resolve a type to its member set. Handles aliases (`ArrayList` -> `List`)
 * and qualified names (`java.util.Stack` -> `Stack`).
 */
export function getMembersForType(
  language: LanguageId,
  type: string | undefined,
): readonly MemberDefinition[] {
  if (!type) return [];
  const definition = getLanguageDefinition(language);
  let base = normalizeTypeName(type);
  if (!base) return [];

  const seen = new Set<string>();
  while (base && !seen.has(base)) {
    seen.add(base);
    const direct = definition.members[base];
    if (direct) return direct;

    const alias = definition.typeAliases?.[base];
    if (!alias) break;
    base = normalizeTypeName(alias);
  }

  // Case-insensitive fallback (SQL and a few C#/Java spellings).
  if (base && !definition.caseSensitive) {
    const lower = base.toLowerCase();
    const match = Object.keys(definition.members).find(
      (key) => key.toLowerCase() === lower,
    );
    if (match) return definition.members[match] ?? [];
  }
  return [];
}

export function isSupportedLanguage(value: string): value is SupportedLanguageId {
  return value in definitions;
}

export function languageIds(): SupportedLanguageId[] {
  return Object.keys(definitions) as SupportedLanguageId[];
}
