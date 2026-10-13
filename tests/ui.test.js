import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installMemoryStorage } from './helpers/env.js';
import { installFakeDom } from './helpers/fakeDom.js';
import { UIManager } from '../src/ui/UIManager.js';
import { RaceController } from '../src/controllers/RaceController.js';
import { GameState, GamePhase } from '../src/core/GameState.js';
import { GameConfig } from '../src/config/GameConfig.js';
import { StorageService } from '../src/services/StorageService.js';
import { BackupService } from '../src/services/BackupService.js';
import { Logger } from '../src/services/Logger.js';

const phrases = JSON.parse(fs.readFileSync(new URL('../public/data/words/phrases.json', import.meta.url), 'utf8'));
const stubAudio = { muted: false, initialize() {}, stopEngine() {}, startEngine() {}, updateEngine() {}, sfx() {}, toggleMute() { this.muted = !this.muted; return this.muted; } };

async function boot() {
    const storage = installMemoryStorage();
    const dom = installFakeDom();
    const ui = new UIManager();
    ui.initialize();
    ui.runCountdown = async () => {};
    // TypingDisplay depende de layout/querySelector reais; é coberto por outros testes e fica fora deste DOM simulado.
    ui.typingDisplay = { reset() {}, renderQueue() {} };
    const state = new GameState();
    const controller = new RaceController(state, ui, { ...GameConfig, ui: { finishDelayMs: 0 } }, { audio: stubAudio, assets: { loadJSON: async () => phrases } });
    controller.initialize();
    return { storage, dom, ui, state, controller, restore() { dom.restore(); storage.restore(); } };
}

function drive(controller, state) {
    for (let i = 0; i < 6000 && !state.is(GamePhase.FINISHED); i++) {
        if (i % 3 === 0 && state.is(GamePhase.RACING)) controller.handleTyping(controller.typingQueue.currentText);
        controller.update(0.05);
    }
}

test('UIManager inicializa com o HTML real e mostra o perfil inicial no menu', async () => {
    const t = await boot();
    try {
        assert.equal(String(t.dom.el('profile-level').textContent), '1');
        assert.match(t.dom.el('profile-xp-label').textContent, /^0 \/ \d+ XP$/);
        assert.equal(t.ui.trackRenderer.active, true);
        assert.equal(t.dom.el('race-area').classList.contains('track-canvas-active'), true);
    } finally { t.restore(); }
});

test('corrida completa com a UI real: HUD, leaderboard, resultados, XP e menu atualizado', async () => {
    const t = await boot();
    try {
        await t.controller.startRace();
        assert.equal(t.state.phase, GamePhase.RACING);
        drive(t.controller, t.state);
        assert.equal(t.state.phase, GamePhase.FINISHED);

        assert.equal(t.dom.el('results-screen').hidden, false);
        assert.equal(t.dom.el('race-screen').hidden, true);
        assert.equal(t.dom.el('result-title').textContent, 'VITÓRIA');
        assert.match(t.dom.el('result-position').textContent, /^1\/4$/);
        assert.match(t.dom.el('result-xp-total').textContent, /^\+[\d.]+$/);
        assert.equal(t.dom.el('result-xp').hidden, false);
        assert.match(t.dom.el('result-xp-breakdown').innerHTML, /Participação/);
        assert.ok(t.dom.el('leaderboard-list').innerHTML.includes('Você'));
        assert.equal(t.dom.el('race-progress').style.width, '100%');

        t.dom.el('results-menu-button').click();
        assert.equal(t.state.phase, GamePhase.MENU);
        assert.equal(t.dom.el('main-menu').hidden, false);
        assert.notEqual(t.dom.el('profile-total-xp').textContent, '0 XP total');
    } finally { t.restore(); }
});

test('painel de objetivos mostra desafios do dia, longo prazo, conquistas e histórico de XP', async () => {
    const t = await boot();
    try {
        await t.controller.startRace();
        drive(t.controller, t.state);
        t.dom.el('results-menu-button').click();
        t.dom.el('objectives-toggle').click();
        assert.equal(t.dom.el('objectives-panel').hidden, false);
        assert.equal((t.dom.el('daily-list').innerHTML.match(/goal-row/g) || []).length, 3);
        assert.ok(t.dom.el('long-list').innerHTML.includes('goal-row'));
        assert.match(t.dom.el('achievements-count').textContent, /^\d+\/\d+$/);
        assert.ok(t.dom.el('achievements-list').innerHTML.includes('unlocked'), 'primeira corrida desbloqueia conquista');
        assert.ok(t.dom.el('xp-history-list').innerHTML.includes('xp-row'));
    } finally { t.restore(); }
});

test('histórico do menu, exportação e importação funcionam com a UI real', async () => {
    const t = await boot();
    try {
        await t.controller.startRace();
        drive(t.controller, t.state);
        t.dom.el('results-menu-button').click();
        t.ui.renderMenuRecords();
        assert.match(t.dom.el('player-summary').innerHTML, /<strong>1<\/strong><span>corridas/);

        t.dom.el('export-records-button').click();
        assert.ok(t.dom.el('toast-region').children.some(c => /Backup exportado/.test(c.textContent)));

        const backup = JSON.stringify(BackupService.export());
        StorageService.clearHistory();
        assert.equal(StorageService.getHistory().length, 0);
        await t.ui.importRecords({ size: backup.length, text: async () => backup });
        assert.equal(StorageService.getHistory().length, 1);
        assert.ok(t.dom.el('toast-region').children.some(c => /importada/.test(c.textContent)));

        await t.ui.importRecords({ size: 3, text: async () => 'xyz' });
        assert.ok(t.dom.el('toast-region').children.some(c => c.className.includes('toast-error')), 'importação inválida mostra erro sem quebrar');
    } finally { t.restore(); }
});

test('banners e feedback de jogo: ultrapassagem, combo, erro, largada e chegada', async () => {
    const t = await boot();
    try {
        t.ui.playOvertake({ type: 'overtake', to: 2 });
        assert.match(t.dom.el('race-banner').textContent, /ULTRAPASSAGEM · 2º/);
        t.ui.pulseCombo(25);
        assert.match(t.dom.el('race-banner').textContent, /COMBO 25x/);
        t.ui.flashError();
        assert.equal(t.dom.el('typing-console').classList.contains('error-flash'), true);
        t.ui.playFinish(true, 1);
        assert.equal(t.dom.el('race-area').classList.contains('finishing'), true);
        t.ui.setQuality('low');
        assert.equal(t.dom.el('race-area').classList.contains('quality-low'), true);
        t.ui.setMuted(true);
        assert.equal(t.dom.el('mute-button').textContent, 'SOM: OFF');
        assert.equal(t.dom.el('mute-button').attrs['aria-pressed'], 'true');
    } finally { t.restore(); }
});

test('UI sobrevive a localStorage indisponível (jogo e menu continuam funcionando)', async () => {
    const t = await boot();
    try {
        delete globalThis.localStorage;
        assert.doesNotThrow(() => { t.ui.persistSettings(); t.ui.loadSettings(); t.ui.renderMenuRecords(); t.ui.progressionView.renderMenu(); });
        await t.controller.startRace();
        drive(t.controller, t.state);
        assert.equal(t.state.phase, GamePhase.FINISHED);
        assert.equal(t.dom.el('results-screen').hidden, false);
    } finally { t.restore(); }
});

test('dica aparece só quando a frase chega ao fim com erro escondido e some ao corrigir', async () => {
    const t = await boot();
    try {
        await t.controller.startRace();
        t.controller.activeSettings.errorMode = 'free'; // a dica existe para o modo livre
        const session = t.controller.typingSession;
        const text = session.challenge.text;
        const wrong = text.slice(0, 3) + (text[3] === 'x' ? 'y' : 'x') + text.slice(4);
        t.controller.handleTyping(wrong.slice(0, 10));
        assert.equal(t.dom.el('typing-hint').hidden, true, 'erro no meio da frase ainda não mostra dica');
        t.controller.handleTyping(wrong);
        assert.equal(t.dom.el('typing-hint').hidden, false);
        assert.match(t.dom.el('typing-hint').innerHTML, /posição <b>4<\/b>/);
        assert.ok(Logger.getEntries({ scope: 'race' }).some(e => e.message === 'typing-invariant'), 'registrou diagnóstico');
        t.controller.handleTyping(text.slice(0, 3));
        assert.equal(t.dom.el('typing-hint').hidden, true);
    } finally { t.restore(); }
});
