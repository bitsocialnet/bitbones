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
  }
}

export {};
