export interface IElectronAPI {
    readFile: (path: string) => Promise<ArrayBuffer>;
    writeFile: (path: string, data: ArrayBuffer | string) => Promise<void>;
    createDirectory: (path: string) => Promise<void>;
    fileExists: (path: string) => Promise<boolean>;
    showSaveDialog: (options: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue>;
    getPathForFile: (file: File) => string;
    path: {
        join: (...args: string[]) => Promise<string>;
        dirname: (path: string) => Promise<string>;
        basename: (path: string, ext?: string) => Promise<string>;
    };
    printHTML: (html: string, mode: 'print' | 'pdf') => Promise<void>;
    db: {
        saveProject: (data: { name: string; refPath?: string; compPath?: string; configJson?: string }) => Promise<any>;
        deleteProject: (id: number) => Promise<any>;
        getProjects: () => Promise<any[]>;
        clearProjects: () => Promise<any>;
        saveMemo: (data: { rowKey: string; colId: string; text: string }) => Promise<any>;
        getMemos: () => Promise<any[]>;
        saveRule: (data: { name: string; type: string; ruleJson: string }) => Promise<any>;
        getRules: (type?: string) => Promise<any[]>;
        saveMappingIntel: (data: { refCol: string; compCol: string }) => Promise<any>;
        getMappingIntel: () => Promise<any[]>;
    };
}

declare global {
    interface Window {
        electron: IElectronAPI;
    }
}
