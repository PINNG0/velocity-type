import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installMemoryStorage } from './helpers/env.js';
import { installFakeDom } from './helpers/fakeDom.js';
import { UIManager } from '../src/ui/UIManager.js';
import { RaceController } from '../src/controllers/RaceController.js';
import { GameState, GamePhase } from '../src/core/GameState.js';
import { GameConfig } from '../src/config/GameConfig.js';
import { SettingsService } from '../src/services/SettingsService.js';
import { RaceModes } from '../src/config/RaceModes.js';
import { Logger } from '../src/services/Logger.js';
import { I18n } from '../src/i18n/I18n.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const phrases = JSON.parse(fs.readFileSync(path.join(root, 'public/data/words/phrases.json'), 'utf8'));
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => ['node_modules', 'dist', '.git'].includes(e.name) ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
test.afterEach(() => I18n.setLanguage('pt'));

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

async function boot() {
    const storage = installMemoryStorage();
    const dom = installFakeDom();
    const ui = new UIManager(); ui.initialize();
    ui.runCountdown = async () => {}; ui.typingDisplay = { reset() {}, renderQueue() {} };
    const audio = { muted: false, volume: 0.7, initialize() {}, stopEngine() {}, startEngine() {}, updateEngine() {}, sfx() {}, setVolume() {}, setMuted: m => m, toggleMute() { return false; } };
    const controller = new RaceController(new GameState(), ui, { ...GameConfig, ui: { finishDelayMs: 0 } }, { audio, assets: { loadJSON: async () => phrases } });
    controller.initialize();
    return { ui, dom, controller, restore() { ui.menuView.stopResetTimer(); dom.restore(); storage.restore(); } };
}

const CHIPS = { 'race-mode': Object.keys(RaceModes), 'difficulty-mode': ['easy', 'medium', 'hard', 'very-hard'], 'error-mode': ['strict', 'free'], 'content-language': ['pt', 'en'], 'quality-mode': ['auto', 'high', 'low'], topics: ['mixed', 'computing', 'science', 'people', 'code'] };
const SUBMENUS = ['race', 'garage', 'history', 'progression', 'settings'];
const visibleScreens = t => ['main-menu', 'race-screen', 'results-screen'].filter(id => !t.dom.el(id).hidden);

// Regras que precisam valer depois de QUALQUER ação.
function checkInvariants(t, step, last) {
    const where = `passo ${step} (${last})`;
    const screens = visibleScreens(t);
    assert.equal(screens.length, 1, `${where}: exatamente uma tela visível, vieram ${screens}`);
    const phase = t.controller.state.phase;
    if ([GamePhase.RACING, GamePhase.PAUSED, GamePhase.COUNTDOWN].includes(phase)) assert.equal(screens[0], 'race-screen', `${where}: fase ${phase}`);
    if (phase === GamePhase.MENU) assert.equal(screens[0], 'main-menu', `${where}: fase menu`);
    if (phase === GamePhase.FINISHED) assert.equal(screens[0], 'results-screen', `${where}: fase final`);
    const s = SettingsService.load();
    assert.ok(RaceModes[s.mode], `${where}: modo ${s.mode}`);
    assert.ok(['adaptive', 'easy', 'medium', 'hard', 'very-hard'].includes(s.difficulty), `${where}: dificuldade ${s.difficulty}`);
    assert.ok(['easy', 'medium', 'hard', 'very-hard'].includes(s.manualDifficulty), `${where}: nível manual ${s.manualDifficulty}`);
    assert.ok(['pt', 'en'].includes(s.language) && ['strict', 'free'].includes(s.errorMode) && ['auto', 'high', 'low'].includes(s.quality), `${where}: configurações inválidas`);
    assert.ok(s.categories.length >= 1, `${where}: sempre há pelo menos um tema`);
    assert.ok(typeof s.pilotName === 'string' && s.pilotName.length <= 16 && !/[<>]/.test(s.pilotName), `${where}: nome do piloto`);
    assert.equal(Logger.counters.error, 0, `${where}: nenhum erro registrado (${Logger.getEntries({ level: 'error' }).map(e => e.message).join('; ')})`);
    if (phase === GamePhase.RACING || phase === GamePhase.COUNTDOWN) assert.equal(t.ui.navContainer(), null, `${where}: setas livres na corrida`);
    const race = t.controller.race;
    if (race?.car) assert.ok(race.car.position <= race.targetDistance + 1, `${where}: carro além da chegada`);
}

for (const seed of [1, 7, 42, 2026]) {
    test(`simulação aleatória (semente ${seed}): 220 ações em menus e corridas sem quebrar nada`, async () => {
        Logger.clear();
        const t = await boot();
        const random = rng(seed);
        const pick = list => list[Math.floor(random() * list.length)];
        const c = t.controller;
        const visited = new Set(), actions = new Set();
        try {
            for (let step = 1; step <= 220; step++) {
                const phase = c.state.phase;
                visited.add(phase);
                let last;
                if (phase === GamePhase.MENU) {
                    const roll = random();
                    if (roll < 0.14) { last = 'submenu'; t.dom.click('[data-submenu]', { submenu: pick(SUBMENUS) }); }
                    else if (roll < 0.20) { last = 'voltar'; t.dom.click('#submenu-back'); }
                    else if (roll < 0.42) { const group = pick(Object.keys(CHIPS)); last = `chip ${group}`; t.dom.click('[data-chip-target]', { chipTarget: group, chipValue: pick(CHIPS[group]) }); }
                    else if (roll < 0.48) { last = 'automática'; const el = t.dom.el('auto-difficulty'); el.checked = random() < 0.5; el.dispatch('change'); }
                    else if (roll < 0.53) { last = 'garagem'; t.dom.click('[data-garage]', { garage: pick(['prev', 'next', 'equip']) }); }
                    else if (roll < 0.57) { last = 'aba'; t.dom.click('[data-settings-tab]', { settingsTab: pick(['audio', 'controls', 'interface', 'performance']) }); }
                    else if (roll < 0.63) { last = 'nome'; const el = t.dom.el('pilot-name'); el.value = pick(['', 'Ana', '<b>x</b>', 'um nome muito comprido com mais de dezesseis letras', '  espaço  ']); el.dispatch('input'); }
                    else if (roll < 0.67) { last = 'volume'; const el = t.dom.el('volume-slider'); el.value = String(Math.floor(random() * 101)); el.dispatch('input'); }
                    else if (roll < 0.70) { last = 'som'; const el = t.dom.el('sound-toggle'); el.checked = random() < 0.5; el.dispatch('change'); }
                    else if (roll < 0.73) { last = 'movimento'; const el = t.dom.el('reduce-motion'); el.checked = random() < 0.5; el.dispatch('change'); }
                    else if (roll < 0.83) { last = 'teclado'; t.dom.key(pick(['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', 'Escape', 'a'])); }
                    else if (roll < 0.91) { last = 'jogar rápido'; t.dom.el('quick-play-button').click(); await new Promise(r => setTimeout(r, 2)); }
                    else { last = 'começar corrida'; t.dom.click('[data-submenu]', { submenu: 'race' }); t.dom.el('start-race-button').click(); await new Promise(r => setTimeout(r, 2)); }
                } else if (phase === GamePhase.RACING || phase === GamePhase.PAUSED) {
                    const roll = random();
                    const input = c.ui.getTypingInput();
                    if (roll < 0.25) { last = 'quadros'; for (let i = 0, n = 1 + Math.floor(random() * 30); i < n; i++) c.update(0.016 + random() * 0.034); }
                    else if (roll < 0.45 && c.typingSession) { last = 'digitar certo'; const text = c.typingQueue.currentText; const n = Math.min(text.length, c.typingSession.input.length + 1 + Math.floor(random() * 4)); input.value = text.slice(0, n); c.handleTyping(input.value); }
                    else if (roll < 0.55 && c.typingSession) { last = 'digitar errado'; input.value = (c.typingSession.input || '') + '\u0001'; c.handleTyping(input.value); }
                    else if (roll < 0.62 && c.typingSession) { last = 'apagar'; input.value = (c.typingSession.input || '').slice(0, -1 - Math.floor(random() * 3)); c.handleTyping(input.value); }
                    else if (roll < 0.74) { last = 'pausa'; t.dom.key(pick(['Escape', 'Tab'])); }
                    else if (roll < 0.80) { last = 'aba oculta'; globalThis.document.hidden = true; c.visibilityHandler(); globalThis.document.hidden = false; }
                    else if (roll < 0.84) { last = 'tela cheia'; globalThis.document.fullscreenElement = null; c.fullscreenHandler(); }
                    else if (roll < 0.88) { last = 'setas na corrida'; const ev = t.dom.key(pick(['ArrowUp', 'ArrowDown', 'Enter'])); if (c.state.phase === GamePhase.RACING) assert.equal(ev.prevented, false, 'setas nunca interceptadas durante a corrida'); }
                    else if (roll < 0.93) { last = 'menu'; c.returnToMenu(); }
                    else { last = 'autoplay'; for (let i = 0; i < 700 && c.state.phase === GamePhase.RACING; i++) { if (i % 3 === 0) { input.value = c.typingQueue.currentText; c.handleTyping(input.value); } c.update(0.05); } }
                } else if (phase === GamePhase.FINISHED) {
                    if (random() < 0.5) { last = 'correr de novo'; t.dom.el('restart-button').click(); await new Promise(r => setTimeout(r, 2)); }
                    else { last = 'voltar ao menu'; t.dom.el('results-menu-button').click(); }
                } else { last = 'aguardando'; await new Promise(r => setTimeout(r, 2)); }
                actions.add(last);
                checkInvariants(t, step, last);
            }
            if (process.env.SIM_COVERAGE) console.log(`semente ${seed}: fases ${[...visited]} | ações ${actions.size}`);
            assert.ok(visited.has(GamePhase.RACING), `a simulação precisa correr de verdade (fases: ${[...visited]})`);
            assert.ok(actions.size >= 12, `variedade de ações: ${actions.size}`);
        } finally { t.restore(); }
    });
}

// ---------- guardas de limpeza ----------
test('limpeza: sem módulos órfãos, sem chaves de tradução sem uso, sem restos do menu antigo', () => {
    const files = walk(path.join(root, 'src')).filter(f => f.endsWith('.js'));
    const code = Object.fromEntries(files.map(f => [f, fs.readFileSync(f, 'utf8')]));
    const all = Object.values(code).join('\n');
    const orphans = files.filter(f => !f.endsWith('main.js') && !new RegExp(`from\\s+['"][^'"]*/${path.basename(f, '.js')}(\\.js)?['"]`).test(all)).map(f => path.relative(root, f));
    assert.deepEqual(orphans, [], 'módulos que ninguém importa — se sobraram de uma versão anterior, rode: npm run cleanup');

    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const src = Object.entries(code).filter(([f]) => !f.includes('/i18n/')).map(([, c]) => c).join('\n');
    const used = new Set([...src.matchAll(/['"`]([a-zA-Z][\w-]*(?:\.[\w.-]+)?)['"`]/g)].map(m => m[1]));
    for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) used.add(m[1]);
    for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const pair of m[1].split(';')) used.add(pair.split(':')[1]);
    const families = [...src.matchAll(/t\(\s*`([\w.-]+)\$\{/g)].map(m => m[1]).concat('mode.');
    const keys = [...fs.readFileSync(path.join(root, 'src/i18n/pt.js'), 'utf8').matchAll(/^\s*"([^"]+)":/gm)].map(m => m[1]);
    assert.deepEqual(keys.filter(k => !used.has(k) && !families.some(f => k.startsWith(f))), [], 'chaves de tradução nunca usadas');

    const css = fs.readFileSync(path.join(root, 'src/ui/styles/main.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const legacy of ['feature-list', 'menu-hero', 'menu-specs', 'options-panel', 'skin-chip', 'profile-bar', 'menu-card', 'dash-bottom']) assert.doesNotMatch(css, new RegExp(`\\.${legacy}(?![\\w-])`), `CSS legado: .${legacy}`);
    assert.doesNotMatch(src, /console\.log|debugger|TODO|FIXME/, 'sem restos de depuração');
});

test('acessibilidade e metadados do HTML: ícone, descrição, abas ligadas aos painéis, grupos com nome', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.match(html, /<link rel="icon"/);
    assert.match(html, /<meta name="description"/);
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
    for (const m of html.matchAll(/role="tab"[^>]*aria-controls="([^"]+)"/g)) assert.ok(ids.has(m[1]), `painel ${m[1]}`);
    for (const m of html.matchAll(/aria-labelledby="([^"]+)"/g)) assert.ok(ids.has(m[1]), `rótulo ${m[1]}`);
    assert.equal((html.match(/data-chips="/g) || []).length, (html.match(/data-chips="[^"]+"[^>]*aria-labelledby=/g) || []).length, 'todo grupo de opções tem nome acessível');
    assert.match(html, /id="pilot-name"[^>]*aria-label=/);
    assert.match(html, /id="typing-input"[^>]*aria-label=/);
});

test('produção: o console só recebe avisos e erros (o histórico completo fica no buffer)', () => {
    const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
    assert.match(main, /import\.meta\.env\?\.PROD\) Logger\.minLevel = 'warn'/);
});
