import { afterEach, describe, expect, it } from "vitest";
import { PLATFORM_HOSTS } from "../src/shared/constants";
import { SUPPORTED_PLATFORM_IDS } from "../src/shared/types";
import {
  allPlatformAdapters,
  detectPlatform,
  isSupportedPlatformHost,
} from "../src/platforms/platform-registry";

function makeVisible(element: HTMLElement): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => new DOMRect(10, 10, 640, 360),
  });
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("platform detection", () => {
  it("recognizes every documented host", () => {
    for (const id of SUPPORTED_PLATFORM_IDS) {
      for (const host of PLATFORM_HOSTS[id]) {
        expect(detectPlatform(new URL(`https://${host}/problems/example`))?.id).toBe(id);
      }
    }
  });

  it("returns null for unrelated sites and lookalike hostnames", () => {
    expect(detectPlatform(new URL("https://example.com/"))).toBeNull();
    expect(detectPlatform(new URL("https://leetcode.com.evil.example/"))).toBeNull();
    expect(isSupportedPlatformHost("leetcode.com")).toBe(true);
    expect(isSupportedPlatformHost("notleetcode.com")).toBe(false);
  });

  it("exposes one adapter per supported platform", () => {
    const ids = allPlatformAdapters().map((adapter) => adapter.id);
    expect(new Set(ids).size).toBe(SUPPORTED_PLATFORM_IDS.length);
    expect(ids).toHaveLength(SUPPORTED_PLATFORM_IDS.length);
  });
});

describe("language hints", () => {
  it("reads the selected label from LeetCode's modern Headless UI dropdown", () => {
    document.body.innerHTML = `
      <button id="headlessui-listbox-button-:r1:" aria-haspopup="listbox" type="button">
        Java
      </button>
    `;
    const platform = detectPlatform(new URL("https://leetcode.com/problems/two-sum/"));
    expect(platform?.getLanguageHint()).toBe("Java");
  });

  it("reads the selected label from LeetCode's legacy custom dropdown", () => {
    document.body.innerHTML = `
      <div data-cy="lang-select">
        <div class="ant-select-selection-item">Java</div>
      </div>
      <div class="language-menu">C++ Java Python JavaScript</div>
    `;
    const platform = detectPlatform(new URL("https://leetcode.com/problems/two-sum/"));
    expect(platform?.getLanguageHint()).toBe("Java");
  });

  it("reads GeeksforGeeks dropdown with Java (21)", () => {
    document.body.innerHTML = `
      <div class="header">
        <button class="dropdown-toggle" aria-haspopup="true">
          Java (21)
        </button>
      </div>
    `;
    const platform = detectPlatform(new URL("https://practice.geeksforgeeks.org/problems/longest-common-subsequence"));
    expect(platform?.getLanguageHint()).toBe("Java (21)");
  });

  it("reads native select options instead of the whole option list", () => {
    document.body.innerHTML = `
      <select name="programTypeId">
        <option>GNU G++17</option>
        <option selected>Python 3</option>
        <option>Java 17</option>
      </select>
    `;
    const platform = detectPlatform(new URL("https://codeforces.com/problemset/problem/1/A"));
    expect(platform?.getLanguageHint()).toBe("Python 3");
  });

  it("ignores placeholder labels", () => {
    document.body.innerHTML = `<select name="language"><option selected>Select language</option></select>`;
    const platform = detectPlatform(new URL("https://www.hackerrank.com/challenges/example"));
    expect(platform?.getLanguageHint()).toBeNull();
  });
});

describe("textarea fallback", () => {
  it("finds a visible code textarea and ignores search boxes", () => {
    document.body.innerHTML = `
      <textarea class="search-box" placeholder="Search"></textarea>
      <textarea class="code-editor"></textarea>
    `;
    const search = document.querySelector<HTMLTextAreaElement>(".search-box")!;
    const code = document.querySelector<HTMLTextAreaElement>(".code-editor")!;
    makeVisible(search);
    makeVisible(code);

    const platform = detectPlatform(new URL("https://leetcode.com/problems/two-sum/"));
    expect(platform?.findTextarea()).toBe(code);
  });

  it("does not return a hidden textarea", () => {
    document.body.innerHTML = `<textarea class="code-editor"></textarea>`;
    const platform = detectPlatform(new URL("https://leetcode.com/problems/two-sum/"));
    expect(platform?.findTextarea()).toBeNull();
  });
});
