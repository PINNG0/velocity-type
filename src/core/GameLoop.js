export class GameLoop {
    constructor(update, { onFrame = null, maxDelta = 0.05 } = {}) {
        this.update = update;
        this.onFrame = onFrame;
        this.maxDelta = maxDelta;
        this.running = false;
        this.lastTime = null;
        this.rafId = null;
        this.frame = this.frame.bind(this);
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.lastTime = null; // evita um delta gigante após parar/reiniciar
        this.rafId = requestAnimationFrame(this.frame);
    }

    stop() {
        this.running = false;
        if (this.rafId !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.rafId);
        this.rafId = null;
    }

    frame(timestamp) {
        if (!this.running) return;

        const rawMs = this.lastTime === null ? 16.7 : Math.max(0, timestamp - this.lastTime);
        this.lastTime = timestamp;
        const deltaTime = Math.min(rawMs / 1000, this.maxDelta);

        this.onFrame?.(rawMs);
        try {
            this.update(deltaTime);
        } catch (error) {
            // Um erro em um quadro não pode matar o loop inteiro.
            this.onError?.(error);
        }
        this.rafId = requestAnimationFrame(this.frame);
    }
}
