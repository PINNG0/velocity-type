export const GameConfig = Object.freeze({
    gameName: 'Velocity Type',

    race: {
        targetDistance: 2400,
        maxSpeedKmh: 320,
        accelerationResponse: 5.8,
        brakingResponse: 3.4,
        minimumSpeedWpm: 12,
        fullSpeedWpm: 100,
        minimumAccuracy: 0.52
    },

    typing: {
        rollingWindowMs: 5000,
        minimumSamplesForStableWpm: 5,
        previewCount: 4,
        maxInputLength: 240
    },

    ui: {
        finishDelayMs: 1500 // tempo da animação de chegada antes da tela de resultados
    },

    opponents: [
        { id: 'rival-1', name: 'Nova', color: 'red', baseSpeed: 148, skill: 0.88, style: 'steady' },
        { id: 'rival-2', name: 'Blaze', color: 'orange', baseSpeed: 160, skill: 0.93, style: 'sprinter' },
        { id: 'rival-3', name: 'Volt', color: 'blue', baseSpeed: 172, skill: 0.97, style: 'closer' }
    ]
});
