import { Logger } from './Logger.js';

export const StorageKeys = Object.freeze({
    bestPrefix: 'velocity-type-best-result',
    history: 'velocity-type-race-history-v1',
    adaptiveHistory: 'velocity-type-history-v2',
    skill: 'velocity-type-adaptive-v1',
    settings: 'velocity-type-settings-v2',
    audio: 'velocity-type-audio-v1',
    profile: 'velocity-type-profile-v1',
    progress: 'velocity-type-progress-v1'
});

export const HISTORY_LIMIT = 200;

function storage() {
    try { return globalThis.localStorage ?? null; } catch { return null; }
}

// Único ponto de acesso ao localStorage. Falhas nunca lançam: retornam fallback/false e vão para o Logger.
export class StorageService {
    static key = StorageKeys.bestPrefix;
    static historyKey = StorageKeys.history;
    static lastError = null;

    static get(key, fallback = null) {
        const s = storage();
        if (!s) return fallback;
        let raw;
        try { raw = s.getItem(key); } catch (error) {
            this.lastError = error;
            Logger.warn('storage', 'leitura falhou', { key, error: String(error) });
            return fallback;
        }
        if (raw === null || raw === undefined || raw === '') return fallback;
        try { return JSON.parse(raw); } catch (error) {
            this.quarantine(key, raw, error);
            return fallback;
        }
    }

    // Valor corrompido: guarda cópia em `<chave>:corrupt` (para recuperação manual) e libera a chave.
    static quarantine(key, raw, error) {
        Logger.error('storage', 'valor corrompido isolado', { key, length: String(raw).length, error: String(error) });
        const s = storage();
        try { s?.setItem(`${key}:corrupt`, String(raw).slice(0, 200000)); } catch { /* sem espaço: segue */ }
        try { s?.removeItem?.(key); } catch { /* ignora */ }
    }

    static set(key, value) {
        const s = storage();
        if (!s) return false;
        try { s.setItem(key, JSON.stringify(value)); return true; } catch (error) {
            this.lastError = error;
            Logger.error('storage', 'escrita falhou (cota/privacidade?)', { key, error: String(error) });
            return false;
        }
    }

    static remove(key) {
        try { storage()?.removeItem?.(key); return true; } catch (error) {
            Logger.warn('storage', 'remoção falhou', { key, error: String(error) });
            return false;
        }
    }

    static newId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

    static bestKey(c) {
        return `${this.key}:v2:${c.difficultyMode}:${c.modeLabel}:${c.language}:${(c.categories || []).slice().sort().join(',')}:${JSON.stringify(c.rules || {})}`;
    }

    static saveBest(result) {
        if (!result.playerWon) return false;
        const key = this.bestKey(result);
        const current = this.get(key);
        if (!current || result.timeSeconds < current.timeSeconds) return this.set(key, result);
        return false;
    }

    static getBest(criteria = null) {
        if (criteria && typeof criteria === 'object') return this.get(this.bestKey(criteria));
        return this.get(this.key); // chave legada
    }

    static getHistory() {
        const value = this.get(this.historyKey);
        return Array.isArray(value) ? value.filter(r => r && typeof r === 'object') : [];
    }

    // Idempotente: o mesmo id nunca entra duas vezes no histórico.
    static saveResult(result) {
        const history = this.getHistory();
        const id = result.id || this.newId();
        if (history.some(r => r.id === id)) {
            Logger.warn('storage', 'resultado duplicado ignorado', { id });
            return false;
        }
        history.unshift({ ...result, id });
        return this.set(this.historyKey, history.slice(0, HISTORY_LIMIT));
    }

    static replaceHistory(records) { return this.set(this.historyKey, records.slice(0, HISTORY_LIMIT)); }

    static clearHistory() {
        this.remove(StorageKeys.history);
        this.remove(StorageKeys.adaptiveHistory);
        Logger.info('storage', 'histórico apagado');
    }

    // Une histórico atual + importado: sem duplicados (prevalece o atual), mais novos primeiro.
    static mergeHistory(current, imported) {
        const map = new Map();
        for (const record of [...current, ...imported]) if (record?.id && !map.has(record.id)) map.set(record.id, record);
        return [...map.values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, HISTORY_LIMIT);
    }

    static sanitizeRecord(record) {
        if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
        const finite = (value, min, max) => {
            const n = Number(value);
            return Number.isFinite(n) && n >= min && n <= max ? n : null;
        };
        const timeSeconds = finite(record.timeSeconds, 0, 86400);
        const wpm = finite(record.wpm, 0, 2000);
        const accuracy = finite(record.accuracy, 0, 1);
        if (timeSeconds === null || wpm === null || accuracy === null) return null;
        const categories = Array.isArray(record.categories)
            ? record.categories.filter(v => ['mixed', 'computing', 'science', 'people', 'code'].includes(v)).slice(0, 5) : [];
        const rawRules = record.rules && typeof record.rules === 'object' && !Array.isArray(record.rules) ? record.rules : {};
        const rules = Object.fromEntries(['accents', 'punctuation', 'caseSensitive', 'numbersExact'].map(k => [k, rawRules[k] === true]));
        const safeText = (value, max = 80) => typeof value === 'string' ? value.replace(/[<>]/g, '').slice(0, max) : '';
        const position = finite(record.position, 1, 4);
        const date = typeof record.date === 'string' && !Number.isNaN(Date.parse(record.date))
            ? new Date(record.date).toISOString() : new Date().toISOString();
        return {
            id: safeText(record.id, 100) || `import-${this.newId()}`,
            date, timeSeconds, wpm, accuracy,
            position: position === null ? null : Math.floor(position),
            playerWon: record.playerWon === true,
            errors: Math.floor(finite(record.errors, 0, 1000000) ?? 0),
            bestCombo: Math.floor(finite(record.bestCombo, 0, 1000000) ?? 0),
            distance: Math.floor(finite(record.distance, 0, 10000000) ?? 0),
            maxSpeed: finite(record.maxSpeed, 0, 1000) ?? 0,
            phrasesCompleted: Math.floor(finite(record.phrasesCompleted, 0, 1000000) ?? 0),
            modeLabel: safeText(record.modeLabel, 60) || 'Corrida',
            difficultyLabel: safeText(record.difficultyLabel, 60) || 'Médio',
            difficultyMode: ['adaptive', 'very-easy', 'easy', 'medium', 'hard', 'very-hard'].includes(record.difficultyMode) ? record.difficultyMode : 'medium',
            language: record.language === 'en' ? 'en' : 'pt', categories, rules,
            wpmSeries: Array.isArray(record.wpmSeries) ? record.wpmSeries.slice(0, 120).map(Number).filter(n => Number.isFinite(n)).map(n => Math.min(500, Math.max(0, Math.round(n)))) : [],
            topMisses: Array.isArray(record.topMisses) ? record.topMisses.slice(0, 5).filter(m => m && typeof m.key === 'string').map(m => ({ key: m.key.slice(0, 2), count: Math.floor(Math.min(100000, Math.max(0, Number(m.count) || 0))) })) : []
        };
    }
}
