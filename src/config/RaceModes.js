// Fonte única dos modos de corrida: Curta 1 km, Média 2 km, Longa 5 km.
export const RaceModes = Object.freeze({
    short: Object.freeze({ id: 'short', distance: 1000, label: 'Curta · 1 km', banner: '1 KM', km: '1' }),
    medium: Object.freeze({ id: 'medium', distance: 2000, label: 'Média · 2 km', banner: '2 KM', km: '2' }),
    long: Object.freeze({ id: 'long', distance: 5000, label: 'Longa · 5 km', banner: '5 KM', km: '5' })
});

// Preferências salvas nas versões anteriores (Sprint 2,4 km / Longa 5 km / Resistência 10 km) continuam válidas.
const LEGACY = Object.freeze({ sprint: 'medium', 'endurance-5': 'long', 'endurance-10': 'long' });

export function normalizeModeId(id) {
    if (RaceModes[id]) return id;
    return LEGACY[id] ?? 'short';
}

export function getRaceMode(id) { return RaceModes[normalizeModeId(id)]; }
