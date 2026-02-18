import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('electron', {
    readFile: (path: string) => ipcRenderer.invoke('read-file', path),
    writeFile: (path: string, data: any) => ipcRenderer.invoke('write-file', path, data),
    createDirectory: (path: string) => ipcRenderer.invoke('create-directory', path),
    fileExists: (path: string) => ipcRenderer.invoke('check-file-exists', path),
    showSaveDialog: (options: any) => ipcRenderer.invoke('show-save-dialog', options),
    getPathForFile: (file: File) => webUtils.getPathForFile(file),
    path: {
        join: (...args: string[]) => ipcRenderer.invoke('path-join', ...args),
        dirname: (path: string) => ipcRenderer.invoke('path-dirname', path),
        basename: (path: string, ext?: string) => ipcRenderer.invoke('path-basename', path, ext),
    },
    printHTML: (html: string, mode: 'print' | 'pdf') => ipcRenderer.invoke('print-html', { html, mode }),
    db: {
        saveProject: (data: any) => ipcRenderer.invoke('db-save-project', data),
        deleteProject: (id: number) => ipcRenderer.invoke('db-delete-project', id),
        getProjects: () => ipcRenderer.invoke('db-get-projects'),
        clearProjects: () => ipcRenderer.invoke('db-clear-projects'),
        saveMemo: (data: any) => ipcRenderer.invoke('db-save-memo', data),
        getMemos: () => ipcRenderer.invoke('db-get-memos'),
        saveRule: (data: any) => ipcRenderer.invoke('db-save-rule', data),
        getRules: (type?: string) => ipcRenderer.invoke('db-get-rules', type),
        saveMappingIntel: (data: any) => ipcRenderer.invoke('db-save-mapping-intel', data),
        getMappingIntel: () => ipcRenderer.invoke('db-get-mapping-intel'),
    },
    isWindows: process.platform === 'win32'
});

window.addEventListener('DOMContentLoaded', () => {
    const replaceText = (selector: string, text: string) => {
        const element = document.getElementById(selector);
        if (element) element.innerText = text;
    };

    for (const dependency of ['chrome', 'node', 'electron']) {
        replaceText(`${dependency}-version`, process.versions[dependency] || 'unknown');
    }
});
