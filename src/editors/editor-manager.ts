import type {
  EditorKind,
  LanguageId,
  RuntimeStatus,
  Settings,
} from "../shared/types";
import { VERSION } from "../shared/constants";
import { CompletionEngine } from "../completion/completion-engine";
import { detectLanguage } from "../languages/language-detection";
import { AceAdapter, findAceEditor } from "./ace-adapter";
import { CodeMirror5Adapter, findCodeMirror5 } from "./codemirror-adapter";
import { CompletionController } from "./completion-controller";
import type { EditorAdapter } from "./editor-adapter";
import { MonacoAdapter, findActiveMonacoEditor } from "./monaco-adapter";
import {
  configureMonacoEditors,
  getMonacoApi,
  getMonacoLanguageId,
  registerMonaco,
} from "./monaco-integration";
import { TextareaAdapter } from "./textarea-adapter";
import { detectPlatform, type PlatformAdapter } from "../platforms/platform-registry";

interface Session {
  kind: EditorKind;
  target: unknown;
  adapter?: EditorAdapter;
  controller?: CompletionController;
  dispose(): void;
}

/**
 * Detects the editor on the page and keeps exactly one integration alive.
 * Practice sites are single-page apps, so the manager re-checks periodically
 * and re-attaches after navigation or an editor remount.
 */
export class EditorManager {
  private readonly engine = new CompletionEngine();
  private session: Session | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private currentPlatform: PlatformAdapter | null = null;
  private disposed = false;

  constructor(
    private readonly getSettings: () => Settings,
    private readonly onStatus: (status: RuntimeStatus) => void,
  ) {}

  start(): void {
    if (this.timer !== undefined) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), 1000);
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    this.disposeSession();
  }

  /** Force re-detection, e.g. when settings change. */
  refresh(): void {
    if (this.disposed) return;
    this.tick();
  }

  private tick(): void {
    if (this.disposed) return;
    const settings = this.getSettings();
    const platform = detectPlatform();

    if (platform !== this.currentPlatform) {
      this.disposeSession();
      this.currentPlatform = platform;
    }

    if (!platform) {
      this.disposeSession();
      this.emitStatus({
        platform: "unknown",
        platformName: "Unsupported site",
        editor: "none",
        language: null,
        supported: false,
        reason: "Leetcomete does not run on this site.",
        settings,
      });
      return;
    }

    if (!settings.enabled) {
      this.disposeSession();
      this.emitStatus({
        platform: platform.id,
        platformName: platform.name,
        editor: "none",
        language: null,
        supported: false,
        reason: "Leetcomete is disabled. Enable it from the popup.",
        settings,
      });
      return;
    }

    if (!settings.platforms[platform.id]) {
      this.disposeSession();
      this.emitStatus({
        platform: platform.id,
        platformName: platform.name,
        editor: "none",
        language: null,
        supported: false,
        reason: `Completion is turned off for ${platform.name} in settings.`,
        settings,
      });
      return;
    }

    // 1. Monaco: attach custom popup controller to the active Monaco code editor.
    const monacoEditor = findActiveMonacoEditor();
    if (monacoEditor) {
      if (this.session?.target !== monacoEditor) {
        this.disposeSession();
        registerMonaco(this.getSettings);
        configureMonacoEditors();
        const adapter = new MonacoAdapter(monacoEditor, () => platform.getLanguageHint());
        const controller = new CompletionController(adapter, this.engine, this.getSettings);
        controller.start();
        this.session = {
          kind: "monaco",
          target: monacoEditor,
          adapter,
          controller,
          dispose: () => controller.dispose(),
        };
      }
      const language = this.sessionLanguage();
      this.emitStatus({
        platform: platform.id,
        platformName: platform.name,
        editor: "monaco",
        language,
        supported: this.isLanguageSupported(language, settings),
        reason: this.languageReason(language, settings),
        settings,
      });
      return;
    } else if (getMonacoApi()) {
      // Monaco is loaded on the page but no editor instance is mounted yet.
      this.disposeSession();
      registerMonaco(this.getSettings);
      configureMonacoEditors();
      const language = detectLanguage({
        editorHint: getMonacoLanguageId(),
        hint: platform.getLanguageHint(),
      });
      this.emitStatus({
        platform: platform.id,
        platformName: platform.name,
        editor: "monaco",
        language,
        supported: this.isLanguageSupported(language, settings),
        reason: this.languageReason(language, settings),
        settings,
      });
      return;
    }

    // 2. Ace Editor (used on GeeksforGeeks, CodeChef)
    const ace = findAceEditor();
    if (ace) {
      if (this.session?.target !== ace) {
        this.disposeSession();
        const adapter = new AceAdapter(ace, () => platform.getLanguageHint());
        const controller = new CompletionController(adapter, this.engine, this.getSettings);
        controller.start();
        this.session = {
          kind: "ace",
          target: ace,
          adapter,
          controller,
          dispose: () => controller.dispose(),
        };
      }
      const language = this.sessionLanguage();
      this.emitStatus({
        platform: platform.id,
        platformName: platform.name,
        editor: "ace",
        language,
        supported: this.isLanguageSupported(language, settings),
        reason: this.languageReason(language, settings),
        settings,
      });
      return;
    }

    // 3. CodeMirror 5: custom popup + captured keyboard handling.
    const cm = findCodeMirror5();
    if (cm) {
      if (this.session?.target !== cm.cm) {
        this.disposeSession();
        const adapter = new CodeMirror5Adapter(cm.cm, () => platform.getLanguageHint());
        const controller = new CompletionController(adapter, this.engine, this.getSettings);
        controller.start();
        this.session = {
          kind: "codemirror5",
          target: cm.cm,
          adapter,
          controller,
          dispose: () => controller.dispose(),
        };
      }
      const language = this.sessionLanguage();
      this.emitStatus({
        platform: platform.id,
        platformName: platform.name,
        editor: "codemirror5",
        language,
        supported: this.isLanguageSupported(language, settings),
        reason: this.languageReason(language, settings),
        settings,
      });
      return;
    }

    // 3. CodeMirror 6 is intentionally not faked.
    if (document.querySelector(".cm-editor")) {
      this.disposeSession();
      this.emitStatus({
        platform: platform.id,
        platformName: platform.name,
        editor: "none",
        language: detectLanguage({ hint: platform.getLanguageHint() }),
        supported: false,
        reason:
          "This editor uses CodeMirror 6, which Leetcomete does not support yet. Monaco and CodeMirror 5 are supported.",
        settings,
      });
      return;
    }

    // 4. Plain textarea fallback.
    const textarea = platform.findTextarea();
    if (textarea) {
      if (this.session?.target !== textarea) {
        this.disposeSession();
        const adapter = new TextareaAdapter(textarea, () => platform.getLanguageHint());
        const controller = new CompletionController(adapter, this.engine, this.getSettings);
        controller.start();
        this.session = {
          kind: "textarea",
          target: textarea,
          adapter,
          controller,
          dispose: () => controller.dispose(),
        };
      }
      const language = this.sessionLanguage();
      this.emitStatus({
        platform: platform.id,
        platformName: platform.name,
        editor: "textarea",
        language,
        supported: this.isLanguageSupported(language, settings),
        reason: this.languageReason(language, settings),
        settings,
      });
      return;
    }

    this.disposeSession();
    this.emitStatus({
      platform: platform.id,
      platformName: platform.name,
      editor: "none",
      language: null,
      supported: false,
      reason: "Waiting for a supported code editor on this page.",
      settings,
    });
  }

  private sessionLanguage(): LanguageId | null {
    try {
      return this.session?.adapter?.getLanguage() ?? null;
    } catch {
      return null;
    }
  }

  private isLanguageSupported(language: LanguageId | null, settings: Settings): boolean {
    return language !== null && (language === "plaintext" || settings.languages[language]);
  }

  private languageReason(language: LanguageId | null, settings: Settings): string | undefined {
    if (language === null) {
      return "Waiting for the editor language to be detected.";
    }
    if (language === "plaintext") {
      return "Language could not be detected; only identifiers declared on the page are suggested.";
    }
    if (!settings.languages[language]) {
      return `${language} completion is turned off in settings.`;
    }
    return undefined;
  }

  private emitStatus(input: {
    platform: RuntimeStatus["platform"];
    platformName: string;
    editor: EditorKind;
    language: LanguageId | null;
    supported: boolean;
    reason?: string;
    settings: Settings;
  }): void {
    const diagnostics = this.session?.controller?.diagnostics.result;
    this.onStatus({
      platform: input.platform,
      platformName: input.platformName,
      editor: input.editor,
      language: input.language,
      supported: input.supported,
      reason: input.reason,
      url: window.location.href,
      version: VERSION,
      extensionEnabled: input.settings.enabled,
      indexMs: diagnostics?.parseMs,
    });
  }

  private disposeSession(): void {
    if (!this.session) return;
    this.session.dispose();
    this.session = null;
  }
}
