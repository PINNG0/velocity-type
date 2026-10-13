export class CarRenderer {
    constructor(element) {
        this.element = element;
        this.lastLeft = null;
        this.lastTilt = null;
    }

    // Só escreve no DOM quando o valor muda de forma perceptível (evita layout/estilo desnecessários).
    render(car, trackLength) {
        const progress = Math.min(car.position / trackLength, 1);
        const left = Math.round((progress * 82 + 4) * 20) / 20;
        if (left !== this.lastLeft) { this.element.style.left = `${left}%`; this.lastLeft = left; }

        const tilt = Math.round(Math.max(-2, Math.min(car.speed / 100, 2)) * 10) / 10;
        if (tilt !== this.lastTilt) {
            this.element.style.transform = `translateX(-50%) rotate(${tilt}deg)`;
            this.lastTilt = tilt;
        }
    }

    reset() {
        this.lastLeft = null; this.lastTilt = null;
        this.element.style.left = '4%';
        this.element.style.transform = 'translateX(-50%) rotate(0deg)';
    }
}
