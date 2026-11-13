import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installMemoryStorage, baseResult } from './helpers/env.js';
import { installFakeDom } from './helpers/fakeDom.js';
import { UIManager } from '../src/ui/UIManager.js';
import { RaceController } from '../src/controllers/RaceController.js';
import { GameState, GamePhase } from '../src/core/GameState.js';
import { GameConfig } from '../src/config/GameConfig.js';
import { SettingsService } from '../src/services/SettingsService.js';
import { StorageService } from '../src/services/StorageService.js';
import { ProfileService } from '../src/services/ProfileService.js';
import { PlayerProfile } from '../src/domain/progression/PlayerProfile.js';
import { I18n } from '../src/i18n/I18n.js';

const phrases = JSON.parse(fs.readFileSync(new URL('../public/data/words/phrases.json', import.meta.url), 'utf8'));
test.afterEach(() => I18n.setLanguage('pt'));

async function boot(language = 'en') {
    const storage = installMemoryStorage();
    const dom = installFakeDom();
    const ui = new UIManager(); ui.initialize();
    ui.runCountdown = async () => {}; ui.typingDisplay = { reset() {}, renderQueue() {} };
    ui.elements.language.value = language; ui.persistSettings(); ui.applyLanguage();
    const audioCalls = [];
    const audio = { muted: false, volume: 0.7, initialize() {}, stopEngine() {}, startEngine() {}, updateEngine() {}, sfx() {}, setVolume: v => audioCalls.push(['volume', v]), setMuted(m) { audioCalls.push(['muted', m]); return m; }, toggleMute() { return false; } };
    const controller = new RaceController(new GameState(), ui, { ...GameConfig, ui: { finishDelayMs: 0 } }, { audio, assets: { loadJSON: async () => phrases } });
    controller.initialize();
    const section = name => dom.i18n.groups['data-section'].find(s => s.dataset.section === name);
    const chips = target => dom.i18n.groups['data-chips'].find(g => g.dataset.chips === target).innerHTML;
    return { ui, dom, controller, audioCalls, section, chips, restore() { ui.menuView.stopResetTimer(); dom.restore(); storage.restore(); } };
}

test('início: perfil com nome, resumo do "Jogar rápido" e versão', async () => {
    const t = await boot('en');
    try {
        assert.equal(t.dom.el('profile-name').textContent, 'Pilot');
        assert.equal(t.dom.el('quick-play-summary').textContent, 'Short · 1 km · Normal · Random');
        assert.match(t.dom.el('app-version').textContent, /^Velocity Type v/);
        assert.equal(t.dom.el('menu-subscreen').hidden, true);
        assert.equal(t.dom.el('main-menu').classList.contains('submenu-open'), false);
    } finally { t.restore(); }
});

test('navegação: abrir cada submenu, voltar pelo botão e pelo ESC', async () => {
    const t = await boot('en');
    try {
        for (const [screen, title] of [['race', 'NEW RACE'], ['garage', 'GARAGE'], ['history', 'HISTORY'], ['progression', 'PROGRESSION'], ['settings', 'SETTINGS']]) {
            t.dom.click('[data-submenu]', { submenu: screen });
            assert.equal(t.dom.el('menu-subscreen').hidden, false, screen);
            assert.equal(t.dom.el('main-menu').classList.contains('submenu-open'), true);
            assert.equal(t.dom.el('submenu-title').textContent, title);
            for (const name of ['race', 'garage', 'history', 'progression', 'settings']) assert.equal(t.section(name).hidden, name !== screen, `${screen}: seção ${name}`);
            t.dom.click('#submenu-back');
            assert.equal(t.dom.el('menu-subscreen').hidden, true);
        }
        t.dom.click('[data-submenu]', { submenu: 'race' });
        t.dom.key('Escape');
        assert.equal(t.dom.el('menu-subscreen').hidden, true, 'ESC volta');
        t.dom.click('[data-submenu]', { submenu: 'inexistente' });
        assert.equal(t.dom.el('menu-subscreen').hidden, true, 'submenu inválido é ignorado');
        t.dom.click('[data-submenu]', { submenu: 'settings' });
        t.ui.showMainMenu();
        assert.equal(t.dom.el('menu-subscreen').hidden, true, 'voltar ao menu (ex.: depois da corrida) fecha submenus');
    } finally { t.restore(); }
});

test('corrida personalizada: chips mudam as configurações salvas, a prévia e o resumo', async () => {
    const t = await boot('en');
    try {
        t.dom.click('[data-submenu]', { submenu: 'race' });
        assert.match(t.chips('race-mode'), /class="chip on"[^>]*data-chip-value="short"/);
        assert.equal((t.chips('race-mode').match(/class="chip/g) || []).length, 3, 'Curta / Média / Longa');
        assert.equal((t.chips('difficulty-mode').match(/class="chip/g) || []).length, 4, 'Fácil / Normal / Difícil / Expert');
        assert.match(t.chips('difficulty-mode'), /class="chip on"[^>]*data-chip-value="medium"/);
        t.dom.click('[data-chip-target]', { chipTarget: 'difficulty-mode', chipValue: 'hard' });
        t.dom.click('[data-chip-target]', { chipTarget: 'race-mode', chipValue: 'long' });
        const saved = SettingsService.load();
        assert.equal(saved.difficulty, 'hard'); assert.equal(saved.mode, 'long');
        assert.equal(t.dom.el('preview-distance').textContent, 'Long · 5 km');
        assert.equal(t.dom.el('preview-difficulty').textContent, 'Hard');
        assert.equal(t.dom.el('quick-play-summary').textContent, 'Long · 5 km · Hard · Random');
        assert.equal(SettingsService.load().manualDifficulty, 'hard');
        assert.match(t.chips('difficulty-mode'), /class="chip on"[^>]*data-chip-value="hard"/);
    } finally { t.restore(); }
});

test('chips de tema: "Aleatório" = todos; clicar em um escolhe só ele; alterna; nunca fica vazio', async () => {
    const t = await boot('en');
    try {
        const selected = () => SettingsService.load().categories.slice().sort().join(',');
        t.dom.click('[data-chip-target]', { chipTarget: 'topics', chipValue: 'science' });
        assert.equal(selected(), 'science');
        assert.equal(t.dom.el('preview-theme').textContent, 'Science');
        t.dom.click('[data-chip-target]', { chipTarget: 'topics', chipValue: 'code' });
        assert.equal(selected(), 'code,science');
        t.dom.click('[data-chip-target]', { chipTarget: 'topics', chipValue: 'science' });
        assert.equal(selected(), 'code');
        t.dom.click('[data-chip-target]', { chipTarget: 'topics', chipValue: 'code' });
        assert.equal(selected(), 'code,computing,people,science', 'sem tema → volta para todos');
        t.dom.click('[data-chip-target]', { chipTarget: 'topics', chipValue: 'people' });
        t.dom.click('[data-chip-target]', { chipTarget: 'topics', chipValue: 'mixed' });
        assert.equal(selected(), 'code,computing,people,science');
        assert.match(t.chips('topics'), /class="chip on"[^>]*data-chip-value="mixed"/);
    } finally { t.restore(); }
});

test('idioma: chip troca o menu inteiro e o resumo na hora (EN ↔ PT)', async () => {
    const t = await boot('en');
    try {
        t.dom.click('[data-chip-target]', { chipTarget: 'content-language', chipValue: 'pt' });
        assert.equal(I18n.lang, 'pt');
        assert.equal(t.dom.el('quick-play-summary').textContent, 'Curta · 1 km · Normal · Aleatório');
        assert.equal(t.dom.el('profile-name').textContent, 'Piloto');
        assert.equal(SettingsService.load().language, 'pt');
        t.dom.click('[data-chip-target]', { chipTarget: 'content-language', chipValue: 'en' });
        assert.equal(t.dom.el('quick-play-summary').textContent, 'Short · 1 km · Normal · Random');
    } finally { t.restore(); }
});

test('garagem: navegar pelas pinturas, bloqueios por nível e equipar', async () => {
    const t = await boot('en');
    try {
        t.dom.click('[data-submenu]', { submenu: 'garage' });
        assert.equal((t.dom.el('skin-picker').innerHTML.match(/data-skin-preview=/g) || []).length, 5);
        assert.equal(t.dom.el('garage-equip').textContent, 'EQUIPPED');
        t.dom.click('[data-garage]', { garage: 'next' });
        assert.match(t.dom.el('garage-car-slot').innerHTML, /data-skin="neon"/);
        assert.match(t.dom.el('garage-skin-name').textContent, /Neon · LOCKED · LEVEL 3/);
        assert.equal(t.dom.el('garage-equip').disabled, true);
        t.dom.click('[data-garage]', { garage: 'equip' });
        assert.equal(SettingsService.load().carSkin, 'classic', 'pintura bloqueada não equipa');
        t.dom.click('[data-garage]', { garage: 'prev' }); t.dom.click('[data-garage]', { garage: 'prev' });
        assert.match(t.dom.el('garage-car-slot').innerHTML, /data-skin="inferno"/, 'volta do primeiro para o último');

        const profile = PlayerProfile.create(); profile.totalXp = 100000; ProfileService.save(profile);
        t.ui.menuView.open('garage');
        t.dom.click('[data-skin-preview]', { skinPreview: '1' });
        assert.equal(t.dom.el('garage-equip').disabled, false);
        assert.equal(t.dom.el('garage-equip').textContent, 'EQUIP');
        t.dom.click('[data-garage]', { garage: 'equip' });
        assert.equal(SettingsService.load().carSkin, 'neon');
        assert.equal(t.dom.el('player-car').dataset.skin, 'neon');
        assert.equal(t.dom.el('garage-equip').textContent, 'EQUIPPED');
        assert.match(t.dom.el('garage-stats').innerHTML, /Speed \(best WPM\)/);
    } finally { t.restore(); }
});

test('histórico: tabela com a melhor corrida destacada e estado vazio', async () => {
    const t = await boot('en');
    try {
        t.dom.click('[data-submenu]', { submenu: 'history' });
        assert.match(t.dom.el('menu-records-list').innerHTML, /Finish a race to start your history/);
        t.dom.click('#submenu-back');
        for (const [id, wpm, position] of [['a', 60, 2], ['b', 95, 1], ['c', 70, 3]]) StorageService.saveResult(baseResult({ id, wpm, position, playerWon: position === 1 }));
        t.dom.click('[data-submenu]', { submenu: 'history' });
        const html = t.dom.el('menu-records-list').innerHTML;
        assert.equal((html.match(/data-menu-record-index/g) || []).length, 3);
        assert.equal((html.match(/class="best/g) || []).length, 1);
        assert.match(html, /<th scope="col">Accuracy<\/th>/);
        assert.match(t.dom.el('player-summary').innerHTML, /<strong>3<\/strong><span>races/);
    } finally { t.restore(); }
});

test('progressão: nível, desafios do dia, conquistas e contagem para o reinício', async () => {
    const t = await boot('en');
    try {
        t.dom.click('[data-submenu]', { submenu: 'progression' });
        assert.equal(t.dom.el('prog-level-title').textContent, 'Level 1');
        assert.equal((t.dom.el('daily-list').innerHTML.match(/goal-row/g) || []).length, 3);
        assert.match(t.dom.el('daily-reset').textContent, /^Resets in \d\d:\d\d:\d\d$/);
        assert.ok(t.ui.menuView.resetTimer, 'cronômetro ativo na tela');
        t.dom.click('#submenu-back');
        assert.equal(t.ui.menuView.resetTimer, null, 'cronômetro parado ao sair');
    } finally { t.restore(); }
});

test('configurações: abas, volume, som, nome do piloto, reduzir movimento e qualidade', async () => {
    const t = await boot('en');
    try {
        t.dom.click('[data-submenu]', { submenu: 'settings' });
        t.dom.click('[data-settings-tab]', { settingsTab: 'controls' });
        const panel = name => t.dom.i18n.groups['data-settings-panel'].find(p => p.dataset.settingsPanel === name);
        assert.equal(panel('controls').hidden, false); assert.equal(panel('audio').hidden, true);
        t.dom.click('[data-chip-target]', { chipTarget: 'error-mode', chipValue: 'free' });
        assert.equal(SettingsService.load().errorMode, 'free');

        const slider = t.dom.el('volume-slider'); slider.value = '35'; slider.dispatch('input');
        assert.deepEqual(t.audioCalls.at(-1), ['volume', 0.35]); assert.equal(t.dom.el('volume-value').textContent, '35%');
        const sound = t.dom.el('sound-toggle'); sound.checked = false; sound.dispatch('change');
        assert.deepEqual(t.audioCalls.at(-1), ['muted', true]);
        assert.equal(t.dom.el('mute-button').textContent, 'SOUND: OFF');

        const name = t.dom.el('pilot-name'); name.value = '  Andrei<b> '; name.dispatch('input');
        assert.equal(t.dom.el('profile-name').textContent, 'Andreib');
        assert.equal(SettingsService.load().pilotName, 'Andreib');

        const motion = t.dom.el('reduce-motion'); motion.checked = true; motion.dispatch('change');
        assert.equal(globalThis.document.documentElement.attrs['data-motion'], 'reduced');
        assert.equal(t.ui.effectsRenderer.reducedMotion, true);
        assert.equal(SettingsService.load().reduceMotion, true);

        const seen = []; t.ui.onQualityChange = mode => seen.push(mode);
        t.dom.click('[data-chip-target]', { chipTarget: 'quality-mode', chipValue: 'low' });
        assert.deepEqual(seen, ['low']);
        assert.equal(t.dom.el('race-area').classList.contains('quality-low'), true);
        assert.equal(SettingsService.load().quality, 'low');
    } finally { t.restore(); }
});

test('"Iniciar corrida" só abre a preparação; a corrida começa em "Começar corrida" com as configurações escolhidas', async () => {
    const t = await boot('en');
    try {
        t.dom.click('[data-submenu]', { submenu: 'race' });
        await new Promise(resolve => setTimeout(resolve, 20));
        assert.equal(t.controller.state.phase, GamePhase.MENU, 'abrir a preparação não larga a corrida');
        assert.equal(t.dom.el('menu-subscreen').hidden, false);
        t.dom.click('[data-chip-target]', { chipTarget: 'race-mode', chipValue: 'long' });
        t.dom.el('start-race-button').click();
        await new Promise(resolve => setTimeout(resolve, 20));
        assert.equal(t.controller.state.phase, GamePhase.RACING);
        assert.equal(t.controller.race.targetDistance, 5000, 'usa a distância escolhida');
        t.controller.returnToMenu();
        assert.equal(t.dom.el('menu-subscreen').hidden, true);
        t.dom.el('start-race-button').click();
        await new Promise(resolve => setTimeout(resolve, 20));
        assert.equal(t.controller.state.phase, GamePhase.RACING);
    } finally { t.restore(); }
});

test('configurações antigas sem os campos novos continuam válidas (migração)', () => {
    const env = installMemoryStorage({ 'velocity-type-settings-v2': JSON.stringify({ language: 'en', mode: 'sprint', quality: 'ultra', pilotName: 12345 }) });
    try {
        const s = SettingsService.load();
        assert.equal(s.quality, 'auto'); assert.equal(s.pilotName, ''); assert.equal(s.reduceMotion, false); assert.equal(s.language, 'en');
    } finally { env.restore(); }
});

test('"Jogar rápido" larga a corrida em 1 clique com as configurações salvas; "Iniciar corrida" não larga', async () => {
    const t = await boot('en');
    try {
        t.dom.click('[data-submenu]', { submenu: 'race' });
        await new Promise(resolve => setTimeout(resolve, 20));
        assert.equal(t.controller.state.phase, GamePhase.MENU);
        t.dom.click('[data-chip-target]', { chipTarget: 'race-mode', chipValue: 'medium' });
        t.dom.click('#submenu-back');
        t.dom.el('quick-play-button').click();
        await new Promise(resolve => setTimeout(resolve, 20));
        assert.equal(t.controller.state.phase, GamePhase.RACING, 'uma ação e a corrida começa');
        assert.equal(t.controller.race.targetDistance, 2000, 'usa o modo salvo');
        t.controller.returnToMenu();
        assert.equal(t.dom.el('quick-play-button').disabled, false);
        assert.equal(t.dom.el('menu-subscreen').hidden, true);
    } finally { t.restore(); }
});

test('dificuldade automática: interruptor liga/desliga, lembra o último nível e escolher um nível a desliga', async () => {
    const t = await boot('en');
    try {
        t.dom.click('[data-chip-target]', { chipTarget: 'difficulty-mode', chipValue: 'hard' });
        const auto = t.dom.el('auto-difficulty');
        assert.equal(auto.checked, false);
        auto.checked = true; auto.dispatch('change');
        assert.equal(SettingsService.load().difficulty, 'adaptive');
        assert.equal(SettingsService.load().manualDifficulty, 'hard');
        assert.match(t.dom.el('preview-difficulty').textContent, /^Automatic \(/);
        assert.match(t.dom.el('quick-play-summary').textContent, /Automatic \(/);
        assert.doesNotMatch(t.chips('difficulty-mode'), /class="chip on"/, 'nenhum nível marcado enquanto automática');
        assert.match(t.chips('difficulty-mode'), /class="chip dim"/);
        auto.checked = false; auto.dispatch('change');
        assert.equal(SettingsService.load().difficulty, 'hard', 'volta ao último nível manual');
        auto.checked = true; auto.dispatch('change');
        t.dom.click('[data-chip-target]', { chipTarget: 'difficulty-mode', chipValue: 'easy' });
        assert.equal(SettingsService.load().difficulty, 'easy');
        assert.equal(t.dom.el('auto-difficulty').checked, false, 'escolher um nível desliga a automática');
    } finally { t.restore(); }
});

test('com a dificuldade automática ligada a corrida usa o nível adaptativo e registra o modo', async () => {
    const t = await boot('en');
    try {
        const auto = t.dom.el('auto-difficulty'); auto.checked = true; auto.dispatch('change');
        await t.controller.startRace();
        assert.equal(t.controller.activeDifficulty.mode, 'adaptive');
        assert.equal(t.controller.activeSettings.difficulty, 'adaptive');
    } finally { t.restore(); }
});
