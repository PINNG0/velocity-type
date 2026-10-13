export class FinishLine {
    constructor(position) {
        this.position = position;
    }

    hasBeenCrossed(position) {
        return position >= this.position;
    }
}
