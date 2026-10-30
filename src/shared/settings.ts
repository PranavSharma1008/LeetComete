import { STORAGE_KEY } from "./constants";
import type {
  Settings,
  SupportedLanguageId,
  SupportedPlatformId,
} from "./types";
import { SUPPORTED_LANGUAGE_IDS, SUPPORTED_PLATFORM_IDS } from "./types";

function booleanRecord<T extends string>(keys: readonly T[], value: boolean): Record<T, boolean> {
  return Object.fromEntries(keys.map((key) => [key, value])) as Record<T, boolean>;
}

export function defaultSettings(): Settings {
  return {
    enabled: true,
    syncEnabled: false,
    platforms: booleanRecord<SupportedPlatformId>(SUPPORTED_PLATFORM_IDS, true),
    languages: booleanRecord<SupportedLanguageId>(SUPPORTED_LANGUAGE_IDS, true),
    minPrefixLength: 1,
    maxSuggestions: 40,
    acceptOnTab: true,
    acceptOnEnter: true,
    fuzzyMatching: true,
    showKeywords: true,
    showBuiltins: true,
    showSnippets: true,
    showMemberSuggestions: true,
    debounceMs: 70,
    theme: "auto",
    debug: false,
  };
}

export function clampSettings(input: Partial<Settings> | undefined | null): Settings {
  const base = defaultSettings();
  if (!input || typeof input !== "object") return base;

  const platforms = { ...base.platforms };
  for (const id of SUPPORTED_PLATFORM_IDS) {
    if (typeof input.platforms?.[id] === "boolean") platforms[id] = input.platforms[id]!;
  }
  const languages = { ...base.languages };
  for (const id of SUPPORTED_LANGUAGE_IDS) {
    if (typeof input.languages?.[id] === "boolean") languages[id] = input.languages[id]!;
  }

  const minPrefixLength = clampInt(input.minPrefixLength, 0, 3, base.minPrefixLength);
  const maxSuggestions = clampInt(input.maxSuggestions, 5, 100, base.maxSuggestions);
  const debounceMs = clampInt(input.debounceMs, 0, 400, base.debounceMs);

  return {
    enabled: bool(input.enabled, base.enabled),
    syncEnabled: bool(input.syncEnabled, base.syncEnabled),
    platforms,
    languages,
    minPrefixLength,
    maxSuggestions,
    acceptOnTab: bool(input.acceptOnTab, base.acceptOnTab),
    acceptOnEnter: bool(input.acceptOnEnter, base.acceptOnEnter),
    fuzzyMatching: bool(input.fuzzyMatching, base.fuzzyMatching),
    showKeywords: bool(input.showKeywords, base.showKeywords),
    showBuiltins: bool(input.showBuiltins, base.showBuiltins),
    showSnippets: bool(input.showSnippets, base.showSnippets),
    showMemberSuggestions: bool(input.showMemberSuggestions, base.showMemberSuggestions),
    debounceMs,
    theme:
      input.theme === "light" || input.theme === "dark" || input.theme === "auto"
        ? input.theme
        : base.theme,
    debug: bool(input.debug, base.debug),
  };
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function hasChromeStorage(): boolean {
  return typeof chrome !== "undefined" && !!chrome.storage?.local;
}

async function readArea(area: chrome.storage.StorageArea): Promise<Partial<Settings> | null> {
  const result = await area.get(STORAGE_KEY);
  const value = result?.[STORAGE_KEY];
  return value && typeof value === "object" ? (value as Partial<Settings>) : null;
}

/**
 * Settings live in `storage.local` by default. When the user explicitly opts
 * into sync we additionally mirror them to `storage.sync`; on load the synced
 * copy wins so a second machine can pick the settings up.
 */
export async function loadSettings(): Promise<Settings> {
  if (!hasChromeStorage()) return defaultSettings();
  try {
    const local = await readArea(chrome.storage.local);
    const merged = clampSettings(local);
    if (!merged.syncEnabled) return merged;

    const synced = await readArea(chrome.storage.sync);
    if (!synced) return merged;
    // syncEnabled itself always comes from local: it is the switch that decides
    // whether the sync area is authoritative.
    return clampSettings({ ...merged, ...synced, syncEnabled: true });
  } catch (error) {
    console.warn("[Leetcomete] Could not load settings, using defaults.", error);
    return defaultSettings();
  }
}

export async function saveSettings(settings: Settings): Promise<boolean> {
  const clean = clampSettings(settings);
  if (!hasChromeStorage()) return false;
  // Write the mirror first. A watcher of `local` may immediately reload
  // settings and, with sync enabled, will then see the matching copy.
  try {
    if (clean.syncEnabled) {
      await chrome.storage.sync.set({ [STORAGE_KEY]: clean });
    } else {
      await chrome.storage.sync.remove(STORAGE_KEY);
    }
  } catch (error) {
    // Sync can fail because of quota or account restrictions. Local settings
    // must still be saved, so this failure is not fatal.
    console.warn("[Leetcomete] Could not update synced settings.", error);
  }

  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: clean });
    return true;
  } catch (error) {
    console.warn("[Leetcomete] Could not save settings.", error);
    return false;
  }
}

export async function resetSettings(): Promise<Settings> {
  const settings = defaultSettings();
  await saveSettings(settings);
  return settings;
}

export type SettingsListener = (settings: Settings) => void;

export function watchSettings(listener: SettingsListener): () => void {
  if (!hasChromeStorage()) return () => undefined;
  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (!(STORAGE_KEY in changes)) return;
    if (areaName !== "local" && areaName !== "sync") return;
    void loadSettings().then(listener);
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}

/** Update a subset of settings and persist the result. */
export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  const next = clampSettings({ ...current, ...patch });
  await saveSettings(next);
  return next;
}
