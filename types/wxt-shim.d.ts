interface UltraDeckContentScriptContext {
  readonly isValid: boolean;
  setTimeout(callback: () => void, delay?: number): number;
}

declare function defineContentScript(config: {
  matches: string[];
  runAt?: 'document_start' | 'document_end' | 'document_idle';
  world?: 'MAIN' | 'ISOLATED';
  noScriptStartedPostMessage?: boolean;
  main: (ctx: UltraDeckContentScriptContext, ...args: unknown[]) => void | Promise<void>;
}): unknown;

declare function defineUnlistedScript(
  definition:
    | (() => unknown | Promise<unknown>)
    | {
        include?: string[];
        exclude?: string[];
        globalName?: string | boolean;
        main: () => unknown | Promise<unknown>;
      },
): unknown;

declare module '*.css';

declare module 'wxt' {
  export function defineConfig(config: { manifest?: (context: { browser: string }) => Record<string, unknown>; [key: string]: unknown }): unknown;
}

declare module 'wxt/browser' {
  export const browser: {
    storage: {
      local: { get(key: string): Promise<Record<string, unknown>>; set(value: Record<string, unknown>): Promise<void> };
      onChanged: { addListener(fn: (changes: Record<string,{ oldValue?: unknown; newValue?: unknown }>, areaName: string) => void): void };
    };
    runtime: {
      getURL(path: string): string;
      onMessage: { addListener(fn: (message: any, sender?: any) => any): void };
      openOptionsPage(): Promise<void>;
    };
    tabs: { query(query: Record<string, unknown>): Promise<Array<{id?: number; url?: string}>>; sendMessage(tabId: number, message: unknown): Promise<any> };
  };
}

declare module 'wxt/utils/inject-script' {
  export function injectScript(path: string, options?: { keepInDom?: boolean }): Promise<void>;
}
