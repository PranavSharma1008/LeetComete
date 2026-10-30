import type { LanguageDefinition } from "../languages/language-config";
import type { Token } from "./lexer";

export type ScopeKind = "global" | "block" | "function" | "class" | "namespace";

export interface ScopeInfo {
  id: number;
  parentId: number;
  start: number;
  end: number;
  depth: number;
  kind: ScopeKind;
}

export interface ScopeModel {
  scopes: ScopeInfo[];
  /** Scope id for every token (indexed like the token array). */
  tokenScope: number[];
  scopeAt(offset: number): ScopeInfo;
  isVisible(
    declarationScopeId: number,
    cursorScopeId: number,
    declarationStart: number,
    cursorOffset: number,
    declarationKind?: string,
  ): boolean;
}

export function buildScopes(
  text: string,
  tokens: Token[],
  language: LanguageDefinition,
): ScopeModel {
  if (language.family === "python" || language.family === "ruby") {
    return buildIndentationScopes(text, tokens, language);
  }
  return buildBraceScopes(text, tokens, language);
}

function buildBraceScopes(
  text: string,
  tokens: Token[],
  language: LanguageDefinition,
): ScopeModel {
  const scopes: ScopeInfo[] = [
    { id: 0, parentId: -1, start: 0, end: text.length, depth: 0, kind: "global" },
  ];
  const tokenScope = new Array<number>(tokens.length).fill(0);
  let current = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.type === "comment" || token.type === "string") {
      tokenScope[i] = current;
      continue;
    }
    if (token.value === "{") {
      tokenScope[i] = current;
      const kind = classifyBrace(tokens, i, language);
      const parent = scopes[current]!;
      const scope: ScopeInfo = {
        id: scopes.length,
        parentId: current,
        start: token.end,
        end: text.length,
        depth: parent.depth + 1,
        kind,
      };
      scopes.push(scope);
      current = scope.id;
      continue;
    }
    if (token.value === "}") {
      tokenScope[i] = current;
      const scope = scopes[current]!;
      if (scope.parentId >= 0) {
        scope.end = token.start;
        current = scope.parentId;
      }
      continue;
    }
    tokenScope[i] = current;
  }

  // Unclosed scopes (editing in progress) run to the end of the document.
  for (const scope of scopes) {
    if (scope.end === text.length && scope.id !== 0) scope.end = text.length;
  }

  return makeScopeModel(scopes, tokenScope);
}

function classifyBrace(
  tokens: Token[],
  braceIndex: number,
  language: LanguageDefinition,
): ScopeKind {
  const classKeywords = new Set([
    ...language.classKeywords,
    "impl",
    "namespace",
    "module",
    "object",
    "protocol",
    "trait",
    "record",
  ]);
  let inspected = 0;
  for (let i = braceIndex - 1; i >= 0 && inspected < 30; i--) {
    const token = tokens[i]!;
    if (token.type === "comment" || token.type === "string") continue;
    inspected++;
    if (token.value === ";" || token.value === "}" || token.value === "{") break;
    if (token.type === "keyword" && classKeywords.has(token.value)) {
      if (token.value === "namespace" || token.value === "module") return "namespace";
      return "class";
    }
  }
  return "block";
}

interface IndentFrame {
  indent: number;
  scopeId: number;
  /** True only for frames that own a scope; duplicate block frames do not. */
  ownsScope: boolean;
}

function buildIndentationScopes(
  text: string,
  tokens: Token[],
  language: LanguageDefinition,
): ScopeModel {
  const lineStarts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) lineStarts.push(i + 1);
  }
  const lines = text.split("\n");
  const lineScope = new Array<number>(lines.length).fill(0);
  const scopes: ScopeInfo[] = [
    { id: 0, parentId: -1, start: 0, end: text.length, depth: 0, kind: "global" },
  ];
  const stack: IndentFrame[] = [{ indent: 0, scopeId: 0, ownsScope: false }];
  let current = 0;
  let previousSignificantLine = -1;

  // Implicit line joining (unclosed brackets or a trailing backslash) matters
  // for multi-line Python/Ruby signatures. Without this, the indented
  // parameter lines look like the start of a new body, and the real body is
  // attached to the wrong scope.
  const lineDepthDelta = new Array<number>(lines.length).fill(0);
  for (const token of tokens) {
    if (token.type === "comment" || token.type === "string") continue;
    const delta =
      token.value === "(" || token.value === "[" || token.value === "{"
        ? 1
        : token.value === ")" || token.value === "]" || token.value === "}"
          ? -1
          : 0;
    if (delta !== 0 && lineDepthDelta[token.line] !== undefined) {
      lineDepthDelta[token.line]! += delta;
    }
  }
  const lineDepth = new Array<number>(lines.length).fill(0);
  let bracketDepth = 0;
  for (let i = 0; i < lines.length; i++) {
    bracketDepth += lineDepthDelta[i] ?? 0;
    lineDepth[i] = bracketDepth;
  }
  const logicalStart = new Array<number>(lines.length).fill(0);
  for (let i = 0; i < lines.length; i++) {
    if (i === 0) continue;
    const previous = lines[i - 1] ?? "";
    const continues =
      (lineDepth[i - 1] ?? 0) > 0 || previous.trimEnd().endsWith("\\");
    logicalStart[i] = continues ? logicalStart[i - 1]! : i;
  }

  const lineEnd = (lineIndex: number): number =>
    (lineStarts[lineIndex] ?? 0) + (lines[lineIndex]?.length ?? 0);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const raw = lines[lineIndex] ?? "";
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      lineScope[lineIndex] = current;
      continue;
    }
    const indent = indentationOf(raw);

    // A continuation line belongs to the logical line above it, so its
    // indentation must not open or close a scope.
    if (logicalStart[lineIndex] !== lineIndex) {
      lineScope[lineIndex] = current;
      previousSignificantLine = lineIndex;
      continue;
    }

    while (stack.length > 1 && indent < stack[stack.length - 1]!.indent) {
      const popped = stack.pop()!;
      // `if`/`for`/`do` frames share their parent's scope id. Closing one of
      // those must not truncate the enclosing function/class scope.
      if (popped.ownsScope) {
        scopes[popped.scopeId]!.end = lineStarts[lineIndex] ?? text.length;
      }
      current = stack[stack.length - 1]!.scopeId;
    }

    const top = stack[stack.length - 1]!;
    if (indent > top.indent) {
      // The body may follow the last line of a multi-line signature, so look
      // back to the first line of the logical header before classifying it.
      const headerLine = previousSignificantLine >= 0
        ? logicalStart[previousSignificantLine] ?? previousSignificantLine
        : -1;
      const previousText = headerLine >= 0 ? lines[headerLine] ?? "" : "";
      const opening = openingKind(previousText, language);
      if (opening === "function" || opening === "class") {
        const parent = scopes[current]!;
        const bodyStart = previousSignificantLine >= 0
          ? Math.min(text.length, lineEnd(previousSignificantLine) + 1)
          : lineStarts[lineIndex] ?? 0;
        const scope: ScopeInfo = {
          id: scopes.length,
          parentId: current,
          start: bodyStart,
          end: text.length,
          depth: parent.depth + 1,
          kind: opening,
        };
        scopes.push(scope);
        stack.push({ indent, scopeId: scope.id, ownsScope: true });
        current = scope.id;
      } else {
        // Python `if`/`for` and Ruby `do` blocks do not introduce a new
        // variable scope. We still track indentation so dedents are handled.
        stack.push({ indent, scopeId: current, ownsScope: false });
      }
    } else {
      current = top.scopeId;
    }

    lineScope[lineIndex] = current;
    previousSignificantLine = lineIndex;
  }

  for (const scope of scopes) {
    if (scope.id !== 0 && scope.end === text.length) scope.end = text.length;
  }

  const tokenScope = tokens.map((token) => lineScope[token.line] ?? 0);
  return makeScopeModel(scopes, tokenScope);
}

function indentationOf(line: string): number {
  let indent = 0;
  for (const char of line) {
    if (char === " ") indent++;
    else if (char === "\t") indent += 4;
    else break;
  }
  return indent;
}

function openingKind(line: string, language: LanguageDefinition): ScopeKind | null {
  if (language.family === "python") {
    if (/^\s*(?:async\s+)?def\b/.test(line)) return "function";
    if (/^\s*class\b/.test(line)) return "class";
    return null;
  }
  if (language.family === "ruby") {
    if (/^\s*def\b/.test(line)) return "function";
    if (/^\s*(?:class|module)\b/.test(line)) return "class";
    return null;
  }
  return null;
}

function makeScopeModel(scopes: ScopeInfo[], tokenScope: number[]): ScopeModel {
  return {
    scopes,
    tokenScope,
    scopeAt(offset: number): ScopeInfo {
      let best = scopes[0]!;
      for (const scope of scopes) {
        if (offset >= scope.start && offset <= scope.end && scope.depth >= best.depth) {
          best = scope;
        }
      }
      return best;
    },
    isVisible(
      declarationScopeId: number,
      cursorScopeId: number,
      declarationStart: number,
      cursorOffset: number,
      declarationKind?: string,
    ): boolean {
      if (declarationScopeId === cursorScopeId) {
        return declarationStart < cursorOffset;
      }

      let scope: ScopeInfo | undefined = scopes[cursorScopeId];
      const declarationScope = scopes[declarationScopeId];
      while (scope && scope.parentId >= 0) {
        scope = scopes[scope.parentId];
        if (!scope) break;
        if (scope.id === declarationScopeId) {
          if (declarationScope?.kind === "class" || declarationScope?.kind === "namespace") {
            return true;
          }
          if (
            declarationScopeId === 0 &&
            (declarationKind === "function" ||
              declarationKind === "class" ||
              declarationKind === "interface" ||
              declarationKind === "struct" ||
              declarationKind === "enum" ||
              declarationKind === "type")
          ) {
            return true;
          }
          return declarationStart < cursorOffset;
        }
      }
      return false;
    },
  };
}
