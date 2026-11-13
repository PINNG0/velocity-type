#!/usr/bin/env node
// Verificação de beta: sintaxe → testes → build limpo (se as dependências estiverem instaladas).
// Uso: npm run verify        (completo)
//      npm run check         (rápido: sintaxe + testes)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findLegacyFiles } from './legacy-files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quick = process.argv.includes('--quick');
const results = [];
// Extrai só os testes que falharam (saída TAP): nome + mensagem de erro, sem as centenas de linhas "ok".
function failedTests(output) {
    const lines = output.split('\n'), out = [];
    for (let i = 0; i < lines.length; i++) {
        if (!/^\s*not ok \d+/.test(lines[i])) continue;
        const block = [lines[i]];
        for (let j = i + 1; j < lines.length && lines[j].trim() !== '...' && block.length < 22; j++) block.push(lines[j]);
        out.push(block.join('\n'));
    }
    return out;
}

const run = (label, cmd, args, { optional = false } = {}) => {
    const t0 = Date.now();
    const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8' });
    const ok = r.status === 0;
    results.push({ label, ok, optional, ms: Date.now() - t0 });
    // Erros aparecem no FINAL da saída dos testes: mostra o fim, não o começo.
    if (!ok) {
        const output = (r.stdout || '') + (r.stderr || '');
        const failed = failedTests(output);
        console.error(`\n--- ${label} falhou ---\n` + (failed.length ? `Testes que falharam (${failed.length}):\n\n${failed.join('\n\n')}` : output.slice(-6000)));
    }
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

// 1b) restos de versões anteriores (zip extraído por cima de uma pasta antiga)
const legacy = findLegacyFiles(root);
results.push({ label: legacy.length ? `arquivos antigos de versões anteriores (${legacy.length}) — rode "npm run cleanup"` : 'sem arquivos antigos', ok: legacy.length === 0, ms: 0 });
if (legacy.length) console.error('Arquivos antigos encontrados (rode "npm run cleanup" para removê-los):\n' + legacy.map(f => `  - ${f}`).join('\n'));

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
