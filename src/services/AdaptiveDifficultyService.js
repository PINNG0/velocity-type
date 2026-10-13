import { StorageService, StorageKeys } from './StorageService.js';
import { Logger } from './Logger.js';

const LEVELS = [
  { id: 'very-easy', label: 'Muito fácil', speed: 0.58 },
  { id: 'easy', label: 'Fácil', speed: 0.72 },
  { id: 'easy-medium', label: 'Fácil–Médio', speed: 0.84 },
  { id: 'medium', label: 'Médio', speed: 0.96 },
  { id: 'medium-hard', label: 'Médio–Difícil', speed: 1.08 },
  { id: 'hard', label: 'Difícil', speed: 1.20 },
  { id: 'hard-very-hard', label: 'Difícil–Muito difícil', speed: 1.32 },
  { id: 'very-hard', label: 'Muito difícil', speed: 1.44 },
  { id: 'expert', label: 'Especialista+', speed: 1.56 }
];
const FIXED = { 'very-easy': 0.58, easy: 0.72, medium: 0.96, hard: 1.20, 'very-hard': 1.44 };
const HISTORY_KEY = StorageKeys.adaptiveHistory;
const SKILL_KEY = StorageKeys.skill;

export class AdaptiveDifficultyService {
  static getHistory() { const v = StorageService.get(HISTORY_KEY, []); return Array.isArray(v) ? v : []; }
  static getSkillIndex() { const v = StorageService.get(SKILL_KEY, null); const n = Number(v); return v === null || !Number.isFinite(n) ? 1 : Math.max(0, Math.min(10, Math.floor(n))); }
  static levelForIndex(index) {
    if (index < LEVELS.length) return LEVELS[Math.max(0, index)];
    return { id: `expert-${index - LEVELS.length + 2}`, label: `Especialista+ ${index - LEVELS.length + 2}`, speed: Math.min(1.8, 1.56 + 0.12 * (index - LEVELS.length + 1)) };
  }
  static choose(mode) {
    if (mode !== 'adaptive') {
      const speed = FIXED[mode] ?? FIXED.medium;
      return { mode, levelIndex: Object.keys(FIXED).indexOf(mode), label: ({'very-easy':'Muito fácil',easy:'Fácil',medium:'Médio',hard:'Difícil','very-hard':'Muito difícil'})[mode] || 'Médio', speed };
    }
    const index = this.getSkillIndex();
    const level = this.levelForIndex(index) || LEVELS[1];
    return { mode: 'adaptive', levelIndex: index, label: level.label, speed: level.speed };
  }
  static record(result) {
    const history = this.getHistory();
    const record = { ...result, id: result.id ?? StorageService.newId(), date: new Date().toISOString(), rulesVersion: 1 };
    history.push(record);
    StorageService.set(HISTORY_KEY, history.slice(-500));
    if (result.difficultyMode === 'adaptive') {
      const current = this.getSkillIndex();
      // Several consistent races are required to move the estimate; a single result cannot swing it.
      const recent = history.filter(x => x.difficultyMode === 'adaptive').slice(-4);
      if (recent.length >= 3) {
        const wins = recent.filter(x => x.playerWon).length;
        const avgMargin = recent.reduce((sum, x) => sum + (x.position === 1 ? 1 : x.position === 4 ? -1 : 0), 0) / recent.length;
        let next = current;
        if (wins >= 3 && avgMargin > 0.45) next = Math.min(10, current + 1);
        else if (wins === 0 && recent.filter(x => x.position === 4).length >= 3) next = Math.max(0, current - 1);
        StorageService.set(SKILL_KEY, next);
        if (next !== current) Logger.info('difficulty', 'nível adaptativo alterado', { from: current, to: next });
      }
    }
    return record;
  }
  static labelForIndex(index) { return this.levelForIndex(Math.max(0, Math.min(10, Math.floor(index))))?.label || 'Especialista+'; }
}
