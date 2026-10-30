import { LANGUAGE_LABELS } from "../shared/constants";
import { loadSettings, saveSettings, watchSettings } from "../shared/settings";
import type {
  GetStatusMessage,
  OpenOptionsMessage,
  RuntimeStatus,
  Settings,
  StatusResponse,
} from "../shared/types";

const EDITOR_LABELS: Record<RuntimeStatus["editor"], string> = {
  monaco: "Monaco",
  codemirror5: "CodeMirror 5",
  ace: "Ace",
  textarea: "Textarea",
  none: "None",
};

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found as T;
}

const enabled = element<HTMLInputElement>("enabled");
const showKeywords = element<HTMLInputElement>("showKeywords");
const showBuiltins = element<HTMLInputElement>("showBuiltins");
const showMemberSuggestions = element<HTMLInputElement>("showMemberSuggestions");
const openOptions = element<HTMLButtonElement>("openOptions");
const statusCard = element<HTMLElement>("statusCard");
const statusTitle = element<HTMLElement>("statusTitle");
const statusBadge = element<HTMLElement>("statusBadge");
const statusReason = element<HTMLElement>("statusReason");
const statusPlatform = element<HTMLElement>("statusPlatform");
const statusEditor = element<HTMLElement>("statusEditor");
const statusLanguage = element<HTMLElement>("statusLanguage");
const indexTime = element<HTMLElement>("indexTime");
const version = element<HTMLElement>("version");

let settings: Settings;
let lastStatus: RuntimeStatus | null = null;
let refreshing = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
/** Local toggles must not be clobbered by an in-flight status refresh. */
let dirty = false;
let changeVersion = 0;

function applyTheme(): void {
  if (!settings) return;
  document.documentElement.dataset.theme = settings.theme;
}

function renderSettings(): void {
  enabled.checked = settings.enabled;
  showKeywords.checked = settings.showKeywords;
  showBuiltins.checked = settings.showBuiltins;
  showMemberSuggestions.checked = settings.showMemberSuggestions;
  applyTheme();
}

function languageLabel(status: RuntimeStatus): string {
  if (!status.language) return "—";
  if (status.language === "plaintext") return "Plain text";
  return LANGUAGE_LABELS[status.language] ?? status.language;
}

function renderStatus(): void {
  const status = lastStatus;

  if (!settings.enabled) {
    setStatus("off", "Paused", "Off", "Completion is disabled. Turn it on to use Leetcomete.", status);
    return;
  }

  if (!status) {
    setStatus(
      "warning",
      "Waiting for a code page",
      "Idle",
      "Open LeetCode or another supported site. Reload the tab after installing or updating the extension.",
      null,
    );
    return;
  }

  if (status.platform === "unknown") {
    setStatus("off", "Unsupported site", "Not active", status.reason ?? "This page is not a supported coding platform.", status);
    return;
  }

  if (status.supported) {
    const reason = status.reason ?? "Completion is ready. Start typing in the editor.";
    setStatus("active", `${status.platformName} connected`, "Active", reason, status);
    return;
  }

  setStatus(
    "warning",
    `${status.platformName} is not ready`,
    "Limited",
    status.reason ?? "Waiting for a supported editor on this page.",
    status,
  );
}

function setStatus(
  state: "active" | "warning" | "off",
  title: string,
  badge: string,
  reason: string,
  status: RuntimeStatus | null,
): void {
  statusCard.dataset.state = state;
  statusTitle.textContent = title;
  statusBadge.textContent = badge;
  statusBadge.dataset.tone =
    state === "active" ? "success" : state === "warning" ? "warning" : "danger";
  statusReason.textContent = reason;
  statusPlatform.textContent = status?.platformName ?? "—";
  statusEditor.textContent = status ? EDITOR_LABELS[status.editor] : "—";
  statusLanguage.textContent = status ? languageLabel(status) : "—";
  indexTime.textContent = status?.indexMs !== undefined
    ? `${Math.max(1, Math.round(status.indexMs))} ms`
    : "—";
}

async function refreshStatus(): Promise<void> {
  if (refreshing) return;
  refreshing = true;
  try {
    const message: GetStatusMessage = { type: "LEETCOMETE_GET_STATUS" };
    const response = await chrome.runtime.sendMessage<GetStatusMessage, StatusResponse>(message);
    if (!response) return;
    lastStatus = response.status;
    if (response.settings && !dirty) {
      settings = response.settings;
      renderSettings();
    }
    version.textContent = `Leetcomete ${response.version || chrome.runtime.getManifest().version}`;
    renderStatus();
  } catch {
    // The service worker may be starting. Keep the last known status.
    if (!lastStatus) renderStatus();
  } finally {
    refreshing = false;
  }
}

function queueSave(): void {
  dirty = true;
  changeVersion++;
  const version = changeVersion;
  if (saveTimer !== undefined) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    void saveSettings(settings).then(() => {
      if (version === changeVersion) dirty = false;
      // Give the page bridge one manager tick to publish the new status.
      window.setTimeout(() => void refreshStatus(), 250);
    });
  }, 80);
}

type BooleanSettingKey =
  | "enabled"
  | "showKeywords"
  | "showBuiltins"
  | "showMemberSuggestions";

function bindToggle(input: HTMLInputElement, key: BooleanSettingKey): void {
  input.addEventListener("change", () => {
    settings[key] = input.checked;
    renderStatus();
    queueSave();
  });
}

bindToggle(enabled, "enabled");
bindToggle(showKeywords, "showKeywords");
bindToggle(showBuiltins, "showBuiltins");
bindToggle(showMemberSuggestions, "showMemberSuggestions");

openOptions.addEventListener("click", () => {
  const message: OpenOptionsMessage = { type: "LEETCOMETE_OPEN_OPTIONS" };
  void chrome.runtime.sendMessage(message).catch(() => {
    void chrome.runtime.openOptionsPage();
  });
  window.close();
});

async function init(): Promise<void> {
  settings = await loadSettings();
  renderSettings();
  version.textContent = `Leetcomete ${chrome.runtime.getManifest().version}`;

  watchSettings((next) => {
    if (dirty) return;
    settings = next;
    renderSettings();
    renderStatus();
  });

  await refreshStatus();
  if (!lastStatus) {
    renderStatus();
  }
  window.setInterval(() => void refreshStatus(), 1000);
}

void init();
