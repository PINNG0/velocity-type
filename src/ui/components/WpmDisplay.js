export class WpmDisplay {
    constructor(element) {
        this.element = element;
    }

    setWpm(wpm) {
        this.element.textContent = Math.round(wpm);
    }
}
