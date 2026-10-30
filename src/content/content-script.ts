import { loadSettings, watchSettings } from "../shared/settings";
import {
  isPageToIsolated,
  postToPage,
  type StatusUpdateMessage,
} from "../shared/messaging";
import type { RuntimeStatus, Settings } from "../shared/types";

let settings: Settings | null = null;
let latestStatus: RuntimeStatus | null = null;

function sendSettings(): void {
  if (!settings) return;
  postToPage({ source: "leetcomete", type: "SETTINGS", settings });
}

function requestFreshStatus(): void {
  postToPage({ source: "leetcomete", type: "PING" });
}

async function init(): Promise<void> {
  settings = await loadSettings();
  sendSettings();

  watchSettings((next) => {
    settings = next;
    sendSettings();
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (!isPageToIsolated(event.data)) return;

    if (event.data.type === "READY") {
      sendSettings();
      return;
    }

    if (event.data.type === "STATUS") {
      latestStatus = event.data.status;
      const message: StatusUpdateMessage = {
        type: "LEETCOMETE_STATUS_UPDATE",
        status: event.data.status,
      };
      void chrome.runtime.sendMessage(message).catch(() => {
        // The service worker may be restarting; status is best-effort.
      });
    }
  });

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    const candidate = message as { type?: unknown };
    if (candidate?.type === "LEETCOMETE_QUERY_STATUS") {
      requestFreshStatus();
      sendResponse({ status: latestStatus });
      return false;
    }
    return false;
  });

  // The MAIN-world bridge may have started before this script; give it a
  // settings update even if its READY message was missed.
  window.setTimeout(sendSettings, 0);
  window.setTimeout(sendSettings, 1000);
  window.setTimeout(requestFreshStatus, 500);
}

void init();
