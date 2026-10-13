import { UIConfig } from '../config/UIConfig.js';
import { getRaceMode } from '../config/RaceModes.js';
import { CarRenderer } from '../rendering/CarRenderer.js';
import { OpponentRenderer } from '../rendering/OpponentRenderer.js';
import { EffectsRenderer } from '../rendering/EffectsRenderer.js';
import { TrackRenderer } from '../rendering/TrackRenderer.js';
import { Countdown } from './components/Countdown.js';
import { TypingDisplay } from './components/TypingDisplay.js';
import { ProgressBar } from './components/ProgressBar.js';
import { RecordsView } from './RecordsView.js';
import { ProgressionView } from './ProgressionView.js';
import { SettingsService } from '../services/SettingsService.js';
import { Logger } from '../services/Logger.js';
import { resolveSkin } from '../config/Unlocks.js';

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
            trackCanvas: 'track-canvas', effectsCanvas: 'effects-canvas', raceBanner: 'race-banner', muteButton: 'mute-button',
            announcer: 'sr-announcer', typingHint: 'typing-hint', errorMode: 'error-mode', skinPicker: 'skin-picker', resultInsights: 'result-insights', resultChart: 'result-chart', resultMisses: 'result-misses', toastRegion: 'toast-region',
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
        if (this.trackRenderer.active) this.elements.raceArea.classList.add('track-canvas-active');
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

    persistSettings() {
        SettingsService.save(this.getSettings());
        this.refreshSettingsSummaries();
    }

    refreshSettingsSummaries() {
        const e = this.elements;
        const chosen = e.topics.filter(i => i.checked && i.value !== 'mixed' && i.value !== 'all');
        if (e.topicsSummary) e.topicsSummary.textContent = chosen.length === 4 ? 'Todos os temas' : `${chosen.length} tema(s)`;
        if (e.rulesSummary) {
            const r = this.getSettings().rules;
            e.rulesSummary.textContent = Object.values(r).every(Boolean) ? 'Completa' : Object.values(r).every(v => !v) ? 'Simplificada' : 'Personalizada';
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
        this.elements.menuStatus.textContent = 'Escolha o idioma e os temas para a próxima corrida.';
        this.elements.start.disabled = false;
        this.elements.start.textContent = 'COMEÇAR CORRIDA';
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
        this.elements.start.disabled = loading;
        this.elements.start.textContent = loading ? 'PREPARANDO PISTA...' : 'COMEÇAR CORRIDA';
        this.elements.menuStatus.textContent = loading
            ? 'Carregando pista, adversários e sequência de digitação...'
            : 'Preparado para largar? O texto nunca para de chegar.';
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
        this.setRaceStatus('COUNTDOWN');
    }

    resizeCanvases() { this.trackRenderer?.resize(); this.effectsRenderer?.resize(); }

    setQuality(quality) {
        this.trackRenderer?.setQuality(quality);
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
        this.elements.pause.textContent = visible ? 'CONTINUAR' : 'PAUSAR';
        this.setRaceStatus(visible ? 'PAUSED' : 'LIVE');
        if (visible) this.elements.resume.focus();
    }

    setRaceStatus(status) {
        this.elements.raceStatus.textContent = status;
        const spoken = { COUNTDOWN: 'Contagem regressiva', LIVE: 'Corrida iniciada', PAUSED: 'Corrida pausada', FINISH: 'Corrida finalizada' }[status];
        this.announce(spoken);
    }

    announce(message) {
        if (message && this.elements.announcer) this.elements.announcer.textContent = message;
    }

    setMuted(muted) {
        const button = this.elements.muteButton;
        if (!button) return;
        button.setAttribute('aria-pressed', String(muted));
        button.textContent = muted ? 'SOM: OFF' : 'SOM: ON';
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

    flashError() { this.restartClass(this.elements.typingConsole ?? this.elements.challenge, 'error-flash'); }

    pulseCombo(count) {
        this.restartClass(this.elements.combo, 'combo-pulse');
        this.showBanner(`COMBO ${count}x`, 'combo', 900);
    }

    // Mantém confete/pista animando depois que a corrida acaba (antes dos resultados).
    tickEffects(deltaTime) { this.effectsRenderer.render(deltaTime, 0); }

    setRevving(on) { this.elements.raceArea.classList.toggle('revving', on); }

    playLaunch() {
        this.setRevving(false);
        this.restartClass(this.elements.raceArea, 'launch');
        this.showBanner('LARGADA!', 'go', 900);
    }

    playOvertake(event) {
        this.showBanner(event.type === 'overtake' ? `ULTRAPASSAGEM · ${event.to}º` : `PERDEU POSIÇÃO · ${event.to}º`, event.type === 'overtake' ? 'overtake' : 'lost', 1100);
    }

    playFinish(won, position) {
        this.showBanner(won ? 'BANDEIRA QUADRICULADA!' : `CHEGADA · ${position}º LUGAR`, won ? 'win' : 'info', 1800);
        this.elements.raceArea.classList.add('finishing');
        if (won) this.effectsRenderer.burst();
    }

    resetRaceVisuals() {
        const e = this.elements;
        this.hudCache.clear();
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
        this.effectsRenderer.clear();
        this.showPause(false);
        e.countdown.hidden = true; e.countdown.textContent = '';
        e.leaderboard.innerHTML = '';
        if (e.raceBanner) e.raceBanner.className = 'race-banner';
        e.raceArea.classList.remove('finishing', 'launch', 'revving');
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
        const show = ch => ch === ' ' ? 'espaço' : `“${ch}”`;
        const key = `${index}|${session.input[index]}`;
        if (key === this.hintKey) return;
        this.hintKey = key;
        const context = text.slice(Math.max(0, index - 12), index + 12);
        hint.innerHTML = `Há um erro na posição <b>${index + 1}</b>: esperado <b>${this.escape(show(text[index]))}</b> e você digitou <b>${this.escape(show(session.input[index]))}</b> (…${this.escape(context)}…). Use <kbd>Backspace</kbd> até ali — ou <kbd>Ctrl</kbd>+<kbd>Backspace</kbd> apaga palavra por palavra.`;
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
                <strong>${this.escape(car.name)}</strong>
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

    // Chamado todo quadro: canvas/carros a cada quadro; textos e leaderboard com limite de frequência.
    updateRace(race, session, deltaTime = 0.016) {
        const now = performance.now();
        const e = this.elements;
        this.carRenderer.render(race.car, race.targetDistance);
        for (let i = 0; i < race.opponents.length; i++) this.opponentRenderer.render(race.opponents[i], race.targetDistance);
        this.trackRenderer.render(deltaTime, race.car.speed);
        this.effectsRenderer.update(race.car.speed);
        this.effectsRenderer.render(deltaTime, race.car.speed);
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
        }
        this.updateLeaderboard(race, hudDue);
    }

    // ---------- resultados / registros (delegam às subpartes) ----------
    showResults(result, isBest, progression = null) {
        const e = this.elements;
        e.raceArea.classList.remove('finishing');
        e.resultTitle.textContent = result.playerWon ? 'VITÓRIA' : 'CORRIDA FINALIZADA';
        e.resultWinner.textContent = '';
        if (e.recordDetails) e.recordDetails.hidden = true;
        if (e.recordDetailsToggle) { e.recordDetailsToggle.textContent = 'DETALHES DA CORRIDA'; e.recordDetailsToggle.setAttribute('aria-expanded', 'false'); }
        e.resultWpm.textContent = Math.round(result.wpm || 0);
        e.resultAccuracy.textContent = `${Math.round(result.accuracy * 100)}%`;
        e.resultErrors.textContent = result.errors;
        e.resultTime.textContent = `${result.timeSeconds.toFixed(1)}s`;
        e.resultSpeed.textContent = `${Math.round(result.maxSpeed)} km/h`;
        e.resultPosition.textContent = `${result.position}/4`;
        e.resultPhrases.textContent = result.phrasesCompleted;
        e.resultBest.textContent = isBest ? 'NOVO RECORDE DE TEMPO' : '—';
        if (e.resultConfig) e.resultConfig.textContent = this.recordsView.describeConfig(result);
        this.progressionView.renderResult(progression);
        this.renderInsights(result);
        this.showScreen(this.screens.results);
        e.restart.focus?.();
        this.announce(`${result.playerWon ? 'Vitória' : 'Corrida finalizada'}. Posição ${result.position} de 4.${progression?.leveledUp ? ` Novo nível ${progression.levelAfter}.` : ''}`);
    }

    // Análise pós-corrida (fora da corrida, para não distrair): gráfico de WPM e teclas mais erradas.
    renderInsights(result) {
        const box = this.elements.resultInsights;
        if (!box) return;
        const series = result.wpmSeries || [];
        const misses = result.topMisses || [];
        box.hidden = series.length < 3 && !misses.length;
        if (box.hidden) return;
        const key = k => k === ' ' ? 'espaço' : k;
        if (this.elements.resultMisses) {
            this.elements.resultMisses.textContent = misses.length ? `Teclas mais erradas: ${misses.map(m => `${key(m.key)} (${m.count}×)`).join(', ')}` : 'Nenhum erro de tecla nesta corrida.';
        }
        if (!this.elements.resultChart) return;
        if (series.length < 3) { this.elements.resultChart.innerHTML = ''; return; }
        const w = 320, h = 70, max = Math.max(...series, 10);
        const points = series.map((v, i) => `${(i / (series.length - 1) * w).toFixed(1)},${(h - 4 - (v / max) * (h - 12)).toFixed(1)}`).join(' ');
        const avg = Math.round(series.reduce((a, b) => a + b, 0) / series.length);
        this.elements.resultChart.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="WPM ao longo da corrida: média ${avg}, pico ${Math.max(...series)}" preserveAspectRatio="none"><polyline fill="none" stroke="#55d6ff" stroke-width="2" points="${points}"/></svg><small>média ${avg} · pico ${Math.max(...series)} WPM</small>`;
    }

    toast(message, kind) { this.progressionView.toast(message, kind); }
    exportRecords() { return this.recordsView.exportRecords(); }
    async importRecords(file) { return this.recordsView.importRecords(file); }
    renderMenuRecords() { return this.recordsView.renderMenuRecords(); }
    renderRecords() { return this.recordsView.renderRecords(); }
}
