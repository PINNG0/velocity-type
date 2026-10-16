import { UIConfig } from '../config/UIConfig.js';
import { getRaceMode } from '../config/RaceModes.js';
import { CarRenderer } from '../rendering/CarRenderer.js';
import { OpponentRenderer } from '../rendering/OpponentRenderer.js';
import { EffectsRenderer } from '../rendering/EffectsRenderer.js';
import { TrackRenderer } from '../rendering/TrackRenderer.js';
import { SceneRenderer } from '../rendering/SceneRenderer.js';
import { Countdown } from './components/Countdown.js';
import { TypingDisplay } from './components/TypingDisplay.js';
import { ProgressBar } from './components/ProgressBar.js';
import { RecordsView } from './RecordsView.js';
import { ProgressionView } from './ProgressionView.js';
import { SettingsService } from '../services/SettingsService.js';
import { Logger } from '../services/Logger.js';
import { resolveSkin } from '../config/Unlocks.js';
import { I18n, t } from '../i18n/I18n.js';
import { StorageService, StorageKeys } from '../services/StorageService.js';

const HUD_INTERVAL_MS = 66;      // textos do HUD ~15 Hz
const COCKPIT_INTERVAL_MS = 33;  // ponteiros/CSS vars ~30 Hz

// Responsabilidade: tudo que toca o DOM. Não decide regras de jogo nem grava dados
// (isso é do RaceController/serviços). Subpartes: RecordsView, ProgressionView e renderers.
export class UIManager {
    constructor() {
        this.screens = {};
        this.typingUpcomingTexts = [];
        this.hudCache = new Map();
        this.lastHudAt = 0;
        this.lastCockpitAt = 0;
        this.leaderboardKey = '';
        this.leaderboardDistances = [];
        this.bannerTimer = null;
    }

    initialize() {
        const byId = id => document.getElementById(id);
        this.screens.menu = byId(UIConfig.screens.menu);
        this.screens.race = byId(UIConfig.screens.race);
        this.screens.results = byId(UIConfig.screens.results);

        const ids = {
            start: 'start-race-button', language: 'content-language', difficulty: 'difficulty-mode', mode: 'race-mode',
            accents: 'rule-accents', punctuation: 'rule-punctuation', caseSensitive: 'rule-case', numbersExact: 'rule-numbers',
            topicsSummary: 'topics-summary', rulesSummary: 'typing-rules-summary', menuDistance: 'menu-distance', resultConfig: 'result-config',
            restart: 'restart-button', resultsMenu: 'results-menu-button', resume: 'resume-button', quitRace: 'quit-race-button', pause: 'pause-button',
            menuStatus: 'menu-status', raceStatus: 'race-status-text', raceTimeTop: 'race-time-top',
            recordDetailsToggle: 'record-details-toggle', recordDetails: 'record-details', openRecords: 'open-records-button',
            recordsPanel: 'records-panel', recordsList: 'records-list', menuRecordsToggle: 'menu-records-toggle',
            menuRecordsPanel: 'menu-records-panel', menuRecordsList: 'menu-records-list', playerSummary: 'player-summary',
            exportRecords: 'export-records-button', importRecords: 'import-records-button', importRecordsFile: 'import-records-file',
            clearRecords: 'clear-records-button', raceModeLabel: 'race-mode-label',
            challenge: 'challenge-text', input: 'typing-input', typingConsole: 'typing-console',
            wpm: 'wpm-value', accuracy: 'accuracy-value', errors: 'errors-value', combo: 'combo-value',
            time: 'race-time', position: 'race-position', distance: 'distance-value',
            progress: 'race-progress', progressLabel: 'progress-label', leaderboard: 'leaderboard-list',
            resultWpm: 'result-wpm', resultAccuracy: 'result-accuracy', resultErrors: 'result-errors', resultTime: 'result-time',
            resultSpeed: 'result-speed', resultPosition: 'result-position', resultPhrases: 'result-phrases', resultBest: 'result-best',
            resultWinner: 'result-winner', resultTitle: 'result-title',
            raceArea: 'race-area', car: 'player-car', opponents: 'opponent-layer', countdown: 'countdown', pauseOverlay: 'pause-overlay',
            effects: 'speed-effects', speedNeedle: 'speed-needle', speedNumber: 'speed-number', rpmNeedle: 'rpm-needle', gear: 'gear-value',
            // opcionais (novos recursos): ausência não impede o jogo de iniciar
            trackCanvas: 'track-canvas', sceneCanvas: 'scene-canvas', effectsCanvas: 'effects-canvas', raceBanner: 'race-banner', muteButton: 'mute-button',
            announcer: 'sr-announcer', gapPill: 'gap-pill', onboardHint: 'onboard-hint', typingHint: 'typing-hint', errorMode: 'error-mode', skinPicker: 'skin-picker', resultInsights: 'result-insights', resultChart: 'result-chart', resultMisses: 'result-misses', toastRegion: 'toast-region',
            profileLevel: 'profile-level', profileXpFill: 'profile-xp-fill', profileXpBar: 'profile-xp-bar', profileXpLabel: 'profile-xp-label', profileTotalXp: 'profile-total-xp',
            objectivesToggle: 'objectives-toggle', objectivesPanel: 'objectives-panel', dailyList: 'daily-list', longList: 'long-list',
            achievementsList: 'achievements-list', achievementsCount: 'achievements-count', xpHistoryList: 'xp-history-list',
            resultXp: 'result-xp', resultXpTotal: 'result-xp-total', resultXpFill: 'result-xp-fill', resultXpBreakdown: 'result-xp-breakdown',
            resultLevel: 'result-level', resultEvents: 'result-events', levelupBanner: 'levelup-banner'
        };
        this.elements = Object.fromEntries(Object.entries(ids).map(([key, id]) => [key, byId(id)]));
        this.elements.topics = [...document.querySelectorAll('[data-content-category]')];

        this.assertElements();

        this.progressionView = new ProgressionView(this.elements, {
            escape: v => this.escape(v),
            getSkin: () => SettingsService.load().carSkin,
            setSkin: id => { SettingsService.save({ ...this.getSettings(), carSkin: id }); this.applySkin(id); }
        });
        this.recordsView = new RecordsView(this.elements, {
            escape: v => this.escape(v),
            notify: (message, kind) => this.progressionView.toast(message, kind),
            onDataChanged: () => this.progressionView.renderMenu()
        });
        this.recordsView.bind();
        this.progressionView.bind();

        this.bindSettings();

        this.carRenderer = new CarRenderer(this.elements.car);
        this.opponentRenderer = new OpponentRenderer(this.elements.opponents);
        this.effectsRenderer = new EffectsRenderer(this.elements.effects, this.elements.effectsCanvas);
        this.trackRenderer = new TrackRenderer(this.elements.trackCanvas);
        this.sceneRenderer = new SceneRenderer(this.elements.sceneCanvas);
        if (this.trackRenderer.active) this.elements.raceArea.classList.add('track-canvas-active');
        this.turboActive = false;
        this.world = null;
        this.countdown = new Countdown(this.elements.countdown);
        this.typingDisplay = new TypingDisplay(this.elements.challenge);
        this.progressBar = new ProgressBar(this.elements.progress);

        let resizeQueued = false;
        window.addEventListener('resize', () => {
            if (resizeQueued) return;
            resizeQueued = true;
            requestAnimationFrame(() => { resizeQueued = false; this.resizeCanvases(); });
        });

        this.progressionView.renderMenu();
        Logger.info('ui', 'interface inicializada');
    }

    // ---------- configurações (persistência única via SettingsService) ----------
    bindSettings() {
        this.loadSettings();
        const save = () => this.persistSettings();
        const e = this.elements;
        [e.language, e.difficulty, e.mode, e.errorMode, e.accents, e.punctuation, e.caseSensitive, e.numbersExact, ...e.topics].forEach(el => el?.addEventListener('change', save));
        e.language?.addEventListener('change', () => this.applyLanguage());
        document.querySelectorAll('[data-lang]').forEach(button => button.addEventListener('click', () => {
            if (e.language) e.language.value = button.dataset.lang;
            this.persistSettings();
            this.applyLanguage();
        }));
        this.applyLanguage();
        document.querySelectorAll('[data-rule-preset]').forEach(button => button.addEventListener('click', () => this.applyRulePreset(button.dataset.rulePreset)));

        // "Variado / Todos os temas" funciona como selecionar tudo.
        const all = e.topics.find(i => i.value === 'mixed');
        const individual = e.topics.filter(i => i.value !== 'mixed');
        all?.addEventListener('change', () => { individual.forEach(i => { i.checked = all.checked; }); this.persistSettings(); });
        individual.forEach(i => i.addEventListener('change', () => {
            if (all) all.checked = i.checked ? individual.every(t => t.checked) : false;
            this.persistSettings();
        }));
    }

    loadSettings() {
        const saved = SettingsService.load();
        const e = this.elements;
        if (e.language) e.language.value = saved.language;
        I18n.setLanguage(saved.language);
        I18n.apply();
        if (e.difficulty) e.difficulty.value = saved.difficulty;
        if (e.mode) e.mode.value = saved.mode;
        if (e.errorMode) e.errorMode.value = saved.errorMode;
        this.carSkin = saved.carSkin;
        e.topics.forEach(input => { input.checked = input.value === 'mixed' ? saved.categories.length === 4 : saved.categories.includes(input.value); });
        for (const key of ['accents', 'punctuation', 'caseSensitive', 'numbersExact']) if (e[key]) e[key].checked = saved.rules[key] !== false;
        this.refreshSettingsSummaries();
    }

    getSettings() {
        const e = this.elements;
        const selected = e.topics.filter(i => i.checked && i.value !== 'mixed').map(i => i.value);
        return {
            language: e.language?.value || 'pt',
            categories: selected.length ? selected : ['computing', 'science', 'people', 'code'],
            difficulty: e.difficulty?.value || 'adaptive',
            mode: e.mode?.value || 'sprint',
            errorMode: e.errorMode?.value === 'free' ? 'free' : 'strict',
            carSkin: this.carSkin || 'classic',
            rules: {
                accents: e.accents?.checked !== false, punctuation: e.punctuation?.checked !== false,
                caseSensitive: e.caseSensitive?.checked !== false, numbersExact: e.numbersExact?.checked !== false
            }
        };
    }

    // Troca o idioma de toda a interface (HTML estático via data-i18n + textos gerados por código).
    applyLanguage() {
        const lang = I18n.setLanguage(this.elements.language?.value || 'pt');
        I18n.apply();
        document.querySelectorAll('[data-lang]').forEach(button => {
            const on = button.dataset.lang === lang;
            button.setAttribute('aria-pressed', String(on));
            button.classList.toggle('active', on);
        });
        this.refreshSettingsSummaries();
        this.setMuted(Boolean(this.mutedState));
        const e = this.elements;
        if (!this.menuBusy) {
            if (e.menuStatus) e.menuStatus.textContent = t('menu.ready');
            if (e.start) e.start.textContent = t('menu.start');
        }
        if (e.pause) e.pause.textContent = t(e.pauseOverlay && !e.pauseOverlay.hidden ? 'race.resume' : 'race.pause');
        this.progressionView?.refreshLabels();
        this.recordsView?.refreshLabels();
        this.hintKey = '';
    }

    persistSettings() {
        SettingsService.save(this.getSettings());
        this.refreshSettingsSummaries();
    }

    refreshSettingsSummaries() {
        const e = this.elements;
        const chosen = e.topics.filter(i => i.checked && i.value !== 'mixed' && i.value !== 'all');
        if (e.topicsSummary) e.topicsSummary.textContent = chosen.length === 4 ? t('topics.all') : t('topics.count', { n: chosen.length });
        if (e.rulesSummary) {
            const r = this.getSettings().rules;
            e.rulesSummary.textContent = t(Object.values(r).every(Boolean) ? 'rules.full' : Object.values(r).every(v => !v) ? 'rules.simple' : 'rules.custom');
        }
        if (e.menuDistance && e.mode) e.menuDistance.textContent = getRaceMode(e.mode.value).km;
    }

    applyRulePreset(preset) {
        const value = preset === 'full';
        for (const id of ['accents', 'punctuation', 'caseSensitive', 'numbersExact']) {
            if (this.elements[id]) this.elements[id].checked = preset === 'custom' ? this.elements[id].checked : value;
        }
        this.persistSettings();
    }

    assertElements() {
        // Só elementos necessários para iniciar e jogar são fatais. Os nós legados do HUD
        // e os novos recursos (perfil, canvas, banners) são opcionais e nunca impedem o boot.
        const required = [
            'start', 'language', 'difficulty', 'mode', 'topics', 'restart',
            'resultsMenu', 'resume', 'quitRace', 'pause', 'menuStatus',
            'raceStatus', 'challenge', 'input', 'wpm', 'accuracy', 'errors',
            'combo', 'progress', 'progressLabel', 'leaderboard', 'resultWpm',
            'resultAccuracy', 'resultErrors', 'resultTime', 'resultSpeed',
            'resultPosition', 'resultPhrases', 'resultBest', 'resultTitle',
            'raceArea', 'car', 'opponents', 'countdown', 'pauseOverlay',
            'effects', 'speedNeedle', 'speedNumber', 'rpmNeedle', 'gear'
        ];
        const missing = required.filter(name => !this.elements[name]);
        const missingScreens = Object.entries(this.screens).filter(([, element]) => !element).map(([name]) => `screen:${name}`);
        const allMissing = [...missing, ...missingScreens];
        if (allMissing.length) throw new Error(`UI incompleta. Elementos ausentes: ${allMissing.join(', ')}`);
    }

    // A pintura só vale se o nível já a desbloqueou (evita save adulterado/importado).
    applySkin(id, level = null) {
        const skin = level === null ? id : resolveSkin(id, level);
        this.carSkin = skin;
        if (this.elements.car) this.elements.car.dataset.skin = skin;
    }

    // ---------- navegação ----------
    showScreen(screen) {
        Object.values(this.screens).forEach(element => { element.hidden = true; element.classList.remove('active'); });
        screen.hidden = false;
        screen.classList.add('active');
    }

    onStartRace(cb) { this.elements.start.addEventListener('click', cb); }
    onRestart(cb) { this.elements.restart.addEventListener('click', cb); }
    onPause(cb) { this.elements.pause.addEventListener('click', cb); }
    onResume(cb) { this.elements.resume.addEventListener('click', cb); }
    onQuitRace(cb) { this.elements.quitRace.addEventListener('click', cb); }
    onReturnToMenu(cb) { this.elements.resultsMenu.addEventListener('click', cb); }
    onMuteToggle(cb) { this.elements.muteButton?.addEventListener('click', cb); }
    getTypingInput() { return this.elements.input; }

    getContentSettings() {
        const s = this.getSettings();
        return { language: s.language, categories: s.categories, difficulty: s.difficulty, mode: s.mode, errorMode: s.errorMode, carSkin: s.carSkin, rules: s.rules };
    }

    showMainMenu() {
        this.showScreen(this.screens.menu);
        this.menuBusy = false;
        if (this.elements.onboardHint) this.elements.onboardHint.hidden = true;
        this.elements.menuStatus.textContent = t('menu.ready');
        this.elements.start.disabled = false;
        this.elements.start.textContent = t('menu.start');
        this.effectsRenderer.clear();
        this.progressionView.renderMenu();
        this.elements.start.focus?.();
    }

    showMenuError(message) {
        this.showScreen(this.screens.menu);
        this.elements.menuStatus.textContent = message;
        this.progressionView.toast(message, 'error');
    }

    setMenuLoading(loading) {
        this.menuBusy = loading;
        this.elements.start.disabled = loading;
        this.elements.start.textContent = t(loading ? 'menu.preparing' : 'menu.start');
        this.elements.menuStatus.textContent = t(loading ? 'menu.loading' : 'menu.ready');
    }

    async runCountdown(seconds, onTick = null) {
        this.countdown.onTick = onTick;
        return this.countdown.run(seconds);
    }

    showRace(challenge) {
        this.showScreen(this.screens.race);
        this.elements.input.value = '';
        this.elements.input.disabled = true;
        this.elements.input.blur();
        this.setTypingChallenge(challenge);
        if (this.elements.raceModeLabel) {
            this.elements.raceModeLabel.textContent = `RACE 01 · ${getRaceMode(this.getSettings().mode).banner} · NIGHT`;
        }
        this.resizeCanvases();
        this.applySkin(this.carSkin || 'classic');
        this.showOnboarding();
        this.setRaceStatus('COUNTDOWN');
    }

    // Instruções mínimas, só até terminar a primeira corrida (o resto se aprende jogando).
    showOnboarding() {
        const hint = this.elements.onboardHint;
        if (!hint) return;
        clearTimeout(this.onboardTimer);
        const seen = StorageService.get(StorageKeys.onboarding, false) === true;
        hint.hidden = seen;
        if (!seen) { this.onboardTimer = setTimeout(() => { hint.hidden = true; }, 15000); this.onboardTimer?.unref?.(); }
    }

    resizeCanvases() { this.trackRenderer?.resize(); this.effectsRenderer?.resize(); this.sceneRenderer?.resize(); }

    setQuality(quality) {
        this.trackRenderer?.setQuality(quality);
        this.sceneRenderer?.setQuality(quality);
        this.effectsRenderer?.setQuality(quality);
        this.elements.raceArea?.classList.toggle('quality-low', quality === 'low');
    }

    setTypingChallenge(challenge) {
        if (this.elements.typingHint) this.elements.typingHint.hidden = true;
        this.hintKey = '';
        this.typingDisplay.reset();
        this.typingDisplay.renderQueue(challenge, [], '');
        this.elements.challenge.classList.remove('phrase-complete');
    }

    renderTypingQueue(currentText, upcomingTexts = [], input = '') {
        if (this.elements.typingHint && !this.elements.typingHint.hidden) this.elements.typingHint.hidden = true;
        this.hintKey = '';
        this.typingUpcomingTexts = [...upcomingTexts];
        this.typingDisplay.renderQueue(currentText, upcomingTexts, input);
        this.elements.challenge.classList.remove('phrase-complete');
    }

    flashPhraseComplete() {
        this.restartClass(this.elements.challenge, 'phrase-complete');
    }

    restartClass(element, className) {
        if (!element) return;
        element.classList.remove(className);
        void element.offsetWidth;
        element.classList.add(className);
    }

    setRaceLocked(locked) {
        this.elements.input.disabled = locked;
        if (!locked) this.elements.input.focus();
        else this.elements.input.blur();
    }

    setPauseAvailable(available) { this.elements.pause.disabled = !available; }

    showPause(visible) {
        this.elements.pauseOverlay.hidden = !visible;
        this.elements.pause.textContent = t(visible ? 'race.resume' : 'race.pause');
        this.setRaceStatus(visible ? 'PAUSED' : 'LIVE');
        if (visible) this.elements.resume.focus();
    }

    setRaceStatus(status) {
        this.elements.raceStatus.textContent = status;
        const spoken = { COUNTDOWN: t('sr.countdown'), LIVE: t('sr.live'), PAUSED: t('sr.paused'), FINISH: t('sr.finish') }[status];
        this.announce(spoken);
    }

    announce(message) {
        if (message && this.elements.announcer) this.elements.announcer.textContent = message;
    }

    setMuted(muted) {
        this.mutedState = muted;
        const button = this.elements.muteButton;
        if (!button) return;
        button.setAttribute('aria-pressed', String(muted));
        button.textContent = t(muted ? 'mute.off' : 'mute.on');
    }

    // ---------- feedback visual de jogo ----------
    showBanner(text, kind = 'info', ms = 1300) {
        const banner = this.elements.raceBanner;
        if (!banner) return;
        banner.textContent = text;
        banner.className = `race-banner show ${kind}`;
        this.restartClass(banner, 'pop');
        clearTimeout(this.bannerTimer);
        this.bannerTimer = setTimeout(() => { banner.className = 'race-banner'; }, ms);
        this.announce(text);
    }

    // Erro bem visível: console treme e fica vermelho, tela toda dá um "tranco" com vinheta vermelha.
    flashError() {
        this.restartClass(this.elements.typingConsole ?? this.elements.challenge, 'error-flash');
        this.restartClass(this.elements.raceArea, 'hit');
    }

    pulseCombo(count) {
        this.restartClass(this.elements.combo, 'combo-pulse');
        this.showBanner(t('banner.combo', { n: count }), 'combo', 900);
    }

    // Mantém confete/pista animando depois que a corrida acaba (antes dos resultados).
    // Depois da chegada os carros seguem "rolando" e desacelerando até a tela de resultados.
    tickEffects(deltaTime) {
        const world = this.world;
        if (!world) { this.effectsRenderer.render(deltaTime, 0); return; }
        const decay = Math.pow(0.4, deltaTime);
        for (const car of [world.car, ...world.opponents]) { car.speed *= decay; car.position += (car.speed / 3.6) * deltaTime; }
        this.renderWorld(world, deltaTime);
    }

    setRevving(on) { this.elements.raceArea.classList.toggle('revving', on); }

    setTurbo(on) {
        if (on === this.turboActive) return;
        this.turboActive = on;
        this.elements.raceArea.classList.toggle('turbo', on);
        this.elements.car.classList.toggle('turbo', on);
        if (on) this.restartClass(this.elements.raceArea, 'kick');
    }

    playTurbo(event) {
        this.showBanner(`${t(`turbo.${event.id}`, null, event.name)}!`, 'turbo', 1300);
        this.setTurbo(true);
    }

    // Chama de partida (como na referência): acende por um instante depois da largada.
    flameOn(ms = 900) {
        const car = this.elements.car;
        car.classList.add('flame');
        clearTimeout(this.flameTimer);
        this.flameTimer = setTimeout(() => car.classList.remove('flame'), ms);
    }

    playLaunch() {
        this.setRevving(false);
        this.elements.raceArea.classList.add('moving');
        this.flameOn(900);
        this.restartClass(this.elements.raceArea, 'launch');
        this.showBanner(t('banner.go'), 'go', 900);
    }

    playOvertake(event) {
        this.showBanner(t(event.type === 'overtake' ? 'banner.overtake' : 'banner.lost', { to: event.to }), event.type === 'overtake' ? 'overtake' : 'lost', 1100);
    }

    playFinish(won, position) {
        this.showBanner(won ? t('banner.win') : t('banner.finish', { n: position }), won ? 'win' : 'info', 1800);
        this.elements.raceArea.classList.add('finishing');
        if (won) this.effectsRenderer.burst();
    }

    resetRaceVisuals() {
        const e = this.elements;
        this.hudCache.clear();
        this.gapKind = '';
        if (this.elements.gapPill) { this.elements.gapPill.textContent = ''; this.elements.gapPill.classList.remove('lead', 'chase'); }
        this.leaderboardKey = '';
        e.wpm.textContent = '0'; e.accuracy.textContent = '100%'; e.errors.textContent = '0'; e.combo.textContent = '0x';
        e.speedNumber.textContent = '0';
        if (e.time) e.time.textContent = '0.0s';
        if (e.distance) e.distance.textContent = '0 m';
        if (e.position) e.position.textContent = '4/4';
        e.progressLabel.textContent = '0%';
        e.gear.textContent = 'N';
        e.speedNeedle.style.setProperty('--needle', '-132deg');
        e.rpmNeedle.style.setProperty('--needle', '-132deg');
        this.progressBar.last = -1;
        this.progressBar.setProgress(0);
        this.carRenderer.reset();
        this.opponentRenderer.clear();
        this.trackRenderer.reset();
        this.sceneRenderer.reset();
        this.world = null;
        this.turboActive = false;
        e.car.classList.remove('turbo', 'flame');
        this.effectsRenderer.clear();
        this.showPause(false);
        e.countdown.hidden = true; e.countdown.textContent = '';
        e.leaderboard.innerHTML = '';
        if (e.raceBanner) e.raceBanner.className = 'race-banner';
        e.raceArea.classList.remove('finishing', 'launch', 'revving', 'turbo', 'moving', 'hit', 'kick');
        this.typingUpcomingTexts = [];
        e.raceArea.style.setProperty('--speed-intensity', '0');
        e.raceArea.style.setProperty('--speed-shift', '0px');
        e.raceArea.style.setProperty('--road-duration', '1.4s');
    }

    // Só toca o DOM quando o texto realmente muda.
    setText(key, element, value) {
        const text = String(value);
        if (!element || this.hudCache.get(key) === text) return;
        this.hudCache.set(key, text);
        element.textContent = text;
    }

    updateTyping(session) {
        const e = this.elements;
        this.setText('wpm', e.wpm, Math.round(session.wpm || 0));
        this.setText('accuracy', e.accuracy, `${Math.round(session.accuracy * 100)}%`);
        this.setText('errors', e.errors, session.incorrectCharacters);
        this.setText('combo', e.combo, `${session.combo}x`);
        this.typingDisplay.renderQueue(session.challenge.text, this.typingUpcomingTexts, session.input);
        this.updateTypingHint(session);
    }

    // Frase "cheia" mas diferente do texto: o erro costuma estar fora da área visível do fluxo.
    updateTypingHint(session) {
        const hint = this.elements.typingHint;
        if (!hint) return;
        const text = session.challenge.text;
        const index = session.firstMismatchIndex;
        const stuck = index !== -1 && session.input.length >= text.length;
        if (!stuck) { if (!hint.hidden) hint.hidden = true; this.hintKey = ''; return; }
        const show = ch => ch === ' ' ? t('key.space') : `“${ch}”`;
        const key = `${index}|${session.input[index]}`;
        if (key === this.hintKey) return;
        this.hintKey = key;
        const context = text.slice(Math.max(0, index - 12), index + 12);
        hint.innerHTML = t('hint.error', { pos: index + 1, expected: this.escape(show(text[index])), typed: this.escape(show(session.input[index])), context: this.escape(context) });
        hint.hidden = false;
    }

    updateCockpit(race, now) {
        if (now - this.lastCockpitAt < COCKPIT_INTERVAL_MS) return;
        this.lastCockpitAt = now;
        const e = this.elements;
        const speed = Math.round(race.car.speed);
        const speedRatio = Math.max(0, Math.min(speed / 320, 1));
        const rpmRatio = Math.max(0, Math.min(speedRatio * 1.18, 1));
        this.setText('speed', e.speedNumber, speed);
        e.speedNeedle.style.setProperty('--needle', `${(-132 + speedRatio * 264).toFixed(1)}deg`);
        e.rpmNeedle.style.setProperty('--needle', `${(-132 + rpmRatio * 264).toFixed(1)}deg`);
        this.setText('gear', e.gear, speed < 15 ? 'N' : Math.min(6, Math.max(1, Math.ceil(speed / 52))));
        e.raceArea.style.setProperty('--speed-intensity', speedRatio.toFixed(2));
        e.raceArea.style.setProperty('--speed-shift', `${(-30 * speedRatio).toFixed(1)}px`);
        e.raceArea.style.setProperty('--road-duration', `${Math.max(0.35, 1.4 - speedRatio * 0.8).toFixed(2)}s`);
    }

    // Reconstrói o HTML só quando a ordem muda; entre mudanças, atualiza apenas as distâncias.
    updateLeaderboard(race, hudDue) {
        const cars = race.getSortedCars();
        let key = '';
        for (let i = 0; i < cars.length; i++) key += `${cars[i].id}|`;
        if (key !== this.leaderboardKey) {
            this.leaderboardKey = key;
            this.elements.leaderboard.innerHTML = cars.map((car, index) => `
            <div class="leaderboard-row ${car.type === 'player' ? 'player' : ''}">
                <span class="leader-position">${index + 1}</span>
                <strong>${this.escape(car.type === 'player' ? t('race.you') : car.name)}</strong>
                <span class="leader-distance">${Math.round(car.position)}m</span>
            </div>`).join('');
            this.leaderboardDistances = [...this.elements.leaderboard.querySelectorAll('.leader-distance')];
            return;
        }
        if (!hudDue) return;
        for (let i = 0; i < cars.length; i++) {
            const text = `${Math.round(cars[i].position)}m`;
            if (this.leaderboardDistances[i] && this.leaderboardDistances[i].textContent !== text) this.leaderboardDistances[i].textContent = text;
        }
    }

    escape(value) {
        return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
    }

    // Desenha o mundo (câmera acompanha o jogador): cenário, pista, carros e efeitos.
    renderWorld(world, deltaTime) {
        const playerPos = world.car.position, speed = world.car.speed;
        this.carRenderer.render(world.car, world.targetDistance, playerPos);
        for (let i = 0; i < world.opponents.length; i++) this.opponentRenderer.render(world.opponents[i], world.targetDistance, playerPos);
        this.sceneRenderer.render(deltaTime, speed, this.turboActive);
        this.trackRenderer.render(deltaTime, speed, { playerPos, target: world.targetDistance }, this.turboActive);
        this.effectsRenderer.update(speed);
        this.effectsRenderer.render(deltaTime, speed, this.turboActive);
    }

    // "Por que estou ganhando/perdendo?": distância até o rival logo à frente, ou vantagem sobre o segundo.
    updateGap(race) {
        const pill = this.elements.gapPill;
        if (!pill) return;
        const cars = race.getSortedCars();
        const index = race.playerPosition - 1;
        let text, kind;
        if (index > 0) {
            const ahead = cars[index - 1];
            text = t('gap.chase', { name: ahead.name, m: Math.max(1, Math.round(ahead.position - race.car.position)) });
            kind = 'chase';
        } else {
            text = t('gap.lead', { m: Math.max(0, Math.round(race.car.position - cars[1].position)) });
            kind = 'lead';
        }
        this.setText('gap', pill, text);
        if (kind !== this.gapKind) { this.gapKind = kind; pill.classList.toggle('lead', kind === 'lead'); pill.classList.toggle('chase', kind === 'chase'); }
    }

    // Palavra concluída: resposta curta e clara (brilho no console + velocidade no cockpit).
    pulseWord() { this.restartClass(this.elements.typingConsole, 'word-pop'); }

    // Chamado todo quadro: canvas/carros a cada quadro; textos e leaderboard com limite de frequência.
    updateRace(race, session, deltaTime = 0.016) {
        const now = performance.now();
        const e = this.elements;
        this.world = race;
        this.renderWorld(race, deltaTime);
        this.progressBar.setProgress(race.progress);
        this.updateCockpit(race, now);

        const hudDue = now - this.lastHudAt >= HUD_INTERVAL_MS;
        if (hudDue) {
            this.lastHudAt = now;
            const t = `${race.elapsedSeconds.toFixed(1)}s`;
            this.setText('time', e.time, t);
            this.setText('timeTop', e.raceTimeTop, t);
            this.setText('distance', e.distance, `${Math.round(race.car.position)} m`);
            this.setText('position', e.position, `${race.playerPosition}/4`);
            this.setText('progressLabel', e.progressLabel, `${Math.round(race.progress * 100)}%`);
            this.setText('wpm', e.wpm, Math.round(session.wpm || 0));
            this.setText('accuracy', e.accuracy, `${Math.round(session.accuracy * 100)}%`);
            this.setText('errors', e.errors, session.incorrectCharacters);
            this.setText('combo', e.combo, `${session.combo}x`);
            this.updateGap(race);
        }
        this.updateLeaderboard(race, hudDue);
    }

    // ---------- resultados / registros (delegam às subpartes) ----------
    showResults(result, isBest, progression = null) {
        const e = this.elements;
        e.raceArea.classList.remove('finishing');
        e.resultTitle.textContent = t(result.playerWon ? 'result.win' : 'result.finished');
        e.resultWinner.textContent = '';
        if (e.recordDetails) e.recordDetails.hidden = true;
        if (e.recordDetailsToggle) { e.recordDetailsToggle.textContent = t('result.details'); e.recordDetailsToggle.setAttribute('aria-expanded', 'false'); }
        e.resultWpm.textContent = Math.round(result.wpm || 0);
        e.resultAccuracy.textContent = `${Math.round(result.accuracy * 100)}%`;
        e.resultErrors.textContent = result.errors;
        e.resultTime.textContent = `${result.timeSeconds.toFixed(1)}s`;
        e.resultSpeed.textContent = `${Math.round(result.maxSpeed)} km/h`;
        e.resultPosition.textContent = `${result.position}/4`;
        e.resultPhrases.textContent = result.phrasesCompleted;
        e.resultBest.textContent = isBest ? t('result.bestRecord') : '—';
        if (e.resultConfig) e.resultConfig.textContent = this.recordsView.describeConfig(result);
        this.progressionView.renderResult(progression);
        this.renderInsights(result);
        this.showScreen(this.screens.results);
        e.restart.focus?.();
        this.announce(`${t(result.playerWon ? 'sr.win' : 'sr.finished')} ${t('sr.result', { pos: result.position })}${progression?.leveledUp ? ` ${t('sr.levelUp', { level: progression.levelAfter })}` : ''}`);
        StorageService.set(StorageKeys.onboarding, true); // instruções rápidas só na 1ª corrida
    }

    // Análise pós-corrida (fora da corrida, para não distrair): gráfico de WPM e teclas mais erradas.
    renderInsights(result) {
        const box = this.elements.resultInsights;
        if (!box) return;
        const series = result.wpmSeries || [];
        const misses = result.topMisses || [];
        box.hidden = series.length < 3 && !misses.length;
        if (box.hidden) return;
        const key = k => k === ' ' ? t('key.space') : k;
        if (this.elements.resultMisses) {
            this.elements.resultMisses.textContent = misses.length ? t('insights.misses', { list: misses.map(m => `${key(m.key)} (${m.count}×)`).join(', ') }) : t('insights.none');
        }
        if (!this.elements.resultChart) return;
        if (series.length < 3) { this.elements.resultChart.innerHTML = ''; return; }
        const w = 320, h = 70, max = Math.max(...series, 10);
        const points = series.map((v, i) => `${(i / (series.length - 1) * w).toFixed(1)},${(h - 4 - (v / max) * (h - 12)).toFixed(1)}`).join(' ');
        const avg = Math.round(series.reduce((a, b) => a + b, 0) / series.length);
        const peak = Math.max(...series);
        this.elements.resultChart.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${t('insights.chartAria', { avg, peak })}" preserveAspectRatio="none"><polyline fill="none" stroke="#55d6ff" stroke-width="2" points="${points}"/></svg><small>${t('insights.chartCaption', { avg, peak })}</small>`;
    }

    toast(message, kind) { this.progressionView.toast(message, kind); }
    exportRecords() { return this.recordsView.exportRecords(); }
    async importRecords(file) { return this.recordsView.importRecords(file); }
    renderMenuRecords() { return this.recordsView.renderMenuRecords(); }
    renderRecords() { return this.recordsView.renderRecords(); }
}
