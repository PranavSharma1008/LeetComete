import { MONACO_LANGUAGE_ALIASES } from "../shared/constants";
import type { LanguageId, SupportedLanguageId } from "../shared/types";

interface CodePattern {
  regex: RegExp;
  weight: number;
}

const HINT_ORDER: SupportedLanguageId[] = [
  "typescript",
  "javascript",
  "cpp",
  "csharp",
  "c",
  "java",
  "python",
  "go",
  "rust",
  "kotlin",
  "swift",
  "ruby",
  "php",
  "scala",
  "sql",
];

/**
 * Map a human-readable language label (from a platform dropdown) to a language
 * id. Handles labels such as "C++ (GCC 9.2)", "Python 3", "PyPy 3" and
 * "GNU C11" without being fooled by "JavaScript" containing "Java".
 */
export function detectLanguageFromHint(hint: string | null | undefined): SupportedLanguageId | null {
  if (!hint) return null;
  const text = hint.trim().toLowerCase();
  if (!text) return null;

  // Reject obvious placeholders before running the broad patterns.
  if (/^(?:text|plain\s*text|select|auto|none|unknown|--)$/.test(text)) return null;

  if (/\btypescript\b|\bts\b/.test(text)) return "typescript";
  if (/\bjavascript\b|\bnode(?:\.js)?\b|\bjs\b/.test(text)) return "javascript";
  if (/\bc\+\+|\bcpp\b|\bg\+\+|clang\+\+/.test(text)) return "cpp";
  if (/\bc#|\bcsharp\b|\.net\b/.test(text)) return "csharp";
  if (/\bobjective-?c\b/.test(text)) return "cpp";
  if (/\bjava\b/.test(text)) return "java";
  if (/\bpython\b|\bpypy\b|\bpython3\b/.test(text)) return "python";
  if (/\bgolang\b|(?:^|\W)go(?:\W|$)/.test(text)) return "go";
  if (/\brust\b/.test(text)) return "rust";
  if (/\bkotlin\b/.test(text)) return "kotlin";
  if (/\bswift\b/.test(text)) return "swift";
  if (/\bruby\b/.test(text)) return "ruby";
  if (/\bphp\b/.test(text)) return "php";
  if (/\bscala\b/.test(text)) return "scala";
  if (/\bsql\b|\bmysql\b|\bpostgres(?:ql)?\b|\boracle\b|\bmariadb\b|\bms\s*sql\b|\bsqlite\b/.test(text)) {
    return "sql";
  }
  // Standalone "C" / "GNU C" / "C11" — never match inside another word.
  if (/(?:^|\W)c(?:\d+|\s|$)/.test(text) && !/c\+\+|c#/.test(text)) return "c";

  return null;
}

const CODE_PATTERNS: Record<SupportedLanguageId, CodePattern[]> = {
  java: [
    { regex: /\bimport\s+java\./i, weight: 8 },
    { regex: /\bSystem\.out\./i, weight: 5 },
    { regex: /\bpublic\s+static\s+void\s+main\b/i, weight: 5 },
    { regex: /\bpublic\s+(?:final\s+|abstract\s+)?class\b/i, weight: 3 },
    { regex: /\b(?:ArrayList|HashMap|StringBuilder|Integer)\s*</i, weight: 3 },
    { regex: /@Override\b/, weight: 3 },
    { regex: /\bnew\s+(?:int|String|ArrayList|HashMap|Scanner)\b/i, weight: 2 },
    { regex: /\b(?:public|protected|private)\s+(?:static\s+)?(?:final\s+)?(?:int|long|double|float|boolean|char|byte|short|void|String|ListNode|TreeNode|\w+\[\]|\w+<[\w\s,<>]+>)\s+\w+\s*\(/, weight: 8 },
    { regex: /\bString\s+(?:\[\]\s+)?\w+/, weight: 5 },
    { regex: /\bclass\s+\w+\s*\{[\s\S]*?\b(?:public|protected|private)\b/, weight: 4 },
    { regex: /\.\s*length\s*\(\s*\)/, weight: 3 },
  ],
  c: [
    { regex: /#include\s*<(?:stdio|stdlib|string|math|stdbool|ctype|limits)\.h>/i, weight: 9 },
    { regex: /\b(?:printf|scanf|fprintf|fscanf)\s*\(/i, weight: 4 },
    { regex: /\b(?:malloc|calloc|realloc|free)\s*\(/i, weight: 4 },
    { regex: /\bint\s+main\s*\(/i, weight: 3 },
    { regex: /\btypedef\s+struct\b/i, weight: 2 },
  ],
  cpp: [
    { regex: /#include\s*<(?:iostream|vector|bits\/stdc\+\+|string|algorithm|map|set|queue|stack|unordered_map|unordered_set)>/i, weight: 9 },
    { regex: /\busing\s+namespace\s+std\b/i, weight: 7 },
    { regex: /\bstd::/i, weight: 6 },
    { regex: /\bcout\s*<</i, weight: 4 },
    { regex: /\b(?:vector|unordered_map|unordered_set|priority_queue)\s*</i, weight: 4 },
    { regex: /\btemplate\s*</i, weight: 3 },
    { regex: /\bauto\s+\w+\s*=/i, weight: 2 },
    { regex: /\bpublic\s*:/, weight: 7 },
    { regex: /\bstring\s*&\s*\w+/, weight: 6 },
    { regex: /\.\s*size\s*\(\s*\)/, weight: 3 },
  ],
  python: [
    { regex: /^\s*def\s+\w+\s*\(/m, weight: 7 },
    { regex: /^\s*class\s+\w+(?:\([^)]*\))?\s*:/m, weight: 6 },
    { regex: /^\s*if\s+__name__\s*==/m, weight: 8 },
    { regex: /^\s*(?:from\s+\w+\s+)?import\s+\w+/m, weight: 3 },
    { regex: /^\s*(?:elif|except|finally)\b/m, weight: 4 },
    { regex: /^\s*for\s+\w+(?:\s*,\s*\w+)?\s+in\s+/m, weight: 4 },
    { regex: /\bself\./, weight: 3 },
  ],
  javascript: [
    { regex: /\bconsole\.(?:log|error|warn|info)\s*\(/i, weight: 5 },
    { regex: /\bmodule\.exports\b/, weight: 5 },
    { regex: /\bfunction\s+\w+\s*\(/i, weight: 3 },
    { regex: /=>/, weight: 3 },
    { regex: /\b(?:let|const)\s+\w+\s*=/, weight: 2 },
    { regex: /\brequire\s*\(/, weight: 3 },
    { regex: /\bdocument\.\w+/, weight: 3 },
  ],
  typescript: [
    { regex: /\binterface\s+\w+\s*(?:<[^>]*>)?\s*\{/, weight: 6 },
    { regex: /\btype\s+\w+\s*=/, weight: 5 },
    { regex: /:\s*(?:string|number|boolean|void|unknown|any|never)\b/, weight: 3 },
    { regex: /\b(?:public|private|protected|readonly)\s+\w+\s*:/, weight: 4 },
    { regex: /\bimport\s+.*\s+from\s+['"]/, weight: 2 },
    { regex: /\benum\s+\w+\s*\{/, weight: 3 },
  ],
  csharp: [
    { regex: /\busing\s+System(?:\.\w+)*\s*;/, weight: 9 },
    { regex: /\bConsole\.(?:Write|Read)/, weight: 6 },
    { regex: /\bnamespace\s+[\w.]+/, weight: 4 },
    { regex: /\bstatic\s+void\s+Main\s*\(/, weight: 5 },
    { regex: /\b(?:List|Dictionary|HashSet)<\w+/, weight: 3 },
    { regex: /\bpublic\s+(?:sealed\s+)?class\b/, weight: 2 },
  ],
  go: [
    { regex: /^\s*package\s+\w+/m, weight: 9 },
    { regex: /\bfunc\s+\w+\s*\(/, weight: 5 },
    { regex: /\bfmt\./, weight: 5 },
    { regex: /:=/, weight: 4 },
    { regex: /^\s*import\s*\(/m, weight: 2 },
    { regex: /\bgo\s+func\b/, weight: 2 },
  ],
  rust: [
    { regex: /\bfn\s+\w+\s*\(/, weight: 6 },
    { regex: /\blet\s+mut\b/, weight: 6 },
    { regex: /\bprintln!\s*\(/, weight: 5 },
    { regex: /\buse\s+std::/, weight: 4 },
    { regex: /\bimpl\s+\w+/, weight: 3 },
    { regex: /\b(?:Vec|String)::new\s*\(/, weight: 3 },
  ],
  kotlin: [
    { regex: /\bfun\s+\w+\s*\(/, weight: 6 },
    { regex: /\bdata\s+class\b/, weight: 5 },
    { regex: /\bwhen\s*\(/, weight: 4 },
    { regex: /\b(?:mutableListOf|listOf|mapOf|mutableMapOf)\s*\(/, weight: 4 },
    { regex: /^\s*(?:val|var)\s+\w+\s*[:=]/m, weight: 3 },
  ],
  swift: [
    { regex: /\bimport\s+(?:UIKit|Foundation|SwiftUI)\b/, weight: 9 },
    { regex: /\bguard\s+let\b/, weight: 5 },
    { regex: /\bfunc\s+\w+\s*\([^)]*\)\s*->/, weight: 4 },
    { regex: /\bif\s+let\b/, weight: 3 },
    { regex: /\blet\s+\w+\s*:\s*(?:Int|String|Bool|Double|Float)\b/, weight: 4 },
  ],
  ruby: [
    { regex: /^\s*def\s+\w+[?!]?\s*(?:\(|$)/m, weight: 4 },
    { regex: /^\s*end\s*$/m, weight: 4 },
    { regex: /\bputs\s+/, weight: 3 },
    { regex: /\b(?:attr_accessor|require_relative)\b/, weight: 5 },
    { regex: /\.each\s+do\b/, weight: 4 },
    { regex: /\belsif\b/, weight: 5 },
    { regex: /\bnil\b/, weight: 2 },
  ],
  php: [
    { regex: /<\?php/, weight: 12 },
    { regex: /\$\w+\s*=/, weight: 4 },
    { regex: /\becho\s+/, weight: 3 },
    { regex: /\bfunction\s+\w+\s*\(/, weight: 1 },
  ],
  scala: [
    { regex: /\bobject\s+\w+\s+extends\s+App\b/, weight: 10 },
    { regex: /\bdef\s+\w+\s*\([^)]*\)\s*:\s*\w+/, weight: 5 },
    { regex: /\bcase\s+class\b/, weight: 4 },
    { regex: /\b(?:List|Seq|Option|Vector)\s*\[/, weight: 4 },
    { regex: /\bval\s+\w+\s*[:=]/, weight: 2 },
  ],
  sql: [
    { regex: /\bselect\b[\s\S]{0,200}\bfrom\b/i, weight: 9 },
    { regex: /\b(?:insert\s+into|update\s+\w+\s+set|create\s+table|alter\s+table|drop\s+table)\b/i, weight: 7 },
    { regex: /\b(?:group\s+by|order\s+by|inner\s+join|left\s+join|right\s+join)\b/i, weight: 4 },
    { regex: /\bwhere\b/i, weight: 1 },
  ],
};

/**
 * Heuristic language detection from source code. It is intentionally
 * conservative: ambiguous snippets return `null` rather than a wrong guess,
 * because a wrong language makes keyword/member suggestions worse.
 */
export function detectLanguageFromCode(code: string): SupportedLanguageId | null {
  if (!code.trim()) return null;
  let best: SupportedLanguageId | null = null;
  let bestScore = 0;

  for (const id of HINT_ORDER) {
    let score = 0;
    for (const pattern of CODE_PATTERNS[id]) {
      if (pattern.regex.test(code)) score += pattern.weight;
    }
    if (score > bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return bestScore >= 4 ? best : null;
}

/** Resolve a Monaco language id (which may include aliases). */
export function detectLanguageFromMonacoId(id: string | null | undefined): SupportedLanguageId | null {
  if (!id) return null;
  const normalized = id.toLowerCase().trim();
  const alias = MONACO_LANGUAGE_ALIASES[normalized];
  if (alias) return alias;
  return detectLanguageFromHint(normalized);
}

export interface LanguageDetectionInput {
  /** Value from the platform's language dropdown. */
  hint?: string | null;
  /** Value from the editor's own language mode. */
  editorHint?: string | null;
  /** Full source code. */
  code?: string;
}

/**
 * Detection priority: editor mode (most reliable) -> platform dropdown ->
 * source heuristics. The editor can be wrong on platforms that label a mode
 * "plaintext", so an unknown editor hint falls through to the dropdown.
 */
export function detectLanguage(input: LanguageDetectionInput): LanguageId {
  const fromEditor = detectLanguageFromMonacoId(input.editorHint);
  if (fromEditor) return fromEditor;

  const fromHint = detectLanguageFromHint(input.hint);
  if (fromHint) return fromHint;

  const fromCode = detectLanguageFromCode(input.code ?? "");
  if (fromCode) return fromCode;

  return "plaintext";
}

/** Score used by tests and diagnostics; exposed for transparency. */
export function languageScores(code: string): Array<{ language: SupportedLanguageId; score: number }> {
  return HINT_ORDER.map((language) => ({
    language,
    score: CODE_PATTERNS[language].reduce(
      (total, pattern) => total + (pattern.regex.test(code) ? pattern.weight : 0),
      0,
    ),
  })).sort((a, b) => b.score - a.score);
}
