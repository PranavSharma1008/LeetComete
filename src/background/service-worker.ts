import { VERSION } from "../shared/constants";
import { loadSettings, saveSettings } from "../shared/settings";
import type {
  OpenOptionsMessage,
  RuntimeStatus,
  StatusResponse,
} from "../shared/types";
import type { StatusUpdateMessage } from "../shared/messaging";

const STATUS_PREFIX = "leetcomete.status.";

const memoryStatusMap = new Map<number, RuntimeStatus>();
let lastKnownStatus: RuntimeStatus | null = null;

function statusKey(tabId: number): string {
  return `${STATUS_PREFIX}${tabId}`;
}

async function readStatus(tabId: number | undefined): Promise<RuntimeStatus | null> {
  if (tabId !== undefined) {
    const memory = memoryStatusMap.get(tabId);
    if (memory) return memory;

    try {
      const result = await chrome.storage.session.get(statusKey(tabId));
      const found = (result[statusKey(tabId)] as RuntimeStatus | undefined) ?? null;
      if (found) {
        memoryStatusMap.set(tabId, found);
        return found;
      }
    } catch {
      // Session storage is unavailable in some Chromium derivatives.
    }

    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: "LEETCOMETE_QUERY_STATUS" });
      if (response?.status) {
        memoryStatusMap.set(tabId, response.status);
        lastKnownStatus = response.status;
        return response.status;
      }
    } catch {
      // Tab may be non-scriptable or content script not ready
    }
  }

  return lastKnownStatus;
}

async function writeStatus(tabId: number, status: RuntimeStatus): Promise<void> {
  memoryStatusMap.set(tabId, status);
  lastKnownStatus = status;
  try {
    await chrome.storage.session.set({ [statusKey(tabId)]: status });
  } catch {
    // Session storage is unavailable in some Chromium derivatives.
  }
}

async function activeTabId(): Promise<number | undefined> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id !== undefined) return tabs[0].id;
    const lastFocused = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (lastFocused[0]?.id !== undefined) return lastFocused[0].id;
    const anyActive = await chrome.tabs.query({ active: true });
    return anyActive[0]?.id;
  } catch {
    return undefined;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void loadSettings().then((settings) => saveSettings(settings));
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const candidate = message as { type?: unknown };

  if (candidate?.type === "LEETCOMETE_STATUS_UPDATE") {
    const statusMessage = message as StatusUpdateMessage;
    const tabId = sender.tab?.id;
    if (statusMessage.status) {
      if (tabId !== undefined) {
        void writeStatus(tabId, statusMessage.status);
      } else {
        lastKnownStatus = statusMessage.status;
      }
    }
    sendResponse({ ok: true });
    return false;
  }

  if (candidate?.type === "LEETCOMETE_GET_STATUS") {
    void (async () => {
      const [settings, tabId] = await Promise.all([loadSettings(), activeTabId()]);
      const status = await readStatus(tabId);
      const response: StatusResponse = {
        status,
        settings,
        version: VERSION,
      };
      sendResponse(response);
    })();
    return true;
  }

  if (candidate?.type === "LEETCOMETE_OPEN_OPTIONS") {
    const optionsMessage = message as OpenOptionsMessage;
    void optionsMessage;
    void chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  memoryStatusMap.delete(tabId);
  void chrome.storage.session.remove(statusKey(tabId)).catch(() => undefined);
});
