// Parâmetros ajustáveis de progressão. Altere aqui sem tocar na lógica.
export const ProgressionConfig = Object.freeze({
    level: Object.freeze({
        baseXp: 100,       // XP para sair do nível 1
        exponent: 1.4,     // XP(L→L+1) = round(baseXp * L^exponent)
        maxLevel: 100
    }),
    reward: Object.freeze({
        participation: 20,        // por corrida concluída (× fator de distância)
        speedFloorWpm: 20,        // abaixo disso não há bônus de velocidade
        speedPerWpm: 0.9,
        wpmCap: 250,              // acima disso é considerado anomalia
        accuracyFloor: 0.9,       // bônus de precisão começa aqui
        accuracyMax: 40,
        positionBonus: Object.freeze({ 1: 50, 2: 25, 3: 10 }),
        recordBonus: 30,
        minPhrases: 2,            // corridas curtas demais viram "baixa qualidade"
        minAccuracy: 0.5,
        lowQualityFactor: 0.25,
        freeRepeats: 2,           // repetições da mesma configuração no dia sem desconto
        repeatStep: 0.2,          // desconto por repetição extra
        repeatFloor: 0.25         // piso do multiplicador
    }),
    goals: Object.freeze({
        dailyCount: 3,
        dailyAllBonusXp: 50,
        countedMinPhrases: 2,
        countedMinAccuracy: 0.5,
        speedAchievementMinAccuracy: 0.85
    }),
    limits: Object.freeze({ awardedIds: 300, history: 100 })
});
