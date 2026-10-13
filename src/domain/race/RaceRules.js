export class RaceRules {
    static isFinished(race) {
        return race.finished;
    }

    static canPause(race) {
        return Boolean(race.startedAt) && !race.finished;
    }
}
