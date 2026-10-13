// Pista desenhada em canvas: asfalto, faixas e zebras que rolam conforme a velocidade,
// postes de neon na lateral (parallax). Os carros continuam em DOM por cima.
export class TrackRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas?.getContext?.('2d') ?? null;
        this.width = 0; this.height = 0; this.dpr = 1;
        this.offset = 0; this.quality = 'high';
        this.active = Boolean(this.ctx);
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
        this.draw(0);
    }

    reset() { this.offset = 0; this.draw(0); }

    render(deltaTime, speedKmh) {
        if (!this.active || !this.width) return;
        this.offset = (this.offset + (speedKmh / 3.6) * deltaTime * 14) % 100000;
        this.draw(speedKmh);
    }

    draw(speedKmh) {
        const { ctx, width: w, height: h } = this;
        const roadTop = h * 0.12, roadBottom = h * 0.9, roadH = roadBottom - roadTop;
        ctx.clearRect(0, 0, w, h);

        const asphalt = ctx.createLinearGradient(0, roadTop, 0, roadBottom);
        asphalt.addColorStop(0, '#0d141d'); asphalt.addColorStop(0.5, '#141d29'); asphalt.addColorStop(1, '#0a1018');
        ctx.fillStyle = asphalt;
        ctx.fillRect(0, roadTop, w, roadH);

        // zebras (vermelho/branco) nas duas bordas
        const curb = 28, curbH = Math.max(5, h * 0.025), shift = this.offset % (curb * 2);
        for (let x = -curb * 2 + shift; x < w + curb; x += curb) {
            const red = Math.round((x - shift) / curb) % 2 === 0;
            ctx.fillStyle = red ? '#d8344a' : '#e8eef6';
            ctx.fillRect(x, roadTop - curbH, curb, curbH);
            ctx.fillRect(x, roadBottom, curb, curbH);
        }

        // divisórias de faixa tracejadas
        ctx.strokeStyle = 'rgba(190,220,255,.35)'; ctx.lineWidth = 2;
        ctx.setLineDash([34, 30]); ctx.lineDashOffset = this.offset;
        for (let i = 1; i <= 3; i++) {
            const y = roadTop + (roadH * i) / 4;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
        ctx.setLineDash([]);

        if (this.quality === 'high') {
            // faixas de neon nas bordas + postes com parallax (mais lentos que o asfalto)
            ctx.shadowColor = '#55d6ff'; ctx.shadowBlur = 10; ctx.fillStyle = '#55d6ff';
            ctx.fillRect(0, roadTop - curbH - 3, w, 2); ctx.fillRect(0, roadBottom + curbH + 1, w, 2);
            ctx.shadowBlur = 0;
            const gap = 210, px = (this.offset * 0.45) % gap;
            ctx.fillStyle = 'rgba(85,214,255,.55)';
            for (let x = -gap + px; x < w + gap; x += gap) {
                ctx.fillRect(x + gap / 2, roadTop - curbH - 22, 3, 18);
                ctx.fillRect(x, roadBottom + curbH + 6, 3, 18);
            }
        }
        if (speedKmh > 220 && this.quality === 'high') { ctx.fillStyle = 'rgba(85,214,255,.04)'; ctx.fillRect(0, roadTop, w, roadH); }
    }
}
