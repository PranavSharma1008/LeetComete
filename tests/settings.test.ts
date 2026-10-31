import { afterEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY } from "../src/shared/constants";
import {
  clampSettings,
  defaultSettings,
  loadSettings,
  saveSettings,
} from "../src/shared/settings";

interface MemoryArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
  data: Record<string, unknown>;
}

function memoryArea(initial: Record<string, unknown> = {}): MemoryArea {
  const data = { ...initial };
  return {
    data,
    async get(key) {
      return key in data ? { [key]: data[key] } : {};
    },
    async set(values) {
      Object.assign(data, values);
    },
    async remove(key) {
      delete data[key];
    },
  };
}

function installChrome(local: MemoryArea, sync: MemoryArea): void {
  vi.stubGlobal("chrome", {
    storage: {
      local,
      sync,
      onChanged: {
        addListener: () => undefined,
        removeListener: () => undefined,
      },
    },
  } as unknown as typeof chrome);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("settings defaults", () => {
  it("enables the documented keyboard acceptance defaults", () => {
    const settings = defaultSettings();
    expect(settings.enabled).toBe(true);
    expect(settings.acceptOnTab).toBe(true);
    expect(settings.acceptOnEnter).toBe(true);
    expect(settings.syncEnabled).toBe(false);
    expect(settings.minPrefixLength).toBe(1);
    expect(settings.maxSuggestions).toBe(50);
    expect(settings.debounceMs).toBe(10);
    expect(settings.fuzzyMatching).toBe(false);
  });

  it("clamps out-of-range values and preserves unknown defaults", () => {
    const settings = clampSettings({
      minPrefixLength: 99,
      maxSuggestions: -5,
      debounceMs: 9999,
      theme: "neon" as never,
    });
    expect(settings.minPrefixLength).toBe(3);
    expect(settings.maxSuggestions).toBe(5);
    expect(settings.debounceMs).toBe(400);
    expect(settings.theme).toBe("auto");
  });
});

describe("settings storage", () => {
  it("returns defaults when Chrome storage is unavailable", async () => {
    vi.stubGlobal("chrome", undefined);
    const settings = await loadSettings();
    expect(settings).toEqual(defaultSettings());
    expect(await saveSettings(settings)).toBe(false);
  });

  it("saves locally and mirrors only when sync is enabled", async () => {
    const local = memoryArea();
    const sync = memoryArea();
    installChrome(local, sync);

    const settings = { ...defaultSettings(), syncEnabled: true, minPrefixLength: 2 };
    expect(await saveSettings(settings)).toBe(true);
    expect(local.data[STORAGE_KEY]).toMatchObject({ minPrefixLength: 2 });
    expect(sync.data[STORAGE_KEY]).toMatchObject({ minPrefixLength: 2 });

    await saveSettings({ ...settings, syncEnabled: false, minPrefixLength: 1 });
    expect(sync.data[STORAGE_KEY]).toBeUndefined();
    expect(local.data[STORAGE_KEY]).toMatchObject({ minPrefixLength: 1 });
  });

  it("loads and clamps a stored snapshot", async () => {
    const local = memoryArea({
      [STORAGE_KEY]: { minPrefixLength: 42, maxSuggestions: 500, acceptOnEnter: false },
    });
    installChrome(local, memoryArea());
    const settings = await loadSettings();
    expect(settings.minPrefixLength).toBe(3);
    expect(settings.maxSuggestions).toBe(100);
    expect(settings.acceptOnEnter).toBe(false);
  });

  it("prefers the synced copy when sync is enabled", async () => {
    const local = memoryArea({
      [STORAGE_KEY]: { syncEnabled: true, minPrefixLength: 1 },
    });
    const sync = memoryArea({
      [STORAGE_KEY]: { syncEnabled: true, minPrefixLength: 3, maxSuggestions: 25 },
    });
    installChrome(local, sync);
    const settings = await loadSettings();
    expect(settings.syncEnabled).toBe(true);
    expect(settings.minPrefixLength).toBe(3);
    expect(settings.maxSuggestions).toBe(25);
  });
});
