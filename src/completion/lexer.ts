import type { LanguageDefinition } from "../languages/language-config";
import { keywordSet } from "../languages/language-config";

export type TokenType =
  | "identifier"
  | "keyword"
  | "number"
  | "string"
  | "comment"
  | "operator"
  | "punct";

export interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
  /** 0-based line. */
  line: number;
  /** 0-based column. */
  column: number;
}

const IDENTIFIER_START = /[\p{L}_$]/u;
const IDENTIFIER_PART = /[\p{L}\p{N}_$]/u;

const MULTI_CHAR_OPERATORS = [
  ">>>=", "===", "!==", "**=", "??=", "<<=", ">>=", ">>>", "...", "<=>",
  "&&=", "||=", "=>", "->", "::", ":=", "==", "!=", "<=", ">=", "++", "--",
  "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<", ">>", "**", "..", "?.",
  "??", "&&", "||", "|>", "<-",
] as const;

const REGEX_PRECEDING_KEYWORDS = new Set([
  "return", "case", "typeof", "instanceof", "in", "of", "delete", "void", "new",
  "do", "else", "yield", "await", "throw",
]);

const REGEX_PRECEDING_PUNCT = new Set([
  "(", "[", "{", ",", ";", ":", "=", "!", "&", "|", "?", "+", "-", "*", "%", "^",
  "~", "<", ">", "=>",
]);

export interface LexResult {
  tokens: Token[];
  /** Offsets inside comments/strings; completion is suppressed there. */
  blockedRanges: Array<{ start: number; end: number }>;
}

/**
 * A small, dependency-free lexer. It is not a compiler front-end; it exists to
 * reliably separate identifiers from comments, strings and punctuation so the
 * identifier index does not suggest words from comments.
 */
export function lex(text: string, language: LanguageDefinition): LexResult {
  const tokens: Token[] = [];
  const blockedRanges: Array<{ start: number; end: number }> = [];
  const keywords = keywordSet(language);
  const caseInsensitiveKeywords = !language.caseSensitive;
  const isKeyword = (value: string) =>
    caseInsensitiveKeywords ? keywords.has(value.toLowerCase()) : keywords.has(value);
  const length = text.length;
  let pos = 0;
  let line = 0;
  let column = 0;
  let previous: Token | null = null;

  const advanceTo = (end: number): void => {
    const bounded = Math.min(end, length);
    for (let i = pos; i < bounded; i++) {
      if (text.charCodeAt(i) === 10) {
        line++;
        column = 0;
      } else {
        column++;
      }
    }
    pos = bounded;
  };

  const push = (type: TokenType, start: number, startLine: number, startColumn: number): void => {
    const token: Token = {
      type,
      value: text.slice(start, pos),
      start,
      end: pos,
      line: startLine,
      column: startColumn,
    };
    tokens.push(token);
    previous = token;
  };

  const consumeComment = (start: number, startLine: number, startColumn: number): void => {
    const end = findBlockCommentEnd(text, start, language);
    advanceTo(end);
    blockedRanges.push({ start, end: pos });
    push("comment", start, startLine, startColumn);
  };

  const consumeLineComment = (start: number, startLine: number, startColumn: number): void => {
    let end = text.indexOf("\n", start);
    if (end < 0) end = length;
    advanceTo(end);
    blockedRanges.push({ start, end: pos });
    push("comment", start, startLine, startColumn);
  };

  const consumeString = (start: number, startLine: number, startColumn: number, delimiter: string): void => {
    // Triple quoted strings (Python, Kotlin, Swift, Scala).
    if (language.tripleQuotedStrings && text.startsWith(delimiter.repeat(3), start)) {
      const close = text.indexOf(delimiter.repeat(3), start + 3);
      const closed = close >= 0;
      advanceTo(closed ? close + 3 : length);
      blockedRanges.push({ start, end: closed ? pos : pos + 1 });
      push("string", start, startLine, startColumn);
      return;
    }

    advanceTo(start + 1);
    let closed = false;
    while (pos < length) {
      const char = text[pos];
      if (char === "\\") {
        advanceTo(pos + 2);
        continue;
      }
      if (char === delimiter) {
        advanceTo(pos + 1);
        closed = true;
        break;
      }
      // Unterminated single-line strings should not swallow the rest of the file.
      if (char === "\n" && delimiter !== "`") break;
      advanceTo(pos + 1);
    }
    if (!closed && pos < length && text[pos] === "\n" && delimiter !== "`") {
      // Leave the newline for the whitespace scanner.
    }
    // An unterminated string extends to the caret at the end of the line/EOF;
    // a closed string must not block completion after its closing quote.
    blockedRanges.push({ start, end: closed ? pos : pos + 1 });
    push("string", start, startLine, startColumn);
  };

  const consumeRustLifetime = (start: number, startLine: number, startColumn: number): boolean => {
    // `'a` is a lifetime, `'a'` is a char literal. Treat lifetimes as opaque
    // punctuation so they never become suggestions.
    if (text[start + 1] === "\\") return false;
    if (!IDENTIFIER_START.test(text[start + 1] ?? "")) return false;
    if (text[start + 2] === "'") return false;
    let end = start + 2;
    while (end < length && IDENTIFIER_PART.test(text[end] ?? "")) end++;
    advanceTo(end);
    push("punct", start, startLine, startColumn);
    return true;
  };

  const canStartRegex = (): boolean => {
    if (!previous) return true;
    if (previous.type === "keyword") return REGEX_PRECEDING_KEYWORDS.has(previous.value);
    if (previous.type === "operator") return true;
    if (previous.type === "punct") return REGEX_PRECEDING_PUNCT.has(previous.value);
    return false;
  };

  const consumeRegex = (start: number, startLine: number, startColumn: number): boolean => {
    if (!canStartRegex()) return false;
    let i = start + 1;
    let inClass = false;
    let closed = false;
    while (i < length) {
      const char = text[i];
      if (char === "\\") {
        i += 2;
        continue;
      }
      if (char === "\n") return false;
      if (char === "[") inClass = true;
      else if (char === "]") inClass = false;
      else if (char === "/" && !inClass) {
        i++;
        closed = true;
        break;
      }
      i++;
    }
    if (!closed) return false;
    while (i < length && /[a-z]/i.test(text[i] ?? "")) i++;
    advanceTo(i);
    blockedRanges.push({ start, end: pos });
    push("string", start, startLine, startColumn);
    return true;
  };

  while (pos < length) {
    const char = text[pos] ?? "";
    const code = text.charCodeAt(pos);

    // Whitespace
    if (char === " " || char === "\t" || char === "\r" || char === "\n") {
      advanceTo(pos + 1);
      continue;
    }

    // C/C++/C# preprocessor directives are not source identifiers.
    if (language.preprocessor && char === "#" && isFirstNonWhitespaceOnLine(text, pos)) {
      consumeLineComment(pos, line, column);
      continue;
    }

    // Line comments
    let matched = false;
    for (const prefix of language.lineComments) {
      if (text.startsWith(prefix, pos)) {
        consumeLineComment(pos, line, column);
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Block comments
    for (const [open, close] of language.blockComments) {
      if (text.startsWith(open, pos)) {
        const start = pos;
        const startLine = line;
        const startColumn = column;
        const end = text.indexOf(close, pos + open.length);
        advanceTo(end < 0 ? length : end + close.length);
        blockedRanges.push({ start, end: pos });
        push("comment", start, startLine, startColumn);
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Strings
    if (language.id === "rust" && char === "'" && consumeRustLifetime(pos, line, column)) {
      continue;
    }
    for (const delimiter of language.stringDelimiters) {
      if (char === delimiter) {
        consumeString(pos, line, column, delimiter);
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // JavaScript/TypeScript regex literals
    if (
      (language.id === "javascript" || language.id === "typescript") &&
      char === "/" &&
      text[pos + 1] !== "/" &&
      text[pos + 1] !== "*" &&
      consumeRegex(pos, line, column)
    ) {
      continue;
    }

    // Identifiers / keywords
    if (IDENTIFIER_START.test(char)) {
      const start = pos;
      const startLine = line;
      const startColumn = column;
      advanceTo(pos + 1);
      while (pos < length && IDENTIFIER_PART.test(text[pos] ?? "")) advanceTo(pos + 1);
      const value = text.slice(start, pos);
      push(isKeyword(value) ? "keyword" : "identifier", start, startLine, startColumn);
      continue;
    }

    // Numbers
    if ((code >= 48 && code <= 57) || (char === "." && /[0-9]/.test(text[pos + 1] ?? ""))) {
      const start = pos;
      const startLine = line;
      const startColumn = column;
      advanceTo(pos + 1);
      while (pos < length && /[0-9a-fA-FxXoObBeE._']/.test(text[pos] ?? "")) advanceTo(pos + 1);
      push("number", start, startLine, startColumn);
      continue;
    }

    // Multi-character operators
    const operator = MULTI_CHAR_OPERATORS.find((candidate) => text.startsWith(candidate, pos));
    if (operator) {
      const start = pos;
      const startLine = line;
      const startColumn = column;
      advanceTo(pos + operator.length);
      push("operator", start, startLine, startColumn);
      continue;
    }

    // Single character punctuation/operators
    const start = pos;
    const startLine = line;
    const startColumn = column;
    advanceTo(pos + 1);
    push("{}()[];,.:@#?".includes(char) ? "punct" : "operator", start, startLine, startColumn);
  }

  return { tokens, blockedRanges };
}

function isFirstNonWhitespaceOnLine(text: string, offset: number): boolean {
  for (let i = offset - 1; i >= 0; i--) {
    const char = text[i];
    if (char === "\n") return true;
    if (char !== " " && char !== "\t" && char !== "\r") return false;
  }
  return true;
}

function findBlockCommentEnd(
  text: string,
  start: number,
  language: LanguageDefinition,
): number {
  for (const [open, close] of language.blockComments) {
    if (text.startsWith(open, start)) {
      const end = text.indexOf(close, start + open.length);
      return end < 0 ? text.length : end + close.length;
    }
  }
  return start + 1;
}

/** Binary search for the token containing an offset. */
export function tokenAtOffset(tokens: Token[], offset: number): Token | null {
  let low = 0;
  let high = tokens.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const token = tokens[mid]!;
    if (offset < token.start) high = mid - 1;
    else if (offset > token.end) low = mid + 1;
    else return token;
  }
  return null;
}

export function isBlockedOffset(
  ranges: Array<{ start: number; end: number }>,
  offset: number,
): boolean {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const range = ranges[mid]!;
    if (offset < range.start) high = mid - 1;
    else if (offset >= range.end) low = mid + 1;
    else return true;
  }
  return false;
}
