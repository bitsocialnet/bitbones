/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare interface ImportMetaEnv {
  readonly VITE_APP_VERSION?: string;
  readonly VITE_COMMIT_REF?: string;
  readonly VITE_PKC_JS_VERSION?: string;
  readonly VITE_HOOKS_VERSION?: string;
}

declare interface ImportMeta {
  readonly env: ImportMetaEnv;
}
