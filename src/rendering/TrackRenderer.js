import { worldPercent } from './Camera.js';

const PX_PER_METER = 22;

// Pista em canvas: asfalto, faixas e zebras que rolam rápido, postes de neon e as linhas de
// largada/chegada (quadriculadas) posicionadas pela câmera. Os carros ficam em DOM por cima.
export class TrackRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas?.getContext?.('2d') ?? null;
        this.width = 0; this.height = 0; this.dpr = 1;
        this.offset = 0; this.quality = 'high';
        this.active = Boolean(this.ctx);
        this.view = null;
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
        this.draw(0, false);
    }

    reset() { this.offset = 0; this.view = null; this.draw(0, false); }

    // view = { playerPos, target } (metros) para posicionar largada/chegada.
    render(deltaTime, speedKmh, view = null, turbo = false) {
        if (!this.active || !this.width) return;
        this.view = view;
        this.offset = (this.offset + (speedKmh / 3.6) * deltaTime * PX_PER_METER * (turbo ? 1.2 : 1)) % 100000;
        this.draw(speedKmh, turbo);
    }

    checkered(x, roadTop, roadBottom) {
        const { ctx } = this;
        const size = 9, cols = 2;
        for (let row = 0, y = roadTop; y < roadBottom; row++, y += size) {
            for (let c = 0; c < cols; c++) {
                ctx.fillStyle = (row + c) % 2 === 0 ? '#f3f5f7' : '#07090c';
                ctx.fillRect(x + c * size, y, size, Math.min(size, roadBottom - y));
            }
        }
        ctx.fillStyle = 'rgba(255,255,255,.18)';
        ctx.fillRect(x - 3, roadTop, 2, roadBottom - roadTop);
    }

    draw(speedKmh, turbo) {
        const { ctx, width: w, height: h } = this;
        const roadTop = h * 0.04, roadBottom = h * 0.96, roadH = roadBottom - roadTop;
        ctx.clearRect(0, 0, w, h);

        const asphalt = ctx.createLinearGradient(0, roadTop, 0, roadBottom);
        asphalt.addColorStop(0, '#0f1620'); asphalt.addColorStop(0.5, '#171f2b'); asphalt.addColorStop(1, '#0b1119');
        ctx.fillStyle = asphalt;
        ctx.fillRect(0, roadTop, w, roadH);

        // zebras (vermelho/branco) rolando junto com o asfalto
        const curb = 28, curbH = Math.max(5, h * 0.03), shift = this.offset % (curb * 2);
        for (let x = -curb * 2 + shift; x < w + curb; x += curb) {
            const red = Math.round((x - shift) / curb) % 2 === 0;
            ctx.fillStyle = red ? '#d8344a' : '#e8eef6';
            ctx.fillRect(x, roadTop - curbH + 2, curb, curbH);
            ctx.fillRect(x, roadBottom - 2, curb, curbH);
        }

        // divisórias tracejadas: o traço alonga com a velocidade (efeito de borrão)
        const dash = 34 + Math.min(speedKmh / 6, 50);
        ctx.strokeStyle = 'rgba(200,225,255,.4)'; ctx.lineWidth = 3;
        ctx.setLineDash([dash, 40]); ctx.lineDashOffset = this.offset;
        for (let i = 1; i <= 3; i++) {
            const y = roadTop + (roadH * i) / 4;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
        ctx.setLineDash([]);

        if (this.view) {
            const { playerPos, target } = this.view;
            for (const meters of [0, target]) {
                const x = worldPercent(meters, playerPos) / 100 * w;
                if (x > -40 && x < w + 20) this.checkered(x, roadTop, roadBottom);
            }
        }

        if (this.quality === 'high') {
            ctx.fillStyle = turbo ? '#ffb347' : '#55d6ff';
            ctx.fillRect(0, roadTop - curbH, w, 2); ctx.fillRect(0, roadBottom + curbH - 1, w, 2);
            const gap = 210, px = (this.offset * 0.9) % gap;
            ctx.fillStyle = turbo ? 'rgba(255,179,71,.6)' : 'rgba(85,214,255,.55)';
            for (let x = -gap + px; x < w + gap; x += gap) ctx.fillRect(x, roadBottom + curbH + 4, 3, 16);
        }
        if (turbo) { ctx.fillStyle = 'rgba(255,170,60,.06)'; ctx.fillRect(0, roadTop, w, roadH); }
    }
}
