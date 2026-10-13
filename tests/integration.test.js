import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installMemoryStorage } from './helpers/env.js';
import { RaceController } from '../src/controllers/RaceController.js';
import { GameState, GamePhase } from '../src/core/GameState.js';
import { GameConfig } from '../src/config/GameConfig.js';
import { StorageService } from '../src/services/StorageService.js';
import { ProfileService } from '../src/services/ProfileService.js';
import { Logger } from '../src/services/Logger.js';

const phrases = JSON.parse(fs.readFileSync(new URL('../public/data/words/phrases.json', import.meta.url), 'utf8'));

function makeFakeUI() {
    const calls = { results: [], toasts: [], overtakes: 0, errorsFlashed: 0, finishes: 0 };
    const input = { value: '', disabled: false, addEventListener() {}, removeEventListener() {}, focus() {}, blur() {} };
    const noop = () => {};
    return {
        calls, input,
        onStartRace: noop, onRestart: noop, onPause: noop, onResume: noop, onQuitRace: noop, onReturnToMenu: noop, onMuteToggle: noop, setMuted: noop,
        getContentSettings: () => ({ language: 'pt', categories: ['computing', 'science', 'people', 'code'], difficulty: 'medium', mode: 'sprint', rules: { accents: true, punctuation: true, caseSensitive: true, numbersExact: true } }),
        getTypingInput: () => input, setMenuLoading: noop, runCountdown: async (_s, onTick) => { onTick?.(3); onTick?.('GO'); },
        showRace: noop, resetRaceVisuals: noop, renderTypingQueue: noop, setRaceLocked: noop, setPauseAvailable: noop, setRevving: noop, playLaunch: noop,
        setRaceStatus: noop, updateRace: noop, updateTyping: noop, flashError() { calls.errorsFlashed++; }, pulseCombo: noop, flashPhraseComplete: noop,
        playOvertake() { calls.overtakes++; }, playFinish() { calls.finishes++; }, tickEffects: noop,
        showResults(result, isBest, progression) { calls.results.push({ result, isBest, progression }); },
        showPause: noop, showMainMenu: noop, showMenuError: noop, toast(message, kind) { calls.toasts.push({ message, kind }); }
    };
}

const stubAudio = { muted: false, initialize() {}, stopEngine() {}, startEngine() {}, updateEngine() {}, sfx() {}, toggleMute() { return false; } };

async function setup(overrides = {}) {
    const env = installMemoryStorage();
    const previousDocument = globalThis.document;
    globalThis.document = { hidden: false, body: {}, documentElement: {}, activeElement: null, addEventListener() {}, removeEventListener() {} };
    const ui = makeFakeUI();
    const state = new GameState();
    const controller = new RaceController(state, ui, { ...GameConfig, ui: { finishDelayMs: 0 } }, { audio: stubAudio, assets: { loadJSON: async () => phrases }, ...overrides });
    controller.initialize();
    return { env, ui, state, controller, restore() { env.restore(); if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument; } };
}

function driveToFinish(controller, state, maxSteps = 6000) {
    for (let i = 0; i < maxSteps && !state.is(GamePhase.FINISHED); i++) {
        if (i % 3 === 0 && state.is(GamePhase.RACING)) controller.handleTyping(controller.typingQueue.currentText);
        controller.update(0.05);
    }
}

test('corrida completa: largada → digitação → chegada → registro único → resultados', async () => {
    const t = await setup();
    try {
        await t.controller.startRace();
        assert.equal(t.state.phase, GamePhase.RACING);
        driveToFinish(t.controller, t.state);
        assert.equal(t.state.phase, GamePhase.FINISHED, 'a corrida deve terminar');
        assert.equal(t.ui.calls.results.length, 1, 'resultados exibidos uma única vez');
        const { result, progression } = t.ui.calls.results[0];
        assert.ok(result.playerWon, 'digitando sem erros o jogador deve vencer');
        assert.ok(result.phrasesCompleted > 3);
        assert.ok(progression.xpGained > 0);
        assert.equal(StorageService.getHistory().length, 1);
        assert.ok(ProfileService.load().totalXp > 0);
        assert.equal(t.ui.calls.finishes, 1);
        assert.equal(t.controller.race, null, 'referências liberadas após o fim');

        // chamadas repetidas não registram de novo
        t.controller.finishRace();
        t.controller.update(0.05);
        assert.equal(StorageService.getHistory().length, 1);
        assert.equal(t.ui.calls.results.length, 1);
    } finally { t.restore(); }
});

test('várias corridas seguidas acumulam XP e histórico sem vazar estado', async () => {
    const t = await setup();
    try {
        let lastXp = 0;
        for (let n = 1; n <= 3; n++) {
            await t.controller.startRace();
            assert.equal(t.state.phase, GamePhase.RACING, `corrida ${n} deve iniciar`);
            driveToFinish(t.controller, t.state);
            assert.equal(StorageService.getHistory().length, n);
            const xp = ProfileService.load().totalXp;
            assert.ok(xp > lastXp);
            lastXp = xp;
        }
    } finally { t.restore(); }
});

test('pausa congela corrida e digitação; retomar continua do mesmo ponto', async () => {
    const t = await setup();
    try {
        await t.controller.startRace();
        for (let i = 0; i < 20; i++) t.controller.update(0.05);
        t.controller.handleTyping(t.controller.typingQueue.currentText.slice(0, 5));
        t.controller.togglePause();
        assert.equal(t.state.phase, GamePhase.PAUSED);
        const position = t.controller.race.car.position, elapsed = t.controller.race.elapsedSeconds, typed = t.controller.typingSession.totalTypedCharacters;
        for (let i = 0; i < 40; i++) t.controller.update(0.05);
        t.controller.handleTyping(t.controller.typingQueue.currentText.slice(0, 9));
        assert.equal(t.controller.race.car.position, position);
        assert.equal(t.controller.race.elapsedSeconds, elapsed);
        assert.equal(t.controller.typingSession.totalTypedCharacters, typed, 'digitação ignorada em pausa');
        t.controller.resumeRace();
        assert.equal(t.state.phase, GamePhase.RACING);
        t.controller.update(0.05);
        assert.ok(t.controller.race.elapsedSeconds > elapsed);
    } finally { t.restore(); }
});

test('sair para o menu no meio da corrida não registra nada e permite nova corrida', async () => {
    const t = await setup();
    try {
        await t.controller.startRace();
        for (let i = 0; i < 10; i++) t.controller.update(0.05);
        t.controller.returnToMenu();
        assert.equal(t.state.phase, GamePhase.MENU);
        assert.equal(StorageService.getHistory().length, 0);
        assert.equal(ProfileService.load().totalXp, 0);
        await t.controller.startRace();
        assert.equal(t.state.phase, GamePhase.RACING);
    } finally { t.restore(); }
});

test('erro de digitação dispara feedback e combos continuam consistentes', async () => {
    const t = await setup();
    try {
        await t.controller.startRace();
        const text = t.controller.typingQueue.currentText;
        t.controller.handleTyping(text[0] === 'x' ? 'y' : 'x');
        assert.equal(t.ui.calls.errorsFlashed, 1);
        assert.equal(t.controller.typingSession.combo, 0);
    } finally { t.restore(); }
});

test('falha total ao registrar ainda mostra resultados e avisa o jogador', async () => {
    const t = await setup({ recorder: { finalize() { throw new Error('disco cheio'); } } });
    try {
        await t.controller.startRace();
        driveToFinish(t.controller, t.state);
        assert.equal(t.state.phase, GamePhase.FINISHED);
        assert.equal(t.ui.calls.results.length, 1);
        assert.ok(t.ui.calls.toasts.some(x => x.kind === 'error'));
        assert.ok(Logger.getEntries({ level: 'error', scope: 'race' }).some(e => /registrar/.test(e.message)));
    } finally { t.restore(); }
});

test('falha ao carregar frases usa conteúdo reserva e a corrida inicia mesmo assim', async () => {
    const t = await setup({ assets: { loadJSON: async () => { throw new Error('offline'); } } });
    try {
        await t.controller.startRace();
        assert.equal(t.state.phase, GamePhase.RACING);
        assert.ok(t.controller.typingQueue.currentText.length > 10);
    } finally { t.restore(); }
});

test('falha na inicialização volta ao menu com erro, sem travar o botão', async () => {
    const t = await setup();
    try {
        t.ui.runCountdown = async () => { throw new Error('boom'); };
        let errorShown = null;
        t.ui.showMenuError = m => { errorShown = m; };
        await t.controller.startRace();
        assert.equal(t.state.phase, GamePhase.MENU);
        assert.ok(errorShown);
        assert.equal(t.controller.starting, false);
        t.ui.runCountdown = async () => {};
        await t.controller.startRace();
        assert.equal(t.state.phase, GamePhase.RACING);
    } finally { t.restore(); }
});
