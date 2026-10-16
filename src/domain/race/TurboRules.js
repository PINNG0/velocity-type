// Recompensa por sequência limpa: combos específicos dão um turbo curto. Erro quebra o combo (e dá um tropeço).
export const TurboConfig = Object.freeze({
    tiers: Object.freeze([
        Object.freeze({ id: 'mini', name: 'MINI TURBO', combo: 25, duration: 2, multiplier: 1.08 }),
        Object.freeze({ id: 'turbo', name: 'TURBO', combo: 50, duration: 3, multiplier: 1.12 }),
        Object.freeze({ id: 'super', name: 'SUPER TURBO', combo: 100, duration: 4, multiplier: 1.16 })
    ]),
    repeatEvery: 100,                  // depois do último nível, repete o super a cada +100
    stumble: Object.freeze({ duration: 0.5, multiplier: 0.92 })
});

// Retorna o nível de turbo atingido exatamente neste combo (ou null).
export function tierForCombo(combo, cfg = TurboConfig) {
    const exact = cfg.tiers.find(t => t.combo === combo);
    if (exact) return exact;
    const last = cfg.tiers[cfg.tiers.length - 1];
    return combo > last.combo && (combo - last.combo) % cfg.repeatEvery === 0 ? last : null;
}
