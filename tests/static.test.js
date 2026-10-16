import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}
const sources = walk(path.join(root, 'src')).filter(f => f.endsWith('.js'));

test('todos os imports relativos de src/ apontam para arquivos existentes', () => {
    const missing = [];
    for (const file of sources) {
        const code = fs.readFileSync(file, 'utf8');
        for (const m of code.matchAll(/(?:import|export)[^'"`;]*?from\s+['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
            const target = path.resolve(path.dirname(file), m[1] ?? m[2]);
            if (!fs.existsSync(target)) missing.push(`${path.relative(root, file)} → ${m[1] ?? m[2]}`);
        }
    }
    assert.deepEqual(missing, []);
});

test('index.html não tem ids duplicados', () => {
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert.deepEqual(dupes, []);
});

test('todo id procurado pelo UIManager existe no HTML (obrigatórios e opcionais)', () => {
    const ui = fs.readFileSync(path.join(root, 'src/ui/UIManager.js'), 'utf8');
    const block = ui.match(/const ids = \{([\s\S]*?)\n        \};/)[1];
    const wanted = [...block.matchAll(/:\s*'([a-z0-9-]+)'/g)].map(m => m[1]);
    assert.ok(wanted.length > 80);
    // Nós legados do HUD foram removidos de propósito e são opcionais no UIManager.
    const legacyOptional = new Set(['race-time', 'race-position', 'distance-value']);
    const missing = wanted.filter(id => !legacyOptional.has(id) && !new RegExp(`id="${id}"`).test(html));
    assert.deepEqual(missing, [], `ids ausentes no HTML: ${missing.join(', ')}`);
});

test('acessibilidade básica: botões nomeados, campos rotulados, regiões ao vivo e idioma', () => {
    assert.match(html, /<html lang="(en|pt-BR)">/);
    for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
        assert.ok(m[2].trim() || /aria-label=/.test(m[1]), `botão sem nome acessível: ${m[0].slice(0, 80)}`);
    }
    assert.match(html, /id="typing-input"[\s\S]*?aria-label=/);
    assert.match(html, /id="sr-announcer"[^>]*aria-live="polite"/);
    assert.match(html, /id="toast-region"[^>]*aria-live/);
    assert.match(html, /role="progressbar"/);
    assert.match(fs.readFileSync(path.join(root, 'src/ui/styles/main.css'), 'utf8'), /prefers-reduced-motion/);
});

test('smoke: todos os módulos (exceto main.js) importam sem erro em ambiente limpo', async () => {
    const failures = [];
    for (const file of sources.filter(f => !f.endsWith('main.js'))) {
        try { await import(pathToFileURL(file).href); } catch (e) { failures.push(`${path.relative(root, file)}: ${e.message}`); }
    }
    assert.deepEqual(failures, []);
});

test('package.json e dados do jogo estão íntegros', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    for (const script of ['dev', 'build', 'preview', 'test']) assert.ok(pkg.scripts[script], `script ${script}`);
    for (const f of ['public/data/words/phrases.json', 'public/data/words/words.json', 'public/data/cars/cars.json', 'public/data/tracks/tracks.json']) {
        assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')), f);
    }
});

test('código-fonte não usa localStorage fora do StorageService (acesso a dados centralizado)', () => {
    const offenders = sources.filter(f => !f.endsWith('StorageService.js') && /localStorage\.(getItem|setItem|removeItem)/.test(fs.readFileSync(f, 'utf8')));
    assert.deepEqual(offenders.map(f => path.relative(root, f)), []);
});

test('CSS: .track permanece absolute (regressão: regra position:relative escondia os carros)', () => {
    const css = fs.readFileSync(path.join(root, 'src/ui/styles/main.css'), 'utf8');
    const rules = [...css.matchAll(/(^|\})\s*\.track\s*\{([^}]*)\}/g)].map(m => m[2]);
    assert.ok(rules.length >= 1);
    assert.ok(rules.some(r => /position:\s*absolute/.test(r)), '.track precisa ser absolute');
    assert.ok(!rules.some(r => /position:\s*(relative|static)/.test(r)), 'nenhuma regra pode rebaixar .track');
    // elementos que dependem do .track como contêiner
    assert.match(css, /\.car\s*\{[^}]*position:\s*absolute/);
    assert.match(css, /\.opponent-layer\s*\{[^}]*position:\s*absolute/);
});
