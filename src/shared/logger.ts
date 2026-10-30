export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  scope: string;
  message: string;
  at: number;
}

const MAX_ENTRIES = 100;

/**
 * Small ring-buffer logger. It never sends anything anywhere; diagnostics stay
 * in memory and are only surfaced in the options page on demand.
 */
export class Logger {
  private entries: LogEntry[] = [];
  private debugEnabled = false;

  constructor(private readonly scope: string) {}

  setDebug(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  debug(message: string, ...args: unknown[]): void {
    if (!this.debugEnabled) return;
    this.write("debug", message, args);
  }

  info(message: string, ...args: unknown[]): void {
    this.write("info", message, args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.write("warn", message, args);
  }

  error(message: string, ...args: unknown[]): void {
    this.write("error", message, args);
  }

  recent(): LogEntry[] {
    return [...this.entries];
  }

  private write(level: LogLevel, message: string, args: unknown[]): void {
    const entry: LogEntry = { level, scope: this.scope, message, at: Date.now() };
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries.shift();

    if (level === "error") {
      console.error(`[${this.scope}] ${message}`, ...args);
    } else if (level === "warn") {
      console.warn(`[${this.scope}] ${message}`, ...args);
    } else if (this.debugEnabled) {
      console.debug(`[${this.scope}] ${message}`, ...args);
    }
  }
}
