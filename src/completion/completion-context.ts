import type { CompletionContext, Declaration } from "../shared/types";
import type { LanguageDefinition } from "../languages/language-config";
import { normalizeTypeName } from "../languages/language-config";
import type { IdentifierIndex } from "./identifier-index";
import { isBlockedOffset, tokenAtOffset } from "./lexer";

const WORD_CHAR = /[\p{L}\p{N}_$]/u;

/**
 * Work out what the caret is sitting on: the word being typed, whether it is a
 * member access, and (when possible) the type of the receiver.
 *
 * The function is intentionally forgiving. A wrong receiver type only costs us
 * member suggestions; it never corrupts the document because acceptance is
 * handled by the editor adapter.
 */
export function buildCompletionContext(
  text: string,
  offset: number,
  language: LanguageDefinition,
  index: IdentifierIndex,
): CompletionContext {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  let prefixStart = safeOffset;
  while (prefixStart > 0 && WORD_CHAR.test(text[prefixStart - 1] ?? "")) {
    prefixStart--;
  }
  const prefix = text.slice(prefixStart, safeOffset);
  const blocked = isBlockedOffset(index.blockedRanges, safeOffset) || isCommentAtCaret(index, safeOffset);

  const access = findMemberAccess(text, prefixStart);
  if (blocked) {
    return {
      prefix,
      prefixStart,
      memberAccess: access.memberAccess,
      blocked: true,
      reason: "The caret is inside a comment or string literal.",
    };
  }

  if (!access.memberAccess) {
    return { prefix, prefixStart, memberAccess: false, blocked: false };
  }

  const receiver = access.receiverName
    ? resolveReceiver(access.receiverName, safeOffset, language, index)
    : undefined;

  return {
    prefix,
    prefixStart,
    memberAccess: true,
    receiverName: access.receiverName,
    receiverType: access.explicitType ?? receiver?.type,
    blocked: false,
    reason: access.receiverName ? undefined : "Could not identify the receiver.",
  };
}

interface MemberAccess {
  memberAccess: boolean;
  receiverName?: string;
  explicitType?: string;
}

const ACCESS_OPERATORS = ["?.", "->", "::", "."] as const;

function findMemberAccess(text: string, prefixStart: number): MemberAccess {
  // Allow horizontal whitespace between the receiver and the operator, but
  // never across a newline (that would make every indented line a member).
  let end = prefixStart;
  while (end > 0 && (text[end - 1] === " " || text[end - 1] === "\t")) end--;
  if (end === 0) return { memberAccess: false };

  const operator = ACCESS_OPERATORS.find((candidate) =>
    text.slice(Math.max(0, end - candidate.length), end) === candidate,
  );
  if (!operator) return { memberAccess: false };

  const receiverEnd = end - operator.length;
  return parseReceiver(text, receiverEnd);
}

function parseReceiver(text: string, receiverEnd: number): MemberAccess {
  let end = receiverEnd;
  while (end > 0 && (text[end - 1] === " " || text[end - 1] === "\t")) end--;
  if (end === 0) return { memberAccess: true };

  const last = text[end - 1] ?? "";

  if (last === ")") {
    const open = matchingOpen(text, end - 1, "(", ")");
    if (open < 0) return { memberAccess: true };
    const calleeEnd = open;
    let calleeStart = calleeEnd;
    while (calleeStart > 0 && (WORD_CHAR.test(text[calleeStart - 1] ?? "") || text[calleeStart - 1] === ".")) {
      calleeStart--;
    }
    const callee = text.slice(calleeStart, calleeEnd);
    const calleeName = callee.split(".").pop() ?? "";
    if (!calleeName) return { memberAccess: true };

    // `new Foo().` — the constructed type is the receiver.
    const beforeCallee = text.slice(0, calleeStart).replace(/[ \t]+$/g, "");
    if (/\bnew\s+$/.test(beforeCallee)) {
      return { memberAccess: true, receiverName: calleeName, explicitType: normalizeTypeName(calleeName) };
    }
    // `Foo().` where Foo looks like a type is treated as an instance.
    if (/^[A-Z]/.test(calleeName)) {
      return { memberAccess: true, receiverName: calleeName, explicitType: normalizeTypeName(calleeName) };
    }
    return { memberAccess: true, receiverName: calleeName };
  }

  if (last === "]") {
    const open = matchingOpen(text, end - 1, "[", "]");
    if (open < 0) return { memberAccess: true };
    let nameEnd = open;
    while (nameEnd > 0 && (text[nameEnd - 1] === " " || text[nameEnd - 1] === "\t")) nameEnd--;
    const name = readIdentifierBackwards(text, nameEnd);
    return name ? { memberAccess: true, receiverName: name } : { memberAccess: true };
  }

  const name = readIdentifierBackwards(text, end);
  if (!name) return { memberAccess: true };
  return { memberAccess: true, receiverName: name };
}

function readIdentifierBackwards(text: string, end: number): string | undefined {
  let start = end;
  while (start > 0 && WORD_CHAR.test(text[start - 1] ?? "")) start--;
  return start === end ? undefined : text.slice(start, end);
}

function matchingOpen(text: string, closeIndex: number, openChar: string, closeChar: string): number {
  let depth = 0;
  for (let i = closeIndex; i >= 0; i--) {
    const char = text[i];
    if (char === closeChar) depth++;
    else if (char === openChar) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

interface ResolvedReceiver {
  type?: string;
}

function resolveReceiver(
  rawName: string,
  offset: number,
  language: LanguageDefinition,
  index: IdentifierIndex,
): ResolvedReceiver {
  const name = rawName === "$this" ? "this" : rawName;
  if (name === "this" || name === "self") return {};

  const declaration = findReceiverDeclaration(name, offset, index);
  if (declaration?.type) return { type: declaration.type };
  if (declaration?.typeText) {
    const type = normalizeTypeName(declaration.typeText);
    if (type) return { type };
  }

  const memberType = findMemberKey(language, name);
  if (memberType) return { type: memberType };

  // A capitalized receiver is usually a class/static access (`Math.`, `Foo.`).
  if (/^[A-Z]/.test(name)) return { type: normalizeTypeName(name) };

  return {};
}

function findReceiverDeclaration(
  name: string,
  offset: number,
  index: IdentifierIndex,
): Declaration | undefined {
  const cursorScope = index.scopes.scopeAt(offset);
  let best: Declaration | undefined;
  for (const declaration of index.declarations) {
    if (declaration.name !== name) continue;
    if (declaration.start >= offset) continue;
    if (!declaration.type && !declaration.typeText) continue;
    if (
      !index.scopes.isVisible(
        declaration.scopeId,
        cursorScope.id,
        declaration.start,
        offset,
        declaration.kind,
      )
    ) {
      continue;
    }
    if (!best || declaration.start > best.start) best = declaration;
  }
  return best;
}

function findMemberKey(language: LanguageDefinition, name: string): string | undefined {
  const keys = Object.keys(language.members);
  if (language.caseSensitive) {
    return keys.includes(name) ? name : undefined;
  }
  const lower = name.toLowerCase();
  return keys.find((key) => key.toLowerCase() === lower);
}

/**
 * The lexer's blocked ranges end at the newline, so a caret at the end of a
 * `//` comment is technically outside the range. Suppress there too; typing a
 * word at the end of a comment should not open the popup.
 */
function isCommentAtCaret(index: IdentifierIndex, offset: number): boolean {
  const token = tokenAtOffset(index.tokens, offset);
  if (token?.type === "comment") return true;
  if (offset <= 0) return false;
  const previous = tokenAtOffset(index.tokens, offset - 1);
  return previous?.type === "comment" && previous.end === offset;
}
