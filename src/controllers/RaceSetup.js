import { getRaceMode } from '../config/RaceModes.js';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// Monta (sem efeitos colaterais) a configuração da corrida a partir das opções e da dificuldade.
// A dificuldade ajusta os rivais gradualmente, sem multiplicar toda a velocidade-base por até 1.8x.
export function buildRaceSetup(settings, baseConfig, difficulty) {
    const mode = getRaceMode(settings?.mode);
    const difficultySpeed = clamp(Number(difficulty?.speed) || 0.96, 0.58, 1.8);
    const opponentSpeedFactor = clamp(0.88 + (difficultySpeed - 0.58) * (0.30 / 1.22), 0.88, 1.18);
    const raceConfig = {
        ...baseConfig,
        race: { ...baseConfig.race, targetDistance: mode.distance },
        opponents: baseConfig.opponents.map(opponent => ({
            ...opponent,
            baseSpeed: opponent.baseSpeed * opponentSpeedFactor,
            skill: Math.min(1, opponent.skill * (0.9 + difficultySpeed * 0.1))
        }))
    };
    return { mode, targetDistance: mode.distance, difficultySpeed, opponentSpeedFactor, raceConfig };
}
