import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installMemoryStorage, makeClock } from './helpers/env.js';
import { installFakeDom } from './helpers/fakeDom.js';
import { CrazyGamesService } from '../src/services/CrazyGamesService.js';
import { StorageService } from '../src/services/StorageService.js';
import { AudioService } from '../src/services/AudioService.js';
import { I18n } from '../src/i18n/I18n.js';
import { UIManager } from '../src/ui/UIManager.js';
import { RaceController } from '../src/controllers/RaceController.js';
import { GameState, GamePhase } from '../src/core/GameState.js';
import { GameConfig } from '../src/config/GameConfig.js';
import { Race } from '../src/domain/race/Race.js';
import { RaceSystem } from '../src/systems/RaceSystem.js';
import { TypingSession } from '../src/domain/typing/TypingSession.js';
import { TypingChallenge } from '../src/domain/typing/TypingChallenge.js';
import { ContentService } from '../src/services/ContentService.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/ui/styles/main.css'), 'utf8');
const phrases = JSON.parse(fs.readFileSync(path.join(root, 'public/data/words/phrases.json'), 'utf8'));
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.name === 'node_modules' || e.name === 'dist' || e.name === '.git' ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

function fakeSdk({ environment = 'crazygames', initFails = false, muteAudio = false } = {}) {
    const calls = []; const store = new Map(); let listener = null;
    const sdk = {
        environment, calls, store,
        init: async () => { calls.push('init'); if (initFails) throw new Error('init failed'); },
        game: {
            settings: { muteAudio },
            gameplayStart: () => calls.push('gameplayStart'), gameplayStop: () => calls.push('gameplayStop'),
            loadingStart: () => calls.push('loadingStart'), loadingStop: () => calls.push('loadingStop'), happytime: () => calls.push('happytime'),
            addSettingsChangeListener: fn => { listener = fn; }
        },
        data: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) },
        user: { systemInfo: { locale: 'pt-BR' } },
        emitSettings: s => listener?.(s)
    };
    return sdk;
}
const cgWindow = sdk => ({ location: { hostname: 'game.crazygames.com', search: '' }, document: { referrer: '' }, CrazyGames: { SDK: sdk }, navigator: { language: 'en-US' } });

test.beforeEach(() => { CrazyGamesService.reset(); StorageService.backend = null; });
test.afterEach(() => { I18n.setLanguage('pt'); delete globalThis.window; });

test('SDK só é carregado na CrazyGames (ou com ?useLocalSdk=true), nunca em outros hosts', async () => {
    assert.equal(CrazyGamesService.shouldLoad({ location: { hostname: 'maria.github.io', search: '' } }), false);
    assert.equal(CrazyGamesService.shouldLoad({ location: { hostname: 'localhost', search: '' } }), false);
    assert.equal(CrazyGamesService.shouldLoad({ location: { hostname: 'localhost', search: '?useLocalSdk=true' } }), true);
    assert.equal(CrazyGamesService.shouldLoad({ location: { hostname: 'x.game-files.crazygames.com', search: '' } }), true);
    assert.equal(CrazyGamesService.shouldLoad({ location: { hostname: 'cdn.example.com', search: '', ancestorOrigins: ['https://www.crazygames.com'] } }), true);
    globalThis.window = { location: { hostname: 'maria.github.io', search: '' }, document: { referrer: '' } };
    assert.equal(await CrazyGamesService.init(), false);
    assert.equal(CrazyGamesService.active, false);
    assert.doesNotThrow(() => { CrazyGamesService.gameplayStart(); CrazyGamesService.gameplayStop(); CrazyGamesService.happytime(); CrazyGamesService.loadingStart(); });
    assert.equal(CrazyGamesService.dataBackend(), null);
});

test('na CrazyGames: init, loading, gameplay start/stop idempotentes, happytime e locale', async () => {
    const sdk = fakeSdk(); globalThis.window = cgWindow(sdk);
    assert.equal(await CrazyGamesService.init(), true);
    CrazyGamesService.loadingStart(); CrazyGamesService.loadingStop();
    CrazyGamesService.gameplayStop(); // sem start anterior: ignorado
    CrazyGamesService.gameplayStart(); CrazyGamesService.gameplayStart();
    CrazyGamesService.gameplayStop(); CrazyGamesService.gameplayStop();
    CrazyGamesService.gameplayStart();
    CrazyGamesService.happytime();
    assert.deepEqual(sdk.calls, ['init', 'loadingStart', 'loadingStop', 'gameplayStart', 'gameplayStop', 'gameplayStart', 'happytime']);
    assert.equal(CrazyGamesService.locale(), 'pt-BR');
    assert.equal(I18n.detect(), 'pt', 'locale do SDK tem prioridade sobre o navegador (en-US)');
});

test('ambiente "disabled", falha ou demora do SDK não derrubam o jogo', async () => {
    globalThis.window = cgWindow(fakeSdk({ environment: 'disabled' }));
    assert.equal(await CrazyGamesService.init(), false);
    CrazyGamesService.reset();
    globalThis.window = cgWindow(fakeSdk({ initFails: true }));
    assert.equal(await CrazyGamesService.init(), false);
    assert.doesNotThrow(() => CrazyGamesService.gameplayStart());
    CrazyGamesService.reset();
    const slow = fakeSdk(); slow.init = () => new Promise(() => {});
    globalThis.window = cgWindow(slow);
    assert.equal(await CrazyGamesService.init({ timeoutMs: 30 }), false);
});

test('muteAudio da plataforma prevalece sobre o botão de som do jogo', async () => {
    const sdk = fakeSdk({ muteAudio: true }); globalThis.window = cgWindow(sdk);
    await CrazyGamesService.init();
    assert.equal(CrazyGamesService.muteAudio(), true);
    const env = installMemoryStorage();
    try {
        const audio = new AudioService();
        audio.master = { gain: { value: 1 } };
        audio.setExternalMute(CrazyGamesService.muteAudio());
        assert.equal(audio.master.gain.value, 0);
        audio.setMuted(false); // o jogador tenta ligar o som
        assert.equal(audio.silent, true);
        assert.equal(audio.master.gain.value, 0, 'continua mudo');
        const seen = []; CrazyGamesService.onMuteChange(m => seen.push(m));
        sdk.emitSettings({ muteAudio: false });
        assert.deepEqual(seen, [false]);
        audio.setExternalMute(false);
        assert.equal(audio.master.gain.value, audio.volume);
    } finally { env.restore(); }
});

test('iOS: contexto de áudio interrompido/suspenso é retomado no próximo gesto', () => {
    const env = installMemoryStorage();
    try {
        const audio = new AudioService();
        const states = [];
        audio.context = { state: 'interrupted', resume: async () => { states.push('resume'); } };
        audio.resume();
        audio.context.state = 'suspended'; audio.resume();
        audio.context.state = 'running'; audio.resume();
        assert.deepEqual(states, ['resume', 'resume']);
    } finally { env.restore(); }
});

test('progresso pode ser salvo no módulo Data da plataforma (e volta ao localStorage fora dela)', async () => {
    const sdk = fakeSdk(); globalThis.window = cgWindow(sdk);
    await CrazyGamesService.init();
    StorageService.backend = CrazyGamesService.dataBackend();
    assert.equal(StorageService.set('k', { xp: 5 }), true);
    assert.equal(sdk.store.get('k'), '{"xp":5}');
    assert.deepEqual(StorageService.get('k'), { xp: 5 });
    StorageService.remove('k');
    assert.equal(StorageService.get('k', 'vazio'), 'vazio');
    StorageService.backend = null;
});

async function bootController(platformCalls) {
    const storage = installMemoryStorage();
    const dom = installFakeDom();
    const ui = new UIManager(); ui.initialize();
    ui.runCountdown = async () => {}; ui.typingDisplay = { reset() {}, renderQueue() {} };
    const audio = { muted: false, initialize() {}, stopEngine() {}, startEngine() {}, updateEngine() {}, sfx() {}, toggleMute() {} };
    const platform = { gameplayStart: () => platformCalls.push('start'), gameplayStop: () => platformCalls.push('stop'), happytime: () => platformCalls.push('happy') };
    const controller = new RaceController(new GameState(), ui, { ...GameConfig, ui: { finishDelayMs: 0 } }, { audio, platform, assets: { loadJSON: async () => phrases } });
    controller.initialize();
    return { controller, ui, dom, restore() { dom.restore(); storage.restore(); } };
}

test('eventos de gameplay: início, pausa (ESC/Tab/sair da tela cheia), retomada, fim e menu', async () => {
    const calls = [];
    const t = await bootController(calls);
    try {
        const c = t.controller, key = k => ({ key: k, preventDefault() {}, stopPropagation() {} });
        await c.startRace();
        assert.deepEqual(calls, ['start']);
        c.globalKeyHandler(key('Tab'));            // Tab pausa
        assert.equal(c.state.phase, GamePhase.PAUSED);
        c.globalKeyHandler(key('Escape'));         // ESC retoma
        assert.equal(c.state.phase, GamePhase.RACING);
        globalThis.document.fullscreenElement = null;
        c.fullscreenHandler();                      // sair da tela cheia pausa
        assert.equal(c.state.phase, GamePhase.PAUSED);
        c.resumeRace();
        assert.deepEqual(calls, ['start', 'stop', 'start', 'stop', 'start']);
        const input = c.ui.getTypingInput();
        for (let i = 0; i < 6000 && c.state.phase !== GamePhase.FINISHED; i++) { if (i % 3 === 0 && c.state.phase === GamePhase.RACING) { input.value = c.typingQueue.currentText; c.handleTyping(input.value); } c.update(0.05); }
        assert.equal(c.state.phase, GamePhase.FINISHED);
        assert.equal(calls.at(-2), 'stop', 'fim de corrida para o gameplay');
        assert.equal(calls.at(-1), 'happy', 'primeira vitória/recorde comemora (uma vez)');
        assert.equal(calls.filter(x => x === 'happy').length, 1);
        await c.startRace();
        c.returnToMenu();
        assert.equal(calls.at(-1), 'stop');
        assert.equal(calls.filter(x => x === 'start').length, calls.filter(x => x === 'stop').length, 'starts e stops pareados');
    } finally { t.restore(); }
});

// ---------- conformidade com os requisitos mínimos (Basic) ----------
test('Basic/Technical: tamanho total, quantidade de arquivos e caminhos relativos', () => {
    const files = [...walk(path.join(root, 'src')), ...walk(path.join(root, 'public')), path.join(root, 'index.html')];
    const bytes = files.reduce((sum, f) => sum + fs.statSync(f).size, 0);
    assert.ok(files.length <= 1500, `${files.length} arquivos`);
    assert.ok(bytes <= 20 * 1024 * 1024, `${(bytes / 1024 / 1024).toFixed(2)} MB (limite 50 MB; ideal ≤ 20 MB para a home mobile)`);
    const bad = [...html.matchAll(/\s(?:src|href)="([^"]+)"/g)].map(m => m[1]).filter(u => u.startsWith('/') || /^https?:/.test(u));
    assert.deepEqual(bad, [], 'index.html só pode usar caminhos relativos');
    assert.doesNotMatch(css, /url\(\s*['"]?\//, 'CSS sem url() absoluto');
    const vite = fs.readFileSync(path.join(root, 'vite.config.js'), 'utf8');
    assert.match(vite, /base:\s*'\.\/'/);
    assert.match(ContentService.url, /data\/words\/phrases\.json$/); // base './' no build gera ./data/...
});

test('Basic/Gameplay: sem links externos, sem anúncios próprios, sem botão/API de tela cheia, sem login externo', () => {
    assert.deepEqual([...html.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map(m => m[0]), [], 'nenhum link externo no HTML');
    for (const file of walk(path.join(root, 'src')).filter(f => f.endsWith('.js'))) {
        const code = fs.readFileSync(file, 'utf8');
        const rel = path.relative(root, file);
        assert.doesNotMatch(code, /requestFullscreen|webkitRequestFullscreen/, `${rel}: tela cheia é da plataforma`);
        assert.doesNotMatch(code, /adsbygoogle|googletag|doubleclick|admob|applovin/i, `${rel}: sem anúncios externos`);
        assert.doesNotMatch(code, /window\.open\(|target=["']_blank/, `${rel}: sem abrir páginas externas`);
        if (!rel.endsWith('CrazyGamesService.js')) assert.doesNotMatch(code, /https?:\/\/(?!localhost)/, `${rel}: só o SDK pode ter URL externa`);
    }
    assert.doesNotMatch(html, /fullscreen|facebook|twitter|discord|steam|play\.google|apps\.apple/i);
});

test('Basic/Technical: CSS bloqueia seleção/lupa no corpo e mantém o campo de digitação selecionável', () => {
    assert.match(css, /body\s*\{[^}]*user-select:\s*none/);
    assert.match(css, /input,\s*textarea\s*\{[^}]*user-select:\s*text/);
});

test('Basic/Gameplay: ESC (que sai da tela cheia) tem alternativa; pausa também por botão', () => {
    const src = fs.readFileSync(path.join(root, 'src/controllers/RaceController.js'), 'utf8');
    assert.match(src, /event\.key === 'Tab'/);
    assert.match(src, /fullscreenchange/);
    assert.match(html, /id="pause-button"/);
});

test('Basic/Gameplay: física consistente em 30/60/144/165 Hz (mesma corrida, mesma distância)', () => {
    const run = hz => {
        const clock = makeClock();
        const race = new Race(GameConfig); race.start();
        const session = new TypingSession(new TypingChallenge('a'.repeat(100000)), { ...GameConfig.typing, clock }); session.start();
        const system = new RaceSystem(race, session, GameConfig);
        const dt = 1 / hz; let typed = 0;
        for (let t = 0; t < 15; t += dt) {
            clock.advance(dt * 1000);
            const target = Math.floor((t + dt) * 7); // 7 caracteres/s (~84 WPM)
            if (target > typed) { typed = target; session.processInput('a'.repeat(typed)); }
            system.update(dt);
        }
        return { player: race.car.position, rivals: race.opponents.map(o => o.position), elapsed: race.elapsedSeconds };
    };
    const base = run(60);
    for (const hz of [30, 144, 165]) {
        const r = run(hz);
        assert.ok(Math.abs(r.player - base.player) / base.player < 0.03, `${hz} Hz: jogador ${r.player.toFixed(0)} vs ${base.player.toFixed(0)}`);
        r.rivals.forEach((p, i) => assert.ok(Math.abs(p - base.rivals[i]) / base.rivals[i] < 0.03, `${hz} Hz: rival ${i} ${p.toFixed(0)} vs ${base.rivals[i].toFixed(0)}`));
        assert.ok(Math.abs(r.elapsed - base.elapsed) < 0.1);
    }
});
