export class OpponentCar {
    constructor({ id, name, color, baseSpeed, skill, lane, style = 'steady' }) {
        this.style = style;
        this.id = id;
        this.name = name;
        this.color = color;
        this.baseSpeed = baseSpeed;
        this.skill = skill;
        this.lane = lane;

        this.position = 0;
        this.speed = 0;
        this.maxSpeed = baseSpeed * (0.96 + skill * 0.08);
    }

    start(offset = 0) {
        this.position = offset;
        this.speed = this.baseSpeed;
    }

    // Personalidade ao longo da corrida (progress 0..1). Médias parecidas: ninguém é injusto, só diferente.
    styleFactor(progress, raceTime) {
        switch (this.style) {
            case 'sprinter': return 1.05 - 0.10 * progress;                 // arranca forte, cansa no fim
            case 'closer': return 0.95 + 0.10 * progress * progress;        // guarda fôlego para o final
            case 'erratic': return 1 + 0.045 * Math.sin(raceTime * 0.0031 + this.id.length);
            default: return 1;
        }
    }

    // gap = rival.position - jogador (m). Rival muito à frente alivia, muito atrás acelera (até ±5%).
    update(deltaTime, raceTime, progress = 0, gap = 0) {
        const safeDelta = Number.isFinite(deltaTime) ? Math.max(deltaTime, 0) : 0;
        const rhythm = Math.sin(raceTime * 0.0012 + this.id.length) * 0.022;
        const rubber = Math.max(-0.05, Math.min(0.05, -(Number.isFinite(gap) ? gap : 0) / 1500));
        const target = this.maxSpeed * (1 + rhythm) * this.styleFactor(progress, raceTime) * (1 + rubber);
        const response = 1.45;

        this.speed += (target - this.speed) * response * safeDelta;
        this.speed = Math.max(0, this.speed);
        this.position += (this.speed / 3.6) * safeDelta;
    }
}
