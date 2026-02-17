/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly DEV: boolean
    readonly PROD: boolean
    readonly MODE: string
    readonly VITE_DEV_SERVER_URL?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
