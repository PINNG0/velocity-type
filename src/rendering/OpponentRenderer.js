import { screenPercent } from './Camera.js';

export class OpponentRenderer {
    constructor(container) {
        this.container = container;
        this.elements = new Map();
    }

    create(opponent) {
        const element = document.createElement('div');

        element.className = `opponent-car opponent-${opponent.color}`;
        element.innerHTML = `
            <span class="car-tag">${String(opponent.name ?? '').replace(/[<>&]/g, '')}</span>
            <div class="mini-car">
                <span class="mini-car-body"></span>
                <span class="mini-wheel wheel-a"></span>
                <span class="mini-wheel wheel-b"></span>
            </div>
        `;

        this.container.appendChild(element);
        this.elements.set(opponent.id, element);

        return element;
    }

    render(opponent, trackLength, playerPosition = null) {
        let element = this.elements.get(opponent.id);

        if (!element) {
            element = this.create(opponent);
        }

        const progress = Math.max(
            0,
            Math.min(opponent.position / trackLength, 1)
        );

        const left = playerPosition === null
            ? Math.round((progress * 82 + 4) * 20) / 20
            : Math.round(screenPercent(opponent.position, playerPosition) * 20) / 20;
        if (element._left !== left) { element.style.left = `${left}%`; element._left = left; }
        if (element._lane !== opponent.lane) { element.style.top = `${27 + opponent.lane * 18}%`; element._lane = opponent.lane; }
    }

    clear() {
        this.elements.forEach(element => element.remove());
        this.elements.clear();
    }
}
