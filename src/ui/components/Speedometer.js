export class Speedometer {
    constructor(element) {
        this.element = element;
    }

    setSpeed(speed) {
        this.element.textContent = `${Math.round(speed)} km/h`;
    }
}
