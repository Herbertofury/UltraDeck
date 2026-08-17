declare function defineContentScript(config: {
  matches: string[];
  runAt?: 'document_start' | 'document_end' | 'document_idle';
  world?: 'MAIN' | 'ISOLATED';
  main: (...args: unknown[]) => void | Promise<void>;
}): unknown;
declare module 'wxt' {
  export function defineConfig(config: { manifest?: (context: { browser: string }) => Record<string, unknown>; [key: string]: unknown }): unknown;
}
declare module 'wxt/browser' {
  export const browser: {
    storage: { local: { get(key: string): Promise<Record<string, unknown>>; set(value: Record<string, unknown>): Promise<void> } };
    runtime: { onMessage: { addListener(fn: (message: any, sender?: any) => any): void } };
    tabs: { query(query: Record<string, unknown>): Promise<Array<{id?: number; url?: string}>>; sendMessage(tabId: number, message: unknown): Promise<any> };
  };
}
