import { PLATFORM_HOSTS, PLATFORM_LABELS } from "../shared/constants";
import type { SupportedPlatformId } from "../shared/types";
import { detectLanguageFromHint } from "../languages/language-detection";

export interface PlatformAdapter {
  readonly id: SupportedPlatformId;
  readonly name: string;
  matches(url: URL): boolean;
  /** Human-readable language label from the page, if one is visible. */
  getLanguageHint(): string | null;
  /** Fallback textarea for sites without Monaco/CodeMirror. */
  findTextarea(): HTMLTextAreaElement | null;
}

function hostMatches(url: URL, platform: SupportedPlatformId): boolean {
  return PLATFORM_HOSTS[platform].some(
    (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
  );
}

function looksLikeLanguageLabel(text: string): boolean {
  return text.length > 0 && text.length <= 48 && detectLanguageFromHint(text) !== null;
}

function firstText(selectors: readonly string[]): string | null {
  for (const selector of selectors) {
    const elements = document.querySelectorAll<HTMLElement>(selector);
    for (const element of elements) {
      const text = element.textContent?.trim();
      // Broad selectors such as `[class*="language"]` can match a container
      // holding every option. Only accept short, recognizable labels.
      if (text && looksLikeLanguageLabel(text)) return text;
    }
  }
  return null;
}

function selectedOption(selectors: readonly string[]): string | null {
  for (const selector of selectors) {
    const selects = document.querySelectorAll<HTMLSelectElement>(selector);
    for (const select of selects) {
      const text = select.selectedOptions?.[0]?.textContent?.trim();
      if (text && looksLikeLanguageLabel(text)) return text;
    }
  }
  return null;
}

/**
 * Scan only language-looking controls. Scanning every button would match a
 * stray "C" or "Java" in navigation, so selectors are deliberately narrow.
 */
function scanLanguageControls(): string | null {
  const selectors = [
    "select",
    "button[aria-haspopup]",
    "[role='button'][aria-haspopup]",
    "[class*='lang']",
    "[class*='language']",
    "[data-cy*='lang']",
    "[aria-label*='language' i]",
    "[class*='dropdown']",
    "[class*='select']",
  ];
  const elements = document.querySelectorAll<HTMLElement>(selectors.join(","));
  for (const element of elements) {
    if (element instanceof HTMLSelectElement) {
      const text = element.selectedOptions?.[0]?.textContent?.trim();
      if (text && detectLanguageFromHint(text)) return text;
      continue;
    }
    const text = element.textContent?.trim() ?? "";
    if (text.length > 0 && text.length <= 48 && detectLanguageFromHint(text)) return text;
  }
  return null;
}

function languageHint(selectors: readonly string[], selects: readonly string[] = []): string | null {
  // A native <select> gives us exactly the selected option, while a text
  // selector may point at a wrapper containing every option.
  return selectedOption(selects) ?? firstText(selectors) ?? scanLanguageControls();
}

function findCodeTextarea(selectors: readonly string[]): HTMLTextAreaElement | null {
  for (const selector of selectors) {
    const textarea = document.querySelector<HTMLTextAreaElement>(selector);
    if (textarea && isVisible(textarea)) return textarea;
  }
  // Last resort: the largest visible textarea that is not a search box.
  const candidates = [...document.querySelectorAll<HTMLTextAreaElement>("textarea")]
    .filter((textarea) => isVisible(textarea) && !looksLikeSearch(textarea))
    .sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight);
  return candidates[0] ?? null;
}

function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 20 && rect.height > 10;
}

function looksLikeSearch(textarea: HTMLTextAreaElement): boolean {
  const hint = `${textarea.name} ${textarea.id} ${textarea.className} ${textarea.placeholder}`.toLowerCase();
  return /search|comment|chat|message|feedback/.test(hint);
}

class LeetCodePlatform implements PlatformAdapter {
  readonly id = "leetcode" as const;
  readonly name = PLATFORM_LABELS.leetcode;
  matches(url: URL): boolean {
    return hostMatches(url, this.id);
  }
  getLanguageHint(): string | null {
    return languageHint(
      [
        "button[id*='headlessui-listbox-button']",
        "button[aria-haspopup='listbox']",
        "[data-cy='lang-select'] .ant-select-selection-item",
        "[class*='lang-select'] .ant-select-selection-item",
        "[class*='language-select'] .ant-select-selection-item",
        "[class*='language'] button",
        ".ant-select-selection-item",
      ],
      ["select[name='language']", "select[name='lang']"],
    );
  }
  findTextarea(): HTMLTextAreaElement | null {
    return findCodeTextarea([
      "textarea[class*='code']",
      "textarea[class*='editor']",
      ".editor textarea",
    ]);
  }
}

class GeeksforGeeksPlatform implements PlatformAdapter {
  readonly id = "geeksforgeeks" as const;
  readonly name = PLATFORM_LABELS.geeksforgeeks;
  matches(url: URL): boolean {
    return hostMatches(url, this.id);
  }
  getLanguageHint(): string | null {
    return languageHint(
      [
        "button[id*='headlessui-listbox-button']",
        "button[aria-haspopup='listbox']",
        "button[aria-haspopup='true']",
        "[role='button'][aria-haspopup]",
        "[class*='dropdown'] button",
        "button[class*='dropdown']",
        "[class*='dropdown-toggle']",
        "[class*='ant-dropdown-trigger']",
        "[class*='ant-select-selection-item']",
        "[class*='language']",
        "[class*='lang']",
        ".gfg-lang",
        "#language",
        "[class*='compiler']",
        "[class*='ide'] button",
        "[class*='header'] button",
        "[class*='toolbar'] button",
      ],
      ["select[name='language']", "select#language", "select[class*='language']"],
    );
  }
  findTextarea(): HTMLTextAreaElement | null {
    return findCodeTextarea([
      "textarea[class*='code']",
      ".code-editor textarea",
    ]);
  }
}

class HackerRankPlatform implements PlatformAdapter {
  readonly id = "hackerrank" as const;
  readonly name = PLATFORM_LABELS.hackerrank;
  matches(url: URL): boolean {
    return hostMatches(url, this.id);
  }
  getLanguageHint(): string | null {
    return languageHint(
      [
        ".select2-selection__rendered",
        "[class*='language-select']",
        "[class*='select-language']",
        "[data-analytics='LanguageSelect']",
        "[data-automation='language-select']",
        "button[id*='headlessui-listbox-button']",
        "button[aria-haspopup='listbox']",
        "button[class*='dropdown']",
        "[class*='dropdown'] button",
      ],
      [
        "select[data-analytics='LanguageSelect']",
        "select[name='language']",
        "select#language",
        "select[class*='language']",
      ],
    );
  }
  findTextarea(): HTMLTextAreaElement | null {
    return findCodeTextarea([
      "textarea[class*='code']",
      ".hr-coding-editor textarea",
      ".editor textarea",
      ".ace_text-input",
    ]);
  }
}

class CodeforcesPlatform implements PlatformAdapter {
  readonly id = "codeforces" as const;
  readonly name = PLATFORM_LABELS.codeforces;
  matches(url: URL): boolean {
    return hostMatches(url, this.id);
  }
  getLanguageHint(): string | null {
    return selectedOption([
      "select[name='programTypeId']",
      "select[name='languageId']",
      "#programTypeId",
      "#languageId",
    ]) ?? languageHint(["[class*='language']", "[class*='programType']"]);
  }
  findTextarea(): HTMLTextAreaElement | null {
    return findCodeTextarea(["textarea[name='source']", "#sourceCode textarea"]);
  }
}

class CodeChefPlatform implements PlatformAdapter {
  readonly id = "codechef" as const;
  readonly name = PLATFORM_LABELS.codechef;
  matches(url: URL): boolean {
    return hostMatches(url, this.id);
  }
  getLanguageHint(): string | null {
    return languageHint(
      [
        ".language-select",
        "[class*='language']",
        "[class*='select-language']",
        "[id*='select-language']",
        "button[class*='dropdown']",
        "[class*='dropdown'] button",
      ],
      ["select#language", "select[name='language']", "select[name='languageId']"],
    );
  }
  findTextarea(): HTMLTextAreaElement | null {
    return findCodeTextarea(["textarea[name='source']", ".editor textarea", ".ace_text-input"]);
  }
}

class AtCoderPlatform implements PlatformAdapter {
  readonly id = "atcoder" as const;
  readonly name = PLATFORM_LABELS.atcoder;
  matches(url: URL): boolean {
    return hostMatches(url, this.id);
  }
  getLanguageHint(): string | null {
    return selectedOption(["select[name='language_id']", "#select-lang select", ".select-lang select"]) ??
      languageHint(["#select-lang", ".select2-selection__rendered", "[class*='language']"]);
  }
  findTextarea(): HTMLTextAreaElement | null {
    return findCodeTextarea(["textarea[name='source']", "#source textarea"]);
  }
}

class ExercismPlatform implements PlatformAdapter {
  readonly id = "exercism" as const;
  readonly name = PLATFORM_LABELS.exercism;
  matches(url: URL): boolean {
    return hostMatches(url, this.id);
  }
  getLanguageHint(): string | null {
    return languageHint(["[class*='language']", "[data-testid*='language']", "[class*='track']"]);
  }
  findTextarea(): HTMLTextAreaElement | null {
    return findCodeTextarea(["textarea[class*='code']"]);
  }
}

const ADAPTERS: PlatformAdapter[] = [
  new LeetCodePlatform(),
  new GeeksforGeeksPlatform(),
  new HackerRankPlatform(),
  new CodeforcesPlatform(),
  new CodeChefPlatform(),
  new AtCoderPlatform(),
  new ExercismPlatform(),
];

export function detectPlatform(url: URL = new URL(window.location.href)): PlatformAdapter | null {
  return ADAPTERS.find((adapter) => adapter.matches(url)) ?? null;
}

export function allPlatformAdapters(): readonly PlatformAdapter[] {
  return ADAPTERS;
}

export function isSupportedPlatformHost(hostname: string): boolean {
  return ADAPTERS.some((adapter) =>
    PLATFORM_HOSTS[adapter.id].some(
      (host) => hostname === host || hostname.endsWith(`.${host}`),
    ),
  );
}
