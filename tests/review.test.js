import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installMemoryStorage, makeClock, baseResult } from './helpers/env.js';
import { installFakeDom } from './helpers/fakeDom.js';
import { RaceModes, getRaceMode, normalizeModeId } from '../src/config/RaceModes.js';
import { SettingsService } from '../src/services/SettingsService.js';
import { AdaptiveDifficultyService } from '../src/services/AdaptiveDifficultyService.js';
import { buildRaceSetup } from '../src/controllers/RaceSetup.js';
import { GameConfig } from '../src/config/GameConfig.js';
import { Race } from '../src/domain/race/Race.js';
import { RaceSystem } from '../src/systems/RaceSystem.js';
import { TypingSession } from '../src/domain/typing/TypingSession.js';
import { TypingChallenge } from '../src/domain/typing/TypingChallenge.js';
import { RaceRecorder } from '../src/services/RaceRecorder.js';
import { StorageService } from '../src/services/StorageService.js';
import { calculateRaceReward } from '../src/domain/progression/XpCalculator.js';
import { createProgressState, recordRace, isCountedRace } from '../src/domain/progression/ProgressTracker.js';
import { KeyboardNav } from '../src/ui/KeyboardNav.js';
import { UIManager } from '../src/ui/UIManager.js';
import { RaceController } from '../src/controllers/RaceController.js';
import { GameState, GamePhase } from '../src/core/GameState.js';
import { I18n } from '../src/i18n/I18n.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const phrases = JSON.parse(fs.readFileSync(path.join(root, 'public/data/words/phrases.json'), 'utf8'));
test.afterEach(() => I18n.setLanguage('pt'));

// ---------- 2) distâncias 1/2/5 km e 4 níveis: interface E lógica ----------
test('modos de corrida: Curta 1 km, Média 2 km, Longa 5 km; ids antigos migram', () => {
    assert.deepEqual(Object.values(RaceModes).map(m => [m.id, m.distance]), [['short', 1000], ['medium', 2000], ['long', 5000]]);
    assert.equal(normalizeModeId('sprint'), 'medium');
    assert.equal(normalizeModeId('endurance-5'), 'long');
    assert.equal(normalizeModeId('endurance-10'), 'long');
    assert.equal(normalizeModeId('???'), 'short');
    assert.equal(getRaceMode('sprint').distance, 2000);
});

test('cada modo e cada nível chegam à lógica da corrida (distância-alvo e velocidade dos rivais)', () => {
    const factors = [];
    for (const level of ['easy', 'medium', 'hard', 'very-hard']) {
        const difficulty = AdaptiveDifficultyService.choose(level);
        assert.equal(difficulty.mode, level);
        factors.push(buildRaceSetup({ mode: 'short' }, GameConfig, difficulty).opponentSpeedFactor);
    }
    assert.deepEqual([...factors].sort((a, b) => a - b), factors, 'rivais mais rápidos a cada nível');
    assert.equal(new Set(factors).size, 4);
    assert.deepEqual(['easy', 'medium', 'hard', 'very-hard'].map(l => AdaptiveDifficultyService.choose(l).label), ['Fácil', 'Normal', 'Difícil', 'Expert']);

    const times = Object.values(RaceModes).map(mode => {
        const setup = buildRaceSetup({ mode: mode.id }, GameConfig, AdaptiveDifficultyService.choose('medium'));
        assert.equal(setup.targetDistance, mode.distance);
        const clock = makeClock();
        const race = new Race(setup.raceConfig); race.start();
        const session = new TypingSession(new TypingChallenge('a'.repeat(100000)), { ...GameConfig.typing, clock }); session.start();
        const system = new RaceSystem(race, session, setup.raceConfig);
        let typed = 0;
        for (let t = 0; t < 600 && !race.finished; t += 0.05) { clock.advance(50); const target = Math.floor((t + 0.05) * 8); if (target > typed) { typed = target; session.processInput('a'.repeat(typed)); } system.update(0.05); }
        assert.ok(race.finished, `${mode.id} termina`);
        assert.equal(race.targetDistance, mode.distance);
        return race.elapsedSeconds;
    });
    assert.ok(times[0] < times[1] && times[1] < times[2], `tempos crescentes: ${times.map(t => t.toFixed(1))}`);
    assert.ok(times[0] > 10 && times[0] < 60, `1 km dura ${times[0].toFixed(1)} s`);
});

test('preferências antigas migram sem perder o resto (regras, erros, idioma, piloto, pintura)', () => {
    const env = installMemoryStorage({ 'velocity-type-settings-v2': JSON.stringify({ language: 'en', mode: 'endurance-10', difficulty: 'adaptive', categories: ['code'], errorMode: 'free', carSkin: 'neon', pilotName: 'Andrei', quality: 'low', reduceMotion: true, rules: { accents: false, punctuation: false, caseSensitive: true, numbersExact: false } }) });
    try {
        const s = SettingsService.load();
        assert.equal(s.mode, 'long'); assert.equal(s.difficulty, 'adaptive', 'a automática salva continua automática'); assert.equal(s.manualDifficulty, 'medium');
        assert.deepEqual([s.language, s.categories[0], s.errorMode, s.carSkin, s.pilotName, s.quality, s.reduceMotion], ['en', 'code', 'free', 'neon', 'Andrei', 'low', true]);
        assert.deepEqual(s.rules, { accents: false, punctuation: false, caseSensitive: true, numbersExact: false });
        env.api.store.set('velocity-type-settings-v2', JSON.stringify({ difficulty: 'very-easy', mode: 'sprint' }));
        assert.equal(SettingsService.load().difficulty, 'easy'); assert.equal(SettingsService.load().mode, 'medium');
    } finally { env.restore(); }
});

test('corridas curtas (1 km) contam por caracteres: poucas frases longas não viram "baixa qualidade"', () => {
    const short = baseResult({ phrasesCompleted: 1, charsTyped: 150, distance: 1000, modeLabel: 'Curta · 1 km' });
    assert.ok(!calculateRaceReward(short).flags.includes('low-quality'));
    assert.ok(isCountedRace(short));
    const tiny = { ...short, charsTyped: 30 };
    assert.ok(calculateRaceReward(tiny).flags.includes('low-quality'));
    assert.equal(isCountedRace(tiny), false);
    assert.ok(calculateRaceReward(baseResult({ phrasesCompleted: 1 })).flags.includes('low-quality'), 'registro antigo (sem caracteres) segue a regra por frases');
    const state = createProgressState('2026-10-09');
    recordRace(state, baseResult({ phrasesCompleted: 1, charsTyped: 100, accuracy: 1 }), { dayKey: '2026-10-09' });
    assert.equal(state.stats.perfectRaces, 0, 'precisão perfeita precisa de 200+ caracteres');
    recordRace(state, baseResult({ phrasesCompleted: 2, charsTyped: 250, accuracy: 1 }), { dayKey: '2026-10-09' });
    assert.equal(state.stats.perfectRaces, 1);
    assert.ok(state.achievements['acc-100']);
});

test('o registro da corrida guarda os caracteres digitados e a importação preserva o campo', () => {
    const env = installMemoryStorage();
    try {
        const setup = buildRaceSetup({ mode: 'short' }, GameConfig, AdaptiveDifficultyService.choose('easy'));
        const clock = makeClock(); const race = new Race(setup.raceConfig); race.start();
        const session = new TypingSession(new TypingChallenge('a'.repeat(5000)), { ...GameConfig.typing, clock }); session.start();
        const system = new RaceSystem(race, session, setup.raceConfig); let typed = 0;
        for (let t = 0; t < 120 && !race.finished; t += 0.05) { clock.advance(50); typed = Math.floor((t + 0.05) * 9); session.processInput('a'.repeat(typed)); system.update(0.05); }
        const summary = RaceRecorder.finalize({ race, session, context: { phrasesCompleted: 1, settings: { difficulty: 'easy', language: 'en', categories: [], rules: {} }, difficulty: AdaptiveDifficultyService.choose('easy'), modeLabel: setup.mode.label } });
        assert.equal(summary.result.charsTyped, session.correctCharacters);
        assert.equal(StorageService.sanitizeRecord(StorageService.getHistory()[0]).charsTyped, session.correctCharacters);
        assert.ok(summary.progression.xpGained > 0 && !summary.progression.reward.flags.includes('low-quality'));
    } finally { env.restore(); }
});

// ---------- 3) o que define a corrida × o que é configuração geral ----------
test('regras de digitação e modo de erro ficam na tela da corrida; Configurações só tem opções gerais', () => {
    const race = html.indexOf('data-section="race"'), garage = html.indexOf('data-section="garage"'), settings = html.indexOf('data-section="settings"');
    const within = (needle, from, to) => { const i = html.indexOf(needle); return i > from && i < to; };
    for (const id of ['rule-accents', 'rule-punctuation', 'rule-case', 'rule-numbers']) assert.ok(within(`id="${id}"`, race, garage), `${id} na corrida`);
    assert.ok(within('data-chips="error-mode"', race, garage));
    const settingsHtml = html.slice(settings, html.indexOf('<footer class="submenu-footer">'));
    assert.doesNotMatch(settingsHtml, /rule-accents|error-mode|data-rule-preset/);
    for (const general of ['volume-slider', 'sound-toggle', 'content-language', 'pilot-name', 'reduce-motion', 'quality-mode']) assert.match(settingsHtml, new RegExp(general));
    assert.match(settingsHtml, /keys\.menu/);
});

async function boot(saved = null) {
    const storage = installMemoryStorage(saved ? { 'velocity-type-settings-v2': JSON.stringify(saved) } : {});
    const dom = installFakeDom();
    const ui = new UIManager(); ui.initialize();
    ui.runCountdown = async () => {}; ui.typingDisplay = { reset() {}, renderQueue() {} };
    const audio = { muted: false, initialize() {}, stopEngine() {}, startEngine() {}, updateEngine() {}, sfx() {}, setVolume() {}, setMuted: m => m, toggleMute() { return false; } };
    const controller = new RaceController(new GameState(), ui, { ...GameConfig, ui: { finishDelayMs: 0 } }, { audio, assets: { loadJSON: async () => phrases } });
    controller.initialize();
    return { ui, dom, controller, restore() { ui.menuView.stopResetTimer(); dom.restore(); storage.restore(); } };
}

test('preferências salvas de regras continuam valendo depois da mudança de tela', async () => {
    const t = await boot({ language: 'en', errorMode: 'free', rules: { accents: false, punctuation: true, caseSensitive: false, numbersExact: true } });
    try {
        assert.equal(t.dom.el('rule-accents').checked, false);
        assert.equal(t.dom.el('rule-case').checked, false);
        assert.equal(t.dom.el('rule-punctuation').checked, true);
        const s = t.ui.getSettings();
        assert.equal(s.errorMode, 'free');
        assert.deepEqual(s.rules, { accents: false, punctuation: true, caseSensitive: false, numbersExact: true });
        t.ui.persistSettings();
        assert.deepEqual(SettingsService.load().rules, s.rules, 'salvar de novo não perde nada');
        assert.equal(t.dom.el('preview-mistakes').textContent, 'Free (erase later)');
    } finally { t.restore(); }
});

// ---------- 4) teclado ----------
function fakeItem(name, extra = {}) {
    return { name, tagName: 'BUTTON', type: 'button', tabIndex: 0, disabled: false, hidden: false, clicks: 0, closest: sel => (sel === '[hidden]' && extra.hiddenParent ? {} : null), focus() { globalThis.document.activeElement = this; }, scrollIntoView() {}, click() { this.clicks++; }, ...extra };
}
function keyEvent(key, extra = {}) { return { key, prevented: false, defaultPrevented: false, preventDefault() { this.prevented = true; }, ...extra }; }
function navWith(items) {
    globalThis.document = { activeElement: null, addEventListener() {} };
    const container = { querySelectorAll: () => items };
    return { nav: new KeyboardNav({ getContainer: () => container }), container };
}

test('teclado: ↑ ↓ ← → movem a seleção (com volta), Home/End, itens ocultos/desabilitados são pulados', () => {
    const prev = globalThis.document;
    try {
        const a = fakeItem('a'), b = fakeItem('b'), hidden = fakeItem('h', { hiddenParent: true }), off = fakeItem('off', { disabled: true }), c = fakeItem('c');
        const { nav } = navWith([a, hidden, b, off, c]);
        const press = key => { const e = keyEvent(key); nav.onKeyDown(e); return e; };
        assert.equal(press('ArrowDown').prevented, true); assert.equal(document.activeElement, a, 'sem foco: ↓ vai ao primeiro');
        press('ArrowDown'); assert.equal(document.activeElement, b);
        press('ArrowRight'); assert.equal(document.activeElement, c);
        press('ArrowDown'); assert.equal(document.activeElement, a, 'volta ao início');
        press('ArrowUp'); assert.equal(document.activeElement, c, 'volta ao fim');
        press('ArrowLeft'); assert.equal(document.activeElement, b);
        press('Home'); assert.equal(document.activeElement, a);
        press('End'); assert.equal(document.activeElement, c);
        document.activeElement = null; press('ArrowUp'); assert.equal(document.activeElement, c, 'sem foco: ↑ vai ao último');
    } finally { globalThis.document = prev; }
});

test('teclado: Enter liga/desliga interruptores e deixa botões com o comportamento nativo', () => {
    const prev = globalThis.document;
    try {
        const sw = fakeItem('sw', { tagName: 'INPUT', type: 'checkbox' }), btn = fakeItem('btn');
        const { nav } = navWith([sw, btn]);
        sw.focus(); const e1 = keyEvent('Enter'); nav.onKeyDown(e1);
        assert.equal(sw.clicks, 1); assert.equal(e1.prevented, true);
        btn.focus(); const e2 = keyEvent('Enter'); nav.onKeyDown(e2);
        assert.equal(btn.clicks, 0, 'o clique de Enter em botão é do navegador'); assert.equal(e2.prevented, false);
    } finally { globalThis.document = prev; }
});

test('teclado: campo de texto, select e setas do controle deslizante não são interceptados; modificadores ignorados', () => {
    const prev = globalThis.document;
    try {
        const text = fakeItem('t', { tagName: 'INPUT', type: 'text' }), range = fakeItem('r', { tagName: 'INPUT', type: 'range' }), select = fakeItem('s', { tagName: 'SELECT' }), btn = fakeItem('b');
        const { nav } = navWith([text, range, select, btn]);
        for (const el of [text, select]) { el.focus(); const e = keyEvent('ArrowDown'); nav.onKeyDown(e); assert.equal(e.prevented, false); assert.equal(document.activeElement, el); }
        range.focus();
        for (const key of ['ArrowLeft', 'ArrowRight']) { const e = keyEvent(key); nav.onKeyDown(e); assert.equal(e.prevented, false, `${key} ajusta o volume`); }
        const down = keyEvent('ArrowDown'); nav.onKeyDown(down); assert.equal(down.prevented, true); assert.equal(document.activeElement, select, '↓ sai do controle deslizante');
        btn.focus(); const ctrl = keyEvent('ArrowDown', { ctrlKey: true }); nav.onKeyDown(ctrl); assert.equal(ctrl.prevented, false);
        const already = keyEvent('ArrowDown', { defaultPrevented: true }); nav.onKeyDown(already); assert.equal(already.prevented, false);
        const letter = keyEvent('a'); nav.onKeyDown(letter); assert.equal(letter.prevented, false, 'letras nunca são interceptadas');
    } finally { globalThis.document = prev; }
});

test('teclado: sem menu visível (corrida) nada é interceptado; menus, resultados e pausa têm seu contêiner', async () => {
    const t = await boot();
    try {
        const c = t.controller;
        assert.equal(t.ui.navContainer(), t.dom.el('menu-home'));
        t.dom.click('[data-submenu]', { submenu: 'race' });
        assert.equal(t.ui.navContainer(), t.dom.el('menu-subscreen'));
        await c.startRace();
        assert.equal(c.state.phase, GamePhase.RACING);
        assert.equal(t.ui.navContainer(), null, 'na corrida não há contêiner de navegação');
        for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Home', 'End']) assert.equal(t.dom.key(key).prevented, false, `${key} livre durante a corrida`);
        c.togglePause();
        assert.equal(t.ui.navContainer(), t.dom.el('pause-overlay'), 'na pausa as setas escolhem entre continuar e sair');
        c.resumeRace();
        const input = c.ui.getTypingInput();
        input.value = c.typingQueue.currentText.slice(0, 5); c.handleTyping(input.value);
        assert.equal(c.typingSession.input.length, 5, 'digitação continua normal');
        c.returnToMenu();
        t.ui.showScreen(t.ui.screens.results);
        assert.equal(t.ui.navContainer(), t.ui.screens.results);
    } finally { t.restore(); }
});

test('teclado: ao abrir um submenu o primeiro controle do conteúdo recebe a seleção', async () => {
    const t = await boot();
    try {
        const first = { id: 'chip-1', focused: false, focus() { this.focused = true; } }, back = { id: 'submenu-back', focus() { throw new Error('não deve focar o Voltar'); } };
        t.ui.keyboardNav.items = () => [back, first];
        t.dom.click('[data-submenu]', { submenu: 'race' });
        assert.equal(first.focused, true);
    } finally { t.restore(); }
});

test('CSS: seleção por teclado é bem visível nos botões do menu, chips, abas e interruptores', () => {
    const css = fs.readFileSync(path.join(root, 'src/ui/styles/main.css'), 'utf8');
    const block = css.slice(css.indexOf('seleção visível pelo teclado'));
    for (const selector of ['.menu-nav-button:focus-visible', '.chip:focus-visible', '.settings-tabs button:focus-visible', '.switch:focus-visible', '.swatch:focus-visible', '.history-table tbody tr:focus-visible']) assert.ok(block.includes(selector), selector);
    assert.match(block, /outline:\s*3px solid #fff/);
});

// ---------- 5 e 6) arquivos do pacote ----------
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => ['node_modules', 'dist', '.git'].includes(e.name) ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

test('pacote: nenhuma imagem duplicada/vazia; o fundo usado pelo CSS existe uma única vez', () => {
    const empties = walk(root).filter(f => fs.statSync(f).size === 0 && path.basename(f) !== '.gitkeep').map(f => path.relative(root, f));
    assert.deepEqual(empties, [], 'arquivos de 0 bytes — rode: npm run cleanup');
    assert.equal(fs.existsSync(path.join(root, 'public/assets/images/backgrounds/menu-scene.webp')), false);
    const used = path.join(root, 'src/assets/menu-scene.webp');
    assert.ok(fs.statSync(used).size > 50 * 1024);
    assert.match(fs.readFileSync(path.join(root, 'src/ui/styles/main.css'), 'utf8'), /\.\.\/\.\.\/assets\/menu-scene\.webp/);
    const webps = walk(root).filter(f => f.endsWith('.webp'));
    assert.equal(webps.length, 1, `webp: ${webps.map(f => path.relative(root, f))} — imagem antiga sobrando? rode: npm run cleanup`);
});

test('pacote: package-lock consistente com o package.json e sem lock solto na pasta de cima', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
    assert.equal(lock.name, pkg.name);
    assert.equal(lock.version, pkg.version, 'versão do lock = versão do package.json');
    assert.equal(lock.packages[''].version, pkg.version);
    assert.deepEqual(lock.packages[''].devDependencies ?? {}, pkg.devDependencies ?? {});
    assert.deepEqual(lock.packages[''].dependencies ?? {}, pkg.dependencies ?? {});
    assert.equal(fs.existsSync(path.join(root, '..', 'package-lock.json')), false, 'só um package-lock, dentro do projeto');
    assert.ok(fs.existsSync(path.join(root, 'docs', 'releases', `${pkg.version}.md`)), 'notas da versão atual');
    assert.match(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), new RegExp(`## ${pkg.version.replace(/\./g, '\\.')}`));
});
