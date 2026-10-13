// Definições de objetivos (diários e de longo prazo) e conquistas. Dados puros.
// metric: chave de contribuição por corrida (diários) ou de estatística acumulada (longo prazo/conquistas).
export const DAILY_POOL = Object.freeze([
    { id: 'daily-races-3', title: 'Aquecimento', description: 'Conclua 3 corridas', metric: 'races', mode: 'sum', target: 3, rewardXp: 60 },
    { id: 'daily-wpm-50', title: 'Ritmo forte', description: 'Alcance 50 WPM em uma corrida', metric: 'wpm', mode: 'max', target: 50, rewardXp: 70 },
    { id: 'daily-acc-95', title: 'Mãos firmes', description: 'Termine uma corrida com 95% de precisão', metric: 'accuracy', mode: 'max', target: 95, rewardXp: 70 },
    { id: 'daily-phrases-30', title: 'Maratona de frases', description: 'Complete 30 frases', metric: 'phrases', mode: 'sum', target: 30, rewardXp: 60 },
    { id: 'daily-win', title: 'Pole position', description: 'Vença uma corrida', metric: 'wins', mode: 'sum', target: 1, rewardXp: 80 },
    { id: 'daily-combo-40', title: 'Sem tropeços', description: 'Faça um combo de 40', metric: 'combo', mode: 'max', target: 40, rewardXp: 60 },
    { id: 'daily-distance-5', title: 'Quilometragem', description: 'Percorra 5 km no total', metric: 'distance', mode: 'sum', target: 5000, rewardXp: 60 }
]);

export const LONG_TERM = Object.freeze([
    { id: 'long-races-25', title: 'Piloto frequente', description: 'Conclua 25 corridas', metric: 'races', target: 25, rewardXp: 150 },
    { id: 'long-races-100', title: 'Veterano', description: 'Conclua 100 corridas', metric: 'races', target: 100, rewardXp: 400 },
    { id: 'long-wins-20', title: 'Campeão local', description: 'Vença 20 corridas', metric: 'wins', target: 20, rewardXp: 250 },
    { id: 'long-distance-100k', title: 'Volta ao mundo', description: 'Percorra 100 km', metric: 'distance', target: 100000, rewardXp: 300 },
    { id: 'long-phrases-1000', title: 'Datilógrafo', description: 'Complete 1.000 frases', metric: 'phrases', target: 1000, rewardXp: 300 }
]);

export const ACHIEVEMENTS = Object.freeze([
    // Velocidade (exigem precisão mínima: apertar teclas sem critério não conta)
    { id: 'speed-40', category: 'speed', title: 'Aquecendo os dedos', description: '40 WPM em uma corrida', metric: 'bestWpm', target: 40, rewardXp: 40 },
    { id: 'speed-60', category: 'speed', title: 'Velocidade de cruzeiro', description: '60 WPM em uma corrida', metric: 'bestWpm', target: 60, rewardXp: 80 },
    { id: 'speed-80', category: 'speed', title: 'Pé no fundo', description: '80 WPM em uma corrida', metric: 'bestWpm', target: 80, rewardXp: 150 },
    { id: 'speed-100', category: 'speed', title: 'Barreira dos 100', description: '100 WPM em uma corrida', metric: 'bestWpm', target: 100, rewardXp: 300 },
    // Precisão
    { id: 'acc-98', category: 'accuracy', title: 'Cirúrgico', description: '98% de precisão em corrida de 3+ frases', metric: 'bestAccuracy', target: 98, rewardXp: 80 },
    { id: 'acc-100', category: 'accuracy', title: 'Corrida perfeita', description: '100% de precisão em corrida de 3+ frases', metric: 'perfectRaces', target: 1, rewardXp: 200 },
    // Consistência
    { id: 'clean-5', category: 'consistency', title: 'Cinco limpas', description: '5 corridas seguidas com 95%+', metric: 'cleanStreak', target: 5, rewardXp: 150 },
    { id: 'streak-3', category: 'consistency', title: 'Hábito', description: 'Jogue 3 dias seguidos', metric: 'streakDays', target: 3, rewardXp: 100 },
    { id: 'streak-7', category: 'consistency', title: 'Semana completa', description: 'Jogue 7 dias seguidos', metric: 'streakDays', target: 7, rewardXp: 300 },
    // Participação
    { id: 'first-race', category: 'participation', title: 'Largada', description: 'Conclua sua primeira corrida', metric: 'races', target: 1, rewardXp: 30 },
    { id: 'races-10', category: 'participation', title: 'Dez voltas', description: 'Conclua 10 corridas', metric: 'races', target: 10, rewardXp: 80 },
    { id: 'first-win', category: 'participation', title: 'Bandeira quadriculada', description: 'Vença sua primeira corrida', metric: 'wins', target: 1, rewardXp: 100 }
]);

export const GOAL_INDEX = new Map([...DAILY_POOL, ...LONG_TERM, ...ACHIEVEMENTS].map(g => [g.id, g]));
