import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';
// fsModuleCache keeps transformed modules between runs; transforming is about half
// of a cold run here, and CI already caches ~/.npm and node_modules/.vite with it.
export default defineConfig({resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},test:{include:['tests/*.test.ts'],fsModuleCache:true}});
