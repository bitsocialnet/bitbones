declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
}

// ext-name ships no typings and has no @types package, so the import would otherwise be untyped.
// This mirrors node_modules/ext-name/index.js: a callable module with a `mime` property, both
// returning the matching { ext, mime } entries.
declare module 'ext-name' {
  interface ExtNameResult {
    ext: string;
    mime: string;
  }

  function extName(filename: string): ExtNameResult[];

  namespace extName {
    function mime(mimeType: string): ExtNameResult[];
  }

  export = extName;
}

// debug ships no typings. Only what src/lib/protocol-log.ts uses: the shared module that pkc-js and the
// hooks log through, its enable/disable switches and the log function every instance falls back to.
declare module 'debug' {
  interface Debug {
    enable(namespaces: string): void;
    disable(): string;
    log: (...args: unknown[]) => void;
  }
  const debug: Debug;
  export default debug;
}
