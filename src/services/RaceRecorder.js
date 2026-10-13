import { RaceResult } from '../domain/race/RaceResult.js';
import { StorageService } from './StorageService.js';
import { AdaptiveDifficultyService } from './AdaptiveDifficultyService.js';
import { ProgressionService } from './ProgressionService.js';
import { Logger } from './Logger.js';
import { bus } from '../core/EventBus.js';

const MAX_STORED_WPM = 500;

// Fluxo ÚNICO para finalizar e registrar uma corrida.
// Cada etapa é isolada: se uma falhar, as demais continuam e a tela de resultados ainda aparece.
export class RaceRecorder {
    static finalize({ race, session, context, now = new Date() }) {
        const errors = [];
        const step = (name, fn, fallback = null) => {
            try { return fn(); } catch (error) {
                errors.push({ step: name, message: String(error?.message ?? error) });
                Logger.error('recorder', `etapa "${name}" falhou`, { error: String(error?.stack ?? error) });
                return fallback;
            }
        };

        const result = new RaceResult({
            // Limite de sanidade: valores absurdos (rajada de teclas) nunca podem ser gravados,
            // senão o próprio histórico seria rejeitado na validação de importação.
            wpm: Math.min(Math.max(Number(session.wpm) || 0, 0), MAX_STORED_WPM),
            accuracy: session.accuracy,
            errors: session.incorrectCharacters,
            timeSeconds: race.elapsedSeconds,
            maxSpeed: race.maxPlayerSpeed,
            position: race.playerPosition,
            phrasesCompleted: context.phrasesCompleted,
            winner: race.winnerName,
            playerWon: race.playerWon,
            bestCombo: session.bestCombo,
            difficultyMode: context.settings?.difficulty || 'medium',
            difficultyLabel: context.difficulty?.label || 'Médio',
            difficultySpeed: context.difficulty?.speed || 0.96,
            modeLabel: context.modeLabel || 'Sprint · 2,4 km',
            language: context.settings?.language || 'pt',
            categories: context.settings?.categories || [],
            rules: context.settings?.rules || {},
            distance: race.targetDistance,
            wpmSeries: context.wpmSeries || [],
            topMisses: session.topMisses ? session.topMisses(5) : [],
            date: now.toISOString()
        });

        step('adaptive', () => AdaptiveDifficultyService.record(result));
        const history = step('history', () => StorageService.saveResult(result), false);
        const isBest = step('best', () => StorageService.saveBest(result), false);
        const progression = step('progression', () => ProgressionService.processRace(result, { isBest, now }), null);

        Logger.info('recorder', 'corrida registrada', { id: result.id, position: result.position, wpm: Math.round(result.wpm), accuracy: +result.accuracy.toFixed(3), history, isBest, xp: progression?.xpGained ?? null, errors: errors.length });
        const summary = { result, isBest, progression, errors };
        bus.emit('race:recorded', summary);
        return summary;
    }
}
