const MAX_PARTICLES = 140;
const CONFETTI = ['#55d6ff', '#ff6677', '#ffd24a', '#7dffa8', '#ffffff'];

// Efeitos em canvas: linhas de velocidade e confete de chegada, com reserva fixa de partículas.
export class EffectsRenderer {
    constructor(element, canvas = null) {
        this.element = element;
        this.canvas = canvas;
        this.ctx = canvas?.getContext?.('2d') ?? null;
        this.width = 0; this.height = 0; this.dpr = 1;
        this.quality = 'high';
        this.reducedMotion = Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
        this.streaks = []; this.confetti = [];
        this.lastIntensity = -1;
    }

    setQuality(quality) { this.quality = quality; }

    resize() {
        if (!this.ctx) return;
        const rect = this.canvas.getBoundingClientRect();
        const dpr = Math.min(globalThis.devicePixelRatio || 1, 1.5);
        const w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
        if (w === this.width && h === this.height && dpr === this.dpr) return;
        this.width = w; this.height = h; this.dpr = dpr;
        this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Mantém a API anterior (variável CSS), só escrevendo quando muda.
    update(speed) {
        const intensity = Math.round(Math.min(speed / 320, 1) * 100) / 100;
        if (intensity === this.lastIntensity) return;
        this.lastIntensity = intensity;
        this.element.style.setProperty('--speed-intensity', intensity);
    }

    burst() {
        if (this.reducedMotion || !this.ctx || !this.width) return;
        const n = this.quality === 'high' ? 90 : 35;
        for (let i = 0; i < n && this.confetti.length < MAX_PARTICLES; i++) {
            this.confetti.push({ x: this.width / 2, y: this.height * 0.3, vx: (Math.random() - 0.5) * 520, vy: -Math.random() * 380 - 80, size: 4 + Math.random() * 5, color: CONFETTI[i % CONFETTI.length], life: 1.8 });
        }
    }

    render(deltaTime, speedKmh) {
        if (!this.ctx || !this.width) return;
        const { ctx } = this;
        ctx.clearRect(0, 0, this.width, this.height);
        if (this.reducedMotion) return;

        const ratio = Math.min(speedKmh / 320, 1);
        const target = this.quality === 'high' ? Math.round(ratio * 28) : Math.round(ratio * 8);
        while (this.streaks.length < target && this.streaks.length < MAX_PARTICLES) {
            this.streaks.push({ x: Math.random() * this.width, y: this.height * (0.1 + Math.random() * 0.62), len: 30 + Math.random() * 80, v: 0.7 + Math.random() * 0.8 });
        }
        if (this.streaks.length > target) this.streaks.length = target;
        ctx.lineWidth = 1.5;
        for (const s of this.streaks) {
            s.x -= (400 + ratio * 1500) * s.v * deltaTime;
            if (s.x + s.len < 0) { s.x = this.width + Math.random() * 80; s.y = this.height * (0.1 + Math.random() * 0.62); }
            ctx.strokeStyle = `rgba(170,230,255,${0.08 + ratio * 0.22})`;
            ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + s.len, s.y); ctx.stroke();
        }
        for (let i = this.confetti.length - 1; i >= 0; i--) {
            const p = this.confetti[i];
            p.life -= deltaTime;
            if (p.life <= 0) { this.confetti.splice(i, 1); continue; }
            p.vy += 700 * deltaTime; p.x += p.vx * deltaTime; p.y += p.vy * deltaTime;
            ctx.globalAlpha = Math.min(1, p.life); ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, p.size, p.size * 0.6);
        }
        ctx.globalAlpha = 1;
    }

    clear() { this.streaks.length = 0; this.confetti.length = 0; this.ctx?.clearRect(0, 0, this.width, this.height); }
}
