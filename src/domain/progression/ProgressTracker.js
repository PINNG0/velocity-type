import { ProgressionConfig } from '../../config/ProgressionConfig.js';
import { DAILY_POOL, LONG_TERM, ACHIEVEMENTS, GOAL_INDEX } from './Goals.js';

const num = (v, min, max, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
const pad = n => String(n).padStart(2, '0');

export function localDayKey(date = new Date()) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayNumber(key) {
    const [y, m, d] = key.split('-').map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}
const validDayKey = k => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k);

function hashString(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// Mesmo dia => mesmos desafios (determinístico), sem depender de estado salvo.
export function pickDailyIds(dayKey, count = ProgressionConfig.goals.dailyCount) {
    const rand = mulberry32(hashString(dayKey));
    const pool = DAILY_POOL.map(g => g.id);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return pool.slice(0, count);
}

const emptyStats = () => ({ races: 0, wins: 0, distance: 0, phrases: 0, bestWpm: 0, bestAccuracy: 0, bestCombo: 0, perfectRaces: 0, cleanStreak: 0, streakDays: 0, lastDay: '' });

export function createProgressState(dayKey) {
    return { schemaVersion: 1, dayKey, daily: freshDaily(dayKey), dailyBonusClaimed: false, long: {}, achievements: {}, stats: emptyStats() };
}

function freshDaily(dayKey) {
    return Object.fromEntries(pickDailyIds(dayKey).map(id => [id, { progress: 0, done: false, doneAt: null }]));
}

export function sanitizeProgressState(raw, dayKey) {
    const base = createProgressState(dayKey);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
    const stats = emptyStats();
    for (const k of Object.keys(stats)) {
        if (k === 'lastDay') stats.lastDay = validDayKey(raw.stats?.lastDay) ? raw.stats.lastDay : '';
        else stats[k] = Math.floor(num(raw.stats?.[k], 0, 1e9));
    }
    const entry = e => ({ progress: num(e?.progress, 0, 1e9), done: e?.done === true, doneAt: typeof e?.doneAt === 'string' ? e.doneAt : null });
    const daily = {};
    for (const [id, e] of Object.entries(raw.daily ?? {}).slice(0, 10)) if (DAILY_POOL.some(g => g.id === id)) daily[id] = entry(e);
    const long = {};
    for (const [id, e] of Object.entries(raw.long ?? {}).slice(0, 20)) if (LONG_TERM.some(g => g.id === id)) long[id] = entry(e);
    const achievements = {};
    for (const [id, at] of Object.entries(raw.achievements ?? {}).slice(0, 50)) if (ACHIEVEMENTS.some(g => g.id === id) && typeof at === 'string') achievements[id] = at;
    return {
        schemaVersion: 1,
        dayKey: validDayKey(raw.dayKey) ? raw.dayKey : dayKey,
        daily: Object.keys(daily).length ? daily : base.daily,
        dailyBonusClaimed: raw.dailyBonusClaimed === true,
        long, achievements, stats
    };
}

// Troca de dia só acontece quando a data local realmente avança. Relógio voltando não reinicia nada.
export function ensureDay(state, dayKey) {
    if (!validDayKey(state.dayKey) || dayKey > state.dayKey) {
        state.dayKey = dayKey; state.daily = freshDaily(dayKey); state.dailyBonusClaimed = false;
        return 'rolled';
    }
    return dayKey < state.dayKey ? 'clock-behind' : 'same';
}

export function isCountedRace(result) {
    const g = ProgressionConfig.goals;
    return (Number(result.phrasesCompleted) || 0) >= g.countedMinPhrases && (Number(result.accuracy) || 0) >= g.countedMinAccuracy;
}

function updateStreak(stats, dayKey) {
    if (stats.lastDay === dayKey) return;
    if (!stats.lastDay) stats.streakDays = 1;
    else if (dayKey > stats.lastDay) stats.streakDays = dayNumber(dayKey) - dayNumber(stats.lastDay) === 1 ? stats.streakDays + 1 : 1;
    else return; // relógio atrás: não mexe
    stats.lastDay = dayKey;
}

function dailyContribution(metric, result) {
    switch (metric) {
        case 'races': return 1;
        case 'wins': return result.playerWon ? 1 : 0;
        case 'phrases': return Number(result.phrasesCompleted) || 0;
        case 'distance': return Number(result.distance) || 0;
        case 'wpm': return Math.min(Number(result.wpm) || 0, 250);
        case 'accuracy': return (Number(result.accuracy) || 0) * 100;
        case 'combo': return Number(result.bestCombo) || 0;
        default: return 0;
    }
}

// Atualiza estatísticas/objetivos/conquistas com uma corrida. Devolve eventos (sem conceder XP).
export function recordRace(state, result, { dayKey, now = new Date() }) {
    const events = [];
    const dayStatus = ensureDay(state, dayKey);
    if (dayStatus === 'rolled') events.push({ type: 'new-day', id: dayKey });
    if (!isCountedRace(result)) return events;

    const g = ProgressionConfig.goals;
    const stats = state.stats;
    const accuracy = Number(result.accuracy) || 0;
    const phrases = Number(result.phrasesCompleted) || 0;
    stats.races++;
    if (result.playerWon) stats.wins++;
    stats.distance += Math.max(0, Number(result.distance) || 0);
    stats.phrases += phrases;
    stats.bestCombo = Math.max(stats.bestCombo, Number(result.bestCombo) || 0);
    if (accuracy >= g.speedAchievementMinAccuracy) stats.bestWpm = Math.max(stats.bestWpm, Math.floor(Math.min(Number(result.wpm) || 0, 250)));
    if (phrases >= 3) {
        stats.bestAccuracy = Math.max(stats.bestAccuracy, Math.floor(accuracy * 100));
        if (accuracy >= 1) stats.perfectRaces++;
    }
    stats.cleanStreak = accuracy >= 0.95 ? stats.cleanStreak + 1 : 0;
    updateStreak(stats, dayKey);

    const at = now.toISOString();
    for (const [id, entry] of Object.entries(state.daily)) {
        const def = GOAL_INDEX.get(id);
        const value = dailyContribution(def.metric, result);
        entry.progress = Math.min(def.target, def.mode === 'sum' ? entry.progress + value : Math.max(entry.progress, value));
        if (!entry.done && entry.progress >= def.target) {
            entry.done = true; entry.doneAt = at;
            events.push({ type: 'daily', id, title: def.title, rewardXp: def.rewardXp, scope: dayKey });
        }
    }
    if (!state.dailyBonusClaimed && Object.values(state.daily).every(e => e.done)) {
        state.dailyBonusClaimed = true;
        events.push({ type: 'daily-all', id: 'daily-all', title: 'Todos os desafios do dia', rewardXp: g.dailyAllBonusXp, scope: dayKey });
    }
    for (const def of LONG_TERM) {
        const entry = state.long[def.id] ?? (state.long[def.id] = { progress: 0, done: false, doneAt: null });
        entry.progress = Math.min(def.target, stats[def.metric] ?? 0);
        if (!entry.done && entry.progress >= def.target) {
            entry.done = true; entry.doneAt = at;
            events.push({ type: 'long', id: def.id, title: def.title, rewardXp: def.rewardXp, scope: 'once' });
        }
    }
    for (const def of ACHIEVEMENTS) {
        if (state.achievements[def.id]) continue;
        if ((stats[def.metric] ?? 0) >= def.target) {
            state.achievements[def.id] = at;
            events.push({ type: 'achievement', id: def.id, title: def.title, rewardXp: def.rewardXp, scope: 'once' });
        }
    }
    return events;
}

// Junta um backup importado sem nunca reduzir progresso local.
export function mergeProgressStates(current, imported) {
    const out = structuredClone(current);
    for (const k of Object.keys(out.stats)) {
        if (k === 'lastDay') out.stats.lastDay = imported.stats.lastDay > out.stats.lastDay ? imported.stats.lastDay : out.stats.lastDay;
        else out.stats[k] = Math.max(out.stats[k], imported.stats[k]);
    }
    for (const [id, at] of Object.entries(imported.achievements)) if (!out.achievements[id] || at < out.achievements[id]) out.achievements[id] = at;
    for (const [id, e] of Object.entries(imported.long)) {
        const c = out.long[id];
        if (!c) out.long[id] = e;
        else { c.progress = Math.max(c.progress, e.progress); if (e.done && !c.done) { c.done = true; c.doneAt = e.doneAt; } }
    }
    return out;
}
