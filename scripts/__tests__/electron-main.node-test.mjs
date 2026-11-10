// Run with: node --test --experimental-test-module-mocks scripts/__tests__/electron-main.node-test.mjs
// electron/main.js is loaded in plain Node against a small fake of the Electron APIs it uses, as a packaged build.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, mock, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (typeof mock.module !== 'function') {
  throw new Error('run this file with node --test --experimental-test-module-mocks');
}

const electronUrl = (name) => pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../electron', name)).href;
const dataPath = mkdtempSync(path.join(tmpdir(), 'bitbones-main-test-'));
writeFileSync(path.join(dataPath, 'auth-key'), 'test-auth-key');
const realPlatform = process.platform;
after(() => {
  Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true });
  rmSync(dataPath, { recursive: true, force: true });
});

let world;

class FakeWebContents extends EventEmitter {
  session = { webRequest: { onBeforeSendHeaders() {}, onHeadersReceived() {} }, setPermissionRequestHandler() {} };
  history = ['file:///build/index.html'];
  index = 0;
  canGoBack() {
    return this.index > 0;
  }
  canGoForward() {
    return this.index < this.history.length - 1;
  }
  goBack() {
    if (this.canGoBack()) this.index--;
  }
  goForward() {
    if (this.canGoForward()) this.index++;
  }
  clearHistory() {
    this.history = [this.history[this.index]];
    this.index = 0;
  }
  getURL() {
    return this.history[this.index];
  }
  reload() {}
  setWindowOpenHandler() {}
}

class FakeBrowserWindow extends EventEmitter {
  static getAllWindows = () => world.windows.filter((window) => !window.destroyed);
  static getFocusedWindow = () => FakeBrowserWindow.getAllWindows().find((window) => window.focused);
  webContents = new FakeWebContents();
  visible = false;
  focused = false;
  minimized = false;
  destroyed = false;
  constructor() {
    super();
    world.windows.push(this);
  }
  loadURL() {}
  openDevTools() {}
  show() {
    this.visible = true;
    this.focused = true;
  }
  hide() {
    this.visible = false;
    this.focused = false;
  }
  focus() {
    this.focused = true;
  }
  isVisible() {
    return this.visible;
  }
  isMinimized() {
    return this.minimized;
  }
  restore() {
    this.minimized = false;
  }
  // the user clicks the window's X
  close() {
    let prevented = false;
    this.emit('close', { preventDefault: () => (prevented = true) });
    if (!prevented) this.destroy();
  }
  destroy() {
    this.destroyed = true;
    this.visible = false;
    this.focused = false;
    this.emit('closed');
  }
}

class FakeMenuItem {
  constructor(options) {
    Object.assign(this, options);
  }
}

class FakeMenu {
  static buildFromTemplate = (template) => new FakeMenu(template.map((item) => (item instanceof FakeMenuItem ? item : new FakeMenuItem(item))));
  static getApplicationMenu = () => world.menu;
  static setApplicationMenu = (menu) => {
    world.menu = menu;
  };
  constructor(items) {
    this.items = items;
  }
  insert(position, item) {
    this.items.splice(position, 0, item);
  }
}

class FakeTray extends EventEmitter {
  setToolTip() {}
  setContextMenu() {}
}

const app = Object.assign(new EventEmitter(), {
  requestSingleInstanceLock: () => world.gotLock,
  quit: () => world.quits++,
  isReady: () => world.ready,
  whenReady: () => world.whenReady,
});

const startIpfs = {};
mock.module('electron', {
  namedExports: {
    app,
    BrowserWindow: FakeBrowserWindow,
    Menu: FakeMenu,
    MenuItem: FakeMenuItem,
    Tray: FakeTray,
    screen: {},
    shell: { openExternal() {} },
    dialog: { showErrorBox: (title, message) => world.dialogs.push(message) },
    ipcMain: { on() {} },
    clipboard: { write: async () => {} },
    ClipboardItem: class {},
  },
});
mock.module('electron-is-dev', { defaultExport: false });
mock.module('electron-context-menu', { defaultExport: () => {} });
mock.module('env-paths', { defaultExport: () => ({ data: dataPath, log: path.join(dataPath, 'log') }) });
mock.module(electronUrl('log.js'), {});
mock.module(electronUrl('start-ipfs.js'), { defaultExport: startIpfs });
mock.module(electronUrl('start-pkc-rpc.js'), {});

let caseId = 0;
// a fresh app process: loads a new copy of main.js, which waits for ready()
const launch = async ({ platform, gotLock = true }) => {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  app.removeAllListeners();
  let setReady;
  world = {
    gotLock,
    ready: false,
    whenReady: new Promise((resolve) => (setReady = resolve)),
    windows: [],
    menu: new FakeMenu([new FakeMenuItem({ label: 'bitbones' }), new FakeMenuItem({ label: 'Edit' }), new FakeMenuItem({ label: 'Help', role: 'help' })]),
    dialogs: [],
    quits: 0,
  };
  await import(`${electronUrl('main.js')}?case=${++caseId}`);
  return {
    ready: async () => {
      world.ready = true;
      setReady();
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
};
const openWindows = () => FakeBrowserWindow.getAllWindows();
// macOS: closing the last window keeps the app running, clicking the dock icon creates a new window
const reopenWindowOnMac = () => {
  const [window] = openWindows();
  window.close();
  assert.equal(openWindows().length, 0);
  app.emit('activate');
  const [reopened] = openWindows();
  reopened.emit('ready-to-show');
  return reopened;
};

test('a second bitbones process quits instead of opening another window', async () => {
  const { ready } = await launch({ platform: 'linux', gotLock: false });
  await ready();
  assert.equal(world.quits, 1);
  assert.equal(world.windows.length, 0);
});

test('launching bitbones again shows the window that was closed to the tray', async () => {
  const { ready } = await launch({ platform: 'linux' });
  await ready();
  const [window] = openWindows();
  window.emit('ready-to-show');
  window.close();
  assert.equal(window.visible, false);
  assert.equal(window.destroyed, false);

  app.emit('second-instance', {}, [], '/');
  assert.equal(window.visible, true);
  assert.equal(window.focused, true);
  assert.equal(world.windows.length, 1);
});

test('the IPFS warning is shown once per failure, not again after IPFS recovers', async () => {
  const { ready } = await launch({ platform: 'darwin' });
  // the first start attempt can fail before the app is ready
  startIpfs.onError(Error('first failure'));
  await ready();
  openWindows()[0].emit('ready-to-show');
  assert.deepEqual(world.dialogs, ['first failure']);

  // the retry loop keeps failing every second
  startIpfs.onError(Error('first failure, retried'));
  assert.deepEqual(world.dialogs, ['first failure']);

  // a retry succeeds, then the user closes and reopens the window
  startIpfs.onStarted?.();
  reopenWindowOnMac();
  assert.deepEqual(world.dialogs, ['first failure']);

  // a later failure is a new problem the user should see
  startIpfs.onError(Error('second failure'));
  assert.deepEqual(world.dialogs, ['first failure', 'second failure']);
});
