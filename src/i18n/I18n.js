import { pt } from './pt.js';
import { en } from './en.js';

const DICTS = { pt, en };

// Tradução da interface. Chaves em pt.js/en.js; texto estático do HTML usa data-i18n / data-i18n-attr.
export class I18n {
    static lang = 'pt';
    static languages = ['pt', 'en'];

    // Navegador em português → pt; qualquer outro → en. Sem navegador (testes/Node) → pt.
    static detect() {
        const language = globalThis.window?.navigator?.language;
        if (!language) return 'pt';
        return /^pt/i.test(language) ? 'pt' : 'en';
    }

    static setLanguage(lang) {
        this.lang = DICTS[lang] ? lang : 'pt';
        try { if (globalThis.document?.documentElement) globalThis.document.documentElement.lang = this.lang === 'en' ? 'en' : 'pt-BR'; } catch { /* sem DOM */ }
        return this.lang;
    }

    static t(key, params = null, fallback = null) {
        const raw = DICTS[this.lang]?.[key] ?? DICTS.pt[key] ?? fallback ?? key;
        return params ? raw.replace(/\{(\w+)\}/g, (match, name) => (params[name] !== undefined ? String(params[name]) : match)) : raw;
    }

    // Traduz um rótulo que foi salvo em português (ex.: "Sprint · 2,4 km"): procura nas chaves com o prefixo.
    static localize(prefix, text) {
        for (const [key, value] of Object.entries(DICTS.pt)) if (key.startsWith(prefix) && value === text) return this.t(key);
        return text;
    }

    static apply(root = globalThis.document) {
        if (!root?.querySelectorAll) return;
        root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = this.t(el.getAttribute('data-i18n')); });
        root.querySelectorAll('[data-i18n-attr]').forEach(el => {
            for (const pair of el.getAttribute('data-i18n-attr').split(';')) {
                const [attr, key] = pair.split(':');
                if (attr && key) el.setAttribute(attr, this.t(key));
            }
        });
    }
}

export const t = (key, params, fallback) => I18n.t(key, params, fallback);
