// Fonte única dos modos de corrida (antes duplicados no controller e na UI).
export const RaceModes = Object.freeze({
    sprint: Object.freeze({ id: 'sprint', distance: 2400, label: 'Sprint · 2,4 km', banner: '2.4 KM', km: '2.4' }),
    'endurance-5': Object.freeze({ id: 'endurance-5', distance: 5000, label: 'Longa · 5 km', banner: '5 KM', km: '5' }),
    'endurance-10': Object.freeze({ id: 'endurance-10', distance: 10000, label: 'Resistência · 10 km', banner: '10 KM', km: '10' })
});

export function getRaceMode(id) { return RaceModes[id] ?? RaceModes.sprint; }
