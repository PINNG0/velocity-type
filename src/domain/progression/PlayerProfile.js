import { ProgressionConfig } from '../../config/ProgressionConfig.js';
import { levelFromXp } from './XpCalculator.js';

const num = (v, min, max, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
const str = (v, max = 80) => typeof v === 'string' ? v.replace(/[<>]/g, '').slice(0, max) : '';

export const PlayerProfile = {
    create(now = new Date()) {
        return { schemaVersion: 1, createdAt: now.toISOString(), totalXp: 0, awardedIds: [], daily: { dayKey: '', counts: {} }, history: [] };
    },

    // Nunca confia no que está salvo: normaliza tipos e limites. O nível é sempre derivado do XP.
    sanitize(raw, now = new Date()) {
        const base = this.create(now);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
        const lim = ProgressionConfig.limits;
        const counts = {};
        if (raw.daily?.counts && typeof raw.daily.counts === 'object') {
            for (const [k, v] of Object.entries(raw.daily.counts).slice(0, 50)) counts[str(k, 160)] = Math.floor(num(v, 0, 10000));
        }
        return {
            schemaVersion: 1,
            createdAt: typeof raw.createdAt === 'string' && !Number.isNaN(Date.parse(raw.createdAt)) ? raw.createdAt : base.createdAt,
            totalXp: Math.floor(num(raw.totalXp, 0, 1e9)),
            awardedIds: Array.isArray(raw.awardedIds) ? raw.awardedIds.filter(x => typeof x === 'string').map(x => x.slice(0, 120)).slice(-lim.awardedIds) : [],
            daily: { dayKey: str(raw.daily?.dayKey, 10), counts },
            history: Array.isArray(raw.history) ? raw.history.slice(0, lim.history).map(h => ({
                id: str(h?.id, 120), source: str(h?.source, 20), label: str(h?.label, 60),
                xp: Math.floor(num(h?.xp, 0, 1e7)), at: typeof h?.at === 'string' ? h.at : base.createdAt,
                totalXpAfter: Math.floor(num(h?.totalXpAfter, 0, 1e9)), level: Math.floor(num(h?.level, 1, 1000, 1)),
                levelBefore: Math.floor(num(h?.levelBefore, 1, 1000, 1)),
                breakdown: Array.isArray(h?.breakdown) ? h.breakdown.slice(0, 8).map(p => ({ id: str(p?.id, 20), label: str(p?.label, 40), xp: Math.floor(num(p?.xp, 0, 1e6)) })) : []
            })).filter(h => h.id) : []
        };
    },

    // Concede XP uma única vez por `id` (idempotente). Retorna null se já concedido.
    award(profile, { id, source, label, xp, breakdown = [], now = new Date() }) {
        if (profile.awardedIds.includes(id)) return null;
        const lim = ProgressionConfig.limits;
        const before = levelFromXp(profile.totalXp);
        profile.totalXp += Math.max(0, Math.floor(xp));
        const after = levelFromXp(profile.totalXp);
        profile.awardedIds.push(id);
        if (profile.awardedIds.length > lim.awardedIds) profile.awardedIds.splice(0, profile.awardedIds.length - lim.awardedIds);
        profile.history.unshift({ id, source, label, xp: Math.max(0, Math.floor(xp)), at: now.toISOString(), totalXpAfter: profile.totalXp, level: after.level, levelBefore: before.level, breakdown });
        if (profile.history.length > lim.history) profile.history.length = lim.history;
        return { levelBefore: before.level, levelAfter: after.level };
    }
};
