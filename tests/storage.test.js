import test from 'node:test';
import assert from 'node:assert/strict';
import { installMemoryStorage, baseResult } from './helpers/env.js';
import { StorageService, StorageKeys, HISTORY_LIMIT } from '../src/services/StorageService.js';
import { BackupService } from '../src/services/BackupService.js';
import { ProgressionService } from '../src/services/ProgressionService.js';
import { ProfileService } from '../src/services/ProfileService.js';
import { Logger } from '../src/services/Logger.js';

test('JSON corrompido é isolado em cópia e o jogo continua com o valor padrão', () => {
    const env = installMemoryStorage({ [StorageKeys.history]: '{quebrado' });
    try {
        assert.deepEqual(StorageService.getHistory(), []);
        assert.equal(env.api.store.get(`${StorageKeys.history}:corrupt`), '{quebrado');
        assert.equal(env.api.store.has(StorageKeys.history), false);
        assert.ok(Logger.getEntries({ level: 'error', scope: 'storage' }).length > 0);
    } finally { env.restore(); }
});

test('sem localStorage ou com cota cheia nada lança exceção', () => {
    const previous = globalThis.localStorage;
    delete globalThis.localStorage;
    assert.equal(StorageService.get('x', 'fallback'), 'fallback');
    assert.equal(StorageService.set('x', 1), false);
    const env = installMemoryStorage();
    env.api.failWrites = true;
    assert.equal(StorageService.saveResult(baseResult()), false);
    env.restore();
    if (previous !== undefined) globalThis.localStorage = previous;
});

test('histórico: mais novo primeiro, limitado e sem duplicar ids', () => {
    const env = installMemoryStorage();
    try {
        StorageService.saveResult(baseResult({ id: 'a' }));
        StorageService.saveResult(baseResult({ id: 'b' }));
        assert.equal(StorageService.saveResult(baseResult({ id: 'b' })), false);
        assert.deepEqual(StorageService.getHistory().map(r => r.id), ['b', 'a']);
        for (let i = 0; i < HISTORY_LIMIT + 30; i++) StorageService.saveResult(baseResult({ id: `n${i}` }));
        assert.equal(StorageService.getHistory().length, HISTORY_LIMIT);
        assert.equal(StorageService.getHistory()[0].id, `n${HISTORY_LIMIT + 29}`);
    } finally { env.restore(); }
});

test('mergeHistory mantém os mais recentes (regressão: a importação antiga descartava os novos)', () => {
    const current = Array.from({ length: HISTORY_LIMIT }, (_, i) => baseResult({ id: `cur${i}`, date: new Date(2026, 9, 9, 12, 0, HISTORY_LIMIT - i).toISOString() }));
    const imported = [baseResult({ id: 'old', date: new Date(2020, 0, 1).toISOString() })];
    const merged = StorageService.mergeHistory(current, imported);
    assert.equal(merged.length, HISTORY_LIMIT);
    assert.equal(merged[0].id, 'cur0', 'o registro mais novo deve continuar no topo');
    assert.ok(!merged.some(r => r.id === 'old'), 'o registro mais antigo é que sai');
});

test('sanitizeRecord rejeita dados inválidos e limpa texto', () => {
    assert.equal(StorageService.sanitizeRecord(null), null);
    assert.equal(StorageService.sanitizeRecord({ timeSeconds: 'x', wpm: 1, accuracy: 1 }), null);
    assert.equal(StorageService.sanitizeRecord({ timeSeconds: 10, wpm: 99999, accuracy: 1 }), null);
    const ok = StorageService.sanitizeRecord({ id: '<b>x</b>', timeSeconds: 10, wpm: 50, accuracy: 0.9, modeLabel: '<script>' });
    assert.ok(!ok.id.includes('<') && !ok.modeLabel.includes('<'));
});

test('exportar → importar em ambiente novo restaura corridas, perfil e conquistas', () => {
    const a = installMemoryStorage();
    let backupText;
    const now = new Date(2026, 9, 9, 12);
    try {
        for (let i = 0; i < 4; i++) {
            const r = baseResult({ id: `exp-${i}`, wpm: 70, date: new Date(2026, 9, 9, 10, i).toISOString() });
            StorageService.saveResult(r);
            ProgressionService.processRace(r, { now });
        }
        backupText = JSON.stringify(BackupService.export(now));
    } finally { a.restore(); }

    const b = installMemoryStorage();
    try {
        const summary = BackupService.import(BackupService.parse(backupText), now);
        assert.equal(summary.races, 4);
        assert.equal(StorageService.getHistory().length, 4);
        assert.ok(ProfileService.load(now).totalXp > 0);
        assert.ok(ProgressionService.getOverview(now).achievements.some(x => x.unlockedAt));
        // importar de novo não duplica nada nem reduz XP
        const xp = ProfileService.load(now).totalXp;
        BackupService.import(BackupService.parse(backupText), now);
        assert.equal(StorageService.getHistory().length, 4);
        assert.equal(ProfileService.load(now).totalXp, xp);
    } finally { b.restore(); }
});

test('importação aceita formato legado e rejeita arquivos inválidos/gigantes', () => {
    const env = installMemoryStorage();
    try {
        assert.equal(BackupService.import([baseResult({ id: 'legacy' })]).races, 1);
        assert.throws(() => BackupService.import({ races: 'x' }), /lista de corridas/);
        assert.throws(() => BackupService.import({ races: [{ lixo: true }] }), /válido/);
        assert.throws(() => BackupService.parse('{', 10), /JSON/);
        assert.throws(() => BackupService.parse('[]', 6 * 1024 * 1024), /5 MB/);
        assert.throws(() => BackupService.import({ races: new Array(5001).fill(baseResult()) }), /demais/);
    } finally { env.restore(); }
});

test('importar um perfil com menos XP nunca reduz o progresso local', () => {
    const env = installMemoryStorage();
    try {
        const now = new Date(2026, 9, 9);
        ProgressionService.processRace(baseResult({ id: 'mine', wpm: 100, accuracy: 1 }), { now });
        const mine = ProfileService.load(now).totalXp;
        BackupService.import({ races: [baseResult({ id: 'x' })], profile: { totalXp: 1 } }, now);
        assert.equal(ProfileService.load(now).totalXp, mine);
    } finally { env.restore(); }
});

test('Logger mantém buffer circular e dump legível', () => {
    Logger.clear();
    for (let i = 0; i < Logger.maxEntries + 50; i++) Logger.debug('t', `m${i}`);
    assert.equal(Logger.getEntries().length, Logger.maxEntries);
    assert.match(Logger.dump().split('\n').pop(), /\[t\] m449/);
    Logger.clear();
});
