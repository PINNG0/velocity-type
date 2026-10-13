export class RaceResult {
    constructor({
        id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        wpmSeries = [],
        topMisses = [],
        wpm,
        accuracy,
        errors,
        timeSeconds,
        maxSpeed,
        position,
        phrasesCompleted,
        winner,
        playerWon,
        bestCombo = 0,
        difficultyMode = 'medium',
        difficultyLabel = 'Médio',
        difficultySpeed = 0.96,
        modeLabel = 'Sprint · 2,4 km',
        language = 'pt',
        categories = [],
        rules = {},
        distance = 2400,
        date = new Date().toISOString()
    }) {
        this.id = id;
        this.wpmSeries = wpmSeries;
        this.topMisses = topMisses;
        this.wpm = wpm;
        this.accuracy = accuracy;
        this.errors = errors;
        this.timeSeconds = timeSeconds;
        this.maxSpeed = maxSpeed;
        this.position = position;
        this.phrasesCompleted = phrasesCompleted;
        this.winner = winner;
        this.playerWon = playerWon;
        this.bestCombo = bestCombo;
        this.difficultyMode = difficultyMode;
        this.difficultyLabel = difficultyLabel;
        this.difficultySpeed = difficultySpeed;
        this.modeLabel = modeLabel;
        this.language = language;
        this.categories = categories;
        this.rules = rules;
        this.distance = distance;
        this.date = date;
    }
}
