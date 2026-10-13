import { ProgressionConfig } from '../../config/ProgressionConfig.js';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function xpToNext(level, cfg = ProgressionConfig.level) {
    return Math.round(cfg.baseXp * Math.pow(Math.max(1, level), cfg.exponent));
}

export function totalXpForLevel(level, cfg = ProgressionConfig.level) {
    let sum = 0;
    for (let l = 1; l < level; l++) sum += xpToNext(l, cfg);
    return sum;
}

export function levelFromXp(totalXp, cfg = ProgressionConfig.level) {
    let remaining = Math.max(0, Math.floor(Number(totalXp) || 0));
    let level = 1;
    while (level < cfg.maxLevel) {
        const need = xpToNext(level, cfg);
        if (remaining < need) break;
        remaining -= need;
        level++;
    }
    const maxed = level >= cfg.maxLevel;
    const need = maxed ? 0 : xpToNext(level, cfg);
    return { level, xpIntoLevel: remaining, xpForNext: need, progress: need ? remaining / need : 1, maxed };
}

export function repeatMultiplier(repeatCount, cfg = ProgressionConfig.reward) {
    if (repeatCount < cfg.freeRepeats) return 1;
    return Math.max(cfg.repeatFloor, 1 - (repeatCount - cfg.freeRepeats + 1) * cfg.repeatStep);
}

export function raceFingerprint(result) {
    return [result.modeLabel, result.difficultyMode, result.language, (result.categories || []).slice().sort().join('+')].join('|');
}

// Recompensa de uma corrida. `context.repeatCount` = corridas já premiadas hoje com a mesma configuração.
export function calculateRaceReward(result, context = {}, cfg = ProgressionConfig.reward) {
    const flags = [];
    const rawWpm = Number(result.wpm) || 0;
    if (rawWpm > cfg.wpmCap) flags.push('wpm-capped');
    const wpm = clamp(rawWpm, 0, cfg.wpmCap);
    const accuracy = clamp(Number(result.accuracy) || 0, 0, 1);
    const distanceFactor = clamp((Number(result.distance) || 2400) / 2400, 0.5, 4.5);
    const diffFactor = clamp(0.8 + ((Number(result.difficultySpeed) || 0.96) - 0.58) * 0.45, 0.8, 1.4);
    const lowQuality = (Number(result.phrasesCompleted) || 0) < cfg.minPhrases || accuracy < cfg.minAccuracy;

    const parts = [{ id: 'participation', label: 'Participação', xp: cfg.participation * distanceFactor * (lowQuality ? cfg.lowQualityFactor : 1) }];
    if (lowQuality) flags.push('low-quality');
    else {
        parts.push({ id: 'speed', label: 'Velocidade', xp: Math.max(0, wpm - cfg.speedFloorWpm) * cfg.speedPerWpm * distanceFactor * diffFactor });
        parts.push({ id: 'accuracy', label: 'Precisão', xp: accuracy >= cfg.accuracyFloor ? (accuracy - cfg.accuracyFloor) / (1 - cfg.accuracyFloor) * cfg.accuracyMax * distanceFactor : 0 });
        parts.push({ id: 'position', label: 'Posição', xp: cfg.positionBonus[result.position] ?? 0 });
        if (context.isBest) parts.push({ id: 'record', label: 'Novo recorde', xp: cfg.recordBonus });
    }

    const multiplier = repeatMultiplier(Math.max(0, context.repeatCount || 0), cfg);
    if (multiplier < 1) flags.push('repeat-decay');
    const finalParts = parts.map(p => ({ ...p, xp: Math.round(p.xp * multiplier) })).filter(p => p.xp > 0);
    return { total: finalParts.reduce((s, p) => s + p.xp, 0), parts: finalParts, multiplier, flags };
}
