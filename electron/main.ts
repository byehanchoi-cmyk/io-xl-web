import electron from 'electron';
import path from 'path';
import fs from 'fs/promises';
import url from 'url';
import os from 'os';
import Database from 'better-sqlite3';

const { app, BrowserWindow, ipcMain, dialog } = electron;

// -------------------------------------------------------------------------
// [Database] - SQLite Initialization
// -------------------------------------------------------------------------
// Determine DB path (using app.getPath requires app to be initialized or at least imported)
// Note: In Electron, some app methods are available before ready.
const userDataPath = app ? app.getPath('userData') : os.tmpdir();
const dbPath = path.join(userDataPath, 'engineering_io.db');
const db = new Database(dbPath);

// Initialize Tables
db.prepare(`
    CREATE TABLE IF NOT EXISTS projects_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        ref_path TEXT,
        comp_path TEXT,
        config_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_modified DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`).run();

db.prepare(`
    CREATE TABLE IF NOT EXISTS user_memos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        row_key TEXT NOT NULL,
        col_id TEXT NOT NULL,
        text TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(row_key, col_id)
    )
`).run();

db.prepare(`
    CREATE TABLE IF NOT EXISTS analysis_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        rule_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`).run();

db.prepare(`
    CREATE TABLE IF NOT EXISTS mapping_intelligence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ref_col TEXT NOT NULL,
        comp_col TEXT NOT NULL,
        use_count INTEGER DEFAULT 1,
        last_used DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(ref_col, comp_col)
    )
`).run();

// -------------------------------------------------------------------------


// Disable hardware acceleration to prevent GPU process crashes on macOS during complex printing
app.disableHardwareAcceleration();

// [Dev] Disable security warnings for development
if (process.env.VITE_DEV_SERVER_URL) {
    process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
}

// -------------------------------------------------------------------------
// [macOS Stability] - Forcefully disable all GPU and OOP Printing features.
// This is critical to prevent "GPU process exited unexpectedly: exit_code=15"
// and "Error initiating printing via service" on specific macOS versions.
// -------------------------------------------------------------------------
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-gpu-rasterization');
app.commandLine.appendSwitch('disable-features', 'PrintCompositorLPAC,PrintJobOop,PrintManagementChildProcess');
// -------------------------------------------------------------------------

// Handle file operations via IPC
ipcMain.handle('read-file', async (_event, filePath) => {
    try {
        const buffer = await fs.readFile(filePath);
        return buffer;
    } catch (error) {
        console.error('Failed to read file:', error);
        throw error;
    }
});

ipcMain.handle('write-file', async (_event, filePath, data) => {
    try {
        // Ensure directory exists
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });

        await fs.writeFile(filePath, Buffer.from(data));
        return true;
    } catch (error) {
        console.error('Failed to write file:', error);
        throw error;
    }
});

ipcMain.handle('create-directory', async (_event, dirPath) => {
    try {
        await fs.mkdir(dirPath, { recursive: true });
        return true;
    } catch (error) {
        console.error('Failed to create directory:', error);
        throw error;
    }
});

ipcMain.handle('check-file-exists', async (_event, filePath) => {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
});

ipcMain.handle('show-save-dialog', async (_event, options) => {
    return await dialog.showSaveDialog(options);
});

// Path utilities
ipcMain.handle('path-join', (_event, ...args) => path.join(...args));
ipcMain.handle('path-dirname', (_event, p) => path.dirname(p));
ipcMain.handle('path-basename', (_event, p, ext) => path.basename(p, ext));

ipcMain.handle('print-html', async (_event, { html, mode }) => {
    const isPrintMode = mode === 'print';

    // Create window for the task
    // Create window for the task
    const printWindow = new BrowserWindow({
        show: true, // Always show for "preview" experience
        width: 1200,
        height: 800,
        title: '데이터 렌더링 중...', // Initial title
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
        }
    });

    const tempPath = path.join(os.tmpdir(), `print_job_${Date.now()}.html`);

    try {
        console.log(`[Main] Starting ${mode} job...`);

        // Write HTML to disk
        console.log(`[Main] HTML content length: ${html.length} characters`);
        await fs.writeFile(tempPath, html, 'utf8');

        // Load content
        const fileUrl = url.pathToFileURL(tempPath).toString();

        await new Promise<void>((resolve, reject) => {
            printWindow.webContents.once('did-finish-load', () => resolve());
            printWindow.webContents.once('did-fail-load', (_, errorCode, errorDescription) =>
                reject(new Error(`Load failed: ${errorDescription} (${errorCode})`))
            );
            printWindow.loadURL(fileUrl);
        });

        // Adaptive Layout Settle Check: 
        // Proceed as soon as scrollHeight stops changing (ready)
        console.log('[Main] Starting adaptive layout detection...');
        let lastHeight = 0;
        let stableCount = 0;
        const maxChecks = 24; // 12 seconds max

        for (let i = 0; i < maxChecks; i++) {
            if (printWindow.isDestroyed()) break;

            const currentHeight = await printWindow.webContents.executeJavaScript('document.body.scrollHeight');
            const isReady = await printWindow.webContents.executeJavaScript('document.readyState === "complete"');

            console.log(`[Main] Check ${i}: Height=${currentHeight}, Ready=${isReady}`);

            if (isReady && currentHeight > 0 && currentHeight === lastHeight) {
                stableCount++;
            } else {
                stableCount = 0;
            }

            // If height is stable for 3 checks (1.5s) and we have some content, proceed
            if (stableCount >= 4) { // Increased to 4 checks (2s) for better safety
                console.log(`[Main] Layout stable at ${currentHeight}px.`);
                break;
            }

            lastHeight = currentHeight;
            await new Promise(r => setTimeout(r, 500));
        }

        if (printWindow.isDestroyed()) return false;

        // [Critical] Rasterization Buffer
        // Even if DOM is stable, the renderer needs a moment to paint the pixels for PDF
        console.log('[Main] Giving renderer 2s to paint before capture...');
        await new Promise(r => setTimeout(r, 2000));

        // Reset scroll position to ensure PDF starts from top
        await printWindow.webContents.executeJavaScript('window.scrollTo(0,0)');

        if (isPrintMode) {
            printWindow.setTitle('인쇄 미리보기 - 시스템 대화상자 요청 중');
            console.log('[Main] Triggering system print dialog...');
            printWindow.focus();

            await printWindow.webContents.print({
                silent: false,
                printBackground: true,
                landscape: true
            });

            return new Promise<boolean>((resolve) => {
                printWindow.on('closed', () => {
                    console.log('[Main] Print window closed by user');
                    resolve(true);
                });
            });
        } else {
            printWindow.setTitle('PDF 생성 중 - 잠시만 기다려주세요');
            console.log('[Main] Generating PDF buffer...');

            const pdfBuffer = await printWindow.webContents.printToPDF({
                landscape: true,
                printBackground: true,
                displayHeaderFooter: true,
                headerTemplate: '<div style="font-size: 1px;"></div>',
                footerTemplate: `
                    <div style="font-size: 9px; width: 100%; text-align: center; color: #64748b; font-family: sans-serif; padding-top: 5px;">
                        <span class="pageNumber"></span> / <span class="totalPages"></span>
                    </div>
                `,
                pageSize: 'A4',
                margins: { top: 0.6, bottom: 0.6, left: 0.4, right: 0.4 }
            });

            console.log(`[Main] PDF buffer generated, size: ${pdfBuffer.length} bytes`);

            // If buffer is too small, it's likely blank
            if (pdfBuffer.length < 2000) {
                console.warn('[Main] Warning: PDF buffer is suspiciously small, content might be missing.');
            }

            printWindow.setTitle('PDF 저장 대기 중');

            // Show native save dialog
            const { filePath, canceled } = await dialog.showSaveDialog({
                title: 'PDF 저장',
                defaultPath: 'Analysis_Report.pdf',
                filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
            });

            if (canceled || !filePath) {
                console.log('[Main] PDF save canceled');
                if (!printWindow.isDestroyed()) printWindow.destroy();
                return false;
            }

            await fs.writeFile(filePath, pdfBuffer);
            if (!printWindow.isDestroyed()) printWindow.destroy();
            console.log(`[Main] PDF saved to: ${filePath}`);
            return true;
        }
    } catch (error) {
        console.error(`[Main] ${mode} failed:`, error);
        if (!printWindow.isDestroyed()) printWindow.destroy();
        throw error;
    } finally {
        // We only destroy here if it's NOT print mode and not already destroyed
        if (mode !== 'print' && !printWindow.isDestroyed()) {
            printWindow.destroy();
        }
        // Cleanup temp file
        setTimeout(async () => {
            try {
                if (await fs.stat(tempPath).catch(() => null)) {
                    await fs.unlink(tempPath);
                }
            } catch (e) { /* ignore */ }
        }, 30000);
    }
});

// -------------------------------------------------------------------------
// [Database IPC Handlers]
// -------------------------------------------------------------------------

// Project History - Added UNIQUE constraint implicitly via ref_path/comp_path check or manual logic
ipcMain.handle('db-save-project', (_event, { name, refPath, compPath, configJson }) => {
    try {
        // Check if project with same paths already exists
        const existing = db.prepare('SELECT id FROM projects_history WHERE ref_path = ? AND comp_path = ?').get(refPath, compPath);

        if (existing) {
            const stmt = db.prepare(`
                UPDATE projects_history 
                SET config_json = ?, last_modified = CURRENT_TIMESTAMP 
                WHERE id = ?
            `);
            return stmt.run(configJson, (existing as any).id);
        } else {
            const stmt = db.prepare(`
                INSERT INTO projects_history (name, ref_path, comp_path, config_json, last_modified)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `);
            return stmt.run(name, refPath, compPath, configJson);
        }
    } catch (error) {
        console.error('[DB] Save project failed:', error);
        throw error;
    }
});

ipcMain.handle('db-delete-project', (_event, id) => {
    try {
        return db.prepare('DELETE FROM projects_history WHERE id = ?').run(id);
    } catch (error) {
        console.error('[DB] Delete project failed:', error);
        throw error;
    }
});

ipcMain.handle('db-get-projects', (_event) => {
    try {
        return db.prepare('SELECT * FROM projects_history ORDER BY last_modified DESC LIMIT 5').all();
    } catch (error) {
        console.error('[DB] Get projects failed:', error);
        throw error;
    }
});

ipcMain.handle('db-clear-projects', (_event) => {
    try {
        return db.prepare('DELETE FROM projects_history').run();
    } catch (error) {
        console.error('[DB] Clear projects failed:', error);
        throw error;
    }
});

// User Memos
ipcMain.handle('db-save-memo', (_event, { rowKey, colId, text }) => {
    try {
        const stmt = db.prepare(`
            INSERT INTO user_memos (row_key, col_id, text, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(row_key, col_id) DO UPDATE SET
                text = excluded.text,
                updated_at = CURRENT_TIMESTAMP
        `);
        return stmt.run(rowKey, colId, text);
    } catch (error) {
        console.error('[DB] Save memo failed:', error);
        throw error;
    }
});

ipcMain.handle('db-get-memos', (_event) => {
    try {
        return db.prepare('SELECT * FROM user_memos').all();
    } catch (error) {
        console.error('[DB] Get memos failed:', error);
        throw error;
    }
});

// Analysis Rules
ipcMain.handle('db-save-rule', (_event, { name, type, ruleJson }) => {
    try {
        const stmt = db.prepare('INSERT INTO analysis_rules (name, type, rule_json) VALUES (?, ?, ?)');
        return stmt.run(name, type, ruleJson);
    } catch (error) {
        console.error('[DB] Save rule failed:', error);
        throw error;
    }
});

ipcMain.handle('db-get-rules', (_event, type) => {
    try {
        if (type) {
            return db.prepare('SELECT * FROM analysis_rules WHERE type = ?').all(type);
        }
        return db.prepare('SELECT * FROM analysis_rules').all();
    } catch (error) {
        console.error('[DB] Get rules failed:', error);
        throw error;
    }
});

// Mapping Intelligence
ipcMain.handle('db-save-mapping-intel', (_event, { refCol, compCol }) => {
    try {
        const stmt = db.prepare(`
            INSERT INTO mapping_intelligence (ref_col, comp_col, use_count, last_used)
            VALUES (?, ?, 1, CURRENT_TIMESTAMP)
            ON CONFLICT(ref_col, comp_col) DO UPDATE SET
                use_count = use_count + 1,
                last_used = CURRENT_TIMESTAMP
        `);
        return stmt.run(refCol, compCol);
    } catch (error) {
        console.error('[DB] Save mapping intel failed:', error);
        throw error;
    }
});

ipcMain.handle('db-get-mapping-intel', (_event) => {
    try {
        return db.prepare('SELECT * FROM mapping_intelligence ORDER BY use_count DESC').all();
    } catch (error) {
        console.error('[DB] Get mapping intel failed:', error);
        throw error;
    }
});

// -------------------------------------------------------------------------

const createWindow = () => {
    // Create the browser window.
    const mainWindow = new BrowserWindow({
        title: 'XL Compare',
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
        },
    });

    // Set Content Security Policy
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    // In development, allow eval for Vite HMR
                    process.env.VITE_DEV_SERVER_URL
                        ? "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss:; worker-src 'self' blob:;"
                        : "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:;"
                ]
            }
        });
    });

    // and load the index.html of the app.
    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    // Open the DevTools.
    // mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
