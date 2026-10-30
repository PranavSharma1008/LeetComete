import type { LanguageDefinition } from "../languages/language-config";
import { normalizeTypeName } from "../languages/language-config";
import type { Token } from "./lexer";

export interface InferredType {
  type?: string;
  typeText?: string;
}

const TYPE_NO_SPACE = new Set([
  ".", "::", "<", ">", "[", "]", ",", "*", "&", "?", ":", "(", ")", "|",
]);

export function formatTypeTokens(tokens: Token[]): string {
  let result = "";
  for (const token of tokens) {
    const value = token.value;
    if (value === ",") {
      result += ", ";
      continue;
    }
    if (TYPE_NO_SPACE.has(value)) {
      result += value;
      continue;
    }
    if (result && !result.endsWith(" ") && !result.endsWith("<") && !result.endsWith("(") && !result.endsWith("[")) {
      result += " ";
    }
    result += value;
  }
  return result.trim();
}

const MODIFIER_WORDS = new Set([
  "public", "private", "protected", "internal", "static", "final", "abstract",
  "synchronized", "native", "transient", "volatile", "strictfp", "sealed",
  "const", "constexpr", "consteval", "constinit", "inline", "virtual", "override",
  "explicit", "mutable", "friend", "noexcept", "typename", "template", "extern",
  "register", "readonly", "async", "await", "partial", "unsafe", "required",
  "init", "lateinit", "open", "data", "enum", "companion", "annotation",
  "crossinline", "noinline", "reified", "suspend", "tailrec", "vararg", "operator",
  "infix", "inner", "actual", "expect", "external", "override", "final",
  "mut", "ref", "move", "pub", "unsafe", "dyn", "impl",
]);

const TYPE_PREFIX_WORDS = new Set([
  "struct", "union", "enum", "class", "unsigned", "signed", "long", "short",
  "const", "volatile", "typename", "auto", "decltype", "typeof", "out", "ref",
]);

/** Extract the declared type from tokens that appear before a declarator. */
export function extractTypeFromPrefix(
  prefix: Token[],
  language: LanguageDefinition,
): InferredType {
  if (language.family !== "c") return {};

  let tokens = prefix.filter((token) => token.type !== "comment" && token.type !== "string");
  // Drop modifiers and annotations at the front.
  while (tokens.length > 0) {
    const value = tokens[0]!.value;
    if (value === "@") {
      tokens = tokens.slice(2);
      continue;
    }
    if (MODIFIER_WORDS.has(value)) {
      tokens = tokens.slice(1);
      continue;
    }
    break;
  }
  if (tokens.length === 0) return {};

  // Ignore a previous declarator in `int a, b`.
  const firstComma = findTopLevelComma(tokens);
  if (firstComma >= 0) tokens = tokens.slice(0, firstComma);
  if (tokens.length === 0) return {};

  const typeTokens: Token[] = [];
  let angleDepth = 0;
  let sawTypeHead = false;
  let previousWasTypeHead = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const value = token.value;

    if (value === "<") {
      angleDepth++;
      typeTokens.push(token);
      previousWasTypeHead = false;
      continue;
    }
    if (value === ">") {
      angleDepth = Math.max(0, angleDepth - 1);
      typeTokens.push(token);
      previousWasTypeHead = false;
      continue;
    }
    if (angleDepth > 0 || value === "." || value === "::" || value === "[" || value === "]" || value === "," || value === "*" || value === "&" || value === "?") {
      typeTokens.push(token);
      previousWasTypeHead = false;
      continue;
    }

    const isWord = token.type === "identifier" || token.type === "keyword";
    if (!isWord) continue;

    if (!sawTypeHead) {
      typeTokens.push(token);
      sawTypeHead = true;
      previousWasTypeHead = true;
      continue;
    }

    // A second word at angle depth 0 after a complete type is the declarator,
    // unless the first word was a type prefix such as `struct`/`unsigned`.
    const firstValue = typeTokens[0]?.value ?? "";
    const firstIsPrefix = TYPE_PREFIX_WORDS.has(firstValue);
    if (!firstIsPrefix && previousWasTypeHead) {
      // e.g. `Foo value` or `vector<int> nums` (the generic already closed).
      break;
    }
    typeTokens.push(token);
    previousWasTypeHead = true;
  }

  // Remove a trailing declarator that slipped in (e.g. `int count` -> `int`).
  while (typeTokens.length > 1) {
    const last = typeTokens[typeTokens.length - 1]!;
    const previous = typeTokens[typeTokens.length - 2]!;
    if (
      last.type === "identifier" &&
      (previous.type === "keyword" || previous.value === ">" || previous.value === "]") &&
      !TYPE_PREFIX_WORDS.has(previous.value) &&
      !language.builtinTypes.includes(previous.value) &&
      !MODIFIER_WORDS.has(previous.value)
    ) {
      typeTokens.pop();
      continue;
    }
    break;
  }

  const typeText = formatTypeTokens(typeTokens);
  return { typeText, type: normalizeTypeName(typeText) };
}

function findTopLevelComma(tokens: Token[]): number {
  let angle = 0;
  let paren = 0;
  let bracket = 0;
  for (let i = 0; i < tokens.length; i++) {
    const value = tokens[i]!.value;
    if (value === "<") angle++;
    else if (value === ">") angle = Math.max(0, angle - 1);
    else if (value === "(") paren++;
    else if (value === ")") paren = Math.max(0, paren - 1);
    else if (value === "[") bracket++;
    else if (value === "]") bracket = Math.max(0, bracket - 1);
    else if (value === "," && angle === 0 && paren === 0 && bracket === 0) return i;
  }
  return -1;
}

/** Collect the tokens of a type annotation that follows a `:`. */
export function findAnnotationType(
  tokens: Token[],
  nameIndex: number,
  language: LanguageDefinition,
): InferredType {
  let colon = -1;
  for (let i = nameIndex + 1; i < Math.min(tokens.length, nameIndex + 8); i++) {
    const token = tokens[i]!;
    if (token.type === "comment" || token.type === "string") continue;
    if (token.value === ":") {
      colon = i;
      break;
    }
    if (token.value === "=" || token.value === ";" || token.value === "," || token.value === ")") break;
  }
  if (colon < 0) return {};

  const typeTokens: Token[] = [];
  let angle = 0;
  let bracket = 0;
  for (let i = colon + 1; i < Math.min(tokens.length, colon + 16); i++) {
    const token = tokens[i]!;
    if (token.type === "comment") continue;
    const value = token.value;
    if (value === "=" || value === ";" || value === "{" || value === "}") break;
    // Commas only end the annotation at the top level; `Map<K, V>` keeps its
    // full generic argument list.
    if (value === "," && angle === 0 && bracket === 0) break;
    // Swift `[Int: Int]()` / `Foo(...)`: a `(` after the type starts an
    // initializer, not part of the type. A leading `(` can be a function type.
    if (value === "(" && typeTokens.length > 0 && angle === 0 && bracket === 0) break;
    if (value === ")" && angle === 0 && bracket === 0) break;
    if (value === "<") angle++;
    else if (value === ">") angle = Math.max(0, angle - 1);
    else if (value === "[") bracket++;
    else if (value === "]") bracket = Math.max(0, bracket - 1);
    typeTokens.push(token);
  }
  if (typeTokens.length === 0) return {};
  const typeText = formatTypeTokens(typeTokens);
  return { typeText, type: normalizeTypeName(typeText) };
}

/** Collect tokens after an `=`/`:=` for type inference. */
export function collectExpression(tokens: Token[], startIndex: number): Token[] {
  const result: Token[] = [];
  let paren = 0;
  let bracket = 0;
  let brace = 0;
  let line = -1;
  for (let i = startIndex; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.type === "comment") continue;
    if (line < 0) line = token.line;
    if (token.line !== line && result.length > 0 && paren === 0 && bracket === 0 && brace === 0) break;
    const value = token.value;
    if (value === "(") paren++;
    else if (value === ")") {
      if (paren === 0) break;
      paren--;
    } else if (value === "[") bracket++;
    else if (value === "]") bracket = Math.max(0, bracket - 1);
    else if (value === "{") brace++;
    else if (value === "}") {
      if (brace === 0) break;
      brace--;
    }
    if (value === ";" && paren === 0 && bracket === 0 && brace === 0) break;
    if (value === "," && paren === 0 && bracket === 0 && brace === 0) break;
    result.push(token);
    if (result.length > 24) break;
  }
  return result;
}

/** Infer the type of a declaration from its initializer tokens. */
export function inferTypeFromExpression(
  expression: Token[],
  language: LanguageDefinition,
): InferredType {
  const tokens = expression.filter((token) => token.type !== "comment");
  if (tokens.length === 0) return {};

  let index = 0;
  while (
    index < tokens.length &&
    ["&", "*", "await", "mut", "ref", "move"].includes(tokens[index]!.value)
  ) {
    index++;
  }
  const first = tokens[index];
  if (!first) return {};

  const firstValue = first.value;
  const family = language.family;

  if (first.type === "string") {
    if (family === "python") return { type: "str", typeText: "str" };
    if (family === "ruby") return { type: "String", typeText: "String" };
    if (family === "php") return { type: "string", typeText: "string" };
    if (family === "sql") return { type: "text", typeText: "text" };
    return { type: "String", typeText: "String" };
  }

  if (first.type === "number") {
    const hasDecimal = /[.eE]/.test(firstValue);
    if (family === "python") return { type: hasDecimal ? "float" : "int", typeText: hasDecimal ? "float" : "int" };
    if (family === "ruby") return { type: hasDecimal ? "Float" : "Integer", typeText: hasDecimal ? "Float" : "Integer" };
    if (family === "php") return { type: hasDecimal ? "float" : "int", typeText: hasDecimal ? "float" : "int" };
    return { type: hasDecimal ? "double" : "int", typeText: hasDecimal ? "double" : "int" };
  }

  if (first.type === "keyword" && ["true", "false", "True", "False"].includes(firstValue)) {
    if (family === "python") return { type: "bool", typeText: "bool" };
    return { type: "boolean", typeText: "boolean" };
  }

  if (firstValue === "new") {
    // Read the constructed type only: `new HashMap<>()` -> HashMap,
    // `new int[] {}` -> int, `new Foo.Bar()` -> Bar. Stop at the argument
    // list/initializer so identifiers inside it cannot leak into the type.
    const typeTokens: Token[] = [];
    let angle = 0;
    for (let i = index + 1; i < tokens.length && typeTokens.length < 16; i++) {
      const token = tokens[i]!;
      const value = token.value;
      if (angle === 0 && ["(", "{", ")", ",", ";"].includes(value)) break;
      if (value === "<") angle++;
      else if (value === ">") angle = Math.max(0, angle - 1);
      typeTokens.push(token);
    }
    const text = formatTypeTokens(typeTokens);
    return text ? { typeText: text, type: normalizeTypeName(text) } : {};
  }

  if (firstValue === "make" && tokens[index + 1]?.value === "(") {
    const inside = tokens.slice(index + 2, index + 12);
    if (inside.some((token) => token.value === "map")) return { type: "map", typeText: "map" };
    if (inside.some((token) => token.value === "[")) return { type: "slice", typeText: "slice" };
    return {};
  }

  if (firstValue === "vec" && tokens[index + 1]?.value === "!") {
    return { type: "Vec", typeText: "Vec" };
  }

  if (firstValue === "[" || firstValue === "{") {
    if (family === "python") {
      return firstValue === "[" ? { type: "list", typeText: "list" } : { type: "dict", typeText: "dict" };
    }
    if (family === "ruby") {
      return firstValue === "[" ? { type: "Array", typeText: "Array" } : { type: "Hash", typeText: "Hash" };
    }
    if (family === "php") return { type: "array", typeText: "array" };
    if (family === "swift") {
      return firstValue === "[" ? { type: "Array", typeText: "Array" } : { type: "Dictionary", typeText: "Dictionary" };
    }
    if (family === "go") {
      // `[]int{}` / `map[string]int{}`
      if (firstValue === "[" && tokens[index + 1]?.value === "]") return { type: "slice", typeText: "slice" };
      return {};
    }
    if (family === "js") {
      return firstValue === "[" ? { type: "Array", typeText: "Array" } : { type: "Object", typeText: "Object" };
    }
    if (family === "scala" && firstValue === "[") return { type: "Array", typeText: "Array" };
    return {};
  }

  if (first.type === "identifier" || first.type === "keyword") {
    const second = tokens[index + 1];

    // Rust / C++ `Type::new()`, `Type::default()`, `Type { ... }`
    if (second?.value === "::") {
      const typeName = firstValue;
      if (["Vec", "String", "HashMap", "HashSet", "BTreeMap", "BTreeSet"].includes(typeName)) {
        return { type: typeName, typeText: typeName };
      }
      return { type: typeName, typeText: typeName };
    }

    // Collection constructors and literals.
    const collection = collectionConstructorType(firstValue, family);
    if (collection) return { type: collection, typeText: collection };

    if (second?.value === "(" || second?.value === "{" || second?.value === "[") {
      // `Stack<Integer>()`, `Foo()`, `List.of(...)`.
      const isKnown =
        language.builtinTypes.includes(firstValue) ||
        /^[A-Z]/.test(firstValue) ||
        second.value === "{";
      if (isKnown) {
        return { type: firstValue, typeText: firstValue };
      }
    }

    if (second?.value === "." && ["map", "filter", "slice", "sort", "concat"].includes(tokens[index + 3]?.value ?? "")) {
      return { type: family === "js" ? "Array" : firstValue, typeText: family === "js" ? "Array" : firstValue };
    }

    if (family === "js" && second?.value === "=>") {
      return { type: "Function", typeText: "Function" };
    }
  }

  return {};
}

function collectionConstructorType(name: string, family: string): string | null {
  const map: Record<string, string> = {
    listOf: "List", mutableListOf: "List", arrayListOf: "List",
    setOf: "Set", mutableSetOf: "Set", hashSetOf: "Set",
    mapOf: "Map", mutableMapOf: "Map", hashMapOf: "Map",
    arrayOf: "Array", intArrayOf: "Array", longArrayOf: "Array",
    List: "List", Seq: "Seq", Vector: "Vector", Map: "Map", Set: "Set",
    Array: "Array", Some: "Option", None: "Option", Ok: "Result", Err: "Result",
    defaultdict: "dict", Counter: "Counter", deque: "deque", OrderedDict: "dict",
    set: "set", list: "list", dict: "dict", tuple: "tuple", str: "str",
    "Array.new": "Array", "Hash.new": "Hash", "Set.new": "Set",
  };
  if (family === "python") {
    if (["list", "dict", "set", "tuple", "str", "int", "float"].includes(name)) return name;
    if (["defaultdict", "Counter", "OrderedDict"].includes(name)) return "dict";
    if (name === "deque") return "deque";
  }
  return map[name] ?? null;
}
