// Utilitários de teste: localStorage em memória e relógio determinístico.
export function installMemoryStorage(initial = {}) {
    const store = new Map(Object.entries(initial));
    const previous = globalThis.localStorage;
    const api = {
        store, failWrites: false,
        getItem: k => store.has(k) ? store.get(k) : null,
        setItem(k, v) { if (api.failWrites) throw new Error('QuotaExceededError'); store.set(k, String(v)); },
        removeItem: k => { store.delete(k); }
    };
    globalThis.localStorage = api;
    return { api, restore() { if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous; } };
}

export function makeClock(start = 0) {
    let t = start;
    const clock = () => t;
    clock.advance = ms => { t += ms; return t; };
    return clock;
}

export function baseResult(overrides = {}) {
    return {
        id: `r-${Math.random().toString(36).slice(2, 8)}`, wpm: 60, accuracy: 0.97, errors: 3, timeSeconds: 60, maxSpeed: 200,
        position: 1, phrasesCompleted: 12, winner: 'Você', playerWon: true, bestCombo: 30, difficultyMode: 'medium', difficultyLabel: 'Médio',
        difficultySpeed: 0.96, modeLabel: 'Sprint · 2,4 km', language: 'pt', categories: ['code'], rules: { accents: true, punctuation: true, caseSensitive: true, numbersExact: true },
        distance: 2400, date: new Date().toISOString(), ...overrides
    };
}
