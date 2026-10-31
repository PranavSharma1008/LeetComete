import {
  LANGUAGE_LABELS,
  PLATFORM_HOSTS,
  PLATFORM_LABELS,
} from "../shared/constants";
import {
  loadSettings,
  resetSettings,
  saveSettings,
  VS_CODE_PRESET,
  watchSettings,
} from "../shared/settings";
import type {
  Settings,
  SupportedLanguageId,
  SupportedPlatformId,
  ThemeMode,
} from "../shared/types";
import { SUPPORTED_LANGUAGE_IDS, SUPPORTED_PLATFORM_IDS } from "../shared/types";

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found as T;
}

const saveState = element<HTMLElement>("saveState");
const toast = element<HTMLElement>("toast");
const toastText = element<HTMLElement>("toastText");
const platformGrid = element<HTMLElement>("platformGrid");
const languageGrid = element<HTMLElement>("languageGrid");
const resetButton = element<HTMLButtonElement>("resetSettings");
const version = element<HTMLElement>("version");
const footerVersion = element<HTMLElement>("footerVersion");

let settings: Settings;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let saving = 0;
/** Prevent an external storage event from overwriting unsaved edits. */
let dirty = false;
let changeVersion = 0;

const RANGE_LABELS: Record<string, (value: number) => string> = {
  minPrefixLength: (value) => String(value),
  maxSuggestions: (value) => String(value),
  debounceMs: (value) => `${value} ms`,
};

function applyTheme(): void {
  document.documentElement.dataset.theme = settings.theme;
}

function setSaveState(state: "loaded" | "saving" | "saved" | "error", label: string): void {
  saveState.dataset.state = state;
  saveState.textContent = label;
}

function showToast(message: string): void {
  toastText.textContent = message;
  toast.dataset.visible = "true";
  if (toastTimer !== undefined) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.dataset.visible = "false";
    toastTimer = undefined;
  }, 1800);
}

function patchSetting(key: string, value: unknown): void {
  settings = { ...settings, [key]: value } as Settings;
  applyTheme();
  queueSave();
}

function queueSave(delay = 140): void {
  dirty = true;
  changeVersion++;
  setSaveState("saving", "Saving…");
  if (saveTimer !== undefined) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    void persist();
  }, delay);
}

async function persist(): Promise<void> {
  const request = ++saving;
  const version = changeVersion;
  const ok = await saveSettings(settings);
  if (request !== saving) return;
  if (ok) {
    if (version === changeVersion) dirty = false;
    setSaveState("saved", "Saved locally");
    showToast("Settings saved locally");
  } else {
    setSaveState("error", "Could not save");
    showToast("Settings could not be saved");
  }
}

function buildPlatformGrid(): void {
  const fragment = document.createDocumentFragment();
  for (const id of SUPPORTED_PLATFORM_IDS) {
    const label = document.createElement("label");
    label.className = "check-card";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.platform = id;

    const copy = document.createElement("span");
    copy.className = "check-copy";
    const title = document.createElement("span");
    title.className = "check-title";
    title.textContent = PLATFORM_LABELS[id];
    const meta = document.createElement("span");
    meta.className = "check-meta";
    meta.textContent = PLATFORM_HOSTS[id][0] ?? id;
    copy.append(title, meta);

    label.append(input, copy);
    fragment.appendChild(label);
  }
  platformGrid.replaceChildren(fragment);
}

function buildLanguageGrid(): void {
  const fragment = document.createDocumentFragment();
  for (const id of SUPPORTED_LANGUAGE_IDS) {
    const label = document.createElement("label");
    label.className = "check-card";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.language = id;

    const copy = document.createElement("span");
    copy.className = "check-copy";
    const title = document.createElement("span");
    title.className = "check-title";
    title.textContent = LANGUAGE_LABELS[id];
    const meta = document.createElement("span");
    meta.className = "check-meta";
    meta.textContent = id;
    copy.append(title, meta);

    label.append(input, copy);
    fragment.appendChild(label);
  }
  languageGrid.replaceChildren(fragment);
}

function updateRangeOutput(input: HTMLInputElement): void {
  const output = document.getElementById(`${input.id}Value`);
  if (!output) return;
  const value = Number(input.value);
  output.textContent = RANGE_LABELS[input.id]?.(value) ?? String(value);
}

function isVsCodePreset(s: Settings): boolean {
  return (
    s.minPrefixLength === VS_CODE_PRESET.minPrefixLength &&
    s.maxSuggestions === VS_CODE_PRESET.maxSuggestions &&
    s.debounceMs === VS_CODE_PRESET.debounceMs &&
    s.acceptOnTab === VS_CODE_PRESET.acceptOnTab &&
    s.acceptOnEnter === VS_CODE_PRESET.acceptOnEnter &&
    s.fuzzyMatching === VS_CODE_PRESET.fuzzyMatching
  );
}

function updatePresetUI(): void {
  const isVsCode = isVsCodePreset(settings);
  const badge = document.getElementById("presetBadge");
  if (badge) {
    badge.textContent = isVsCode ? "VS Code" : "Custom";
    if (isVsCode) {
      badge.dataset.tone = "success";
    } else {
      delete badge.dataset.tone;
    }
  }
  for (const radio of document.querySelectorAll<HTMLInputElement>("input[name='sensitivityPreset']")) {
    radio.checked = radio.value === (isVsCode ? "vscode" : "custom");
  }
}

function render(): void {
  applyTheme();
  updatePresetUI();

  for (const input of document.querySelectorAll<HTMLInputElement>("input[data-setting]")) {
    const key = input.dataset.setting;
    if (!key) continue;
    if (input.type === "range") {
      const value = settings[key as keyof Settings];
      input.value = String(typeof value === "number" ? value : 0);
      updateRangeOutput(input);
    } else {
      const value = settings[key as keyof Settings];
      input.checked = Boolean(value);
    }
  }

  for (const radio of document.querySelectorAll<HTMLInputElement>("input[name='theme']")) {
    radio.checked = radio.value === settings.theme;
  }

  for (const input of platformGrid.querySelectorAll<HTMLInputElement>("input[data-platform]")) {
    const id = input.dataset.platform as SupportedPlatformId | undefined;
    input.checked = id ? settings.platforms[id] : false;
  }

  for (const input of languageGrid.querySelectorAll<HTMLInputElement>("input[data-language]")) {
    const id = input.dataset.language as SupportedLanguageId | undefined;
    input.checked = id ? settings.languages[id] : false;
  }
}

function bindEvents(): void {
  for (const radio of document.querySelectorAll<HTMLInputElement>("input[name='sensitivityPreset']")) {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      if (radio.value === "vscode") {
        settings = {
          ...settings,
          ...VS_CODE_PRESET,
        };
        render();
        queueSave(0);
        showToast("VS Code preset applied");
      }
    });
  }

  for (const input of document.querySelectorAll<HTMLInputElement>("input[data-setting]")) {
    const key = input.dataset.setting;
    if (!key) continue;
    if (input.type === "range") {
      input.addEventListener("input", () => {
        updateRangeOutput(input);
        dirty = true;
        settings = { ...settings, [key]: Number(input.value) } as Settings;
        updatePresetUI();
      });
      input.addEventListener("change", () => queueSave(0));
    } else {
      input.addEventListener("change", () => {
        patchSetting(key, input.checked);
        updatePresetUI();
      });
    }
  }

  for (const radio of document.querySelectorAll<HTMLInputElement>("input[name='theme']")) {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      patchSetting("theme", radio.value as ThemeMode);
    });
  }

  platformGrid.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    const id = input.dataset.platform as SupportedPlatformId | undefined;
    if (!id) return;
    settings = {
      ...settings,
      platforms: { ...settings.platforms, [id]: input.checked },
    };
    queueSave(0);
  });

  languageGrid.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    const id = input.dataset.language as SupportedLanguageId | undefined;
    if (!id) return;
    settings = {
      ...settings,
      languages: { ...settings.languages, [id]: input.checked },
    };
    queueSave(0);
  });

  resetButton.addEventListener("click", () => {
    const confirmed = window.confirm(
      "Reset every Leetcomete preference to its default? Your code and editor contents are not affected.",
    );
    if (!confirmed) return;
    void (async () => {
      settings = await resetSettings();
      dirty = false;
      changeVersion++;
      render();
      setSaveState("saved", "Defaults restored");
      showToast("Defaults restored");
    })();
  });
}

async function init(): Promise<void> {
  settings = await loadSettings();
  buildPlatformGrid();
  buildLanguageGrid();
  render();
  bindEvents();

  const manifestVersion = chrome.runtime.getManifest().version;
  version.textContent = `v${manifestVersion}`;
  footerVersion.textContent = `v${manifestVersion}`;

  watchSettings((next) => {
    if (dirty) return;
    settings = next;
    render();
  });
}

void init();
