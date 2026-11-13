#!/usr/bin/env node
// Remove arquivos de versões anteriores que sobram quando um zip novo é extraído por cima de uma pasta antiga.
// Uso: npm run cleanup            (remove)
//      npm run cleanup -- --dry-run   (só mostra o que seria removido)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanLegacyFiles } from './legacy-files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');
const found = cleanLegacyFiles(root, { dryRun });

if (!found.length) console.log('Nada a limpar: nenhum arquivo antigo encontrado.');
else {
    console.log(`${dryRun ? 'Seriam removidos' : 'Removidos'} (${found.length}):`);
    for (const rel of found) console.log(`  - ${rel}`);
    if (!dryRun) console.log('\nPronto. Se usa git: "git add -A" registra as remoções. Rode "npm run verify" para conferir.');
}
