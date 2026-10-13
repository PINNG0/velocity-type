import test from 'node:test';
import assert from 'node:assert/strict';
import { installMemoryStorage, baseResult } from './helpers/env.js';
import { xpToNext, totalXpForLevel, levelFromXp, calculateRaceReward, repeatMultiplier } from '../src/domain/progression/XpCalculator.js';
import { PlayerProfile } from '../src/domain/progression/PlayerProfile.js';
import { createProgressState, recordRace, pickDailyIds, ensureDay, localDayKey } from '../src/domain/progression/ProgressTracker.js';
import { ProgressionService } from '../src/services/ProgressionService.js';
import { ProfileService } from '../src/services/ProfileService.js';
import { ProgressionConfig } from '../src/config/ProgressionConfig.js';

test('fórmula de níveis é crescente e levelFromXp é o inverso de totalXpForLevel', () => {
    let previous = 0;
    for (let level = 1; level < 60; level++) {
        const need = xpToNext(level);
        assert.ok(need > previous, `nível ${level} deve exigir mais XP que o anterior`);
        previous = need;
        const start = totalXpForLevel(level);
        assert.equal(levelFromXp(start).level, level);
        assert.equal(levelFromXp(start + need - 1).level, level);
        assert.equal(levelFromXp(start + need).level, level + 1);
    }
});

test('fórmula é ajustável pela configuração e respeita o nível máximo', () => {
    const cfg = { baseXp: 10, exponent: 1, maxLevel: 3 };
    assert.equal(xpToNext(1, cfg), 10);
    assert.equal(xpToNext(2, cfg), 20);
    const top = levelFromXp(1e6, cfg);
    assert.equal(top.level, 3);
    assert.equal(top.maxed, true);
    assert.equal(top.progress, 1);
    assert.equal(levelFromXp(-50).level, 1);
    assert.equal(levelFromXp(NaN).level, 1);
});

test('recompensa considera desempenho e é maior com mais WPM, precisão e vitória', () => {
    const weak = calculateRaceReward(baseResult({ wpm: 25, accuracy: 0.9, position: 4, playerWon: false })).total;
    const strong = calculateRaceReward(baseResult({ wpm: 90, accuracy: 1, position: 1 })).total;
    assert.ok(strong > weak * 2, `${strong} deveria superar bastante ${weak}`);
    assert.ok(calculateRaceReward(baseResult({ distance: 10000 })).total > calculateRaceReward(baseResult({ distance: 2400 })).total);
});

test('corrida curta ou imprecisa rende pouco XP e WPM absurdo é limitado', () => {
    const low = calculateRaceReward(baseResult({ phrasesCompleted: 1, wpm: 200 }));
    assert.ok(low.flags.includes('low-quality'));
    assert.ok(low.total <= Math.round(ProgressionConfig.reward.participation * ProgressionConfig.reward.lowQualityFactor));
    const capped = calculateRaceReward(baseResult({ wpm: 5000 }));
    assert.ok(capped.flags.includes('wpm-capped'));
    assert.equal(calculateRaceReward(baseResult({ wpm: 5000 })).total, calculateRaceReward(baseResult({ wpm: ProgressionConfig.reward.wpmCap })).total);
});

test('repetir a mesma configuração reduz o XP gradualmente, com piso', () => {
    assert.equal(repeatMultiplier(0), 1);
    assert.equal(repeatMultiplier(1), 1);
    assert.ok(repeatMultiplier(2) < 1);
    assert.ok(repeatMultiplier(3) < repeatMultiplier(2));
    assert.equal(repeatMultiplier(500), ProgressionConfig.reward.repeatFloor);
    const first = calculateRaceReward(baseResult(), { repeatCount: 0 }).total;
    const tenth = calculateRaceReward(baseResult(), { repeatCount: 9 }).total;
    assert.ok(tenth < first * 0.35);
});

test('PlayerProfile.award é idempotente por id e mantém histórico limitado', () => {
    const p = PlayerProfile.create();
    assert.ok(PlayerProfile.award(p, { id: 'race:1', source: 'race', label: 'x', xp: 120 }));
    assert.equal(PlayerProfile.award(p, { id: 'race:1', source: 'race', label: 'x', xp: 120 }), null);
    assert.equal(p.totalXp, 120);
    for (let i = 0; i < 500; i++) PlayerProfile.award(p, { id: `race:b${i}`, source: 'race', label: 'x', xp: 1 });
    assert.ok(p.history.length <= ProgressionConfig.limits.history);
    assert.ok(p.awardedIds.length <= ProgressionConfig.limits.awardedIds);
});

test('PlayerProfile.sanitize rejeita lixo e recalcula valores seguros', () => {
    const p = PlayerProfile.sanitize({ totalXp: 'abc', awardedIds: [1, 'a'], history: [{ id: '' }, { id: 'ok', xp: -5 }], daily: { counts: { a: -3 } } });
    assert.equal(p.totalXp, 0);
    assert.deepEqual(p.awardedIds, ['a']);
    assert.equal(p.history.length, 1);
    assert.equal(p.history[0].xp, 0);
    assert.equal(PlayerProfile.sanitize(null).totalXp, 0);
    assert.equal(PlayerProfile.sanitize([]).totalXp, 0);
});

test('desafios diários são determinísticos por dia e não reiniciam no mesmo dia', () => {
    assert.deepEqual(pickDailyIds('2026-10-09'), pickDailyIds('2026-10-09'));
    assert.equal(new Set(pickDailyIds('2026-10-09')).size, ProgressionConfig.goals.dailyCount);
    const state = createProgressState('2026-10-09');
    recordRace(state, baseResult({ wpm: 120, accuracy: 1, phrasesCompleted: 40, bestCombo: 80, distance: 6000 }), { dayKey: '2026-10-09' });
    const snapshot = JSON.stringify(state.daily);
    assert.equal(ensureDay(state, '2026-10-09'), 'same');
    assert.equal(JSON.stringify(state.daily), snapshot);
});

test('virada de dia gera novos desafios; relógio voltando não apaga progresso', () => {
    const state = createProgressState('2026-10-09');
    recordRace(state, baseResult(), { dayKey: '2026-10-09' });
    const achievements = { ...state.achievements };
    assert.equal(ensureDay(state, '2026-10-08'), 'clock-behind');
    assert.equal(state.dayKey, '2026-10-09');
    assert.equal(ensureDay(state, '2026-10-10'), 'rolled');
    assert.ok(Object.values(state.daily).every(e => e.progress === 0 && !e.done));
    assert.deepEqual(state.achievements, achievements, 'conquistas persistem na virada do dia');
});

test('conquistas desbloqueiam uma única vez e streak de dias conta dias consecutivos', () => {
    const state = createProgressState('2026-10-01');
    const unlocked = [];
    for (const day of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-03', '2026-10-05']) {
        for (const ev of recordRace(state, baseResult({ wpm: 45 }), { dayKey: day })) if (ev.type === 'achievement') unlocked.push(ev.id);
    }
    assert.equal(new Set(unlocked).size, unlocked.length, 'sem conquistas repetidas');
    assert.ok(unlocked.includes('first-race') && unlocked.includes('speed-40') && unlocked.includes('streak-3'));
    assert.equal(state.stats.streakDays, 1, 'pular um dia reinicia a sequência');
});

test('corrida ignorada (curta/imprecisa) não conta para objetivos nem estatísticas', () => {
    const state = createProgressState('2026-10-09');
    const events = recordRace(state, baseResult({ phrasesCompleted: 0, accuracy: 0.2 }), { dayKey: '2026-10-09' });
    assert.equal(state.stats.races, 0);
    assert.equal(events.filter(e => e.rewardXp).length, 0);
});

test('velocidade só vira conquista com precisão mínima', () => {
    const state = createProgressState('2026-10-09');
    recordRace(state, baseResult({ wpm: 150, accuracy: 0.6 }), { dayKey: '2026-10-09' });
    assert.equal(state.stats.bestWpm, 0);
    recordRace(state, baseResult({ wpm: 150, accuracy: 0.95 }), { dayKey: '2026-10-09' });
    assert.ok(state.stats.bestWpm >= 100);
    assert.ok(state.achievements['speed-100']);
});

test('ProgressionService concede XP uma vez por corrida (duplicata não paga de novo)', () => {
    const env = installMemoryStorage();
    try {
        const now = new Date(2026, 9, 9, 12);
        const result = baseResult({ id: 'dup-1' });
        const first = ProgressionService.processRace(result, { now });
        assert.ok(first.xpGained > 0 && !first.duplicate);
        const xpAfterFirst = ProfileService.load(now).totalXp;
        const second = ProgressionService.processRace(result, { now });
        assert.equal(second.duplicate, true);
        assert.equal(second.xpGained, 0);
        assert.equal(ProfileService.load(now).totalXp, xpAfterFirst);
    } finally { env.restore(); }
});

test('XP persiste entre "sessões" e detecta subida de nível', () => {
    const env = installMemoryStorage();
    try {
        const now = new Date(2026, 9, 9, 12);
        let leveled = false;
        for (let i = 0; i < 6; i++) {
            const out = ProgressionService.processRace(baseResult({ id: `lv-${i}`, wpm: 90, accuracy: 1, categories: [`c${i}`] }), { now });
            leveled ||= out.leveledUp;
        }
        assert.ok(leveled, 'deveria subir de nível ao acumular XP');
        const overview = ProgressionService.getOverview(now);
        assert.ok(overview.profile.level >= 2);
        assert.ok(overview.history.length >= 6);
        assert.equal(overview.daily.length, ProgressionConfig.goals.dailyCount);
        assert.ok(overview.achievements.some(a => a.unlockedAt));
    } finally { env.restore(); }
});

test('mesma configuração repetida no mesmo dia rende menos; em outro dia volta ao normal', () => {
    const env = installMemoryStorage();
    try {
        const day1 = new Date(2026, 9, 9, 12), day2 = new Date(2026, 9, 10, 12);
        const gains = [];
        for (let i = 0; i < 6; i++) gains.push(ProgressionService.processRace(baseResult({ id: `rep-${i}`, position: 4, playerWon: false }), { now: day1 }).reward.total);
        assert.ok(gains[5] < gains[0], `${gains[5]} < ${gains[0]}`);
        assert.equal(ProgressionService.processRace(baseResult({ id: 'rep-next', position: 4, playerWon: false }), { now: day2 }).reward.total, gains[0]);
        assert.equal(localDayKey(day2), '2026-10-10');
    } finally { env.restore(); }
});

test('falha de gravação é reportada sem lançar exceção', () => {
    const env = installMemoryStorage();
    try {
        env.api.failWrites = true;
        const out = ProgressionService.processRace(baseResult({ id: 'fail-1' }), { now: new Date(2026, 9, 9) });
        assert.equal(out.persisted, false);
        assert.ok(out.xpGained > 0);
    } finally { env.restore(); }
});
