const { app, BrowserWindow, Menu, Tray, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let tray;
let isQuitting = false;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hidden',
    frame: false,
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
    }
  });

  // Create system tray
  createTray();
};

const createTray = () => {
  // Use a NativeImage for the tray icon instead of canvas
  const { nativeImage } = require('electron');
  
  // Create an empty 16x16 transparent image
  const trayIcon = nativeImage.createEmpty();
  
  // Create a small colored square (simple but effective)
  const size = { width: 16, height: 16 };
  const emptyImage = nativeImage.createEmpty();
  emptyImage.setSize(size);
  
  // Create a simple colored square as the icon
  const imageData = Buffer.alloc(size.width * size.height * 4);
  for (let i = 0; i < size.width * size.height; i++) {
    const offset = i * 4;
    // Purple color (RGBA): R=139, G=92, B=246
    imageData[offset] = 139;     // R
    imageData[offset + 1] = 92;  // G
    imageData[offset + 2] = 246; // B
    imageData[offset + 3] = 255; // A (opacity)
  }
  
  // Set the tray icon data
  trayIcon.addRepresentation({ 
    scaleFactor: 1.0,
    width: size.width,
    height: size.height,
    buffer: imageData
  });
  
  // Create the tray with our icon
  tray = new Tray(trayIcon);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Pynk Desktop',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      }
    },
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