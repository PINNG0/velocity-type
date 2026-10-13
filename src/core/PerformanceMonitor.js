import { Logger } from '../services/Logger.js';

// Mede o tempo de quadro (média móvel) e reduz efeitos quando o aparelho não acompanha.
export class PerformanceMonitor {
    constructor({ lowAboveMs = 26, highBelowMs = 19, minSamples = 90 } = {}) {
        this.lowAboveMs = lowAboveMs; this.highBelowMs = highBelowMs; this.minSamples = minSamples;
        this.avgMs = 16.7; this.samples = 0; this.quality = 'high'; this.listeners = new Set();
    }

    onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

    sample(frameMs) {
        if (!Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 250) return; // ignora abas em segundo plano/pausas
        this.avgMs += (frameMs - this.avgMs) * 0.05;
        if (++this.samples < this.minSamples) return;
        const next = this.quality === 'high' && this.avgMs > this.lowAboveMs ? 'low'
            : this.quality === 'low' && this.avgMs < this.highBelowMs ? 'high' : this.quality;
        if (next !== this.quality) {
            this.quality = next; this.samples = 0;
            Logger.warn('perf', `qualidade visual → ${next}`, { avgFrameMs: +this.avgMs.toFixed(1) });
            this.listeners.forEach(fn => fn(next));
        }
    }
}
