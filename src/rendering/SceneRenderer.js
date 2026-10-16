// Cenário em paralaxe (montanhas → colinas → árvores/prédios → mureta com postes de luz).
// Cada camada rola numa velocidade diferente: é isso que dá a sensação de movimento.
const PX_PER_METER = { far: 0.5, mid: 1.4, near: 4, fence: 20 };
const TILE = { far: 2400, mid: 1800, near: 1300 };
const TAU = Math.PI * 2;

// Perfil periódico (soma de senos com períodos inteiros): emenda perfeita ao rolar.
const profile = (x, tile, waves) => waves.reduce((sum, [k, amp, phase]) => sum + amp * Math.sin(TAU * k * x / tile + phase), 0);
const WAVES = {
    far: [[2, 0.5, 0.3], [5, 0.25, 1.7], [11, 0.12, 2.9]],
    mid: [[3, 0.45, 2.1], [7, 0.28, 0.4], [16, 0.12, 4.2]],
    near: [[9, 0.35, 1.1], [23, 0.3, 3.3], [41, 0.18, 5.1]]
};

export class SceneRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas?.getContext?.('2d') ?? null;
        this.active = Boolean(this.ctx);
        this.width = 0; this.height = 0; this.dpr = 1;
        this.offset = { far: 0, mid: 0, near: 0, fence: 0 };
        this.quality = 'high';
    }

    setQuality(quality) { this.quality = quality; }

    resize() {
        if (!this.active) return;
        const rect = this.canvas.getBoundingClientRect();
        const dpr = Math.min(globalThis.devicePixelRatio || 1, 1.5);
        const w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
        if (w === this.width && h === this.height && dpr === this.dpr) return;
        this.width = w; this.height = h; this.dpr = dpr;
        this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.draw(false);
    }

    reset() { for (const k of Object.keys(this.offset)) this.offset[k] = 0; this.draw(false); }

    render(deltaTime, speedKmh, turbo = false) {
        if (!this.active || !this.width) return;
        const v = (speedKmh / 3.6) * (turbo ? 1.2 : 1) * deltaTime;
        for (const k of Object.keys(this.offset)) this.offset[k] = (this.offset[k] + v * PX_PER_METER[k]) % 1e6;
        this.draw(turbo);
    }

    layer(key, baseY, maxH, color, step = 10) {
        const { ctx, width: w } = this;
        const tile = TILE[key], shift = this.offset[key];
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, baseY);
        for (let x = 0; x <= w + step; x += step) {
            const h = (profile(x + shift, tile, WAVES[key]) + 1) * 0.5 * maxH; // 0..maxH
            ctx.lineTo(x, baseY - Math.max(2, h));
        }
        ctx.lineTo(w + step, baseY);
        ctx.closePath();
        ctx.fill();
    }

    draw(turbo) {
        const { ctx, width: w, height: h } = this;
        // A pista começa em 28% da altura da corrida; o céu ocupa 61%: a mureta fica logo acima da pista.
        const baseY = h * (28 / 61);
        ctx.clearRect(0, 0, w, h);

        this.layer('far', baseY - 14, baseY * 0.62, '#12263b', 12);
        if (this.quality === 'high') this.layer('mid', baseY - 10, baseY * 0.4, '#0d1d2f', 10);
        this.layer('near', baseY - 6, baseY * 0.2, '#08131f', 8);

        // mureta: duas barras + balaústres que rolam
        const fence = this.offset.fence;
        ctx.fillStyle = '#9fb0c4';
        ctx.fillRect(0, baseY - 18, w, 3);
        ctx.fillRect(0, baseY - 8, w, 2);
        ctx.fillStyle = '#6f8196';
        const gap = 34;
        for (let x = -((fence % gap)); x < w + gap; x += gap) ctx.fillRect(x, baseY - 18, 3, 18);

        // postes de luz: passam rápido, com brilho
        const lampGap = 460;
        for (let x = -((fence * 1.0) % lampGap) + 120; x < w + lampGap; x += lampGap) {
            ctx.fillStyle = '#7c8ca1';
            ctx.fillRect(x, baseY - 86, 3, 70);
            ctx.fillRect(x, baseY - 86, 20, 3);
            ctx.fillStyle = turbo ? '#ffd9a0' : '#fff2b8';
            ctx.fillRect(x + 16, baseY - 84, 10, 4);
            if (this.quality === 'high') { ctx.fillStyle = 'rgba(255,242,184,.10)'; ctx.fillRect(x - 6, baseY - 80, 44, 58); }
        }
    }
}
