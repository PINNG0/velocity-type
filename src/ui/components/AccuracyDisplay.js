export class AccuracyDisplay {
    constructor(element) {
        this.element = element;
    }

    setAccuracy(accuracy) {
        this.element.textContent = `${Math.round(accuracy * 100)}%`;
    }
}
