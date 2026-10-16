import { Race } from '../domain/race/Race.js';
import { TypingChallenge } from '../domain/typing/TypingChallenge.js';
import { TypingSession } from '../domain/typing/TypingSession.js';
import { ChallengeSequence } from '../domain/typing/ChallengeSequence.js';
import { TypingQueue } from '../domain/typing/TypingQueue.js';
import { InputController } from './InputController.js';
import { buildRaceSetup } from './RaceSetup.js';
import { TypingSystem } from '../systems/TypingSystem.js';
import { RaceSystem } from '../systems/RaceSystem.js';
import { GamePhase } from '../core/GameState.js';
import { AudioService } from '../services/AudioService.js';
import { AssetService } from '../services/AssetService.js';
import { ContentService } from '../services/ContentService.js';
import { SettingsService } from '../services/SettingsService.js';
import { AdaptiveDifficultyService } from '../services/AdaptiveDifficultyService.js';
import { RaceRecorder } from '../services/RaceRecorder.js';
import { TypingDiagnostics } from '../services/TypingDiagnostics.js';
import { Logger } from '../services/Logger.js';
import { t } from '../i18n/I18n.js';
import { eventTitle } from '../ui/ProgressionView.js';
import { skinsUnlockedBetween } from '../config/Unlocks.js';
import { tierForCombo } from '../domain/race/TurboRules.js';

// Reduz a série a no máximo `max` pontos (média por bloco) para guardar e desenhar.
export function downsample(values, max) {
    if (values.length <= max) return [...values];
    const out = [], step = values.length / max;
    for (let i = 0; i < max; i++) {
        const slice = values.slice(Math.floor(i * step), Math.max(Math.floor(i * step) + 1, Math.floor((i + 1) * step)));
        out.push(Math.round(slice.reduce((a, b) => a + b, 0) / slice.length));
    }
    return out;
}

const isComboMilestone = combo => combo === 10 || combo === 25 || combo === 50 || (combo >= 100 && combo % 50 === 0);

// Responsabilidade: orquestrar o ciclo de uma corrida (menu → contagem → corrida → pausa → fim).
// Não monta HTML (UIManager), não calcula XP nem grava dados (RaceRecorder), não escolhe frases (ContentService).
export class RaceController {
    constructor(state, ui, config, services = {}) {
        this.state = state;
        this.ui = ui;
        this.config = config;

        this.race = null;
        this.typingSession = null;
        this.typingSystem = null;
        this.raceSystem = null;
        this.inputController = null;
        this.challengeSequence = null;
        this.typingQueue = null;

        this.phrasesCompleted = 0;
        this.starting = false;
        this.finishedHandled = false;
        this.phrasesPromise = null;
        this.finishTimer = null;
        this.finishPromise = null;
        this.finishDelayMs = config.ui?.finishDelayMs ?? 1500;

        this.audio = services.audio ?? new AudioService();
        this.assets = services.assets ?? new AssetService();
        this.recorder = services.recorder ?? RaceRecorder;
    }

    initialize() {
        this.ui.onStartRace(() => void this.startRace());
        this.ui.onRestart(() => void this.startRace());
        this.ui.onPause(() => this.togglePause());
        this.ui.onResume(() => this.resumeRace());
        this.ui.onQuitRace(() => this.returnToMenu());
        this.ui.onReturnToMenu(() => this.returnToMenu());
        this.ui.onMuteToggle?.(() => this.ui.setMuted?.(this.audio.toggleMute()));
        this.ui.setMuted?.(this.audio.muted);

        // ESC continua funcionando mesmo com o campo de texto desabilitado.
        this.globalKeyHandler = (event) => {
            if (event.key === 'Escape' && (this.state.is(GamePhase.RACING) || this.state.is(GamePhase.PAUSED))) {
                event.preventDefault();
                event.stopPropagation();
                this.togglePause();
            }
        };
        document.addEventListener('keydown', this.globalKeyHandler);

        // Aba em segundo plano: pausa automaticamente (o relógio da corrida não pode correr sozinho).
        this.visibilityHandler = () => {
            if (document.hidden && this.state.is(GamePhase.RACING)) {
                Logger.info('race', 'pausa automática (aba oculta)');
                this.togglePause();
            }
        };
        document.addEventListener('visibilitychange', this.visibilityHandler);
    }

    // O conteúdo editável do jogo fica em public/data/words/phrases.json.
    async loadPhrases(language = 'pt', categories = ['computing', 'science', 'people', 'code']) {
        if (!this.phrasesPromise) this.phrasesPromise = ContentService.load(this.assets);
        return ContentService.select(await this.phrasesPromise, language, categories);
    }

    isCodeText(text) { return ContentService.isCodeText(text); }

    async startRace() {
        if (this.starting) return;

        this.cancelFinishSequence();
        this.starting = true;
        this.finishedHandled = false;
        this.stuckLogged = false;
        this.turboShown = false;
        this.lastAcceptedValue = '';
        this.wpmSamples = [];
        this.nextSampleAt = 1;
        this.phrasesCompleted = 0;
        this.ui.setMenuLoading(true);

        try {
            this.audio.initialize();
            this.audio.stopEngine();

            const settings = this.ui.getContentSettings();
            const rawPhrases = await this.loadPhrases(settings.language, settings.categories);
            const phrases = rawPhrases.map(text => SettingsService.normalizeText(text, settings.rules, this.isCodeText(text))).filter(Boolean);

            this.activeSettings = settings;
            this.activeDifficulty = AdaptiveDifficultyService.choose(settings.difficulty);
            const setup = buildRaceSetup(settings, this.config, this.activeDifficulty);
            this.activeDifficulty.speed = setup.difficultySpeed;
            this.activeModeLabel = setup.mode.label;

            this.challengeSequence = new ChallengeSequence(phrases.length ? phrases : rawPhrases, { shuffle: true });
            this.typingQueue = new TypingQueue(this.challengeSequence, this.config.typing?.previewCount ?? 4);

            this.race = new Race(setup.raceConfig);
            this.createTypingSession();
            this.raceSystem = new RaceSystem(this.race, this.typingSession, setup.raceConfig);

            this.inputController?.disable();
            this.inputController = new InputController(
                this.ui.getTypingInput(),
                value => this.handleTyping(value),
                event => this.handleKeyDown(event)
            );

            this.state.setPhase(GamePhase.COUNTDOWN);

            this.ui.showRace(this.typingQueue.currentText);
            this.ui.resetRaceVisuals();
            this.ui.renderTypingQueue(this.typingQueue.currentText, this.typingQueue.upcomingTexts, '');
            this.ui.setRaceLocked(true);
            this.ui.setPauseAvailable(false);
            this.ui.setRevving?.(true);

            await this.ui.runCountdown(3, value => {
                if (value === 'GO') { this.audio.sfx('go'); return; }
                this.audio.sfx('countdown', value);
                this.audio.sfx('rev', 4 - value);
            });

            if (!this.state.is(GamePhase.COUNTDOWN)) return;

            this.state.setPhase(GamePhase.RACING);
            this.race.start();
            this.typingSession.start();
            this.raceSystem.setTypingSession(this.typingSession);
            TypingDiagnostics.log('race-start', { mode: settings.mode, difficulty: this.activeDifficulty.id || settings.difficulty, targetDistance: setup.targetDistance, phraseCount: phrases.length });

            this.ui.playLaunch?.();
            this.audio.startEngine();
            this.ui.setRaceStatus('LIVE');
            this.ui.setRaceLocked(false);
            this.ui.setPauseAvailable(true);
            this.inputController.enable();
        } catch (error) {
            Logger.error('race', 'falha ao iniciar corrida', { error: String(error?.stack ?? error) });
            this.abortRaceStart();
            this.ui.setMenuLoading(false);
            this.ui.showMenuError(t('menu.startError'));
        } finally {
            this.starting = false;
            this.ui.setMenuLoading(false);
        }
    }

    abortRaceStart() {
        TypingDiagnostics.log('race-aborted', { phase: this.state.phase });
        this.inputController?.disable();
        this.audio.stopEngine();
        this.clearRaceReferences();
        this.state.setPhase(GamePhase.MENU);
    }

    clearRaceReferences() {
        this.race = null;
        this.raceSystem = null;
        this.typingSession = null;
        this.typingSystem = null;
        this.typingQueue = null;
    }

    createTypingSession() {
        this.typingSession = new TypingSession(new TypingChallenge(this.typingQueue.currentText), this.config.typing);
        this.typingSystem = new TypingSystem(this.typingSession);
    }

    handleKeyDown(event) {
        if (event.key.toLowerCase() === 'r' && this.state.is(GamePhase.FINISHED)) {
            event.preventDefault();
            void this.startRace();
        }
    }

    handleTyping(value) {
        if (!this.state.is(GamePhase.RACING)) return;

        const session = this.typingSession;
        const previousErrors = session.incorrectCharacters;
        const previousCombo = session.combo;
        const previousInputLength = session.input.length;

        // O valor do campo fica intacto (cursor/rolagem nativos); só o valor normalizado vai ao domínio.
        const rules = this.activeSettings?.rules || SettingsService.defaults().rules;
        const isCode = this.isCodeText(session.challenge.text);
        const normalized = SettingsService.normalizeInput(value, rules, isCode);

        // "Corrigir na hora" (padrão): uma tecla errada é recusada (conta como erro) e o campo volta
        // ao último valor correto. Evita erros escondidos no meio de frases longas.
        if ((this.activeSettings?.errorMode ?? 'strict') === 'strict' && !session.challenge.text.startsWith(normalized)) {
            session.registerRejectedKey();
            this.race?.stumble();
            this.inputController.setValue(this.lastAcceptedValue);
            this.ui.updateTyping(session, this.phrasesCompleted);
            this.ui.flashError?.();
            this.audio.sfx('error');
            return;
        }
        this.lastAcceptedValue = value;

        this.typingSystem.process(normalized);
        this.ui.updateTyping(session, this.phrasesCompleted);

        const completedWord = session.input.length > previousInputLength && (session.input.endsWith(' ') || session.isComplete) && session.incorrectCharacters === previousErrors;
        const turboTier = session.combo > previousCombo ? tierForCombo(session.combo) : null;
        if (session.incorrectCharacters > previousErrors) {
            this.race?.stumble();
            this.ui.flashError?.();
            this.audio.sfx('error');
        } else if (turboTier) {
            this.race?.activateTurbo(turboTier); // o banner/áudio saem do evento 'turbo' no próximo quadro
        } else if (session.combo !== previousCombo && isComboMilestone(session.combo)) {
            this.ui.pulseCombo?.(session.combo);
            this.audio.sfx('combo');
        }

        if (completedWord) { this.ui.pulseWord?.(); this.audio.sfx('word'); }
        if (session.isComplete) this.completePhrase();
        else this.logStuckPhrase(session);
    }

    // Registra (uma vez por frase) quando o texto está "cheio" mas diferente, com os códigos dos
    // caracteres: revela espaços/acentos invisíveis ou teclas trocadas. Veja com velocityType.logs().
    logStuckPhrase(session) {
        const text = session.challenge.text;
        if (this.stuckLogged || session.input.length < text.length) return;
        const index = session.firstMismatchIndex;
        if (index === -1) return;
        this.stuckLogged = true;
        TypingDiagnostics.log('typing-invariant', {
            reason: 'frase cheia com erro oculto', index,
            expectedCode: text.codePointAt(index), typedCode: session.input.codePointAt(index),
            expected: text.slice(Math.max(0, index - 6), index + 6), typed: session.input.slice(Math.max(0, index - 6), index + 6)
        });
    }

    completePhrase() {
        TypingDiagnostics.log('challenge-complete', {
            completed: this.phrasesCompleted + 1, textLength: this.typingSession.challenge.length,
            inputLength: this.typingSession.input.length, errors: this.typingSession.incorrectCharacters
        });
        this.phrasesCompleted++;
        this.stuckLogged = false;
        this.lastAcceptedValue = '';
        this.audio.sfx('phrase');

        const nextChallenge = this.typingQueue.advance();
        this.typingSession.advanceTo(nextChallenge);
        this.raceSystem.setTypingSession(this.typingSession);

        this.ui.renderTypingQueue(this.typingQueue.currentText, this.typingQueue.upcomingTexts, '');
        this.inputController.clear();
        TypingDiagnostics.log('input-cleared', { nextTextLength: nextChallenge.length, fieldLength: this.ui.getTypingInput()?.value?.length ?? null });
        this.ui.flashPhraseComplete();
    }

    togglePause() {
        if (!this.race) return;

        if (this.state.is(GamePhase.RACING)) {
            this.state.setPhase(GamePhase.PAUSED);
            this.race.pause();
            this.typingSession?.pause();
            this.audio.stopEngine();
            TypingDiagnostics.log('race-paused', { elapsedSeconds: this.race.elapsedSeconds, distance: this.race.car?.position ?? null });
            this.inputController?.disable();
            this.ui.setRaceLocked(true);
            this.ui.showPause(true);
            return;
        }

        if (this.state.is(GamePhase.PAUSED)) this.resumeRace();
    }

    resumeRace() {
        if (!this.race || !this.state.is(GamePhase.PAUSED)) return;
        this.state.setPhase(GamePhase.RACING);
        this.race.resume();
        this.typingSession?.resume();
        this.audio.startEngine();
        TypingDiagnostics.log('race-resumed', { elapsedSeconds: this.race.elapsedSeconds, distance: this.race.car?.position ?? null });
        this.ui.showPause(false);
        this.ui.setRaceLocked(false);
        this.inputController?.enable();
    }

    returnToMenu() {
        if (this.starting) return;
        this.cancelFinishSequence();
        this.inputController?.disable();
        this.race?.pause?.();
        this.audio.stopEngine();
        this.clearRaceReferences();
        this.challengeSequence = null;
        this.finishedHandled = false;
        this.ui.showPause(false);
        this.ui.setPauseAvailable(false);
        this.ui.setRaceLocked(true);
        this.state.setPhase(GamePhase.MENU);
        this.ui.showMainMenu();
    }

    update(deltaTime) {
        if (this.state.is(GamePhase.FINISHED) && this.finishTimer) {
            this.ui.tickEffects?.(deltaTime); // confete da chegada
            return;
        }
        if (!this.race || !this.raceSystem) return;
        if (!this.state.is(GamePhase.RACING)) return;

        this.raceSystem.update(deltaTime);
        if (this.race.elapsedSeconds >= this.nextSampleAt && this.wpmSamples.length < 3600) {
            this.wpmSamples.push(Math.round(Math.min(this.typingSession.stableWpm || 0, 500)));
            this.nextSampleAt += 1;
        }
        this.ui.updateRace(this.race, this.typingSession, deltaTime);
        this.audio.updateEngine(this.race.car.speed / (this.config.race?.maxSpeedKmh || 320));

        const turboNow = this.race.turboRemaining > 0;
        if (turboNow !== this.turboShown) { this.turboShown = turboNow; this.ui.setTurbo?.(turboNow); }

        for (const event of this.race.drainEvents()) {
            if (event.type === 'turbo') { this.ui.playTurbo?.(event); this.audio.sfx('turbo'); Logger.info('race', 'turbo', event); continue; }
            this.ui.playOvertake?.(event);
            this.audio.sfx(event.type);
            Logger.debug('race', event.type, event);
        }

        if (this.race.finished && !this.finishedHandled) this.finishRace();
    }

    // Único caminho de encerramento: trava a corrida, registra via RaceRecorder, anima a chegada e mostra resultados.
    finishRace() {
        if (this.finishedHandled) return;
        this.finishedHandled = true;

        const race = this.race;
        const session = this.typingSession;
        TypingDiagnostics.log('race-finished', {
            position: race.playerPosition, winner: race.winnerName, elapsedSeconds: race.elapsedSeconds,
            phrasesCompleted: this.phrasesCompleted, targetDistance: race.targetDistance,
            player: { distance: Math.round(race.car.position), speedKmh: Math.round(race.car.speed), maxSpeedKmh: Math.round(race.maxPlayerSpeed) },
            opponents: race.opponents.map(o => ({ name: o.name, distance: Math.round(o.position), speedKmh: Math.round(o.speed), baseSpeedKmh: Math.round(o.baseSpeed), maxSpeedKmh: Math.round(o.maxSpeed) }))
        });

        this.state.setPhase(GamePhase.FINISHED);
        this.turboShown = false;
        this.ui.setTurbo?.(false);
        session.finish();
        this.inputController?.disable();
        this.audio.stopEngine();
        this.ui.setRaceLocked(true);
        this.ui.setPauseAvailable(false);
        this.ui.setRaceStatus('FINISH');

        const summary = this.safeFinalize(race, session);
        this.lastSummary = summary;

        this.ui.playFinish?.(race.playerWon, race.playerPosition);
        this.audio.sfx('finish');
        this.clearRaceReferences();

        if (this.finishDelayMs <= 0) {
            this.presentResults(summary);
            this.finishPromise = Promise.resolve(true);
            return;
        }
        this.finishPromise = new Promise(resolve => {
            this.finishTimer = setTimeout(() => {
                this.finishTimer = null;
                const stillFinished = this.state.is(GamePhase.FINISHED);
                if (stillFinished) this.presentResults(summary);
                resolve(stillFinished);
            }, this.finishDelayMs);
        });
    }

    // Se o registro falhar por completo, o jogador ainda vê o resultado (sem XP) e é avisado.
    safeFinalize(race, session) {
        try {
            return this.recorder.finalize({
                race, session,
                context: { phrasesCompleted: this.phrasesCompleted, settings: this.activeSettings, difficulty: this.activeDifficulty, modeLabel: this.activeModeLabel, wpmSeries: downsample(this.wpmSamples, 60) }
            });
        } catch (error) {
            Logger.error('race', 'falha ao registrar a corrida', { error: String(error?.stack ?? error) });
            const safe = (v, d = 0) => Number.isFinite(v) ? v : d;
            const result = {
                id: `unsaved-${Date.now()}`, wpm: safe(session.wpm), accuracy: safe(session.accuracy, 1), errors: safe(session.incorrectCharacters),
                timeSeconds: safe(race.elapsedSeconds), maxSpeed: safe(race.maxPlayerSpeed), position: race.playerPosition,
                phrasesCompleted: this.phrasesCompleted, winner: race.winnerName, playerWon: race.playerWon, bestCombo: safe(session.bestCombo),
                difficultyLabel: this.activeDifficulty?.label, modeLabel: this.activeModeLabel, language: this.activeSettings?.language,
                categories: this.activeSettings?.categories || [], rules: this.activeSettings?.rules || {}, distance: race.targetDistance, date: new Date().toISOString()
            };
            return { result, isBest: false, progression: null, errors: [{ step: 'finalize', message: String(error?.message ?? error) }] };
        }
    }

    presentResults(summary) {
        const { result, isBest, progression, errors } = summary;
        this.ui.showResults(result, isBest, progression);
        if (progression?.leveledUp) {
            this.audio.sfx('levelup');
            this.ui.toast?.(t('toast.levelup', { level: progression.levelAfter }), 'success');
            for (const skin of skinsUnlockedBetween(progression.levelBefore, progression.levelAfter)) this.ui.toast?.(t('toast.skin', { name: t(`skin.${skin.id}`, null, skin.name) }), 'success');
        }
        for (const event of progression?.events ?? []) {
            if (event.type === 'achievement') { this.audio.sfx('achievement'); this.ui.toast?.(t('toast.achievement', { title: eventTitle(event), xp: event.rewardXp }), 'success'); }
            else if (event.rewardXp) this.ui.toast?.(t('toast.goal', { title: eventTitle(event), xp: event.rewardXp }), 'success');
        }
        if (errors.length || progression?.persisted === false) {
            this.ui.toast?.(t('toast.saveFail'), 'error');
        }
    }

    cancelFinishSequence() {
        if (this.finishTimer) { clearTimeout(this.finishTimer); this.finishTimer = null; }
    }
}
