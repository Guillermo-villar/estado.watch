import { cpSync, mkdirSync, rmSync } from 'node:fs';
const target = new URL('../.wrangler/site/', import.meta.url);
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(new URL('../public/', import.meta.url), target, { recursive: true });
cpSync(new URL('../assets/', import.meta.url), new URL('assets/',target), { recursive: true });
