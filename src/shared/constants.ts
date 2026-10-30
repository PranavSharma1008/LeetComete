import type { SupportedLanguageId, SupportedPlatformId } from "./types";

export const EXTENSION_NAME = "Leetcomete";
export const VERSION = "1.0.0";

export const STORAGE_KEY = "leetcomete.settings.v1";

export const LANGUAGE_LABELS: Record<SupportedLanguageId, string> = {
  java: "Java",
  c: "C",
  cpp: "C++",
  python: "Python",
  javascript: "JavaScript",
  typescript: "TypeScript",
  csharp: "C#",
  go: "Go",
  rust: "Rust",
  kotlin: "Kotlin",
  swift: "Swift",
  ruby: "Ruby",
  php: "PHP",
  scala: "Scala",
  sql: "SQL",
};

export const PLATFORM_LABELS: Record<SupportedPlatformId, string> = {
  leetcode: "LeetCode",
  geeksforgeeks: "GeeksforGeeks",
  hackerrank: "HackerRank",
  codeforces: "Codeforces",
  codechef: "CodeChef",
  atcoder: "AtCoder",
  exercism: "Exercism",
};

export const PLATFORM_HOSTS: Record<SupportedPlatformId, string[]> = {
  leetcode: ["leetcode.com", "www.leetcode.com", "leetcode.cn", "www.leetcode.cn"],
  geeksforgeeks: [
    "geeksforgeeks.org",
    "www.geeksforgeeks.org",
    "practice.geeksforgeeks.org",
  ],
  hackerrank: ["hackerrank.com", "www.hackerrank.com"],
  codeforces: ["codeforces.com", "www.codeforces.com", "m1.codeforces.com", "m2.codeforces.com"],
  codechef: ["codechef.com", "www.codechef.com"],
  atcoder: ["atcoder.jp"],
  exercism: ["exercism.org", "www.exercism.org"],
};

/** Monaco language ids that map onto our language registry. */
export const MONACO_LANGUAGE_ALIASES: Record<string, SupportedLanguageId> = {
  java: "java",
  c: "c",
  cpp: "cpp",
  "c++": "cpp",
  "objective-c": "cpp",
  python: "python",
  python3: "python",
  py: "python",
  javascript: "javascript",
  js: "javascript",
  typescript: "typescript",
  ts: "typescript",
  csharp: "csharp",
  "c#": "csharp",
  go: "go",
  golang: "go",
  rust: "rust",
  kotlin: "kotlin",
  swift: "swift",
  ruby: "ruby",
  php: "php",
  scala: "scala",
  sql: "sql",
  mysql: "sql",
  pgsql: "sql",
  postgresql: "sql",
};

export const KEYBOARD = {
  acceptTab: "Tab",
  acceptEnter: "Enter",
  next: "ArrowDown",
  previous: "ArrowUp",
  dismiss: "Escape",
  explicitTrigger: "Ctrl+Space",
  explicitTriggerAlt: "Alt+/",
} as const;

export const UI = {
  maxVisibleItems: 8,
  itemHeight: 28,
  popupWidth: 340,
  maxPopupHeight: 248,
  gap: 4,
} as const;
