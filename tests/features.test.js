import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installMemoryStorage, makeClock, baseResult } from './helpers/env.js';
import { installFakeDom } from './helpers/fakeDom.js';
import { InputController } from '../src/controllers/InputController.js';
import { RaceController, downsample } from '../src/controllers/RaceController.js';
import { GameState, GamePhase } from '../src/core/GameState.js';
import { GameConfig } from '../src/config/GameConfig.js';
import { TypingSession } from '../src/domain/typing/TypingSession.js';
import { TypingChallenge } from '../src/domain/typing/TypingChallenge.js';
import { OpponentCar } from '../src/domain/car/OpponentCar.js';
import { CarSkins, resolveSkin, skinsUnlockedBetween } from '../src/config/Unlocks.js';
import { SettingsService } from '../src/services/SettingsService.js';
import { StorageService } from '../src/services/StorageService.js';
import { UIManager } from '../src/ui/UIManager.js';

const phrases = JSON.parse(fs.readFileSync(new URL('../public/data/words/phrases.json', import.meta.url), 'utf8'));

test('teclas mortas: valor provisório da composição é ignorado e só o final é processado', () => {
    const prev = globalThis.document;
    globalThis.document = { addEventListener() {}, removeEventListener() {}, activeElement: null, body: {} };
    try {
        const input = Object.assign(new EventTarget(), { value: '', disabled: false });
        const seen = [];
        const controller = new InputController(input, v => seen.push(v));
        controller.enable();
        const fire = (type, extra = {}) => { const e = new Event(type); Object.assign(e, extra); input.dispatchEvent(e); };
        input.value = 'pos'; fire('input');
        input.value = 'pos~'; fire('compositionstart'); fire('input', { isComposing: true });
        assert.deepEqual(seen, ['pos'], 'o "~" provisório não chega ao jogo');
        input.value = 'posã'; fire('input', { isComposing: true }); fire('compositionend');
        assert.deepEqual(seen, ['pos', 'posã']);
        fire('input'); // alguns navegadores disparam input depois do fim: valor repetido é inofensivo
        const session = new TypingSession(new TypingChallenge('posã'), { ...GameConfig.typing, clock: makeClock() });
        session.start();
        for (const v of seen) session.processInput(v);
        session.processInput('posã');
        assert.equal(session.isComplete, true);
        assert.equal(session.incorrectCharacters, 0);
        assert.equal(session.totalTypedCharacters, 4, 'valor repetido não conta tecla extra');
    } finally { if (prev === undefined) delete globalThis.document; else globalThis.document = prev; }
});

async function boot(errorMode) {
    const storage = installMemoryStorage();
    const dom = installFakeDom();
    const ui = new UIManager(); ui.initialize();
    ui.runCountdown = async () => {}; ui.typingDisplay = { reset() {}, renderQueue() {} };
    ui.getContentSettings = () => ({ language: 'pt', categories: ['computing'], difficulty: 'medium', mode: 'sprint', errorMode, carSkin: 'classic', rules: { accents: true, punctuation: true, caseSensitive: true, numbersExact: true } });
    const state = new GameState();
    const audio = { muted: false, initialize() {}, stopEngine() {}, startEngine() {}, updateEngine() {}, sfx() {}, toggleMute() {} };
    const controller = new RaceController(state, ui, { ...GameConfig, ui: { finishDelayMs: 0 } }, { audio, assets: { loadJSON: async () => phrases } });
    controller.initialize();
    await controller.startRace();
    return { controller, state, dom, restore() { dom.restore(); storage.restore(); } };
}

test('modo "corrigir na hora": tecla errada é recusada, conta como erro e o campo volta ao último valor correto', async () => {
    const t = await boot('strict');
    try {
        const c = t.controller, s = c.typingSession, text = s.challenge.text;
        const input = c.ui.getTypingInput();
        input.value = text.slice(0, 3); c.handleTyping(input.value);
        const wrongChar = text[3] === 'x' ? 'y' : 'x';
        input.value = text.slice(0, 3) + wrongChar; c.handleTyping(input.value);
        assert.equal(input.value, text.slice(0, 3), 'campo revertido');
        assert.equal(s.input, text.slice(0, 3));
        assert.equal(s.incorrectCharacters, 1);
        assert.equal(s.combo, 0);
        assert.equal(s.correctCharacters + s.incorrectCharacters, s.totalTypedCharacters);
        assert.equal(s.firstMismatchIndex, -1, 'nunca existe erro escondido');
        assert.deepEqual(s.topMisses(1), [{ key: text[3], count: 1 }]);
        // continuar certo funciona e a frase completa normalmente
        for (let i = 4; i <= text.length; i++) { input.value = text.slice(0, i); c.handleTyping(input.value); }
        assert.equal(c.phrasesCompleted, 1);
        assert.equal(input.value, '', 'campo limpo após completar');
    } finally { t.restore(); }
});

test('modo livre: tecla errada permanece no campo (comportamento antigo)', async () => {
    const t = await boot('free');
    try {
        const c = t.controller, s = c.typingSession, text = s.challenge.text;
        const input = c.ui.getTypingInput();
        const bad = text.slice(0, 2) + (text[2] === 'x' ? 'y' : 'x');
        input.value = bad; c.handleTyping(bad);
        assert.equal(input.value, bad);
        assert.equal(s.firstMismatchIndex, 2);
    } finally { t.restore(); }
});

test('corrida inteira em modo estrito grava gráfico de WPM e teclas mais erradas', async () => {
    const t = await boot('strict');
    try {
        const c = t.controller;
        const input = c.ui.getTypingInput();
        for (let i = 0; i < 6000 && !t.state.is(GamePhase.FINISHED); i++) {
            if (i % 3 === 0 && t.state.is(GamePhase.RACING)) {
                const text = c.typingQueue.currentText;
                if (i % 30 === 0) { input.value = (c.typingSession.input || '') + '\u0001'; c.handleTyping(input.value); }
                input.value = text; c.handleTyping(text);
            }
            c.update(0.05);
        }
        const saved = StorageService.getHistory()[0];
        assert.ok(saved.wpmSeries.length >= 5 && saved.wpmSeries.length <= 60, `série: ${saved.wpmSeries.length}`);
        assert.ok(saved.topMisses.length >= 1);
        const clean = StorageService.sanitizeRecord(saved);
        assert.deepEqual(clean.wpmSeries, saved.wpmSeries, 'sobrevive à validação de importação');
    } finally { t.restore(); }
});

test('downsample mantém a forma da série e limita o tamanho', () => {
    assert.deepEqual(downsample([1, 2, 3], 60), [1, 2, 3]);
    const out = downsample(Array.from({ length: 1000 }, (_, i) => i), 60);
    assert.equal(out.length, 60);
    assert.ok(out[0] < out[30] && out[30] < out[59]);
});

test('pinturas: desbloqueio por nível, save adulterado cai no clássico', () => {
    assert.equal(resolveSkin('inferno', 1), 'classic');
    assert.equal(resolveSkin('neon', 3), 'neon');
    assert.deepEqual(skinsUnlockedBetween(2, 6).map(s => s.id), ['neon', 'gold']);
    assert.equal(CarSkins[0].level, 1);
    const env = installMemoryStorage({ 'velocity-type-settings-v2': JSON.stringify({ carSkin: 'hack', errorMode: 'x' }) });
    try { const s = SettingsService.load(); assert.equal(s.carSkin, 'classic'); assert.equal(s.errorMode, 'strict'); } finally { env.restore(); }
});

test('rivais têm personalidade, médias comparáveis e rubber-band limitado a ±5%', () => {
    const mk = style => new OpponentCar({ id: 'r-1', name: 'x', color: 'red', baseSpeed: 150, skill: 0.9, lane: 0, style });
    const settle = (car, progress, gap = 0) => { car.start(); for (let i = 0; i < 400; i++) car.update(0.05, 0, progress, gap); return car.speed; };
    assert.ok(settle(mk('sprinter'), 0.05) > settle(mk('sprinter'), 0.95), 'velocista cansa');
    assert.ok(settle(mk('closer'), 0.95) > settle(mk('closer'), 0.05), 'fechador acelera no fim');
    const steady = settle(mk('steady'), 0.5);
    assert.ok(settle(mk('steady'), 0.5, 5000) < steady && settle(mk('steady'), 0.5, 5000) > steady * 0.93, 'à frente alivia, mas pouco');
    assert.ok(settle(mk('steady'), 0.5, -5000) > steady && settle(mk('steady'), 0.5, -5000) < steady * 1.07, 'atrás acelera, mas pouco');
    assert.ok(Math.abs(settle(mk('sprinter'), 0.5) - steady) / steady < 0.03, 'no meio da corrida são equivalentes');
    assert.deepEqual(GameConfig.opponents.map(o => o.style), ['steady', 'sprinter', 'closer']);
});

test('conteúdo: frases novas são únicas, sem espaços estranhos e de tamanho jogável', () => {
    for (const [lang, packs] of Object.entries(phrases.packs)) {
        for (const [cat, list] of Object.entries(packs)) {
            assert.equal(new Set(list).size, list.length, `${lang}/${cat} sem duplicatas`);
            for (const t of list) { assert.ok(t.length >= 8 && t.length <= 300, `${lang}/${cat}: tamanho ${t.length}`); assert.equal(t, t.trim()); assert.ok(!/\s{2}|[\u00a0\u200b]/.test(t)); }
        }
    }
    assert.ok(phrases.packs.pt.computing.length >= 28 && phrases.packs.en.people.length >= 28);
});

test('seletor de pinturas e análise pós-corrida aparecem na UI', async () => {
    const t = await boot('strict');
    try {
        const ui = t.controller.ui;
        ui.progressionView.renderSkins(6);
        const html = t.dom.el('skin-picker').innerHTML;
        assert.equal((html.match(/data-skin=/g) || []).length, CarSkins.length);
        assert.equal((html.match(/ disabled/g) || []).length, 2, 'phantom e inferno bloqueados no nível 6');
        ui.renderInsights(baseResult({ wpmSeries: [20, 40, 60, 55, 70], topMisses: [{ key: ' ', count: 3 }, { key: 'ç', count: 2 }] }));
        assert.equal(t.dom.el('result-insights').hidden, false);
        assert.match(t.dom.el('result-chart').innerHTML, /<polyline/);
        assert.match(t.dom.el('result-misses').textContent, /espaço \(3×\), ç \(2×\)/);
        ui.renderInsights(baseResult({ wpmSeries: [], topMisses: [] }));
        assert.equal(t.dom.el('result-insights').hidden, true);
    } finally { t.restore(); }
});
