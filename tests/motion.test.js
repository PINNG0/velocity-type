import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installMemoryStorage, makeClock } from './helpers/env.js';
import { installFakeDom, makeElement } from './helpers/fakeDom.js';
import { Camera, worldPercent, screenPercent } from '../src/rendering/Camera.js';
import { TurboConfig, tierForCombo } from '../src/domain/race/TurboRules.js';
import { Race } from '../src/domain/race/Race.js';
import { RaceSystem } from '../src/systems/RaceSystem.js';
import { Car } from '../src/domain/car/Car.js';
import { TypingSession } from '../src/domain/typing/TypingSession.js';
import { TypingChallenge } from '../src/domain/typing/TypingChallenge.js';
import { GameConfig } from '../src/config/GameConfig.js';
import { Countdown } from '../src/ui/components/Countdown.js';
import { SceneRenderer } from '../src/rendering/SceneRenderer.js';
import { TrackRenderer } from '../src/rendering/TrackRenderer.js';
import { OpponentRenderer } from '../src/rendering/OpponentRenderer.js';
import { UIManager } from '../src/ui/UIManager.js';
import { RaceController } from '../src/controllers/RaceController.js';
import { GameState } from '../src/core/GameState.js';

const phrases = JSON.parse(fs.readFileSync(new URL('../public/data/words/phrases.json', import.meta.url), 'utf8'));

function recordingCanvas(width = 1000, height = 400) {
    const calls = [];
    const ctx = {
        calls, fillStyle: '', strokeStyle: '', lineWidth: 1, shadowBlur: 0, shadowColor: '', lineDashOffset: 0,
        fillRect(x, y, w, h) { calls.push({ type: 'fillRect', x, y, w, h, fill: this.fillStyle }); },
        createLinearGradient: () => ({ addColorStop() {} })
    };
    for (const m of ['clearRect', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke', 'setLineDash', 'setTransform']) ctx[m] = () => {};
    return { canvas: { getContext: () => ctx, getBoundingClientRect: () => ({ width, height }), width: 0, height: 0 }, ctx, calls };
}

test('câmera: jogador fixo, rivais relativos, linhas de largada/chegada entram e saem da tela', () => {
    assert.equal(worldPercent(500, 500), Camera.playerX);
    assert.ok(Math.abs(worldPercent(600, 500) - (Camera.playerX + 100 * Camera.scale)) < 1e-9);
    assert.equal(screenPercent(1e6, 0), Camera.max);
    assert.equal(screenPercent(-1e6, 0), Camera.min);
    assert.ok(worldPercent(0, 0) > 0 && worldPercent(0, 0) < 100, 'largada visível no início');
    assert.ok(worldPercent(0, 1500) < 0, 'largada sai pela esquerda');
    assert.ok(worldPercent(2400, 0) > 100, 'chegada ainda fora da tela no início');
    assert.ok(worldPercent(2400, 2300) < 100, 'chegada aparece perto do fim');
});

test('regras de turbo: 25/50/100 e repetição do super a cada +100', () => {
    assert.equal(tierForCombo(25).id, 'mini');
    assert.equal(tierForCombo(50).id, 'turbo');
    assert.equal(tierForCombo(100).id, 'super');
    assert.equal(tierForCombo(200).id, 'super');
    assert.equal(tierForCombo(300).id, 'super');
    for (const c of [0, 1, 24, 26, 49, 75, 99, 150, 250]) assert.equal(tierForCombo(c), null, `combo ${c}`);
    assert.ok(TurboConfig.tiers.every(t => t.multiplier > 1 && t.multiplier <= 1.2), 'turbo pequeno (≤ +20%)');
});

test('Race: turbo acelera por um tempo e expira; tropeço reduz brevemente; eventos são emitidos', () => {
    const race = new Race(GameConfig);
    race.start();
    assert.equal(race.speedMultiplier, 1);
    race.activateTurbo(TurboConfig.tiers[0]);
    assert.equal(race.speedMultiplier, TurboConfig.tiers[0].multiplier);
    assert.deepEqual(race.drainEvents().map(e => e.type), ['turbo']);
    race.update(1.9); assert.ok(race.speedMultiplier > 1);
    race.update(0.2); assert.equal(race.speedMultiplier, 1, 'expirou');
    race.stumble();
    assert.equal(race.speedMultiplier, TurboConfig.stumble.multiplier);
    race.update(0.6); assert.equal(race.speedMultiplier, 1);
    race.activateTurbo(TurboConfig.tiers[2]); race.activateTurbo(TurboConfig.tiers[0]);
    assert.equal(race.speedMultiplier, TurboConfig.tiers[2].multiplier, 'turbo mais forte não é rebaixado');
    race.finished = true; race.turboRemaining = 0; race.activateTurbo(TurboConfig.tiers[0]);
    assert.equal(race.turboRemaining, 0, 'sem turbo depois da chegada');
});

test('RaceSystem: turbo aumenta a velocidade alvo e o carro aceita folga de 20% acima do máximo', () => {
    const run = turbo => {
        const clock = makeClock();
        const race = new Race(GameConfig); race.start();
        const session = new TypingSession(new TypingChallenge('a'.repeat(5000)), { ...GameConfig.typing, clock }); session.start();
        const system = new RaceSystem(race, session, GameConfig);
        if (turbo) race.activateTurbo(TurboConfig.tiers[2]);
        for (let i = 1; i <= 60; i++) { clock.advance(60); session.processInput('a'.repeat(i * 2)); system.update(0.05); }
        return race.car.speed;
    };
    assert.ok(run(true) > run(false) * 1.05);
    const car = new Car({ maxSpeed: 320 }); car.setSpeed(9999);
    assert.equal(car.speed, 384);
});

test('Countdown: uma luz por segundo, verde no fim, ticks 3-2-1-GO e some ao terminar', async () => {
    const el = makeElement('countdown');
    const cd = new Countdown(el);
    cd.wait = async () => {};
    const lit = [], ticks = [];
    const render = cd.render.bind(cd);
    cd.render = (...a) => { render(...a); lit.push({ on: (el.innerHTML.match(/class="on"/g) || []).length, go: (el.innerHTML.match(/class="go"/g) || []).length, label: a[2] }); };
    cd.onTick = v => ticks.push(v);
    await cd.run(3);
    assert.deepEqual(ticks, [3, 2, 1, 'GO']);
    assert.deepEqual(lit.map(l => l.on), [1, 2, 3, 0]);
    assert.equal(lit.at(-1).go, 3);
    assert.equal(lit.at(-1).label, 'DIGITE!');
    assert.equal(el.hidden, true);
});

test('cenário em paralaxe só rola com o carro em movimento, e camadas diferentes rolam em velocidades diferentes', () => {
    const { canvas } = recordingCanvas();
    const scene = new SceneRenderer(canvas); scene.resize();
    scene.render(0.1, 0);
    assert.equal(scene.offset.fence, 0, 'parado = cenário parado');
    scene.render(0.1, 180);
    const o = scene.offset;
    assert.ok(o.fence > o.near && o.near > o.mid && o.mid > o.far && o.far > 0, JSON.stringify(o));
    const before = o.fence; scene.render(0.1, 180, true);
    assert.ok(scene.offset.fence - before > (before) * 1.1, 'turbo rola mais rápido');
    scene.setQuality('low'); assert.doesNotThrow(() => scene.render(0.1, 180));
});

test('pista desenha a linha quadriculada da largada/chegada só quando ela está na tela', () => {
    const { canvas, calls } = recordingCanvas();
    const track = new TrackRenderer(canvas); track.resize();
    const checks = () => calls.filter(c => c.fill === '#f3f5f7').length;
    calls.length = 0; track.render(0.016, 100, { playerPos: 0, target: 2400 });
    assert.ok(checks() > 5, 'largada visível no início');
    calls.length = 0; track.render(0.016, 100, { playerPos: 1000, target: 3000 });
    assert.equal(checks(), 0, 'nenhuma das duas na tela entre largada e chegada');
    calls.length = 0; track.render(0.016, 100, { playerPos: 2300, target: 2400 });
    assert.ok(checks() > 5, 'chegada visível perto do fim');
    const off = track.offset; track.render(0.1, 0, null); assert.equal(track.offset, off, 'parado não rola');
});

test('rivais são posicionados pela câmera (relativos ao jogador) e mostram o nome', () => {
    const dom = installFakeDom();
    try {
        const layer = makeElement('layer');
        const r = new OpponentRenderer(layer);
        r.render({ id: 'a', name: 'Nova', color: 'red', lane: 0, position: 600 }, 2400, 500);
        const el = layer.children[0];
        assert.equal(el.style.left, `${Math.round((Camera.playerX + 100 * Camera.scale) * 20) / 20}%`);
        assert.match(el.innerHTML, /car-tag">Nova</);
        r.render({ id: 'a', name: 'Nova', color: 'red', lane: 0, position: 5e6 }, 2400, 500);
        assert.equal(el.style.left, `${Camera.max}%`);
    } finally { dom.restore(); }
});

async function boot() {
    const storage = installMemoryStorage();
    const dom = installFakeDom();
    const ui = new UIManager(); ui.initialize();
    ui.runCountdown = async () => {}; ui.typingDisplay = { reset() {}, renderQueue() {} };
    const sfx = [];
    const audio = { muted: false, initialize() {}, stopEngine() {}, startEngine() {}, updateEngine() {}, sfx: (n, a) => sfx.push(n), toggleMute() {} };
    const controller = new RaceController(new GameState(), ui, { ...GameConfig, ui: { finishDelayMs: 0 } }, { audio, assets: { loadJSON: async () => phrases } });
    controller.initialize();
    await controller.startRace();
    return { controller, ui, dom, sfx, restore() { dom.restore(); storage.restore(); } };
}

test('combo 25 dá MINI TURBO (banner, chama, efeito, som); erro causa tropeço, tremida e vinheta vermelha', async () => {
    const t = await boot();
    try {
        const c = t.controller, text = c.typingSession.challenge.text, input = c.ui.getTypingInput();
        for (let i = 1; i <= 25; i++) { input.value = text.slice(0, i); c.handleTyping(input.value); }
        assert.equal(c.typingSession.combo, 25);
        assert.ok(c.race.turboRemaining > 1.9 && c.race.speedMultiplier > 1);
        c.update(0.016);
        assert.equal(t.dom.el('race-area').classList.contains('turbo'), true);
        assert.equal(t.dom.el('player-car').classList.contains('turbo'), true);
        assert.match(t.dom.el('race-banner').textContent, /MINI TURBO/);
        assert.ok(t.sfx.includes('turbo'));

        const wrong = text[25] === 'x' ? 'y' : 'x';
        input.value = text.slice(0, 25) + wrong; c.handleTyping(input.value);
        assert.ok(c.race.speedMultiplier < 1.08, 'tropeço desconta o turbo');
        assert.equal(t.dom.el('race-area').classList.contains('hit'), true, 'vinheta/tranco da tela');
        assert.equal(t.dom.el('typing-console').classList.contains('error-flash'), true);
        assert.equal(c.typingSession.combo, 0);
        for (let i = 0; i < 80; i++) c.update(0.05);
        assert.equal(t.dom.el('race-area').classList.contains('turbo'), false, 'turbo termina');
    } finally { t.restore(); }
});

test('depois da chegada o mundo continua rolando e desacelera (sem "congelar")', async () => {
    const t = await boot();
    try {
        const world = { car: { position: 2400, speed: 250 }, opponents: [{ id: 'a', name: 'A', color: 'red', lane: 0, position: 2350, speed: 150 }], targetDistance: 2400 };
        t.ui.world = world;
        for (let i = 0; i < 10; i++) t.ui.tickEffects(0.05);
        assert.ok(world.car.position > 2400 && world.car.speed < 250 && world.car.speed > 50);
        assert.ok(world.opponents[0].position > 2350);
        t.ui.resetRaceVisuals();
        assert.equal(t.ui.world, null);
    } finally { t.restore(); }
});

test('corrida completa continua funcionando com câmera, turbo e tropeços (regressão geral)', async () => {
    const t = await boot();
    try {
        const c = t.controller, input = c.ui.getTypingInput();
        for (let i = 0; i < 6000 && c.state.phase !== 'finished'; i++) {
            if (i % 3 === 0 && c.state.phase === 'racing') {
                if (i % 45 === 0) { input.value = (c.typingSession.input || '') + '\u0001'; c.handleTyping(input.value); }
                input.value = c.typingQueue.currentText; c.handleTyping(input.value);
            }
            c.update(0.05);
        }
        assert.equal(c.state.phase, 'finished');
        assert.ok(t.sfx.includes('turbo') || t.sfx.includes('finish'));
    } finally { t.restore(); }
});
