// Logger central do jogo: buffer circular em memória + console opcional.
// Uso no navegador: `velocityType.logs()` (texto) ou `velocityType.logEntries()` (objetos).
const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });

export class Logger {
    static maxEntries = 400;
    static minLevel = 'info';
    // No Node (testes) o console fica mudo por padrão; no navegador, ativo.
    static consoleEnabled = typeof window !== 'undefined';
    static entries = [];
    static counters = { debug: 0, info: 0, warn: 0, error: 0 };

    static log(level, scope, message, data = undefined) {
        const lvl = LEVELS[level] ? level : 'info';
        const entry = { at: new Date().toISOString(), level: lvl, scope: String(scope), message: String(message) };
        if (data !== undefined) entry.data = data;
        this.counters[lvl]++;
        this.entries.push(entry);
        if (this.entries.length > this.maxEntries) this.entries.splice(0, this.entries.length - this.maxEntries);
        if (this.consoleEnabled && LEVELS[lvl] >= LEVELS[this.minLevel]) {
            const fn = lvl === 'error' ? console.error : lvl === 'warn' ? console.warn : console.info;
            fn(`[VT:${entry.scope}] ${entry.message}`, data ?? '');
        }
        return entry;
    }

    static debug(scope, message, data) { return this.log('debug', scope, message, data); }
    static info(scope, message, data) { return this.log('info', scope, message, data); }
    static warn(scope, message, data) { return this.log('warn', scope, message, data); }
    static error(scope, message, data) { return this.log('error', scope, message, data); }

    static getEntries({ level = null, scope = null } = {}) {
        return this.entries.filter(e => (!level || e.level === level) && (!scope || e.scope === scope));
    }

    static dump() {
        return this.entries.map(e => `${e.at} ${e.level.toUpperCase().padEnd(5)} [${e.scope}] ${e.message}${e.data !== undefined ? ' ' + safeStringify(e.data) : ''}`).join('\n');
    }

    static clear() {
        this.entries = [];
        this.counters = { debug: 0, info: 0, warn: 0, error: 0 };
    }
}

function safeStringify(value) {
    try { return JSON.stringify(value); } catch { return String(value); }
}
