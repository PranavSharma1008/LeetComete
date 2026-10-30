import { clampSettings } from "../shared/settings";
import { isIsolatedToPage, PAGE_SOURCE, postToIsolated } from "../shared/messaging";
import type { Settings } from "../shared/types";
import { EditorManager } from "../editors/editor-manager";

interface PageBridgeGlobal {
  __leetcometePageBridge?: {
    manager: EditorManager;
    setSettings(settings: Settings): void;
  };
}

let settings: Settings = clampSettings(undefined);

const host = window as unknown as PageBridgeGlobal;
if (!host.__leetcometePageBridge) {
  const manager = new EditorManager(
    () => settings,
    (status) => {
      postToIsolated({ source: PAGE_SOURCE, type: "STATUS", status });
    },
  );
  manager.start();

  const setSettings = (next: Settings): void => {
    settings = clampSettings(next);
    manager.refresh();
  };

  host.__leetcometePageBridge = { manager, setSettings };

  window.addEventListener("message", (event) => {
    // Only accept messages from this window; content scripts in other frames
    // must not be able to change our settings.
    if (event.source !== window) return;
    if (!isIsolatedToPage(event.data)) return;
    if (event.data.type === "SETTINGS") {
      setSettings(event.data.settings);
    } else if (event.data.type === "PING") {
      postToIsolated({ source: PAGE_SOURCE, type: "READY" });
      manager.refresh();
    }
  });

  // Announce readiness both immediately and shortly after. The isolated
  // content script may load before or after this MAIN-world script.
  postToIsolated({ source: PAGE_SOURCE, type: "READY" });
  window.setTimeout(() => {
    postToIsolated({ source: PAGE_SOURCE, type: "READY" });
  }, 500);
  window.setTimeout(() => {
    postToIsolated({ source: PAGE_SOURCE, type: "READY" });
  }, 2000);
}
