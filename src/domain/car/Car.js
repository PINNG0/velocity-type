export class Car {
    constructor(stats) {
        this.stats = stats;
        this.speed = 0; // km/h
        this.position = 0; // meters
        this.lane = 1;
    }

    update(deltaTime) {
        const safeDelta = Number.isFinite(deltaTime) ? Math.max(deltaTime, 0) : 0;
        const metersPerSecond = this.speed / 3.6;
        this.position += metersPerSecond * safeDelta;
    }

    setSpeed(speed) {
        const safeSpeed = Number.isFinite(speed) ? speed : 0;
        this.speed = Math.max(0, Math.min(safeSpeed, this.stats.maxSpeed));
    }

    reset() {
        this.speed = 0;
        this.position = 0;
    }
}
