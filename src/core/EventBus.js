import { Logger } from '../services/Logger.js';

// Barramento mínimo para desacoplar domínio/serviços da interface.
// Eventos usados: race:finished, race:recorded, progress:levelup, progress:achievement, race:overtake.
export class EventBus {
    constructor() { this.handlers = new Map(); }

    on(event, handler) {
        if (!this.handlers.has(event)) this.handlers.set(event, new Set());
        this.handlers.get(event).add(handler);
        return () => this.off(event, handler);
    }

    off(event, handler) { this.handlers.get(event)?.delete(handler); }

    emit(event, payload) {
        for (const handler of [...(this.handlers.get(event) ?? [])]) {
            try { handler(payload); } catch (error) {
                Logger.error('eventbus', `handler de "${event}" falhou`, { error: String(error?.message ?? error) });
            }
        }
    }
}

export const bus = new EventBus();
