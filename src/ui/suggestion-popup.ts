import type { CompletionItem, ThemeMode } from "../shared/types";
import { UI } from "../shared/constants";

export interface PopupCallbacks {
  onAccept: (item: CompletionItem) => void;
  onDismiss: () => void;
}

const KIND_BADGE: Record<CompletionItem["kind"], string> = {
  variable: "V",
  parameter: "P",
  field: "F",
  property: "P",
  constant: "C",
  function: "ƒ",
  method: "ƒ",
  class: "K",
  struct: "K",
  interface: "I",
  enum: "E",
  type: "T",
  keyword: "K",
  builtin: "B",
  snippet: "S",
};

const STYLE = `
:host {
  all: initial;
  position: fixed;
  z-index: 2147483647;
  display: block;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color-scheme: light dark;
}
.panel {
  --lc-bg: #ffffff;
  --lc-bg-alt: #f5f7fb;
  --lc-border: #d7dce5;
  --lc-text: #1c2333;
  --lc-muted: #6a7386;
  --lc-accent: #2563eb;
  --lc-accent-soft: #e8efff;
  --lc-badge: #64748b;
  width: ${UI.popupWidth}px;
  max-height: ${UI.maxPopupHeight}px;
  overflow: hidden auto;
  padding: 4px;
  border: 1px solid var(--lc-border);
  border-radius: 10px;
  background: var(--lc-bg);
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.22), 0 2px 8px rgba(15, 23, 42, 0.12);
  box-sizing: border-box;
}
:host([data-theme="dark"]) .panel {
  --lc-bg: #141a24;
  --lc-bg-alt: #1b2431;
  --lc-border: #2b3545;
  --lc-text: #e6ebf4;
  --lc-muted: #93a0b4;
  --lc-accent: #6ea8ff;
  --lc-accent-soft: #1d2b45;
  --lc-badge: #8fa0b8;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55), 0 2px 8px rgba(0, 0, 0, 0.4);
}
.item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: ${UI.itemHeight}px;
  padding: 0 8px;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  box-sizing: border-box;
}
.item[aria-selected="true"],
.item:hover {
  background: var(--lc-accent-soft);
}
.badge {
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
  border-radius: 5px;
  background: var(--lc-bg-alt);
  color: var(--lc-badge);
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.item:hover .badge,
.item[aria-selected="true"] .badge {
  background: var(--lc-accent);
  color: #fff;
}
.label {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 550;
  color: var(--lc-text);
}
.match { color: var(--lc-accent); }
.detail {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
  font-size: 11px;
  color: var(--lc-muted);
}
.footer {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 8px 2px;
  border-top: 1px solid var(--lc-border);
  margin-top: 4px;
  font-size: 10px;
  color: var(--lc-muted);
}
.empty { padding: 10px; font-size: 12px; color: var(--lc-muted); }
`;

/**
 * A shadow-DOM completion popup. Shadow DOM keeps the host page's CSS from
 * leaking into the list (LeetCode's global styles are aggressive) and keeps our
 * styles from leaking out.
 */
export class SuggestionPopup {
  private readonly host: HTMLDivElement;
  private readonly shadow: ShadowRoot;
  private readonly panel: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly footer: HTMLDivElement;
  private items: CompletionItem[] = [];
  private selected = 0;
  private callbacks: PopupCallbacks | null = null;
  private prefix = "";
  private visible = false;
  private theme: ThemeMode = "auto";
  private mediaQuery: MediaQueryList | null = null;
  private readonly onMediaChange = (): void => this.applyTheme();
  private destroyed = false;

  constructor() {
    this.host = document.createElement("div");
    this.host.setAttribute("data-leetcomete", "popup");
    this.shadow = this.host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = STYLE;

    this.panel = document.createElement("div");
    this.panel.className = "panel";
    this.panel.setAttribute("role", "listbox");
    this.panel.setAttribute("aria-label", "Leetcomete suggestions");

    this.list = document.createElement("div");
    this.footer = document.createElement("div");
    this.footer.className = "footer";
    this.footer.innerHTML = "<span>↑↓ navigate</span><span>Tab accept · Esc close</span>";

    this.panel.append(this.list, this.footer);
    this.shadow.append(style, this.panel);
    this.host.style.display = "none";
    document.documentElement.appendChild(this.host);

    this.mediaQuery = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;
    this.mediaQuery?.addEventListener?.("change", this.onMediaChange);
    this.applyTheme();
  }

  /** Remove the popup and its listeners when an editor session ends. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.mediaQuery?.removeEventListener?.("change", this.onMediaChange);
    this.host.remove();
    this.items = [];
    this.callbacks = null;
    this.visible = false;
  }

  get isVisible(): boolean {
    return this.visible;
  }

  get selectedItem(): CompletionItem | undefined {
    return this.items[this.selected];
  }

  setTheme(theme: ThemeMode): void {
    this.theme = theme;
    this.applyTheme();
  }

  show(
    items: CompletionItem[],
    prefix: string,
    anchor: DOMRect | null,
    callbacks: PopupCallbacks,
  ): void {
    if (this.destroyed) return;
    if (items.length === 0) {
      this.hide();
      return;
    }
    this.items = items;
    this.selected = 0;
    this.prefix = prefix;
    this.callbacks = callbacks;
    this.visible = true;
    this.render();
    this.host.style.display = "block";
    this.position(anchor);
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.items = [];
    this.callbacks = null;
    this.host.style.display = "none";
    this.list.replaceChildren();
  }

  move(delta: number): void {
    if (!this.visible || this.items.length === 0) return;
    this.selected = (this.selected + delta + this.items.length) % this.items.length;
    this.updateSelection();
  }

  acceptSelected(): boolean {
    const item = this.selectedItem;
    if (!this.visible || !item || !this.callbacks) return false;
    const callback = this.callbacks.onAccept;
    this.hide();
    callback(item);
    return true;
  }

  private render(): void {
    const fragment = document.createDocumentFragment();
    this.items.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "item";
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", index === this.selected ? "true" : "false");
      row.dataset.index = String(index);

      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = KIND_BADGE[item.kind] ?? "·";

      const label = document.createElement("span");
      label.className = "label";
      this.renderLabel(label, item.label);

      const detail = document.createElement("span");
      detail.className = "detail";
      detail.textContent = item.detail ?? "";

      row.append(badge, label, detail);
      row.addEventListener("mouseenter", () => {
        this.selected = index;
        this.updateSelection();
      });
      row.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      row.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const target = this.items[index];
        if (!target || !this.callbacks) return;
        const callback = this.callbacks.onAccept;
        this.hide();
        callback(target);
      });
      fragment.appendChild(row);
    });
    this.list.replaceChildren(fragment);
  }

  private renderLabel(element: HTMLElement, label: string): void {
    if (this.prefix && label.toLowerCase().startsWith(this.prefix.toLowerCase())) {
      const match = document.createElement("span");
      match.className = "match";
      match.textContent = label.slice(0, this.prefix.length);
      element.append(match, document.createTextNode(label.slice(this.prefix.length)));
    } else {
      element.textContent = label;
    }
  }

  private updateSelection(): void {
    const rows = this.list.querySelectorAll<HTMLElement>(".item");
    rows.forEach((row, index) => {
      row.setAttribute("aria-selected", index === this.selected ? "true" : "false");
    });
    const selectedRow = rows[this.selected];
    if (selectedRow && typeof selectedRow.scrollIntoView === "function") {
      selectedRow.scrollIntoView({ block: "nearest" });
    }
  }

  private position(anchor: DOMRect | null): void {
    const margin = 8;
    const rect = anchor;
    if (!rect) {
      this.host.style.left = `${margin}px`;
      this.host.style.top = `${margin}px`;
      return;
    }

    const measured = this.panel.getBoundingClientRect();
    const width = measured.width || UI.popupWidth;
    const height = measured.height || UI.maxPopupHeight;
    let left = rect.left;
    let top = rect.bottom + UI.gap;

    if (left + width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - width - margin);
    }
    if (top + height > window.innerHeight - margin) {
      const above = rect.top - height - UI.gap;
      top = above >= margin ? above : Math.max(margin, window.innerHeight - height - margin);
    }
    this.host.style.left = `${Math.round(left)}px`;
    this.host.style.top = `${Math.round(top)}px`;
  }

  private applyTheme(): void {
    const dark =
      this.theme === "dark" ||
      (this.theme === "auto" && (this.mediaQuery?.matches ?? false));
    this.host.dataset.theme = dark ? "dark" : "light";
  }
}
