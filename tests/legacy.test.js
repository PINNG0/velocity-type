import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findLegacyFiles, cleanLegacyFiles } from '../scripts/legacy-files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIG = `export const value = ${JSON.stringify('x'.repeat(500))};\n`;

function fixture() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-legacy-'));
    const write = (rel, text = BIG) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
    write('src/main.js', "import './core/Game.js';\n");
    write('src/core/Game.js', BIG);
    write('src/services/Tiny.js', 'export const t = 1;\n');                 // pequeno, mas importado: precisa ficar
    write('src/services/User.js', "import { t } from './Tiny.js';\nexport const u = t;\n" + BIG);
    return { dir, write };
}

test('o projeto atual não tem restos de versões anteriores', () => {
    assert.deepEqual(findLegacyFiles(root), []);
});

test('encontra restos: módulos-esqueleto soltos, EventBus antigo, dados e imagens de modelo', () => {
    const { dir, write } = fixture();
    try {
        assert.deepEqual(findLegacyFiles(dir), [], 'árvore limpa (módulo pequeno importado não é resto)');
        write('src/domain/track/Track.js', 'export class Track {}\n');
        write('src/ui/screens/MenuScreen.js', 'export class MenuScreen {}\n');
        write('src/core/EventBus.js', 'export class EventBus {}\n');
        write('public/assets/images/backgrounds/menu-scene.webp', 'x');
        write('public/data/cars/cars.json', '[]');
        write('public/data/words/words.json', '[]');
        write('public/data/words/phrases.json', '{}');
        assert.deepEqual(findLegacyFiles(dir).sort(), ['public/assets', 'public/data/cars', 'public/data/words/words.json', 'src/core/EventBus.js', 'src/domain/track/Track.js', 'src/ui/screens/MenuScreen.js'].sort());
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('limpeza remove os restos, apaga pastas vazias, mantém o que é do jogo e é repetível', () => {
    const { dir, write } = fixture();
    try {
        write('src/domain/track/Track.js', 'export class Track {}\n');
        write('public/assets/images/backgrounds/menu-scene.webp', 'x');
        write('public/data/words/phrases.json', '{}');
        assert.equal(cleanLegacyFiles(dir, { dryRun: true }).length, 2);
        assert.ok(fs.existsSync(path.join(dir, 'src/domain/track/Track.js')), 'dry-run não apaga nada');
        assert.equal(cleanLegacyFiles(dir).length, 2);
        assert.equal(fs.existsSync(path.join(dir, 'src/domain/track')), false, 'pasta vazia removida');
        assert.equal(fs.existsSync(path.join(dir, 'public/assets')), false);
        for (const keep of ['src/main.js', 'src/core/Game.js', 'src/services/Tiny.js', 'public/data/words/phrases.json']) assert.ok(fs.existsSync(path.join(dir, keep)), keep);
        assert.deepEqual(cleanLegacyFiles(dir), [], 'segunda execução não encontra nada');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
