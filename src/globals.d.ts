import type { ElementInfo } from 'element-source';

// Shapes of the dev-only instrumentation src/lib/dev-tools.ts publishes on `window`. They exist on
// the dev server only: src/bootstrap.ts loads that module behind `import.meta.env.DEV`, so all of these
// are undefined in a production build, hence optional. The `profile-browsing` and `inspect-elements`
// skills read them through the browser, and no application code may touch them.

// what element-source resolves a DOM node to: the library's ElementInfo plus a flag saying whether
// anything was actually resolved, or a message explaining why nothing was
type ElementSourceResult = (ElementInfo & { available: boolean }) | { error: string };

interface ElementSourceApi {
  ready: boolean;
  error: string | null;
  resolve: (node: unknown) => Promise<ElementSourceResult>;
  resolveBySelector: (selector: string) => Promise<ElementSourceResult>;
  resolveAtPoint: (x: number, y: number) => Promise<ElementSourceResult>;
  formatStack: (stack: unknown, maxLines?: number) => string;
}

declare module 'react' {
  // lowercase iframe attributes React renders verbatim; they are absent from React's own typings
  interface IframeHTMLAttributes<T> extends HTMLAttributes<T> {
    allowfullscreen?: boolean;
    credentialless?: boolean;
    frameborder?: string;
    referrerpolicy?: string;
    srcdoc?: string;
  }
}

declare global {
  interface Window {
    // set in src/app.tsx so the pkc-js module is reachable from the devtools console
    PkcJs?: unknown;
    // exposed by electron/preload.js, and settable from src/main.tsx for local experiments
    defaultPkcOptions?: Record<string, unknown>;
    pkcRpcAuthKey?: string;
    // guards the one-time sticky-menu scroll listener in src/components/menu/menu.tsx
    STICKY_MENU_SCROLL_LISTENER?: boolean;
    // set by the profiler via addInitScript before the app loads, to suppress the Agentation toolbar
    __PROFILING__?: boolean;
    // element-source bridge used by the `inspect-elements` skill
    __ELEMENT_SOURCE__?: ElementSourceApi;
  }
}

export {};
