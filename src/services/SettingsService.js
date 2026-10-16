import { StorageService, StorageKeys } from './StorageService.js';
import { I18n } from '../i18n/I18n.js';

const KEY = StorageKeys.settings;
const DEFAULTS = Object.freeze({
  language: 'pt', categories: ['computing', 'science', 'people', 'code'],
  difficulty: 'adaptive', mode: 'sprint', errorMode: 'strict', carSkin: 'classic',
  rules: { accents: true, punctuation: true, caseSensitive: true, numbersExact: true }
});

export class SettingsService {
  static defaults() { return structuredClone(DEFAULTS); }
  static load() {
    try {
      const raw = StorageService.get(KEY);
      // Primeira visita: idioma do navegador (pt → português, resto → inglês).
      if (!raw || typeof raw !== 'object') return { ...this.defaults(), language: I18n.detect() };
      return {
        ...this.defaults(), ...raw,
        language: raw.language === 'en' ? 'en' : 'pt',
        categories: Array.isArray(raw.categories) ? raw.categories.filter(x => ['computing','science','people','code'].includes(x)) : [...DEFAULTS.categories],
        difficulty: ['adaptive','very-easy','easy','medium','hard','very-hard'].includes(raw.difficulty) ? raw.difficulty : 'adaptive',
        mode: ['sprint','endurance-5','endurance-10'].includes(raw.mode) ? raw.mode : 'sprint',
        errorMode: raw.errorMode === 'free' ? 'free' : 'strict',
        carSkin: ['classic','neon','gold','phantom','inferno'].includes(raw.carSkin) ? raw.carSkin : 'classic',
        rules: { ...DEFAULTS.rules, ...(raw.rules || {}) }
      };
    } catch { return this.defaults(); }
  }
  static save(settings) {
    return StorageService.set(KEY, settings);
  }
  static normalizeText(text, rules, isCode = false) {
    return this.normalizeForTyping(text, rules, isCode, false);
  }

  // Input normalization must preserve a trailing space: it is a real character
  // the player needs to type to move to the next word. Only targets are trimmed.
  static normalizeInput(text, rules, isCode = false) {
    return this.normalizeForTyping(text, rules, isCode, true);
  }

  static normalizeForTyping(text, rules, isCode, preserveTrailingSpace) {
    let value = String(text);
    if (!isCode) {
      if (!rules.accents) value = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (!rules.punctuation) value = value.replace(/[.,;:!?¿¡…“”"'()\[\]{}—–-]/g, '');
      if (!rules.numbersExact) value = value.replace(/\d+/g, '');
      if (!rules.caseSensitive) value = value.toLocaleLowerCase();
    }
    if (isCode) return preserveTrailingSpace ? value : value.trim();
    value = value.replace(/\s+/g, ' ');
    return preserveTrailingSpace ? value.replace(/^ +/g, '') : value.trim();
  }
}
