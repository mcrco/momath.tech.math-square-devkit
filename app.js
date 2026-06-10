// © 2026 National Museum of Mathematics. All rights reserved.
const electron = require('electron');
const path = require('path');
const url = require('url');
const log = require('electron-log');

class App {
  constructor() {
    this.dev = false;
    this.semaphoreGuid = null;
    this.semaphoreUrl = null;

    const argv = process.argv.slice(1);

    // Parse --dev flag
    for (const arg of argv) {
      if (arg === '--dev' || arg === '-dev' || arg === '-d') {
        this.dev = true;
        break;
      }
    }

    // Parse semaphore args (single-dash takes precedence)
    this.semaphoreGuid = this._parseArg(argv, 'semaphoreguid') || process.env.SEMAPHORE_GUID || null;
    this.semaphoreUrl = this._parseArg(argv, 'semaphoreurl') || process.env.SEMAPHORE_URL || null;

    console.log('[app] dev:', this.dev);
    console.log('[app] semaphoreGuid:', this.semaphoreGuid);
    console.log('[app] semaphoreUrl:', this.semaphoreUrl);

    electron.app.commandLine.appendSwitch('ignore-gpu-blacklist');

    if (this.dev) {
      log.transports.file.level = false;
      log.transports.console.level = 'debug';
    } else {
      log.transports.file.level = 'info';
      log.transports.console.level = false;
    }

    electron.app.on('ready', () => this.create());
    electron.app.on('window-all-closed', () => electron.app.quit());
    electron.app.on('activate', () => this.create());
  }

  _parseArg(argv, name) {
    // Try single-dash first, then double-dash
    for (const prefix of ['-', '--']) {
      for (const arg of argv) {
        if (arg.startsWith(`${prefix}${name}=`)) {
          const val = arg.split('=')[1];
          if (val && val.trim()) return val.trim();
        }
      }
    }
    return null;
  }

  create() {
    if (this.window) return;
    log.info('starting');

    this.window = new electron.BrowserWindow({
      title: "Math Square",
      width: 1024,
      height: 1024,
      backgroundColor: '#000000',
      frame: true,
      resizable: true,
      movable: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        webgl: true,
        backgroundThrottling: false
      }
    });

    // Tray menu
    const menuTemplate = [
      { role: 'reload' },
      { role: 'forcereload' },
      { label: 'Restart', click: () => { electron.app.relaunch(); electron.app.quit(); } },
      { role: 'quit' }
    ];

    if (this.dev) {
      menuTemplate.unshift({
        label: 'Toggle DevTools',
        click: () => {
          if (this.window.webContents.isDevToolsOpened())
            this.window.webContents.closeDevTools();
          else
            this.window.webContents.openDevTools({ mode: 'detach' });
        }
      });
    }

    this.menu = electron.Menu.buildFromTemplate(menuTemplate);
    this.tray = new electron.Tray(path.join(__dirname, 'icon.png'));
    this.tray.setContextMenu(this.menu);

    // DevTools available via right-click menu in dev mode
    this.window.on('closed', () => { log.info('closed'); this.window = null; });
    this.window.on('unresponsive', () => this.fatal('unresponsive'));
    this.window.webContents.on('crashed', () => this.fatal('crashed'));

    // Build URL with semaphore params
    const queryParts = [];
    if (this.semaphoreGuid)
      queryParts.push(`semaphoreguid=${encodeURIComponent(this.semaphoreGuid)}`);
    if (this.semaphoreUrl)
      queryParts.push(`launcher_callback_url=${encodeURIComponent(this.semaphoreUrl)}`);

    const loadUrl = url.format({
      pathname: path.join(__dirname, this.dev ? 'dev.html' : 'index.html'),
      protocol: 'file:',
      slashes: true,
      search: queryParts.length > 0 ? queryParts.join('&') : undefined
    });

    console.log('[app] Loading:', loadUrl);
    this.window.loadURL(loadUrl);

    // Nightly restart at 5am UTC (production only)
    if (!this.dev) {
      setTimeout(() => this.fatal('nightly restart'),
        86400000 - ((Date.now() + 68400000) % 86400000));
    }
  }

  fatal(msg) {
    log.error('fatal: ' + msg);
    if (!this.dev) {
      electron.app.relaunch();
      electron.app.quit();
    }
  }
}

global.app = new App();
