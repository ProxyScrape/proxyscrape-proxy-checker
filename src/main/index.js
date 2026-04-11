import path from 'path';
import { BrowserWindow, app, ipcMain, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import { isDev, isPortable } from '../shared/AppConstants';
import { initDatabase, saveCheck, getChecksList, getCheckResults, deleteCheck, closeDatabase } from './database';
const iconPath = path.join(__dirname, '../../public/icons/icon.png');

let window;

const isMac = process.platform === 'darwin';

const windowOptions = {
    width: 1220,
    height: 905,
    show: false,
    icon: iconPath,
    ...(isMac
        ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 12, y: 10 } }
        : { frame: false }),
    webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        nodeIntegrationInWorker: true,
        sandbox: false
    }
};

const devWindow = () => {
    window = new BrowserWindow(windowOptions);

    window.webContents.once('dom-ready', () => {
        window.webContents.openDevTools();
    });
};

const prodWindow = () => {
    window = new BrowserWindow({ ...windowOptions, resizable: true });
    window.removeMenu();
};

const createWindow = () => {
    isDev ? devWindow() : prodWindow();

    if (isDev && process.env['ELECTRON_RENDERER_URL']) {
        window.loadURL(process.env['ELECTRON_RENDERER_URL']);
    } else {
        window.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    window.on('ready-to-show', () => {
        window.show();
    });

    window.on('closed', () => {
        window = null;
    });

    window.on('maximize', () => {
        window.webContents.send('on-window-maximize');
    });

    window.on('unmaximize', () => {
        window.webContents.send('on-window-unmaximize');
    });
};

ipcMain.handle('choose-path', async (event, action = 'save') => {
    try {
        const { filePaths, filePath } = await (action === 'save' ? dialog.showSaveDialog : dialog.showOpenDialog)({
            filters: [
                {
                    name: 'Text Files',
                    extensions: ['txt']
                }
            ],
            properties: ['openFile', 'multiSelections']
        });

        if (filePaths) return filePaths[0];
        if (filePath) return filePath;
    } catch (error) {
        console.error(error);
    }
});

ipcMain.handle('choose-multi', async () => {
    try {
        const { filePaths } = await dialog.showOpenDialog({
            filters: [
                {
                    name: 'Text Files',
                    extensions: ['txt']
                }
            ],
            properties: ['openFile', 'multiSelections']
        });

        if (filePaths.length) return filePaths;
    } catch (error) {
        console.error(error);
    }
});

ipcMain.on('getUserData', event => {
    event.returnValue = app.getPath('userData');
});

ipcMain.on('getDownloadsPath', event => {
    event.returnValue = app.getPath('downloads');
});

ipcMain.handle('db-save-check', (event, checkData) => {
    try {
        return saveCheck(checkData);
    } catch (error) {
        console.error('Failed to save check:', error);
        return null;
    }
});

ipcMain.handle('db-get-checks', () => {
    try {
        return getChecksList();
    } catch (error) {
        console.error('Failed to get checks:', error);
        return [];
    }
});

ipcMain.handle('db-get-check-results', (event, checkId) => {
    try {
        return getCheckResults(checkId);
    } catch (error) {
        console.error('Failed to get check results:', error);
        return null;
    }
});

ipcMain.handle('db-delete-check', (event, checkId) => {
    try {
        deleteCheck(checkId);
        return true;
    } catch (error) {
        console.error('Failed to delete check:', error);
        return false;
    }
});

app.on('ready', () => {
    initDatabase();
    createWindow();
    if (!isDev && !isPortable) autoUpdater.checkForUpdates();
});

app.on('activate', () => {
    if (window === null) {
        createWindow();
    }
});

app.on('before-quit', () => {
    if (window && !window.isDestroyed()) {
        window.webContents.send('app-before-quit');
    }
    closeDatabase();
});

app.on('window-all-closed', async () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// updater events

autoUpdater.on('update-downloaded', () => {
    autoUpdater.quitAndInstall(true, true);
});

autoUpdater.on('download-progress', (progressObj) => {
    window.webContents.send("download-progress", Math.floor(progressObj.percent));
});

// window control events

ipcMain.on('window-minimize', () => {
    window.minimize();
});

ipcMain.on('window-maximize', () => {
    window.maximize();
});

ipcMain.on('window-unmaximize', () => {
    window.unmaximize();
});

ipcMain.on('window-close', () => {
    window.close();
});
