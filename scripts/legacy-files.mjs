// Restos de versões anteriores: um zip novo extraído por cima de uma pasta antiga NÃO apaga arquivos que foram
// removidos do projeto. Este módulo encontra e remove esses restos (usado por `npm run cleanup` e `npm run verify`).
import fs from 'node:fs';
import path from 'node:path';

// Caminhos removidos do projeto desde o modelo inicial.
const REMOVED_PATHS = [
    'public/assets',                        // imagens/áudio de modelo (o fundo real está em src/assets)
    'public/data/cars',
    'public/data/tracks',
    'public/data/words/words.json',
    'src/core/EventBus.js'                  // barramento de eventos que ninguém ouvia
];
const STUB_MAX_BYTES = 400;                  // módulos-esqueleto do modelo inicial têm poucas linhas

function walk(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}
const posix = (root, file) => path.relative(root, file).split(path.sep).join('/');

export function findLegacyFiles(root) {
    const found = REMOVED_PATHS.filter(rel => fs.existsSync(path.join(root, rel)));
    const files = walk(path.join(root, 'src')).filter(f => f.endsWith('.js'));
    const all = files.map(f => fs.readFileSync(f, 'utf8')).join('\n');
    for (const file of files) {
        const base = path.basename(file, '.js');
        if (base === 'main') continue;
        const imported = new RegExp(`from\\s+['"][^'"]*/${base}(\\.js)?['"]`).test(all);
        const rel = posix(root, file);
        if (!imported && fs.statSync(file).size < STUB_MAX_BYTES && !found.includes(rel)) found.push(rel);
    }
    return found;
}

// Remove os restos e as pastas que ficarem vazias dentro de src/. Com { dryRun: true } só lista.
export function cleanLegacyFiles(root, { dryRun = false } = {}) {
    const found = findLegacyFiles(root);
    if (dryRun) return found;
    for (const rel of found) fs.rmSync(path.join(root, rel), { recursive: true, force: true });
    const prune = dir => {
        if (!fs.existsSync(dir)) return;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) if (entry.isDirectory()) prune(path.join(dir, entry.name));
        if (fs.readdirSync(dir).length === 0 && path.basename(dir) !== 'src') fs.rmdirSync(dir);
    };
    prune(path.join(root, 'src'));
    prune(path.join(root, 'public'));
    return found;
}
