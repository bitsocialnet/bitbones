// Dev-only render inspectors, loaded by the `import.meta.env.DEV` guard in index.html.
//
// Nothing here may be imported from application code. Vite replaces `import.meta.env.DEV` with the
// literal `false` in a production build, so the single dynamic import in index.html becomes dead
// code and this module — plus react-scan, react-grab and element-source — never reaches the shipped
// bundle. CI greps `build/assets/` for the globals below to keep that true.
//
// Three tools, one entry point:
//   react-scan     highlights re-renders and feeds the per-component report the `profile-browsing`
//                  skill reads through `window.__getReactScanReport()`
//   element-source resolves a live DOM node back to its source file for the `inspect-elements` skill
//   react-grab     toolbar-activated element picker for humans
//
// Ported from 5chan/src/lib/react-scan.ts and merged with the react-scan/react-grab wiring that
// already lived inline in index.html, so there is exactly one place where dev instrumentation
// starts.
//
// Every package is reached through a dynamic import, so this module has no static imports at all.
// The shapes below are derived from the `Window` declarations in src/globals.d.ts, which is what
// the automation skills read, so the two cannot drift apart.

type ReactScanReportRow = ReturnType<NonNullable<Window['__getReactScanReport']>>[string];
type ElementSourceApi = NonNullable<Window['__ELEMENT_SOURCE__']>;
type ElementSourceResult = Awaited<ReturnType<ElementSourceApi['resolve']>>;

import('react-scan').then(({ scan }) => {
  // react-scan's own `getReport()` is unusable here: it reads `Store.legacyReportData`, which 0.5.7
  // still initializes as an empty Map and never writes to, and the live `Store.reportData` is only
  // populated while the toolbar is visible AND a component is manually focused in the inspector —
  // neither holds under automation. `onRender` has no such gate, so accumulate the report here.
  const report = new Map<string, ReactScanReportRow>();

  scan({
    enabled: true,
    // The profiler sets `__PROFILING__` via addInitScript before the app loads, so automated runs
    // get no toolbar and no sounds.
    showToolbar: !window.__PROFILING__,
    onRender: (fiber, renders) => {
      for (const render of renders) {
        // `fiber.type` is the react-internal component type, which bippy leaves loosely typed
        const name: string | undefined = render.componentName || fiber?.type?.displayName || fiber?.type?.name;
        if (!name) {
          continue;
        }
        const row = report.get(name) || { count: 0, time: 0 };
        row.count += render.count || 1;
        row.time += render.time || 0;
        report.set(name, row);
      }
    },
  });

  // Returns a plain object rather than a Map: callers serialize this with JSON.stringify, and
  // JSON.stringify(new Map()) is always "{}" regardless of contents.
  window.__getReactScanReport = () => Object.fromEntries(report);
  window.__resetReactScanReport = () => report.clear();
});

// element-source is a second dynamic import, so publish a stub synchronously. An agent that
// evaluates `window.__ELEMENT_SOURCE__.resolve(...)` too early then gets a structured "not ready"
// answer instead of a TypeError on undefined.
const notReady = async (): Promise<ElementSourceResult> => ({ error: 'element-source is not ready yet.' });

const elementSourceApi: ElementSourceApi = {
  ready: false,
  error: null,
  resolve: notReady,
  resolveBySelector: notReady,
  resolveAtPoint: notReady,
  formatStack: () => '',
};

window.__ELEMENT_SOURCE__ = elementSourceApi;

import('element-source')
  .then(({ formatStack, resolveElementInfo }) => {
    const resolve = async (node: unknown): Promise<ElementSourceResult> => {
      if (!(node instanceof Element)) {
        return { error: 'Expected a DOM Element.' };
      }

      try {
        const info = await resolveElementInfo(node);
        return {
          ...info,
          available: Boolean(info.source || info.stack.length || info.componentName),
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    };

    Object.assign(elementSourceApi, {
      ready: true,
      resolve,
      resolveBySelector: async (selector: string): Promise<ElementSourceResult> => {
        const element = document.querySelector(selector);
        if (!(element instanceof Element)) {
          return { error: `No element matched selector: ${selector}` };
        }
        return resolve(element);
      },
      resolveAtPoint: async (x: number, y: number): Promise<ElementSourceResult> => {
        const element = document.elementFromPoint(x, y);
        if (!(element instanceof Element)) {
          return { error: `No element found at point (${x}, ${y})` };
        }
        return resolve(element);
      },
      formatStack: (stack: unknown, maxLines = 3) => (Array.isArray(stack) ? formatStack(stack, maxLines) : ''),
    } satisfies Partial<ElementSourceApi>);
  })
  .catch((error: unknown) => {
    elementSourceApi.error = error instanceof Error ? error.message : String(error);
  });

// react-grab is toolbar-activated only: its keyboard shortcut is disabled so it cannot fight with
// copy/paste.
import('react-grab/core').then((reactGrab) => {
  const api = reactGrab.init({ activationKey: () => false });
  window.__REACT_GRAB__ = api;
  window.dispatchEvent(new CustomEvent('react-grab:init', { detail: api }));
});
