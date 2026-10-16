export class RaceSystem {
    constructor(race, typingSession, config) {
        this.race = race;
        this.typingSession = typingSession;
        this.config = config;
    }

    setTypingSession(typingSession) {
        if (!typingSession) {
            throw new Error('RaceSystem precisa de uma TypingSession válida.');
        }
        this.typingSession = typingSession;
    }

    update(deltaTime) {
        if (!this.typingSession || !this.race || this.race.finished) return;

        const settings = this.config.race;
        const wpm = Math.min(Math.max(this.typingSession.stableWpm || 0, 0), 180);
        const accuracy = Number.isFinite(this.typingSession.accuracy)
            ? this.typingSession.accuracy
            : 1;

        const wpmRange = Math.max(
            settings.fullSpeedWpm - settings.minimumSpeedWpm,
            1
        );

        const normalizedWpm = Math.max(
            0,
            Math.min(
                (wpm - settings.minimumSpeedWpm) / wpmRange,
                1
            )
        );

        const accuracyFactor = Math.max(
            Math.min(accuracy, 1),
            settings.minimumAccuracy
        );

        // Pequeno bônus de ritmo para recompensar sequências limpas sem
        // transformar erros em uma punição impossível de recuperar.
        const comboFactor = 1 + Math.min(this.typingSession.combo, 40) / 400;

        const targetSpeed = Math.min(
            normalizedWpm * settings.maxSpeedKmh * accuracyFactor * comboFactor,
            settings.maxSpeedKmh
        ) * (this.race.speedMultiplier ?? 1); // turbo / tropeço

        const difference = targetSpeed - this.race.car.speed;
        const response = difference >= 0
            ? settings.accelerationResponse
            : settings.brakingResponse;

        const safeDelta = Math.min(Math.max(deltaTime, 0), 0.05);
        const nextSpeed = this.race.car.speed +
            difference * response * safeDelta;

        this.race.car.setSpeed(nextSpeed);
        this.race.update(safeDelta);
    }
}
