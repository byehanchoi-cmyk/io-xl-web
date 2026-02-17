import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        nodePolyfills({
            include: ['buffer', 'process', 'stream'],
            globals: {
                Buffer: true,
                process: true,
            },
        }),
        electron([
            {
                entry: 'electron/main.ts',
                vite: {
                    build: {
                        outDir: 'dist-electron',
                        rollupOptions: {
                            external: ['better-sqlite3', 'electron']
                        }
                    }
                }
            },
            {
                entry: 'electron/preload.ts',
                vite: {
                    build: {
                        outDir: 'dist-electron',
                    }
                }
            }
        ])
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    build: {
        outDir: 'dist',
        rollupOptions: {
            external: ['electron']
        }
    },
    server: {
        port: 5173,
        strictPort: false,
    },
    optimizeDeps: {
        exclude: ['better-sqlite3']
    }
});
