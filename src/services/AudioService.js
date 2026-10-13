import { StorageService, StorageKeys } from './StorageService.js';
import { Logger } from './Logger.js';

const clamp01 = v => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
// Intervalo mínimo entre repetições de cada efeito (ms) para evitar "metralhadora" de sons.
const MIN_GAP = { error: 90, phrase: 60, combo: 200, overtake: 400, tick: 40 };

// Áudio 100% procedural (WebAudio): não depende de arquivos e falha em silêncio se indisponível.
export class AudioService {
    constructor() {
        this.context = null;
        this.master = null;
        this.engine = null;
        this.lastPlayed = {};
        this.lastEngineUpdate = 0;
        const saved = StorageService.get(StorageKeys.audio, {}) || {};
        this.muted = saved.muted === true;
        this.volume = clamp01(saved.volume ?? 0.7);
    }

    initialize() {
        if (this.context) { this.resume(); return; }
        const Ctx = globalThis.window?.AudioContext || globalThis.window?.webkitAudioContext;
        if (!Ctx) { Logger.warn('audio', 'WebAudio indisponível: jogo seguirá sem som'); return; }
        try {
            this.context = new Ctx();
            this.master = this.context.createGain();
            this.master.gain.value = this.muted ? 0 : this.volume;
            this.master.connect(this.context.destination);
            Logger.info('audio', 'contexto de áudio criado', { muted: this.muted, volume: this.volume });
        } catch (error) { Logger.error('audio', 'falha ao criar AudioContext', { error: String(error) }); this.context = null; }
    }

    resume() {
        if (this.context?.state === 'suspended') this.context.resume().catch(() => {});
    }

    persist() { StorageService.set(StorageKeys.audio, { muted: this.muted, volume: this.volume }); }

    setMuted(muted) {
        this.muted = Boolean(muted);
        if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
        if (this.muted) this.stopEngine();
        this.persist();
        return this.muted;
    }

    toggleMute() { return this.setMuted(!this.muted); }

    setVolume(volume) {
        this.volume = clamp01(volume);
        if (this.master && !this.muted) this.master.gain.value = this.volume;
        this.persist();
    }

    tone(frequency = 440, duration = 0.08, { type = 'sine', gain = 0.05, slideTo = null, delay = 0 } = {}) {
        if (!this.context || !this.master || this.muted) return;
        try {
            const t0 = this.context.currentTime + delay;
            const osc = this.context.createOscillator();
            const g = this.context.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(frequency, t0);
            if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + duration);
            g.gain.setValueAtTime(gain, t0);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
            osc.connect(g); g.connect(this.master);
            osc.start(t0); osc.stop(t0 + duration + 0.02);
        } catch (error) { Logger.debug('audio', 'tone falhou', { error: String(error) }); }
    }

    // Compatível com o uso anterior.
    beep(frequency = 440, duration = 0.08) { this.tone(frequency, duration, { type: 'sine', gain: 0.04 }); }

    sfx(name) {
        const now = performance.now();
        const gap = MIN_GAP[name] ?? 0;
        if (gap && now - (this.lastPlayed[name] ?? -1e9) < gap) return;
        this.lastPlayed[name] = now;
        switch (name) {
            case 'countdown': this.tone(520, 0.12, { type: 'square', gain: 0.035 }); break;
            case 'go': this.tone(880, 0.35, { type: 'square', gain: 0.045, slideTo: 1320 }); break;
            case 'phrase': this.tone(760, 0.06, { gain: 0.04 }); break;
            case 'error': this.tone(150, 0.09, { type: 'sawtooth', gain: 0.035, slideTo: 90 }); break;
            case 'combo': this.tone(660, 0.08, { gain: 0.045 }); this.tone(990, 0.12, { gain: 0.045, delay: 0.07 }); break;
            case 'overtake': this.tone(400, 0.2, { type: 'triangle', gain: 0.05, slideTo: 900 }); break;
            case 'overtaken': this.tone(500, 0.2, { type: 'triangle', gain: 0.04, slideTo: 250 }); break;
            case 'finish': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', gain: 0.05, delay: i * 0.1 })); break;
            case 'levelup': [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, { type: 'square', gain: 0.04, delay: i * 0.08 })); break;
            case 'achievement': this.tone(784, 0.12, { gain: 0.05 }); this.tone(1175, 0.25, { gain: 0.05, delay: 0.1 }); break;
            default: break;
        }
    }

    startEngine() {
        if (!this.context || !this.master || this.engine || this.muted) return;
        try {
            const osc = this.context.createOscillator();
            const filter = this.context.createBiquadFilter();
            const gain = this.context.createGain();
            osc.type = 'sawtooth'; osc.frequency.value = 55;
            filter.type = 'lowpass'; filter.frequency.value = 300;
            gain.gain.value = 0.0001;
            osc.connect(filter); filter.connect(gain); gain.connect(this.master);
            osc.start();
            this.engine = { osc, filter, gain };
        } catch (error) { Logger.warn('audio', 'motor indisponível', { error: String(error) }); }
    }

    // Chamado todo quadro, mas só atualiza o grafo de áudio ~12x/s.
    updateEngine(speedRatio) {
        if (!this.engine || !this.context) return;
        const now = performance.now();
        if (now - this.lastEngineUpdate < 80) return;
        this.lastEngineUpdate = now;
        const r = clamp01(speedRatio), t = this.context.currentTime;
        this.engine.osc.frequency.setTargetAtTime(55 + r * 150, t, 0.1);
        this.engine.filter.frequency.setTargetAtTime(260 + r * 900, t, 0.1);
        this.engine.gain.gain.setTargetAtTime(r > 0.02 ? 0.012 + r * 0.02 : 0.0001, t, 0.15);
    }

    stopEngine() {
        if (!this.engine) return;
        try { this.engine.gain.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.05); this.engine.osc.stop(this.context.currentTime + 0.3); } catch { /* já parado */ }
        this.engine = null;
    }
}
