import type { Settings } from "./types";

/** Messages exchanged between the isolated content script and the MAIN world. */
export const BRIDGE_SOURCE = "leetcomete" as const;
export const PAGE_SOURCE = "leetcomete-page" as const;

export type IsolatedToPageMessage =
  | { source: typeof BRIDGE_SOURCE; type: "SETTINGS"; settings: Settings }
  | { source: typeof BRIDGE_SOURCE; type: "PING" };

export type PageToIsolatedMessage =
  | {
      source: typeof PAGE_SOURCE;
      type: "STATUS";
      status: import("./types").RuntimeStatus;
    }
  | { source: typeof PAGE_SOURCE; type: "READY" };

/** Runtime message sent from the isolated content script to the service worker. */
export interface StatusUpdateMessage {
  type: "LEETCOMETE_STATUS_UPDATE";
  status: import("./types").RuntimeStatus;
}

export function isIsolatedToPage(value: unknown): value is IsolatedToPageMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { source?: unknown; type?: unknown };
  return (
    candidate.source === BRIDGE_SOURCE &&
    (candidate.type === "SETTINGS" || candidate.type === "PING")
  );
}

export function isPageToIsolated(value: unknown): value is PageToIsolatedMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { source?: unknown; type?: unknown };
  return (
    candidate.source === PAGE_SOURCE &&
    (candidate.type === "STATUS" || candidate.type === "READY")
  );
}

/** Post a message to the other world without leaking it to third-party frames. */
export function postToPage(message: IsolatedToPageMessage): void {
  window.postMessage(message, window.location.origin);
}

export function postToIsolated(message: PageToIsolatedMessage): void {
  window.postMessage(message, window.location.origin);
}
