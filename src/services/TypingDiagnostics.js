import { Logger } from './Logger.js';

// Diagnóstico focado em marcos e anomalias (nunca por tecla). Encaminha ao Logger
// e, em desenvolvimento, ao terminal do `npm run dev` via endpoint do Vite.
const CONSOLE_MILESTONES = new Set(['race-start', 'race-paused', 'race-resumed', 'race-finished', 'race-aborted', 'challenge-complete', 'typing-invariant']);

export class TypingDiagnostics {
    static enabled = true;
    static log(event, details = {}) {
        if (!this.enabled) return;
        const name = String(event).slice(0, 80);
        const entry = { event: name, at: new Date().toISOString(), ...details };
        Logger.log(name === 'typing-invariant' ? 'warn' : 'debug', 'race', name, details);
        if (import.meta.env?.DEV && typeof fetch === 'function') {
            fetch('/__velocity-debug', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(entry), keepalive: true
            }).catch(() => {});
        }
        if (CONSOLE_MILESTONES.has(name) && Logger.consoleEnabled) console.info('[Velocity Type]', entry);
    }
}
