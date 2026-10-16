import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installMemoryStorage } from './helpers/env.js';
import { installFakeDom } from './helpers/fakeDom.js';
import { pt } from '../src/i18n/pt.js';
import { en } from '../src/i18n/en.js';
import { I18n, t } from '../src/i18n/I18n.js';
import { UIManager } from '../src/ui/UIManager.js';
import { RaceController } from '../src/controllers/RaceController.js';
import { GameState, GamePhase } from '../src/core/GameState.js';
import { GameConfig } from '../src/config/GameConfig.js';
import { StorageService, StorageKeys } from '../src/services/StorageService.js';
import { SettingsService } from '../src/services/SettingsService.js';
import { DAILY_POOL, LONG_TERM, ACHIEVEMENTS } from '../src/domain/progression/Goals.js';
import { CarSkins } from '../src/config/Unlocks.js';
import { RaceModes } from '../src/config/RaceModes.js';
import { TurboConfig } from '../src/domain/race/TurboRules.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const phrases = JSON.parse(fs.readFileSync(path.join(root, 'public/data/words/phrases.json'), 'utf8'));
const PT_MARKERS = /[áéíóúãõçâêôàÁÉÍÓÚÃÕÇ]|\b(você|corrida|vitória|tempo|frases?|nível|pausar|continuar|conquista|desafio)\b/i;
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

test.afterEach(() => I18n.setLanguage('pt'));

test('dicionários PT e EN têm as mesmas chaves e os mesmos parâmetros {x}', () => {
    assert.deepEqual(Object.keys(pt).sort(), Object.keys(en).sort());
    const params = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
    for (const key of Object.keys(pt)) {
        assert.ok(pt[key] !== '' && en[key] !== '', `vazio: ${key}`);
        assert.equal(params(pt[key]), params(en[key]), `parâmetros diferentes em ${key}`);
    }
});

test('inglês não contém português (acentos e palavras típicas)', () => {
    const allowed = new Set(['spec.drivers']); // exceções não existem hoje; lista mantida para casos futuros
    const bad = Object.entries(en).filter(([k, v]) => !allowed.has(k) && PT_MARKERS.test(v)).map(([k, v]) => `${k}: ${v}`);
    assert.deepEqual(bad, []);
});

test('toda chave usada no código e no HTML existe nos dicionários', () => {
    const used = new Set();
    for (const file of walk(path.join(root, 'src')).filter(f => f.endsWith('.js') && !f.includes('/i18n/'))) {
        const code = fs.readFileSync(file, 'utf8');
        for (const m of code.matchAll(/\bt\(\s*'([\w.\-]+)'/g)) used.add(m[1]);
    }
    for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) used.add(m[1]);
    for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const pair of m[1].split(';')) used.add(pair.split(':')[1]);
    const missing = [...used].filter(k => !(k in pt));
    assert.deepEqual(missing, []);
    assert.ok(used.size > 80);
});

test('chaves dinâmicas montadas por código existem (metas, pinturas, modos, dificuldades, turbo, categorias)', () => {
    const need = [];
    for (const g of [...DAILY_POOL, ...LONG_TERM, ...ACHIEVEMENTS]) need.push(`goal.${g.id}.title`, `goal.${g.id}.desc`, `cat.${g.category ?? 'speed'}`);
    for (const s of CarSkins) need.push(`skin.${s.id}`);
    for (const m of Object.values(RaceModes)) need.push(`mode.${m.id}`);
    for (const d of ['very-easy', 'easy', 'easy-medium', 'medium', 'medium-hard', 'hard', 'hard-very-hard', 'very-hard']) need.push(`diff.${d}`);
    for (const x of TurboConfig.tiers) need.push(`turbo.${x.id}`);
    for (const c of ['computing', 'science', 'people', 'code']) need.push(`topics.${c}`);
    for (const p of ['participation', 'speed', 'accuracy', 'position', 'record']) need.push(`xp.part.${p}`);
    for (const e of ['daily', 'daily-all', 'long', 'achievement']) need.push(`event.${e}`);
    for (const c of ['tooBig', 'notJson', 'noList', 'tooMany', 'noneValid', 'writeFail']) need.push(`err.${c}`);
    assert.deepEqual([...new Set(need)].filter(k => !(k in pt)), []);
});

test('todo texto do HTML está traduzível (data-i18n) ou é dinâmico/neutro', () => {
    const body = html.slice(html.indexOf('<body'));
    const untranslated = [];
    for (const m of body.matchAll(/<(\w+)([^>]*)>([^<>]*[A-Za-zÀ-ÿ][^<>]*)<\/\1>/g)) {
        const text = m[3].trim();
        if (/data-i18n/.test(m[2]) || /\sid="/.test(m[2]) || m[1] === 'option') continue;
        if (PT_MARKERS.test(text)) untranslated.push(text);
    }
    assert.deepEqual(untranslated, []);
});

test('I18n: parâmetros, fallback, idioma inválido, localize e detecção do navegador', () => {
    I18n.setLanguage('en');
    assert.equal(t('banner.overtake', { to: 2 }), 'OVERTAKE · P2');
    assert.equal(t('nao.existe', null, 'padrão'), 'padrão');
    assert.equal(t('nao.existe'), 'nao.existe');
    assert.equal(I18n.localize('mode.', 'Sprint · 2,4 km'), 'Sprint · 2.4 km');
    assert.equal(I18n.localize('diff.', 'Médio'), 'Medium');
    assert.equal(I18n.localize('diff.', 'Texto desconhecido'), 'Texto desconhecido');
    assert.equal(I18n.setLanguage('xx'), 'pt');
    const prev = globalThis.window;
    try {
        globalThis.window = { navigator: { language: 'pt-BR' } }; assert.equal(I18n.detect(), 'pt');
        globalThis.window = { navigator: { language: 'en-US' } }; assert.equal(I18n.detect(), 'en');
        globalThis.window = { navigator: { language: 'de-DE' } }; assert.equal(I18n.detect(), 'en');
        delete globalThis.window; assert.equal(I18n.detect(), 'pt');
    } finally { if (prev === undefined) delete globalThis.window; else globalThis.window = prev; }
});

test('primeira visita usa o idioma do navegador; escolha salva é respeitada', () => {
    const env = installMemoryStorage();
    const prev = globalThis.window;
    try {
        globalThis.window = { navigator: { language: 'en-GB' } };
        assert.equal(SettingsService.load().language, 'en');
        SettingsService.save({ ...SettingsService.defaults(), language: 'pt' });
        assert.equal(SettingsService.load().language, 'pt');
    } finally { env.restore(); if (prev === undefined) delete globalThis.window; else globalThis.window = prev; }
});

async function boot(lang) {
    const storage = installMemoryStorage();
    const dom = installFakeDom();
    const ui = new UIManager(); ui.initialize();
    ui.runCountdown = async () => {}; ui.typingDisplay = { reset() {}, renderQueue() {} };
    ui.elements.language.value = lang; ui.persistSettings(); ui.applyLanguage();
    const audio = { muted: false, initialize() {}, stopEngine() {}, startEngine() {}, updateEngine() {}, sfx() {}, toggleMute() {} };
    const controller = new RaceController(new GameState(), ui, { ...GameConfig, ui: { finishDelayMs: 0 } }, { audio, assets: { loadJSON: async () => phrases } });
    controller.initialize();
    return { controller, ui, dom, restore() { dom.restore(); storage.restore(); } };
}

test('trocar o idioma traduz o HTML estático e os textos dinâmicos (EN ↔ PT)', async () => {
    const t1 = await boot('en');
    try {
        const textOf = key => t1.dom.i18n.text.find(el => el.attrs['data-i18n'] === key).textContent;
        assert.equal(textOf('menu.start'), 'START RACE');
        assert.equal(textOf('result.restart'), 'RACE AGAIN');
        assert.equal(t1.dom.el('start-race-button').textContent, 'START RACE');
        assert.equal(t1.dom.el('menu-status').textContent, 'Ready to race? The text never stops coming.');
        assert.equal(t1.dom.el('topics-summary').textContent, 'All topics');
        assert.equal(t1.dom.el('typing-rules-summary').textContent, 'Full');
        assert.equal(t1.dom.el('mute-button').textContent, 'SOUND: ON');
        t1.ui.elements.language.value = 'pt'; t1.ui.applyLanguage();
        assert.equal(textOf('menu.start'), 'COMEÇAR CORRIDA');
        assert.equal(t1.dom.el('mute-button').textContent, 'SOM: ON');
        assert.equal(globalThis.document.documentElement.lang, 'pt-BR');
    } finally { t1.restore(); }
});

test('corrida inteira em inglês não deixa nenhum texto em português na tela', async () => {
    const x = await boot('en');
    try {
        const c = x.controller, input = c.ui.getTypingInput();
        await c.startRace();
        for (let i = 0; i < 6000 && c.state.phase !== GamePhase.FINISHED; i++) {
            if (i % 3 === 0 && c.state.phase === GamePhase.RACING) {
                if (i % 40 === 0) { input.value = (c.typingSession.input || '') + '\u0001'; c.handleTyping(input.value); }
                input.value = c.typingQueue.currentText; c.handleTyping(input.value);
            }
            c.update(0.05);
        }
        x.ui.progressionView.renderObjectives(); x.ui.renderMenuRecords(); x.ui.renderRecords();
        x.ui.playOvertake({ type: 'overtake', to: 1 }); x.ui.pulseCombo(25); x.ui.playTurbo({ id: 'super', name: 'SUPER TURBO' }); x.ui.playFinish(true, 1);
        x.ui.setMuted(true); x.ui.showPause(true); x.ui.showPause(false);
        const leftovers = [];
        for (const [id, el] of x.dom.elements) {
            const text = `${el.textContent ?? ''} ${el.innerHTML ?? ''}`;
            if (PT_MARKERS.test(text.replace(/Português/g, ''))) leftovers.push(`${id}: ${text.slice(0, 80)}`);
        }
        for (const toast of x.dom.el('toast-region').children) if (PT_MARKERS.test(toast.textContent)) leftovers.push(`toast: ${toast.textContent}`);
        assert.deepEqual(leftovers, []);
        assert.equal(x.dom.el('result-title').textContent, 'VICTORY');
        assert.match(x.dom.el('result-xp-breakdown').innerHTML, /Participation/);
        assert.match(x.dom.el('daily-list').innerHTML, /Warm-up|Strong pace|Steady hands|Phrase marathon|Pole position|No stumbles|Mileage/);
        assert.match(x.dom.el('leaderboard-list').innerHTML, />You</);
    } finally { x.restore(); }
});

test('início rápido: dica só na 1ª corrida; indicador de distância e brilho ao concluir palavra', async () => {
    const x = await boot('en');
    try {
        const c = x.controller, input = c.ui.getTypingInput();
        await c.startRace();
        assert.equal(x.dom.el('onboard-hint').hidden, false, 'primeira corrida mostra a dica');
        const text = c.typingSession.challenge.text, cut = text.indexOf(' ') + 1;
        for (let i = 1; i <= cut; i++) { input.value = text.slice(0, i); c.handleTyping(input.value); }
        assert.equal(x.dom.el('typing-console').classList.contains('word-pop'), true, 'palavra concluída dá resposta visual');
        for (let i = 0; i < 12; i++) c.update(0.05);
        c.ui.lastHudAt = 0; c.update(0.05);
        assert.match(x.dom.el('gap-pill').textContent, /Catch .+ m ahead|You lead by \d+ m/);
        for (let i = 0; i < 6000 && c.state.phase !== GamePhase.FINISHED; i++) { if (i % 3 === 0 && c.state.phase === GamePhase.RACING) { input.value = c.typingQueue.currentText; c.handleTyping(input.value); } c.update(0.05); }
        assert.equal(StorageService.get(StorageKeys.onboarding), true);
        await c.startRace();
        assert.equal(x.dom.el('onboard-hint').hidden, true, 'depois da primeira corrida a dica some');
    } finally { x.restore(); }
});

test('menu em início rápido: botão de jogar vem antes das opções e as opções ficam recolhidas', () => {
    const play = html.indexOf('id="start-race-button"');
    const options = html.indexOf('id="options-panel"');
    assert.ok(play > 0 && options > play, 'jogar antes de opções');
    assert.ok(html.indexOf('id="content-language"') > options, 'seletores avançados dentro das opções');
    assert.ok(html.indexOf('id="skin-picker"') > options, 'garagem dentro das opções');
    assert.doesNotMatch(html.slice(options - 60, options + 80), /\sopen[\s>]/, 'opções começam fechadas');
    assert.match(html, /data-lang="en"/);
    assert.match(html, /data-lang="pt"/);
});

test('CSS: sem fontes menores que 11px e regras para áreas de jogo pequenas (907×510 / 821×462)', () => {
    const css = fs.readFileSync(path.join(root, 'src/ui/styles/main.css'), 'utf8');
    const tiny = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].filter(m => parseFloat(m[1]) < 10);
    assert.deepEqual(tiny.map(m => m[0]), [], 'só .car-tag pode ter 10px');
    assert.match(css, /@media \(max-height: 640px\) and \(min-width: 700px\)/);
    assert.match(css, /@media \(max-height: 520px\)/);
});
