import type { Declaration, CompletionKind } from "../shared/types";
import type { LanguageDefinition } from "../languages/language-config";
import { keywordSet, normalizeTypeName } from "../languages/language-config";
import type { Token } from "./lexer";
import type { ScopeModel } from "./scope";
import {
  collectExpression,
  extractTypeFromPrefix,
  findAnnotationType,
  formatTypeTokens,
  inferTypeFromExpression,
  type InferredType,
} from "./type-inference";

export interface ExtractionResult {
  declarations: Declaration[];
  identifiers: Map<string, number>;
  scopes: ScopeModel;
  tokenCount: number;
  blockedRanges: Array<{ start: number; end: number }>;
}

const REJECT_PREFIX_WORDS = new Set([
  "return", "throw", "new", "delete", "case", "goto", "yield", "await", "typeof",
  "instanceof", "else", "do", "if", "while", "for", "switch", "catch", "try",
  "assert", "raise", "print", "println", "echo", "puts", "p", "console",
]);

const LOOP_KEYWORDS = new Set(["for", "foreach", "catch", "using", "lock", "fixed", "when"]);

const SIGNATURE_AFTER = new Set(["{", ";", ":", "->", "=>", "throws", "where", "=", "const"]);

/** Languages that declare a variable's type after a colon (`name: Type`). */
const ANNOTATION_FAMILIES = new Set([
  "python", "ruby", "js", "php", "kotlin", "swift", "scala", "rust",
]);

interface AddOptions {
  scopeId?: number;
  type?: string;
  typeText?: string;
  detail?: string;
  memberOf?: string;
  kind?: CompletionKind;
}

export function extractIdentifiers(
  text: string,
  language: LanguageDefinition,
  tokens: Token[],
  blockedRanges: Array<{ start: number; end: number }>,
  scopes: ScopeModel,
): ExtractionResult {
  const declarations: Declaration[] = [];
  const identifiers = new Map<string, number>();
  const builtinTypes = new Set(
    language.builtinTypes.map((type) => (language.caseSensitive ? type : type.toLowerCase())),
  );

  const add = (token: Token, kind: CompletionKind, options: AddOptions = {}): void => {
    const scopeId = options.scopeId ?? scopes.tokenScope[tokenIndex(token)] ?? 0;
    declarations.push({
      name: token.value,
      kind: options.kind ?? kind,
      start: token.start,
      end: token.end,
      type: options.type,
      typeText: options.typeText,
      scopeId,
      line: token.line,
      detail: options.detail,
      memberOf: options.memberOf,
    });
  };

  const tokenIndex = (token: Token): number => {
    // Tokens are in source order; binary search keeps this O(log n) even in
    // very large files.
    let low = 0;
    let high = tokens.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const candidate = tokens[mid]!;
      if (candidate.start < token.start) low = mid + 1;
      else if (candidate.start > token.start) high = mid - 1;
      else return mid;
    }
    return -1;
  };

  extractTypeDeclarations(language, tokens, scopes, add);
  extractFunctions(language, tokens, scopes, add);
  extractVariables(language, tokens, scopes, add);
  extractSpecialDeclarations(language, tokens, scopes, add);
  extractArrowAndLambdaParameters(language, tokens, scopes, add);
  extractRubyDefinitions(language, tokens, scopes, add);

  // The same token can be discovered by more than one pass (for example a
  // record component is both a field and, syntactically, a variable, and a Ruby
  // method parameter can look like a class field). Keep the most specific
  // classification for each token.
  const deduped: Declaration[] = [];
  const tokenSlots = new Map<string, number>();
  for (const declaration of declarations) {
    const key = `${declaration.start}:${declaration.end}`;
    const existingIndex = tokenSlots.get(key);
    if (existingIndex === undefined) {
      tokenSlots.set(key, deduped.length);
      deduped.push(declaration);
      continue;
    }
    const existing = deduped[existingIndex]!;
    if (kindPriority(declaration.kind) > kindPriority(existing.kind)) {
      deduped[existingIndex] = declaration;
    }
  }

  // Identifier frequency index. Member names (`obj.foo`) and keywords are not
  // useful as free-standing suggestions.
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.type !== "identifier") continue;
    if (token.value === "_") continue;
    const previous = previousSignificant(tokens, i);
    if (previous && [".", "->", "::"].includes(previous.value)) continue;
    if (builtinTypes.has(language.caseSensitive ? token.value : token.value.toLowerCase())) {
      continue;
    }
    const key = language.caseSensitive ? token.value : token.value.toLowerCase();
    identifiers.set(key, (identifiers.get(key) ?? 0) + 1);
  }

  return {
    declarations: deduped,
    identifiers,
    scopes,
    tokenCount: tokens.length,
    blockedRanges,
  };
}

// ---------------------------------------------------------------------------
// Type declarations
// ---------------------------------------------------------------------------

function extractTypeDeclarations(
  language: LanguageDefinition,
  tokens: Token[],
  scopes: ScopeModel,
  add: (token: Token, kind: CompletionKind, options?: AddOptions) => void,
): void {
  const classKeywords = new Set(language.classKeywords);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.type !== "keyword") continue;
    const value = language.caseSensitive ? token.value : token.value.toLowerCase();

    if (language.id === "sql") {
      extractSqlTypeDeclarations(tokens, i, add);
      continue;
    }

    if (!classKeywords.has(value) || value === "impl" || value === "mod") continue;
    const previous = previousSignificant(tokens, i);
    if (previous && [".", "->", "::"].includes(previous.value)) continue;

    let next = nextSignificant(tokens, i);
    if (next < 0) continue;
    // enum class Color / record struct Point
    if (
      tokens[next]!.type === "keyword" &&
      ["class", "struct", "interface", "enum", "record"].includes(tokens[next]!.value)
    ) {
      next = nextSignificant(tokens, next);
    }
    if (next < 0) continue;
    const nameToken = tokens[next]!;
    if (nameToken.type !== "identifier") continue;

    const kind: CompletionKind =
      value === "interface" || value === "protocol" || value === "trait"
        ? "interface"
        : value === "struct"
          ? "struct"
          : value === "enum"
            ? "enum"
            : value === "type"
              ? "type"
              : "class";

    // `type Foo struct` is a struct; `type Foo =` is an alias.
    if (value === "type") {
      const afterName = nextSignificant(tokens, next);
      if (afterName >= 0 && tokens[afterName]!.value === "struct") {
        add(nameToken, "struct", { detail: `struct ${nameToken.value}` });
        continue;
      }
    }

    const label =
      kind === "interface" ? "interface"
        : kind === "struct" ? "struct"
          : kind === "enum" ? "enum"
            : kind === "type" ? "type"
              : "class";
    add(nameToken, kind, { detail: `${label} ${nameToken.value}` });

    // Record components become fields (`record Point(int x, int y)`).
    if (value === "record") {
      const open = nextSignificant(tokens, next);
      if (open >= 0 && tokens[open]!.value === "(") {
        const close = matchingParen(tokens, open);
        if (close > open) {
          for (const segment of splitTopLevel(tokens, open + 1, close)) {
            const parameter = parseParameterSegment(segment, language);
            if (parameter?.nameToken) {
              add(parameter.nameToken, "field", {
                type: parameter.type,
                typeText: parameter.typeText,
                detail: `record component ${parameter.nameToken.value}`,
              });
            }
          }
        }
      }
    }
  }
}

function extractSqlTypeDeclarations(
  tokens: Token[],
  index: number,
  add: (token: Token, kind: CompletionKind, options?: AddOptions) => void,
): void {
  const token = tokens[index]!;
  const value = token.value.toLowerCase();
  const previous = previousSignificant(tokens, index);

  if (value === "with") {
    let next = nextSignificant(tokens, index);
    if (next >= 0 && tokens[next]!.value.toLowerCase() === "recursive") {
      next = nextSignificant(tokens, next);
    }
    if (next >= 0 && tokens[next]!.type === "identifier") {
      add(tokens[next]!, "type", { detail: `CTE ${tokens[next]!.value}` });
    }
    return;
  }

  if (value === "table" || value === "view") {
    if (!previous || !["create", "alter"].includes(previous.value.toLowerCase())) return;
    let next = nextSignificant(tokens, index);
    while (next >= 0 && ["if", "not", "exists"].includes(tokens[next]!.value.toLowerCase())) {
      next = nextSignificant(tokens, next);
    }
    if (next >= 0 && tokens[next]!.type === "identifier") {
      add(tokens[next]!, "class", { detail: `${value} ${tokens[next]!.value}` });
    }
  }
}

// ---------------------------------------------------------------------------
// Functions and parameters
// ---------------------------------------------------------------------------

function extractFunctions(
  language: LanguageDefinition,
  tokens: Token[],
  scopes: ScopeModel,
  add: (token: Token, kind: CompletionKind, options?: AddOptions) => void,
): void {
  for (let i = 0; i < tokens.length; i++) {
    const nameToken = tokens[i]!;
    if (nameToken.type !== "identifier") continue;

    const open = nextSignificant(tokens, i);
    if (open < 0 || tokens[open]!.value !== "(") continue;
    const previous = previousSignificant(tokens, i);
    if (previous && [".", "->", "::"].includes(previous.value)) continue;

    const close = matchingParen(tokens, open);
    if (close < 0) continue;
    const after = nextSignificant(tokens, close);
    const afterValue = after >= 0 ? tokens[after]!.value : "";
    if (
      after >= 0 &&
      !SIGNATURE_AFTER.has(afterValue) &&
      !hasBodyBrace(tokens, after)
    ) {
      continue;
    }

    const explicit = hasFunctionKeyword(tokens, i, language);
    const scopeId = scopes.tokenScope[i] ?? 0;
    const scopeKind = scopes.scopes[scopeId]?.kind ?? "global";
    const inTypeScope = scopeKind === "class" || scopeKind === "namespace";
    const prefix = collectPrefix(tokens, i, language);
    const reject = prefix.some((token) => REJECT_PREFIX_WORDS.has(token.value));
    const declarationEvidence = hasDeclarationEvidence(prefix, language);

    if (!explicit) {
      if (reject) continue;
      if (inTypeScope) {
        // Inside a class, `foo();` is a call, not a method.
        if (prefix.length === 0 && afterValue === ";") continue;
        if (prefix.length === 0 && afterValue !== "{" && afterValue !== ":") continue;
      } else {
        if (prefix.length === 0) continue;
        if (afterValue === ";" && !declarationEvidence) continue;
        if (!declarationEvidence) continue;
      }
    } else if (reject && !prefix.some((token) => token.value === "function")) {
      continue;
    }

    // A call with a generic-looking argument list should never be a function.
    if (prefix.length === 0 && !inTypeScope && !explicit) continue;

    const kind: CompletionKind = inTypeScope ? "method" : "function";
    const params = parseParameters(tokens, open, close, language);
    const signature = params.map((param) => param.label).join(", ");
    add(nameToken, kind, {
      detail: `${kind} ${nameToken.value}(${signature})`,
    });

    const bodyScope = findBodyScope(tokens, close, scopeId, scopes, language);
    if (bodyScope != null) {
      for (const param of params) {
        if (!param.nameToken) continue;
        add(param.nameToken, "parameter", {
          scopeId: bodyScope,
          type: param.type,
          typeText: param.typeText,
          detail: `parameter ${param.nameToken.value}${param.typeText ? `: ${param.typeText}` : ""}`,
        });
      }
    }
  }
}

interface ParsedParameter {
  nameToken?: Token;
  label: string;
  type?: string;
  typeText?: string;
}

function parseParameters(
  tokens: Token[],
  openIndex: number,
  closeIndex: number,
  language: LanguageDefinition,
): ParsedParameter[] {
  const result: ParsedParameter[] = [];
  for (const segment of splitTopLevel(tokens, openIndex + 1, closeIndex)) {
    const parsed = parseParameterSegment(segment, language);
    if (parsed) result.push(parsed);
  }
  return result;
}

function parseParameterSegment(
  segment: Token[],
  language: LanguageDefinition,
): ParsedParameter | null {
  const tokens = segment.filter((token) => token.type !== "comment");
  if (tokens.length === 0) return null;

  let defaultIndex = -1;
  let annotationIndex = -1;
  let angle = 0;
  let bracket = 0;
  let brace = 0;
  for (let i = 0; i < tokens.length; i++) {
    const value = tokens[i]!.value;
    if (value === "<") angle++;
    else if (value === ">") angle = Math.max(0, angle - 1);
    else if (value === "[") bracket++;
    else if (value === "]") bracket = Math.max(0, bracket - 1);
    else if (value === "{") brace++;
    else if (value === "}") brace = Math.max(0, brace - 1);
    else if (value === "=" && angle === 0 && bracket === 0 && brace === 0 && defaultIndex < 0) {
      defaultIndex = i;
    } else if (value === ":" && angle === 0 && bracket === 0 && brace === 0 && annotationIndex < 0) {
      annotationIndex = i;
    }
  }

  const end = defaultIndex >= 0 ? defaultIndex : tokens.length;
  const beforeDefault = tokens.slice(0, end);
  const family = language.family;
  const isAnnotationLanguage = ["kotlin", "swift", "scala", "python", "rust", "js", "go"].includes(family);

  let nameIndex = -1;
  if (family === "go") {
    nameIndex = beforeDefault.findIndex(
      (token) => token.type === "identifier" && token.value !== "_",
    );
  } else if (family === "kotlin" || family === "swift" || family === "scala" || family === "js") {
    const stop = annotationIndex >= 0 ? annotationIndex : beforeDefault.length;
    nameIndex = beforeDefault.findIndex(
      (token, index) => index < stop && token.type === "identifier" && token.value !== "_",
    );
  } else if (family === "rust") {
    const stop = annotationIndex >= 0 ? annotationIndex : beforeDefault.length;
    for (let i = stop - 1; i >= 0; i--) {
      const token = beforeDefault[i]!;
      if (token.type === "identifier" && token.value !== "_") {
        nameIndex = i;
        break;
      }
    }
  } else {
    const stop = annotationIndex >= 0 ? annotationIndex : beforeDefault.length;
    for (let i = stop - 1; i >= 0; i--) {
      const token = beforeDefault[i]!;
      if (token.type === "identifier" && token.value !== "_") {
        nameIndex = i;
        break;
      }
    }
  }

  if (nameIndex < 0) return null;
  const nameToken = beforeDefault[nameIndex]!;

  let inferred: InferredType = {};
  if (isAnnotationLanguage && annotationIndex >= 0) {
    inferred = typeFromTokens(tokens.slice(annotationIndex + 1));
  } else if (family === "go") {
    inferred = typeFromTokens(beforeDefault.slice(nameIndex + 1));
  } else if (family === "c" || family === "php" || family === "ruby") {
    inferred = extractTypeFromPrefix(beforeDefault.slice(0, nameIndex), language);
  }

  const label = `${nameToken.value}${inferred.typeText ? `: ${inferred.typeText}` : ""}`;
  return {
    nameToken,
    label,
    type: inferred.type,
    typeText: inferred.typeText,
  };
}

function typeFromTokens(tokens: Token[]): InferredType {
  const cleaned = tokens.filter(
    (token) => !["=", "&", "*", "mut", "ref", "inout", "final", "const"].includes(token.value),
  );
  if (cleaned.length === 0) return {};
  const typeText = formatTypeTokens(cleaned);
  return { typeText, type: normalizeTypeName(typeText) };
}

/**
 * True when a `{` body follows before the declaration ends. This covers Go's
 * `func f() []int {`, Rust's `fn f() -> T {`, Swift/Kotlin/Scala return types,
 * and Java/C# `throws`/`where` clauses without weakening call detection.
 */
function hasBodyBrace(tokens: Token[], startIndex: number): boolean {
  let inspected = 0;
  for (let i = startIndex; i < tokens.length && inspected < 16; i++) {
    const token = tokens[i]!;
    if (token.type === "comment" || token.type === "string") continue;
    inspected++;
    if (token.value === "{") return true;
    if (token.value === ";" || token.value === "}" || token.value === "=") return false;
  }
  return false;
}

const KIND_PRIORITY: Record<CompletionKind, number> = {
  parameter: 100,
  field: 90,
  property: 90,
  method: 80,
  function: 80,
  constant: 70,
  class: 60,
  struct: 60,
  interface: 60,
  enum: 60,
  type: 60,
  variable: 50,
  builtin: 20,
  keyword: 10,
  snippet: 10,
};

function kindPriority(kind: CompletionKind): number {
  return KIND_PRIORITY[kind] ?? 0;
}

function hasFunctionKeyword(
  tokens: Token[],
  nameIndex: number,
  language: LanguageDefinition,
): boolean {
  let inspected = 0;
  for (let i = nameIndex - 1; i >= 0 && inspected < 8; i--) {
    const token = tokens[i]!;
    if (token.type === "comment" || token.type === "string") continue;
    if ([";", "{", "}", "=", ",", "("].includes(token.value)) break;
    if (language.functionKeywords.includes(token.value)) return true;
    inspected++;
  }
  return false;
}

function findBodyScope(
  tokens: Token[],
  closeIndex: number,
  currentScopeId: number,
  scopes: ScopeModel,
  language: LanguageDefinition,
): number | null {
  if (language.family === "python" || language.family === "ruby") {
    const after = tokens[closeIndex]?.end ?? 0;
    let best: { id: number; start: number } | null = null;
    for (const scope of scopes.scopes) {
      if (scope.parentId !== currentScopeId) continue;
      if (scope.start < after) continue;
      if (!best || scope.start < best.start) best = { id: scope.id, start: scope.start };
    }
    return best?.id ?? null;
  }

  let inspected = 0;
  for (let i = closeIndex + 1; i < tokens.length && inspected < 16; i++) {
    const token = tokens[i]!;
    if (token.type === "comment" || token.type === "string") continue;
    if (token.value === ";") return null;
    if (token.value === "{") {
      const outer = scopes.tokenScope[i] ?? currentScopeId;
      const match = scopes.scopes.find(
        (scope) => scope.parentId === outer && scope.start === token.end,
      );
      return match?.id ?? scopes.scopeAt(token.end + 1).id;
    }
    inspected++;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Variables, fields and properties
// ---------------------------------------------------------------------------

function extractVariables(
  language: LanguageDefinition,
  tokens: Token[],
  scopes: ScopeModel,
  add: (token: Token, kind: CompletionKind, options?: AddOptions) => void,
): void {
  const family = language.family;

  for (let i = 0; i < tokens.length; i++) {
    const nameToken = tokens[i]!;
    if (nameToken.type !== "identifier") continue;
    if (nameToken.value === "_") continue;

    const next = nextSignificant(tokens, i);
    if (next < 0) continue;
    const nextValue = tokens[next]!.value;
    if (nextValue === "(") continue;

    const previous = previousSignificant(tokens, i);
    const scopeId = scopes.tokenScope[i] ?? 0;
    const scopeKind = scopes.scopes[scopeId]?.kind ?? "global";

    // `self.x = ...` / `this.x = ...`
    if (previous && previous.value === ".") {
      const beforeDot = previousSignificant(tokens, i - 1);
      if (
        beforeDot &&
        (beforeDot.value === "self" || beforeDot.value === "this") &&
        (nextValue === "=" || nextValue === ":")
      ) {
        const inferred = inferFromAssignment(tokens, next, language);
        add(nameToken, "property", {
          type: inferred.type,
          typeText: inferred.typeText,
          detail: `property ${beforeDot.value}.${nameToken.value}`,
          memberOf: beforeDot.value,
        });
      }
      continue;
    }
    if (previous && ["->", "::"].includes(previous.value)) continue;

    const parenKeyword = enclosingParenKeyword(tokens, i);
    const inLoopHeader = parenKeyword ? LOOP_KEYWORDS.has(parenKeyword) : false;
    const localDepth = localNestingDepth(tokens, i);
    if (localDepth.paren > 0 && !inLoopHeader) continue;
    if (
      localDepth.brace > 0 &&
      (family === "python" || family === "ruby" || family === "js" || family === "php")
    ) {
      continue;
    }

    const prefix = collectPrefix(tokens, i, language);
    const reject = prefix.some((token) => REJECT_PREFIX_WORDS.has(token.value));
    if (reject) continue;

    const declarationKeyword = prefix.some((token) =>
      language.declarationKeywords.includes(token.value),
    );

    const isPythonLike = family === "python" || family === "ruby";
    const isPhp = family === "php";
    const isGo = family === "go";
    const nextIsAssignment = nextValue === "=" || nextValue === ":=";

    let shouldAdd = false;
    if (isPythonLike) {
      if (nextIsAssignment || nextValue === ":") {
        shouldAdd = true;
      } else if (nextValue === "," && isTupleDeclaration(tokens, i, language)) {
        shouldAdd = true;
      } else if (nextValue === "in" || nextValue === "of") {
        shouldAdd = true;
      }
    } else if (isPhp) {
      shouldAdd = nameToken.value.startsWith("$") && (nextIsAssignment || nextValue === ";");
    } else if (isGo) {
      shouldAdd = nextValue === ":=" || declarationKeyword || nextValue === ",";
    } else {
      if (nextIsAssignment) {
        shouldAdd =
          declarationKeyword ||
          hasDeclarationEvidence(prefix, language) ||
          (scopeKind === "class" && prefix.length > 0);
      } else if (nextValue === ":" || nextValue === ";" || nextValue === "[" || nextValue === ")") {
        shouldAdd = declarationKeyword || hasDeclarationEvidence(prefix, language);
      } else if (declarationKeyword) {
        // `var x int` / `const x Type` in Go-like declarations.
        shouldAdd = true;
      } else if (nextValue === "in" || nextValue === "of") {
        shouldAdd = true;
      }
    }

    if (!shouldAdd) continue;

    // Avoid treating labels in object literals as declarations.
    if (
      nextValue === ":" &&
      (family === "js" || family === "python" || family === "ruby") &&
      localDepth.brace > 0
    ) {
      continue;
    }

    let inferred: InferredType = {};
    if (nextValue === "=" || nextValue === ":=") {
      inferred = inferFromAssignment(tokens, next, language);
    }

    // C-style declarations carry the type before the name. Prefer the
    // declared type over the initializer so `Map<K, V> m = new HashMap<>()`
    // suggests the interface's members, and `Foo f;` works without `=`.
    if (family === "c") {
      const declared = extractTypeFromPrefix(prefix, language);
      if (hasUsableType(declared)) inferred = declared;
    }

    // Python/JS/TS and annotation-first languages put the type after `:`.
    if (nextValue === ":" && ANNOTATION_FAMILIES.has(family)) {
      const annotation = findAnnotationType(tokens, i, language);
      if (annotation.typeText) inferred = annotation;
    }

    if (family === "go" && declarationKeyword && nextValue !== ":=" && nextValue !== "=") {
      inferred = typeFromTokens(
        tokens.slice(next, Math.min(tokens.length, next + 8)).filter((token) => {
          if (token.value === "=" || token.value === ";" || token.value === ",") return false;
          return true;
        }),
      );
    }

    const typeInfo = resolveType(inferred, language);
    const kind: CompletionKind =
      /^[A-Z][A-Z0-9_]*$/.test(nameToken.value) && nameToken.value.length > 1
        ? "constant"
        : scopeKind === "class"
          ? "field"
          : "variable";
    const typePrefix = typeInfo.typeText ? `${typeInfo.typeText} ` : "";
    add(nameToken, kind, {
      type: typeInfo.type,
      typeText: typeInfo.typeText,
      detail:
        kind === "field"
          ? `field ${typePrefix}${nameToken.value}`
          : kind === "constant"
            ? `constant ${nameToken.value}`
            : `${typePrefix}${nameToken.value}`,
    });
  }
}

function inferFromAssignment(
  tokens: Token[],
  assignmentIndex: number,
  language: LanguageDefinition,
): InferredType {
  const expression = collectExpression(tokens, assignmentIndex + 1);
  return inferTypeFromExpression(expression, language);
}

const PLACEHOLDER_TYPE_NAMES = new Set([
  "var", "auto", "let", "val", "const", "mut", "dynamic",
]);

/** True when a parsed declared type is concrete enough to drive members. */
function hasUsableType(inferred: InferredType): boolean {
  if (!inferred.typeText) return false;
  const normalized = normalizeTypeName(inferred.typeText);
  return !!normalized && !PLACEHOLDER_TYPE_NAMES.has(normalized);
}

function resolveType(inferred: InferredType, language: LanguageDefinition): InferredType {
  let type = inferred.type;
  let typeText = inferred.typeText;

  if (typeText && ["var", "auto", "let", "val", "const", "mut", "dynamic"].includes(typeText)) {
    type = undefined;
    typeText = undefined;
  }

  if (typeText) {
    if (language.family === "js" && typeText.endsWith("[]")) {
      type = "Array";
    }
    if (language.id === "swift") {
      if (typeText.startsWith("[")) {
        type = typeText.includes(":") ? "Dictionary" : "Array";
      }
    }
    if (language.id === "go") {
      if (typeText.startsWith("[]")) type = "slice";
      else if (typeText.startsWith("map[")) type = "map";
    }
    if (language.family === "python" && typeText.startsWith("[")) type = "list";
  }

  return { type, typeText };
}

function isTupleDeclaration(
  tokens: Token[],
  nameIndex: number,
  language: LanguageDefinition,
): boolean {
  let inspected = 0;
  for (let i = nameIndex + 1; i < tokens.length && inspected < 20; i++) {
    const token = tokens[i]!;
    if (token.type === "comment") continue;
    if (token.value === "=") return true;
    if (token.value === ";" || token.value === "{" || token.value === "}") return false;
    if (token.line !== tokens[nameIndex]!.line && language.family === "python") return false;
    inspected++;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Special declarations: for/with/except/import/destructuring/SQL aliases
// ---------------------------------------------------------------------------

function extractSpecialDeclarations(
  language: LanguageDefinition,
  tokens: Token[],
  scopes: ScopeModel,
  add: (token: Token, kind: CompletionKind, options?: AddOptions) => void,
): void {
  const family = language.family;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.type !== "keyword") continue;
    const value = token.value;

    if (value === "for" || value === "foreach") {
      extractLoopVariables(language, tokens, i, scopes, add);
    } else if (value === "with" || value === "except" || value === "catch") {
      extractAsVariables(language, tokens, i, add);
    } else if (value === "import" || value === "from") {
      extractImportAliases(language, tokens, i, add);
    } else if (value === "lambda" && family === "python") {
      extractPythonLambda(tokens, i, scopes, add);
    } else if (value === "let" || value === "const" || value === "var") {
      if (family === "js") extractDestructuring(language, tokens, i, add);
    }
  }

  if (language.id === "sql") {
    extractSqlAliases(tokens, add);
  }

  if (family === "c") {
    extractStructuredBindings(language, tokens, add);
  }
}

function extractLoopVariables(
  language: LanguageDefinition,
  tokens: Token[],
  keywordIndex: number,
  scopes: ScopeModel,
  add: (token: Token, kind: CompletionKind, options?: AddOptions) => void,
): void {
  let next = nextSignificant(tokens, keywordIndex);
  if (next < 0) return;

  // Skip the parentheses in `for (...)`.
  if (tokens[next]!.value === "(") next = nextSignificant(tokens, next);
  if (next < 0) return;

  // Go: `for i, v := range items`
  if (language.family === "go") {
    for (let i = next; i < tokens.length && i < next + 6; i++) {
      const token = tokens[i]!;
      if (token.type === "identifier" && token.value !== "_") {
        add(token, "variable", { detail: `loop variable ${token.value}` });
      }
      if (token.value === ":=") break;
      if (token.value === "{" || token.value === ";") break;
    }
    return;
  }

  // C-like: `for (int i = 0; ...)` and `for (String s : items)`.
  if (language.family === "c") {
    for (let i = next; i < tokens.length && i < next + 14; i++) {
      const token = tokens[i]!;
      if (token.value === ";") break;
      if (token.value === ")") break;
      if (token.type !== "identifier" || token.value === "_") continue;
      const after = nextSignificant(tokens, i);
      if (after < 0) continue;
      const afterValue = tokens[after]!.value;
      if (!["=", ":", ",", ")", "in", "of"].includes(afterValue)) continue;
      const prefix = collectPrefix(tokens, i, language);
      if (!hasDeclarationEvidence(prefix, language)) continue;
      const inferred = afterValue === "="
        ? inferFromAssignment(tokens, after, language)
        : extractTypeFromPrefix(prefix, language);
      const typeInfo = resolveType(inferred, language);
      add(token, "variable", {
        type: typeInfo.type,
        typeText: typeInfo.typeText,
        detail: `loop variable ${token.value}${typeInfo.typeText ? `: ${typeInfo.typeText}` : ""}`,
      });
    }
    return;
  }

  // Python / Ruby: `for x in items` / `for x, y in pairs`
  const line = tokens[next]!.line;
  for (let i = next; i < tokens.length && tokens[i]!.line === line; i++) {
    const token = tokens[i]!;
    if (token.type === "identifier" && token.value !== "_") {
      add(token, "variable", { detail: `loop variable ${token.value}` });
    }
    if (token.value === "in" || token.value === "do" || token.value === "{") break;
  }
}

function extractAsVariables(
  language: LanguageDefinition,
  tokens: Token[],
  keywordIndex: number,
  add: (token: Token, kind: CompletionKind, options?: AddOptions) => void,
): void {
  const line = tokens[keywordIndex]!.line;
  for (let i = keywordIndex + 1; i < tokens.length && tokens[i]!.line === line; i++) {
    if (tokens[i]!.value !== "as") continue;
    const next = nextSignificant(tokens, i);
    if (next < 0) continue;
    const token = tokens[next]!;
    if (token.type === "identifier") {
      add(token, "variable", {
        detail: `caught variable ${token.value}`,
      });
    }
    break;
  }
}

function extractImportAliases(
  language: LanguageDefinition,
  tokens: Token[],
  keywordIndex: number,
  add: (token: Token, kind: CompletionKind, options?: AddOptions) => void,
): void {
  if (language.family !== "python") return;
  const line = tokens[keywordIndex]!.line;
  for (let i = keywordIndex + 1; i < tokens.length && tokens[i]!.line === line; i++) {
    if (tokens[i]!.value === "as") {
      const next = nextSignificant(tokens, i);
      if (next >= 0 && tokens[next]!.type === "identifier") {
        add(tokens[next]!, "variable", { detail: `import alias ${tokens[next]!.value}` });
      }
    }
  }
}

function extractPythonLambda(
  tokens: Token[],
  keywordIndex: number,
  scopes: ScopeModel,
  add: (token: Token, kind: CompletionKind, options?: AddOptions) => void,
): void {
  const line = tokens[keywordIndex]!.line;
  for (let i = keywordIndex + 1; i < tokens.length && tokens[i]!.line === line; i++) {
    const token = tokens[i]!;
    if (token.value === ":") break;
    if (token.type === "identifier") {
      add(token, "parameter", { detail: `lambda parameter ${token.value}` });
    }
  }
}

function extractDestructuring(
  language: LanguageDefinition,
  tokens: Token[],
  keywordIndex: number,
  add: (token: Token, kind: CompletionKind, options?: AddOptions) => void,
): void {
  let open = nextSignificant(tokens, keywordIndex);
  if (open < 0) return;
  const openValue = tokens[open]!.value;
  if (openValue !== "{" && openValue !== "[") return;
  const closeValue = openValue === "{" ? "}" : "]";
  let depth = 0;
  for (let i = open; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.value === openValue) depth++;
    else if (token.value === closeValue) {
      depth--;
      if (depth === 0) break;
    } else if (token.type === "identifier" && token.value !== "_") {
      const next = nextSignificant(tokens, i);
      const nextValue = next >= 0 ? tokens[next]!.value : "";
      if (["=", ",", closeValue, ":", "..."].includes(nextValue)) {
        add(token, "variable", { detail: `destructured ${token.value}` });
      }
    }
  }
}

function extractStructuredBindings(
  language: LanguageDefinition,
  tokens: Token[],
  add: (token: Token, kind: CompletionKind, options?: AddOptions) => void,
): void {
  // C++: `auto [key, value] = map`
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i]!.value !== "[") continue;
    const previous = previousSignificant(tokens, i);
    if (!previous || (previous.value !== "auto" && previous.value !== "const")) continue;
    const close = matchingBracket(tokens, i);
    if (close < 0) continue;
    const after = nextSignificant(tokens, close);
    if (after < 0 || tokens[after]!.value !== "=") continue;
    for (const token of tokens.slice(i + 1, close)) {
      if (token.type === "identifier" && token.value !== "_") {
        add(token, "variable", { detail: `structured binding ${token.value}` });
      }
    }
  }
}

function extractSqlAliases(
  tokens: Token[],
  add: (token: Token, kind: CompletionKind, options?: AddOptions) => void,
): void {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const value = token.value.toLowerCase();
    if (value === "as") {
      const next = nextSignificant(tokens, i);
      if (next >= 0 && tokens[next]!.type === "identifier") {
        add(tokens[next]!, "variable", { detail: `alias ${tokens[next]!.value}` });
      }
      continue;
    }
    if (value === "from" || value === "join") {
      let next = nextSignificant(tokens, i);
      if (next < 0) continue;
      if (tokens[next]!.value === "(") continue;
      next = nextSignificant(tokens, next);
      if (next >= 0 && tokens[next]!.type === "identifier" && tokens[next]!.value.toLowerCase() !== "as") {
        // `FROM users u` / `JOIN orders o`
        add(tokens[next]!, "variable", { detail: `table alias ${tokens[next]!.value}` });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Arrow / lambda parameters and Ruby definitions
// ---------------------------------------------------------------------------

function extractArrowAndLambdaParameters(
  language: LanguageDefinition,
  tokens: Token[],
  scopes: ScopeModel,
  add: (token: Token, kind: CompletionKind, options?: AddOptions) => void,
): void {
  const arrowValues = new Set<string>();
  if (language.family === "js") arrowValues.add("=>");
  if (["java", "csharp", "kotlin", "swift", "scala"].includes(language.id)) arrowValues.add("->");
  const hasBlockParams = language.id === "rust" || language.id === "ruby";
  if (arrowValues.size === 0 && !hasBlockParams) return;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (!arrowValues.has(token.value)) continue;
    const previous = previousSignificant(tokens, i);
    if (!previous) continue;

    if (previous.value === ")") {
      const open = matchingOpenParen(tokens, i - 1);
      if (open < 0) continue;
      const params = parseParameters(tokens, open, i - 1, language);
      for (const param of params) {
        if (param.nameToken) {
          add(param.nameToken, "parameter", {
            type: param.type,
            typeText: param.typeText,
            detail: `lambda parameter ${param.nameToken.value}`,
          });
        }
      }
    } else if (previous.type === "identifier" && previous.value !== "_") {
      // Java/C# lambda `x -> ...`; avoid C++ `ptr->field`.
      const before = previousSignificant(tokens, i - 1);
      if (
        !before ||
        ["(", ",", "=", "return", "case", "->"].includes(before.value) ||
        language.family === "js"
      ) {
        add(previous, "parameter", { detail: `lambda parameter ${previous.value}` });
      }
    }
  }

  // Rust closures `|x, y|` and Ruby block params `|x, y|`.
  if (language.id === "rust" || language.id === "ruby") {
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i]!.value !== "|") continue;
      const previous = previousSignificant(tokens, i);
      if (
        previous &&
        !["(", ",", "=", "move", "do", "{", "|"].includes(previous.value) &&
        tokens[i]!.line !== tokens[i - 1]?.line
      ) {
        continue;
      }
      let close = -1;
      for (let j = i + 1; j < Math.min(tokens.length, i + 12); j++) {
        if (tokens[j]!.value === "|") {
          close = j;
          break;
        }
        if (tokens[j]!.line !== tokens[i]!.line) break;
      }
      if (close < 0) continue;
      for (const param of tokens.slice(i + 1, close)) {
        if (param.type === "identifier" && param.value !== "_") {
          add(param, "parameter", { detail: `block parameter ${param.value}` });
        }
      }
      i = close;
    }
  }
}

function extractRubyDefinitions(
  language: LanguageDefinition,
  tokens: Token[],
  scopes: ScopeModel,
  add: (token: Token, kind: CompletionKind, options?: AddOptions) => void,
): void {
  if (language.family !== "ruby") return;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i]!.value !== "def") continue;
    let next = nextSignificant(tokens, i);
    if (next < 0) continue;
    // `def self.foo`
    if (tokens[next]!.value === "self") {
      const dot = nextSignificant(tokens, next);
      if (dot >= 0 && tokens[dot]!.value === ".") {
        next = nextSignificant(tokens, dot);
      }
    }
    if (next < 0 || tokens[next]!.type !== "identifier") continue;
    const nameToken = tokens[next]!;
    const scopeId = scopes.tokenScope[next] ?? 0;
    add(nameToken, "method", { detail: `method ${nameToken.value}` });
    const open = nextSignificant(tokens, next);
    if (open >= 0 && tokens[open]!.value === "(") {
      const close = matchingParen(tokens, open);
      if (close < 0) continue;
      const bodyScope = findBodyScope(tokens, close, scopeId, scopes, language);
      if (bodyScope == null) continue;
      for (const param of parseParameters(tokens, open, close, language)) {
        if (param.nameToken) {
          add(param.nameToken, "parameter", {
            type: param.type,
            typeText: param.typeText,
            detail: `parameter ${param.nameToken.value}`,
          });
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

function previousSignificant(tokens: Token[], index: number): Token | null {
  for (let i = index - 1; i >= 0; i--) {
    const token = tokens[i]!;
    if (token.type !== "comment" && token.type !== "string") return token;
  }
  return null;
}

function nextSignificant(tokens: Token[], index: number): number {
  for (let i = index + 1; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.type !== "comment" && token.type !== "string") return i;
  }
  return -1;
}

function collectPrefix(
  tokens: Token[],
  nameIndex: number,
  language: LanguageDefinition,
): Token[] {
  const result: Token[] = [];
  const nameLine = tokens[nameIndex]!.line;
  for (let i = nameIndex - 1; i >= 0 && result.length < 24; i--) {
    const token = tokens[i]!;
    if (token.type === "comment" || token.type === "string") continue;
    if ([";", "{", "}", "(", "="].includes(token.value)) break;
    if (
      (token.line < nameLine && (language.family === "python" || language.family === "ruby")) ||
      (token.line < nameLine - 1 && language.family === "js")
    ) {
      break;
    }
    result.unshift(token);
  }
  return result;
}

function hasDeclarationEvidence(
  prefix: Token[],
  language: LanguageDefinition,
): boolean {
  if (prefix.length === 0) return false;
  for (const token of prefix) {
    if (language.declarationKeywords.includes(token.value)) return true;
    if (language.builtinTypes.includes(token.value)) return true;
    if (language.modifiers.includes(token.value)) return true;
    if (token.type === "identifier" && /^[A-Z]/.test(token.value)) return true;
    if (token.value === ">" || token.value === "]") return true;
  }
  return false;
}

function enclosingParenKeyword(tokens: Token[], index: number): string | null {
  let depth = 0;
  for (let i = index - 1; i >= 0; i--) {
    const token = tokens[i]!;
    if (token.type === "comment" || token.type === "string") continue;
    if (token.value === ")") depth++;
    else if (token.value === "(") {
      if (depth > 0) {
        depth--;
        continue;
      }
      const before = previousSignificant(tokens, i);
      return before?.value ?? null;
    } else if (token.value === ";" || token.value === "{" || token.value === "}") {
      return null;
    }
  }
  return null;
}

function localNestingDepth(tokens: Token[], index: number): { paren: number; brace: number; bracket: number } {
  let paren = 0;
  let brace = 0;
  let bracket = 0;
  for (let i = index - 1; i >= 0; i--) {
    const token = tokens[i]!;
    if (token.type === "comment" || token.type === "string") continue;
    if (token.value === ")") paren++;
    else if (token.value === "(") {
      if (paren === 0) break;
      paren--;
    } else if (token.value === "}") brace++;
    else if (token.value === "{") {
      if (brace === 0) break;
      brace--;
    } else if (token.value === "]") bracket++;
    else if (token.value === "[") {
      if (bracket === 0) break;
      bracket--;
    } else if (token.value === ";" || token.value === "=") break;
  }
  return { paren, brace, bracket };
}

function matchingParen(tokens: Token[], openIndex: number): number {
  return matchingDelimiter(tokens, openIndex, "(", ")");
}

function matchingBracket(tokens: Token[], openIndex: number): number {
  return matchingDelimiter(tokens, openIndex, "[", "]");
}

function matchingDelimiter(
  tokens: Token[],
  openIndex: number,
  open: string,
  close: string,
): number {
  let depth = 0;
  for (let i = openIndex; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.type === "comment" || token.type === "string") continue;
    if (token.value === open) depth++;
    else if (token.value === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function matchingOpenParen(tokens: Token[], closeIndex: number): number {
  let depth = 0;
  for (let i = closeIndex; i >= 0; i--) {
    const token = tokens[i]!;
    if (token.type === "comment" || token.type === "string") continue;
    if (token.value === ")") depth++;
    else if (token.value === "(") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitTopLevel(tokens: Token[], start: number, end: number): Token[][] {
  const segments: Token[][] = [];
  let current: Token[] = [];
  let paren = 0;
  let bracket = 0;
  let brace = 0;
  let angle = 0;

  for (let i = start; i < end; i++) {
    const token = tokens[i]!;
    if (token.type === "comment") continue;
    const value = token.value;
    if (value === "(") paren++;
    else if (value === ")") paren = Math.max(0, paren - 1);
    else if (value === "[") bracket++;
    else if (value === "]") bracket = Math.max(0, bracket - 1);
    else if (value === "{") brace++;
    else if (value === "}") brace = Math.max(0, brace - 1);
    else if (value === "<") angle++;
    else if (value === ">") angle = Math.max(0, angle - 1);

    if (value === "," && paren === 0 && bracket === 0 && brace === 0 && angle === 0) {
      segments.push(current);
      current = [];
      continue;
    }
    current.push(token);
  }
  if (current.length > 0) segments.push(current);
  return segments;
}
