import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installMemoryStorage, makeClock } from './helpers/env.js';
import { TypingSession } from '../src/domain/typing/TypingSession.js';
import { TypingChallenge } from '../src/domain/typing/TypingChallenge.js';
import { ChallengeSequence } from '../src/domain/typing/ChallengeSequence.js';
import { TypingQueue } from '../src/domain/typing/TypingQueue.js';
import { Race } from '../src/domain/race/Race.js';
import { RaceSystem } from '../src/systems/RaceSystem.js';
import { GameConfig } from '../src/config/GameConfig.js';
import { GameLoop } from '../src/core/GameLoop.js';
import { PerformanceMonitor } from '../src/core/PerformanceMonitor.js';
import { UIManager } from '../src/ui/UIManager.js';
import { AudioService } from '../src/services/AudioService.js';
import { SettingsService } from '../src/services/SettingsService.js';
import { buildRaceSetup } from '../src/controllers/RaceSetup.js';
import { ContentService } from '../src/services/ContentService.js';

const phrases = JSON.parse(fs.readFileSync(new URL('../public/data/words/phrases.json', import.meta.url), 'utf8'));
const pool = ContentService.select(phrases, 'pt', ['mixed']);

// Digita `charCount` caracteres com tempo fixo por tecla, trocando de frase como o controller faz.
function typeSequence(session, queue, charCount, clock, msPerChar, { mistakeEvery = 0 } = {}) {
    let typed = 0, completed = 0;
    while (typed < charCount) {
        const text = queue.currentText;
        for (let i = 1; i <= text.length && typed < charCount; i++) {
            if (mistakeEvery && typed > 0 && typed % mistakeEvery === 0) {
                clock.advance(msPerChar); session.processInput(text.slice(0, i - 1) + '\u0001');
                clock.advance(msPerChar); session.processInput(text.slice(0, i - 1));
            }
            clock.advance(msPerChar);
            session.processInput(text.slice(0, i));
            typed++;
        }
        if (session.isComplete) { completed++; session.advanceTo(queue.advance()); }
        else break;
    }
    return completed;
}

test('sessão longa (20 min a 60 WPM): precisão, WPM e memória estáveis', () => {
    const clock = makeClock(1000);
    const sequence = new ChallengeSequence(pool, { shuffle: true });
    const queue = new TypingQueue(sequence, 4);
    const session = new TypingSession(new TypingChallenge(queue.currentText), { ...GameConfig.typing, clock });
    session.start();
    const completed = typeSequence(session, queue, 6000 * 4, clock, 200); // 5 chars/palavra, 200 ms/char = 60 WPM
    assert.ok(completed > 100, `frases completas: ${completed}`);
    assert.equal(session.accuracy, 1);
    assert.ok(Math.abs(session.wpm - 60) < 2.5, `WPM global ≈ 60, veio ${session.wpm.toFixed(1)}`);
    assert.ok(Math.abs(session.stableWpm - 60) < 6, `WPM estável ≈ 60, veio ${session.stableWpm.toFixed(1)}`);
    assert.ok(session.keystrokes.length <= 1200, `buffer de teclas limitado (${session.keystrokes.length})`);
});

test('sessão longa com erros e backspace mantém contadores coerentes', () => {
    const clock = makeClock();
    const queue = new TypingQueue(new ChallengeSequence(pool, { shuffle: true }), 4);
    const session = new TypingSession(new TypingChallenge(queue.currentText), { ...GameConfig.typing, clock });
    session.start();
    typeSequence(session, queue, 4000, clock, 150, { mistakeEvery: 25 });
    assert.ok(session.incorrectCharacters > 100);
    assert.equal(session.correctCharacters + session.incorrectCharacters, session.totalTypedCharacters);
    assert.ok(session.accuracy > 0.9 && session.accuracy < 1);
    assert.ok(session.bestCombo >= 20 && session.bestCombo <= 26);
});

test('rajada de teclas (colar/autodigitação) não degrada o desempenho nem cresce sem limite', () => {
    const clock = makeClock();
    const full = 'a'.repeat(200);
    const session = new TypingSession(new TypingChallenge(full), { ...GameConfig.typing, clock });
    session.start();
    const t0 = performance.now();
    for (let round = 0; round < 100; round++) { // 20 mil teclas, tempo parado: tudo dentro da janela
        for (let k = 1; k <= 200; k++) session.processInput(full.slice(0, k));
        session.advanceTo(new TypingChallenge(full));
    }
    assert.equal(session.totalTypedCharacters, 20000);
    assert.ok(session.keystrokes.length <= 1200, `teclas guardadas: ${session.keystrokes.length}`);
    assert.ok(performance.now() - t0 < 1500, `20 mil teclas em ${Math.round(performance.now() - t0)} ms`);
});

test('pausar não derruba o WPM (relógio da digitação congela)', () => {
    const clock = makeClock(5000);
    const session = new TypingSession(new TypingChallenge('a'.repeat(400)), { ...GameConfig.typing, clock });
    session.start();
    for (let i = 1; i <= 100; i++) { clock.advance(200); session.processInput('a'.repeat(i)); }
    const before = session.wpm;
    session.pause();
    clock.advance(10 * 60 * 1000);
    session.processInput('a'.repeat(150)); // ignorado em pausa
    assert.equal(session.totalTypedCharacters, 100);
    session.resume();
    assert.ok(Math.abs(session.wpm - before) < 0.5, `WPM após pausa ${session.wpm.toFixed(1)} vs ${before.toFixed(1)}`);
    clock.advance(200); session.processInput('a'.repeat(101));
    assert.ok(Math.abs(session.wpm - 60) < 2);
});

test('tempo da corrida acompanha a simulação (não o relógio de parede)', () => {
    const race = new Race(GameConfig);
    race.start();
    race.car.setSpeed(100);
    for (let i = 0; i < 100; i++) race.update(0.05);
    assert.ok(Math.abs(race.elapsedSeconds - 5) < 1e-9);
    race.pause();
    race.update(1);
    assert.ok(Math.abs(race.elapsedSeconds - 5) < 1e-9, 'pausa não acumula tempo');
});

test('classificação reutiliza objetos (sem alocação por quadro) e detecta ultrapassagens', () => {
    const race = new Race({ race: { ...GameConfig.race, targetDistance: 5000 }, opponents: [{ id: 'a', name: 'A', color: 'red', baseSpeed: 100, skill: 1 }] });
    race.start();
    race.elapsed = 10; // fora da janela de tolerância da largada
    race.opponents[0].position = 50;
    assert.equal(race.getSortedCars(), race.getSortedCars());
    race.update(0.01);
    assert.equal(race.playerPosition, 2);
    race.car.position = 500;
    race.update(0.01);
    assert.equal(race.playerPosition, 1);
    const events = race.drainEvents();
    assert.deepEqual(events.map(e => e.type), ['overtaken', 'overtake']);
    const fresh = new Race(GameConfig);
    fresh.start();
    fresh.update(0.5);
    assert.equal(fresh.drainEvents().length, 0, 'sem eventos na largada');
    assert.equal(race.drainEvents().length, 0);
});

test('corrida completa por RaceSystem: jogador digitando bem vence o modo Sprint', () => {
    const clock = makeClock();
    const race = new Race(GameConfig);
    race.start();
    const session = new TypingSession(new TypingChallenge('a'.repeat(100000)), { ...GameConfig.typing, clock });
    session.start();
    const system = new RaceSystem(race, session, GameConfig);
    let typed = 0;
    for (let step = 0; step < 20000 && !race.finished; step++) {
        clock.advance(50);
        if (step % 2 === 0) { typed++; session.processInput('a'.repeat(typed)); } // ~ 240 chars/min*... rápido
        system.update(0.05);
    }
    assert.ok(race.finished && race.playerWon, 'jogador a ~100+ WPM vence');
    assert.ok(race.elapsedSeconds > 20 && race.elapsedSeconds < 120);
    assert.equal(race.car.position, race.targetDistance);
});

test('rivais ficam alcançáveis em todas as dificuldades (fator limitado)', () => {
    for (const speed of [0.1, 0.58, 0.96, 1.44, 1.8, 99]) {
        const setup = buildRaceSetup({ mode: 'endurance-10' }, GameConfig, { speed });
        assert.ok(setup.opponentSpeedFactor >= 0.88 && setup.opponentSpeedFactor <= 1.18);
        assert.equal(setup.targetDistance, 10000);
        assert.ok(setup.raceConfig.opponents.every(o => o.skill <= 1));
    }
    assert.equal(buildRaceSetup({ mode: 'inexistente' }, GameConfig, {}).targetDistance, 2400);
});

test('GameLoop: reinício não gera delta gigante e erro de quadro não derruba o loop', () => {
    const previousRaf = globalThis.requestAnimationFrame, previousCaf = globalThis.cancelAnimationFrame;
    let callback = null;
    globalThis.requestAnimationFrame = fn => { callback = fn; return 1; };
    globalThis.cancelAnimationFrame = () => { callback = null; };
    try {
        const deltas = []; let errors = 0, fail = false;
        const loop = new GameLoop(dt => { if (fail) throw new Error('x'); deltas.push(dt); });
        loop.onError = () => { errors++; };
        loop.start(); callback(1000); callback(1016);
        loop.stop(); assert.equal(callback, null);
        loop.start(); callback(900000);
        assert.ok(deltas.at(-1) <= 0.05, `delta após reinício: ${deltas.at(-1)}`);
        fail = true; callback(900016);
        assert.equal(errors, 1);
        assert.ok(callback, 'loop continua agendado após erro');
    } finally { globalThis.requestAnimationFrame = previousRaf; globalThis.cancelAnimationFrame = previousCaf; }
});

test('PerformanceMonitor reduz e restaura a qualidade visual com histerese', () => {
    const monitor = new PerformanceMonitor({ minSamples: 20 });
    const seen = [];
    monitor.onChange(q => seen.push(q));
    for (let i = 0; i < 400; i++) monitor.sample(40);
    assert.equal(monitor.quality, 'low');
    for (let i = 0; i < 400; i++) monitor.sample(12);
    assert.equal(monitor.quality, 'high');
    assert.deepEqual(seen, ['low', 'high']);
    monitor.sample(5000); monitor.sample(NaN);
    assert.ok(monitor.avgMs < 20, 'amostras absurdas (aba oculta) são ignoradas');
});

test('UI só escreve no DOM quando o valor muda (HUD e leaderboard)', () => {
    const ui = new UIManager();
    let writes = 0;
    const el = { set textContent(v) { writes++; this._t = v; }, get textContent() { return this._t; } };
    for (let i = 0; i < 50; i++) ui.setText('k', el, 42);
    assert.equal(writes, 1);
    ui.setText('k', el, 43);
    assert.equal(writes, 2);

    let htmlWrites = 0;
    const rows = [{ textContent: '' }, { textContent: '' }];
    ui.elements = { leaderboard: { set innerHTML(v) { htmlWrites++; }, querySelectorAll: () => rows } };
    const race = new Race({ race: GameConfig.race, opponents: [{ id: 'a', name: 'A', color: 'red', baseSpeed: 100, skill: 1 }] });
    race.start();
    race.opponents[0].position = 30;
    for (let i = 0; i < 100; i++) { race.car.position += 0.1; ui.updateLeaderboard(race, true); }
    assert.equal(htmlWrites, 1, 'ordem estável → HTML do ranking montado uma vez');
});

test('AudioService funciona sem WebAudio e persiste o mudo', () => {
    const env = installMemoryStorage();
    try {
        const audio = new AudioService();
        audio.initialize();
        assert.doesNotThrow(() => { audio.sfx('error'); audio.sfx('finish'); audio.startEngine(); audio.updateEngine(0.5); audio.stopEngine(); audio.beep(); });
        assert.equal(audio.toggleMute(), true);
        assert.equal(new AudioService().muted, true, 'preferência de mudo persiste');
        audio.setVolume(5);
        assert.equal(audio.volume, 1);
    } finally { env.restore(); }
});

test('SettingsService volta aos padrões quando o salvo está corrompido ou inválido', () => {
    const env = installMemoryStorage({ 'velocity-type-settings-v2': '{{{' });
    try {
        assert.equal(SettingsService.load().difficulty, 'adaptive');
        env.api.store.set('velocity-type-settings-v2', JSON.stringify({ language: 'xx', mode: 'banana', categories: ['x'], difficulty: 'zzz' }));
        const s = SettingsService.load();
        assert.equal(s.language, 'pt'); assert.equal(s.mode, 'sprint'); assert.equal(s.difficulty, 'adaptive');
    } finally { env.restore(); }
});

test('erro do mesmo tamanho (ex.: ", posição" digitado como ",pposição") é localizado e não completa a frase', () => {
    const clock = makeClock();
    const text = 'pois ruído, posição, desgaste e condições';
    const session = new TypingSession(new TypingChallenge(text), { ...GameConfig.typing, clock });
    session.start();
    const typed = 'pois ruído,pposição, desgaste e condições'; // falta o espaço e sobra um "p": mesmo comprimento
    assert.equal(typed.length, text.length);
    for (let i = 1; i <= typed.length; i++) { clock.advance(120); session.processInput(typed.slice(0, i)); }
    assert.equal(session.isComplete, false);
    assert.equal(session.firstMismatchIndex, text.indexOf(', ') + 1);
    // corrigir só o trecho errado (apagar até ali e redigitar) completa a frase
    const cut = session.firstMismatchIndex;
    clock.advance(100); session.processInput(typed.slice(0, cut));
    for (let i = cut + 1; i <= text.length; i++) { clock.advance(120); session.processInput(text.slice(0, i)); }
    assert.equal(session.isComplete, true);
    assert.equal(session.firstMismatchIndex, -1);
});
