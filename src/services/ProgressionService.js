import { StorageService, StorageKeys } from './StorageService.js';
import { ProfileService } from './ProfileService.js';
import { Logger } from './Logger.js';
import { bus } from '../core/EventBus.js';
import { PlayerProfile } from '../domain/progression/PlayerProfile.js';
import { calculateRaceReward, levelFromXp, raceFingerprint } from '../domain/progression/XpCalculator.js';
import { createProgressState, sanitizeProgressState, recordRace, localDayKey } from '../domain/progression/ProgressTracker.js';
import { DAILY_POOL, LONG_TERM, ACHIEVEMENTS } from '../domain/progression/Goals.js';

export class ProgressService {
    static load(dayKey = localDayKey()) { return sanitizeProgressState(StorageService.get(StorageKeys.progress), dayKey); }
    static save(state) { return StorageService.set(StorageKeys.progress, state); }
}

// Fluxo único de progressão: XP da corrida + objetivos + conquistas, gravados de uma vez.
export class ProgressionService {
    static processRace(result, { isBest = false, now = new Date() } = {}) {
        const dayKey = localDayKey(now);
        const profile = ProfileService.load(now);
        const progress = ProgressService.load(dayKey);
        const raceAwardId = `race:${result.id}`;

        if (!result.id || profile.awardedIds.includes(raceAwardId)) {
            Logger.warn('progress', 'corrida já processada (sem novo XP)', { id: result.id });
            return { duplicate: true, xpGained: 0, reward: { total: 0, parts: [], flags: ['duplicate'], multiplier: 0 }, events: [], levelBefore: ProfileService.summary(profile).level, levelAfter: ProfileService.summary(profile).level, leveledUp: false, before: ProfileService.summary(profile), after: ProfileService.summary(profile) };
        }

        const before = ProfileService.summary(profile);
        if (profile.daily.dayKey !== dayKey) profile.daily = { dayKey, counts: {} };
        const fp = raceFingerprint(result);
        const repeatCount = profile.daily.counts[fp] ?? 0;

        const reward = calculateRaceReward(result, { repeatCount, isBest });
        PlayerProfile.award(profile, { id: raceAwardId, source: 'race', label: result.modeLabel || 'Corrida', xp: reward.total, breakdown: reward.parts, now });
        profile.daily.counts[fp] = repeatCount + 1;

        const events = recordRace(progress, result, { dayKey, now });
        let bonusXp = 0;
        for (const ev of events) {
            if (!ev.rewardXp) continue;
            const id = ev.scope === 'once' ? `${ev.type}:${ev.id}` : `${ev.type}:${ev.id}:${ev.scope}`;
            if (PlayerProfile.award(profile, { id, source: ev.type, label: ev.title, xp: ev.rewardXp, now })) bonusXp += ev.rewardXp;
        }

        const savedProfile = ProfileService.save(profile);
        const savedProgress = ProgressService.save(progress);
        if (!savedProfile || !savedProgress) Logger.error('progress', 'falha ao persistir progressão', { savedProfile, savedProgress });

        const after = ProfileService.summary(profile);
        const outcome = {
            duplicate: false, reward, events, bonusXp, xpGained: reward.total + bonusXp,
            levelBefore: before.level, levelAfter: after.level, leveledUp: after.level > before.level,
            before, after, persisted: savedProfile && savedProgress
        };
        Logger.info('progress', 'XP concedido', { raceId: result.id, xp: outcome.xpGained, flags: reward.flags, level: `${before.level}→${after.level}`, events: events.map(e => e.id) });
        if (outcome.leveledUp) bus.emit('progress:levelup', outcome);
        for (const ev of events) if (ev.type === 'achievement') bus.emit('progress:achievement', ev);
        return outcome;
    }

    static getOverview(now = new Date()) {
        const dayKey = localDayKey(now);
        const state = ProgressService.load(dayKey);
        // Leitura não reinicia nada: se o dia virou, mostra os desafios do novo dia sem gravar.
        const view = structuredClone(state);
        if (view.dayKey < dayKey) Object.assign(view, createProgressState(dayKey), { stats: state.stats, long: state.long, achievements: state.achievements });
        const profile = ProfileService.load(now);
        return {
            profile: ProfileService.summary(profile),
            history: profile.history,
            dayKey: view.dayKey,
            daily: Object.entries(view.daily).map(([id, entry]) => ({ def: DAILY_POOL.find(g => g.id === id), entry })),
            long: LONG_TERM.map(def => ({ def, entry: view.long[def.id] ?? { progress: Math.min(def.target, view.stats[def.metric] ?? 0), done: false } })),
            achievements: ACHIEVEMENTS.map(def => ({ def, unlockedAt: view.achievements[def.id] ?? null })),
            stats: view.stats
        };
    }
}
export { levelFromXp };
