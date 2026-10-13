// Recompensas de nível: pinturas do carro. O nível vem do XP (ProgressionConfig).
export const CarSkins = Object.freeze([
    Object.freeze({ id: 'classic', name: 'Clássico', level: 1 }),
    Object.freeze({ id: 'neon', name: 'Neon', level: 3 }),
    Object.freeze({ id: 'gold', name: 'Dourado', level: 6 }),
    Object.freeze({ id: 'phantom', name: 'Fantasma', level: 10 }),
    Object.freeze({ id: 'inferno', name: 'Inferno', level: 15 })
]);

export const isSkinUnlocked = (id, level) => CarSkins.some(s => s.id === id && level >= s.level);
export const resolveSkin = (id, level) => isSkinUnlocked(id, level) ? id : 'classic';
export const skinsUnlockedBetween = (fromLevel, toLevel) => CarSkins.filter(s => s.level > fromLevel && s.level <= toLevel);
