const { app, BrowserWindow, Menu, Tray, ipcMain, shell, nativeImage, Notification } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const notificationState = require('electron-notification-state');

let mainWindow;
let tray;
let isQuitting = false;

// Get icon path based on platform
const getIconPath = () => {
  const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  return path.join(__dirname, iconName);
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hidden',
    frame: false,
    icon: getIconPath(),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    backgroundColor: '#000000',
    show: false
  });

  mainWindow.loadFile('src/index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      showNotification('Pynk is still running', 'The app is minimized to the system tray.');
    }
  });

  // Create application menu
  createAppMenu();
  
  // Create system tray
  createTray();
};

const createAppMenu = () => {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Dashboard',
          click: () => {
            mainWindow.show();
            mainWindow.webContents.send('navigate-to', 'dashboard');
          }
        },
        { type: 'separator' },
        {
          label: 'Settings',
          click: () => {
            mainWindow.show();
            mainWindow.webContents.send('navigate-to', 'settings');
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Command+Q' : 'Ctrl+Q',
          click: () => {
            isQuitting = true;
            app.quit();
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Network',
      submenu: [
        {
          label: 'Add Host',
          click: () => {
            mainWindow.show();
            mainWindow.webContents.send('show-add-host');
          }
        },
        {
          label: 'View Hosts',
          click: () => {
            mainWindow.show();
            mainWindow.webContents.send('navigate-to', 'hosts');
          }
        },
        { type: 'separator' },
        {
          label: 'Generate Report',
          click: () => {
            mainWindow.show();
            mainWindow.webContents.send('navigate-to', 'reports');
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Pynk',
          click: () => {
            showAboutDialog();
          }
        },
        {
          label: 'Visit GitHub Repo',
          click: async () => {
            await shell.openExternal('https://github.com/jakubwawak/pynk_desktop');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
};

const createTray = () => {
  // Use platform-specific icons
  const icon = getIconPath();
  
  // Create the tray with our icon
  tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Pynk Desktop',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      }
    },
    { type: 'separator' },
    {
      label: 'Dashboard',
      click: () => {
        mainWindow.show();
        mainWindow.webContents.send('navigate-to', 'dashboard');
      }
    },
    {
      label: 'Hosts',
      click: () => {
        mainWindow.show();
        mainWindow.webContents.send('navigate-to', 'hosts');
      }
    },
    {
      label: 'Add New Host',
      click: () => {
        mainWindow.show();
        mainWindow.webContents.send('show-add-host');
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Pynk Desktop - Network Monitor');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
};

// Show notification
const showNotification = (title, body) => {
  // Only show notification if app is in background or not focused
  const shouldNotify = !mainWindow.isFocused() || notificationState.getDoNotDisturb();
  
  if (Notification.isSupported() && shouldNotify) {
    const notification = new Notification({
      title: title,
      body: body,
      icon: getIconPath(),
      silent: false
    });
    
    notification.show();
    
    notification.on('click', () => {
      // Focus the app when the notification is clicked
      if (mainWindow) {
        if (!mainWindow.isVisible()) {
          mainWindow.show();
        }
        mainWindow.focus();
      }
    });
  }
};

// Show about dialog
const showAboutDialog = () => {
  const aboutWindow = new BrowserWindow({
    width: 400,
    height: 300,
    resizable: false,
    minimizable: false,
    maximizable: false,
    parent: mainWindow,
    modal: true,
    icon: getIconPath(),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // We could load an HTML file, but for simplicity using webContents.loadURL with data URL
  aboutWindow.setMenu(null);
  aboutWindow.loadURL(`data:text/html;charset=utf-8,
    <html>
      <head>
        <style>
          body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            padding: 20px;
            color: #333;
            background-color: #f5f5f5;
            text-align: center;
          }
          h1 {
            color: #8250df;
          }
          .version {
            color: #666;
            margin-bottom: 20px;
          }
          .copyright {
            margin-top: 20px;
            font-size: 12px;
            color: #999;
          }
        </style>
      </head>
      <body>
        <h1>Pynk Desktop</h1>
        <div class="version">Version ${app.getVersion()}</div>
        <p>A powerful network monitoring and ping analysis desktop application.</p>
        <p>Created by Jakub Wawak</p>
        <div class="copyright">© ${new Date().getFullYear()} Pynk Desktop</div>
      </body>
    </html>
  `);
};

// IPC handlers for system features
ipcMain.handle('show-notification', (event, title, body) => {
  showNotification(title, body);
  return true;
});

// Listen for network status changes
ipcMain.on('network-status-change', (event, host, status) => {
  const statusText = status ? 'Online' : 'Offline';
  const title = `Host ${host.alias || host.name} is ${statusText}`;
  const body = `Status changed at ${new Date().toLocaleTimeString()}`;
  showNotification(title, body);
});

// Window control handlers
ipcMain.handle('minimize-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
  return true;
});

ipcMain.handle('toggle-maximize-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
  return true;
});

ipcMain.handle('close-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
  return true;
});

// IPC handlers for network operations
ipcMain.handle('ping-host', async (event, host, count = 4) => {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const pingCmd = isWindows ? 'ping' : 'ping';
    const args = isWindows ? ['-n', count.toString(), host] : ['-c', count.toString(), host];
    
    const ping = spawn(pingCmd, args);
    let output = '';
    let error = '';

    ping.stdout.on('data', (data) => {
      output += data.toString();
    });

    ping.stderr.on('data', (data) => {
      error += data.toString();
    });

    ping.on('close', (code) => {
      resolve(parsePingOutput(output, error, code, host));
    });
  });
});

ipcMain.handle('traceroute-host', async (event, host) => {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';
    
    // Choose appropriate command and arguments for the platform
    let cmd, args;
    
    if (isWindows) {
      cmd = 'tracert';
      args = ['-d', '-h', '30', host]; // -d to avoid DNS lookup, -h max hops
    } else if (isMac) {
      cmd = 'traceroute';
      args = ['-m', '30', host]; // -m max hops
    } else {
      // Linux and others
      cmd = 'traceroute';
      args = ['-m', '30', '-n', host]; // -m max hops, -n skip DNS resolution
    }
    
    console.log(`Running traceroute command: ${cmd} ${args.join(' ')}`);
    
    const trace = spawn(cmd, args);
    let output = '';
    let error = '';
    let stdoutComplete = false;
    let stderrComplete = false;
    let timeout = null;

    // Set a timeout to ensure we don't wait too long
    timeout = setTimeout(() => {
      if (trace.connected) {
        trace.kill();
      }
      resolve({
        success: false,
        output: output,
        error: 'Traceroute timed out after 30 seconds',
        timestamp: new Date().toISOString()
      });
    }, 30000);

    trace.stdout.on('data', (data) => {
      output += data.toString();
    });

    trace.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    trace.stdout.on('end', () => {
      stdoutComplete = true;
      if (stderrComplete && timeout) {
        clearTimeout(timeout);
        timeout = null;
        resolve({
          success: true,
          output: output,
          error: error,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    trace.stderr.on('end', () => {
      stderrComplete = true;
      if (stdoutComplete && timeout) {
        clearTimeout(timeout);
        timeout = null;
        resolve({
          success: true,
          output: output,
          error: error,
          timestamp: new Date().toISOString()
        });
      }
    });

    trace.on('error', (err) => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      resolve({
        success: false,
        output: '',
        error: err.message || 'Failed to start traceroute',
        timestamp: new Date().toISOString()
      });
    });

    trace.on('close', (code) => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      if (!stdoutComplete || !stderrComplete) {
        resolve({
          success: code === 0,
          output: output,
          error: error,
          timestamp: new Date().toISOString()
        });
      }
    });
  });
});

const parsePingOutput = (output, error, code, host) => {
  const lines = output.split('\n');
  const result = {
    host: host,
    timestamp: new Date().toISOString(),
    success: code === 0 && !error,
    times: [],
    packetsTransmitted: 0,
    packetsReceived: 0,
    packetLoss: 0,
    avgTime: 0,
    minTime: 0,
    maxTime: 0,
    error: error || null
  };

  if (!result.success) {
    return result;
  }

  // Parse ping times
  lines.forEach(line => {
    const timeMatch = line.match(/time[<=](\d+\.?\d*)/i);
    if (timeMatch) {
      result.times.push(parseFloat(timeMatch[1]));
    }
  });

  // Calculate statistics
  if (result.times.length > 0) {
    result.packetsTransmitted = 4; // Default ping count
    result.packetsReceived = result.times.length;
    result.packetLoss = ((result.packetsTransmitted - result.packetsReceived) / result.packetsTransmitted) * 100;
    result.avgTime = result.times.reduce((a, b) => a + b, 0) / result.times.length;
    result.minTime = Math.min(...result.times);
    result.maxTime = Math.max(...result.times);
  }

  return result;
};

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});