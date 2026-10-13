#!/usr/bin/env node
// Verificação de beta: sintaxe → testes → build limpo (se as dependências estiverem instaladas).
// Uso: npm run verify        (completo)
//      npm run check         (rápido: sintaxe + testes)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quick = process.argv.includes('--quick');
const results = [];
const run = (label, cmd, args, { optional = false } = {}) => {
    const t0 = Date.now();
    const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8' });
    const ok = r.status === 0;
    results.push({ label, ok, optional, ms: Date.now() - t0 });
    if (!ok) console.error(`\n--- ${label} falhou ---\n${(r.stdout || '') + (r.stderr || '')}`.slice(0, 4000));
    return ok;
};

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}

// 1) sintaxe de todos os módulos
const files = [...walk(path.join(root, 'src')), ...walk(path.join(root, 'tests')), ...walk(path.join(root, 'scripts'))].filter(f => /\.(m?js)$/.test(f));
const bad = files.filter(f => spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' }).status !== 0);
results.push({ label: `sintaxe (${files.length} arquivos)`, ok: bad.length === 0, ms: 0 });
if (bad.length) console.error('Erros de sintaxe em:', bad.map(f => path.relative(root, f)).join(', '));

// 2) testes
run('testes (node --test)', process.execPath, ['--test']);

// 3) build limpo
if (!quick) {
    const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
    if (!fs.existsSync(vite)) {
        results.push({ label: 'build (vite) — dependências ausentes: rode "npm install" antes', ok: false, optional: true, ms: 0 });
    } else {
        fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
        if (run('build limpo (vite build)', process.execPath, [vite, 'build'])) {
            const required = ['dist/index.html', 'dist/data/words/phrases.json'];
            const missing = required.filter(f => !fs.existsSync(path.join(root, f)));
            const hasAssets = fs.existsSync(path.join(root, 'dist/assets')) && fs.readdirSync(path.join(root, 'dist/assets')).some(f => f.endsWith('.js'));
            results.push({ label: 'conteúdo do dist', ok: missing.length === 0 && hasAssets, ms: 0 });
            if (missing.length) console.error('Ausentes no dist:', missing.join(', '));
        }
    }
}

console.log('\n=== Velocity Type · verificação ===');
for (const r of results) console.log(`${r.ok ? 'OK   ' : r.optional ? 'AVISO' : 'FALHA'}  ${r.label}${r.ms ? ` (${r.ms} ms)` : ''}`);
process.exit(results.some(r => !r.ok && !r.optional) ? 1 : 0);
