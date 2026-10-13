export class Time {
    static clampDelta(deltaTime, max = 0.05) {
        return Math.min(Math.max(deltaTime, 0), max);
    }
}
