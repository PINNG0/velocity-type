import { Camera } from './Camera.js';

export class CarRenderer {
    constructor(element) {
        this.element = element;
        this.lastLeft = null;
        this.lastTilt = null;
    }

    // O jogador fica perto de uma posição fixa; ao acelerar "avança" um pouco na tela (sensação de arranque).
    render(car, trackLength, playerPosition = null) {
        let left;
        if (playerPosition === null) left = Math.round((Math.min(car.position / trackLength, 1) * 82 + 4) * 20) / 20;
        else left = Math.round((Camera.playerX - 3 + Math.min(car.speed / 320, 1.2) * 5) * 20) / 20;
        if (left !== this.lastLeft) { this.element.style.left = `${left}%`; this.lastLeft = left; }

        const tilt = Math.round(Math.max(-2, Math.min(car.speed / 100, 2)) * 10) / 10;
        if (tilt !== this.lastTilt) {
            this.element.style.transform = `translateX(-50%) rotate(${tilt}deg)`;
            this.lastTilt = tilt;
        }
    }

    reset() {
        this.lastLeft = null; this.lastTilt = null;
        this.element.style.left = `${Camera.playerX - 3}%`;
        this.element.style.transform = 'translateX(-50%) rotate(0deg)';
    }
}
