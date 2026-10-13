import { Logger } from '../services/Logger.js';

export const GamePhase = Object.freeze({
    MENU: 'menu',
    COUNTDOWN: 'countdown',
    RACING: 'racing',
    PAUSED: 'paused',
    FINISHED: 'finished'
});

// Transições esperadas; qualquer outra é registrada como anomalia (não bloqueia, para não travar o jogo).
const ALLOWED = {
    menu: ['countdown', 'menu'],
    countdown: ['racing', 'menu', 'countdown'],
    racing: ['paused', 'finished', 'menu'],
    paused: ['racing', 'menu'],
    finished: ['countdown', 'menu']
};

export class GameState {
    constructor() {
        this.phase = GamePhase.MENU;
    }

    setPhase(phase) {
        if (phase !== this.phase) {
            if (!ALLOWED[this.phase]?.includes(phase)) Logger.warn('state', 'transição inesperada', { from: this.phase, to: phase });
            else Logger.debug('state', `${this.phase} → ${phase}`);
        }
        this.phase = phase;
    }

    is(phase) {
        return this.phase === phase;
    }
}
