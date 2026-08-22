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
