import { StorageService, StorageKeys } from './StorageService.js';
import { ProfileService } from './ProfileService.js';
import { ProgressService } from './ProgressionService.js';
import { PlayerProfile } from '../domain/progression/PlayerProfile.js';
import { sanitizeProgressState, mergeProgressStates, localDayKey } from '../domain/progression/ProgressTracker.js';
import { Logger } from './Logger.js';

export const BACKUP_SCHEMA = 2;
export const BACKUP_MAX_BYTES = 5 * 1024 * 1024;

// Exportação/importação do save completo (corridas + perfil + objetivos).
export class BackupService {
    static export(now = new Date()) {
        return {
            app: 'velocity-type', schemaVersion: BACKUP_SCHEMA, exportedAt: now.toISOString(),
            races: StorageService.getHistory(),
            profile: ProfileService.load(now),
            progress: ProgressService.load(localDayKey(now))
        };
    }

    static parse(text, size = String(text ?? '').length) {
        if (size > BACKUP_MAX_BYTES) throw new Error('O arquivo excede o limite de 5 MB.');
        let data;
        try { data = JSON.parse(text); } catch { throw new Error('O arquivo não é um JSON válido.'); }
        return data;
    }

    // Aceita o formato legado (lista simples ou { races }) e o v2. Nunca reduz o progresso local.
    static import(data, now = new Date()) {
        const rawRaces = Array.isArray(data) ? data : data?.races;
        if (!Array.isArray(rawRaces)) throw new Error('O arquivo não contém uma lista de corridas.');
        if (rawRaces.length > 5000) throw new Error('O arquivo contém registros demais (máximo: 5.000).');
        const valid = rawRaces.map(r => StorageService.sanitizeRecord(r)).filter(Boolean);
        if (!valid.length) throw new Error('Nenhum registro válido foi encontrado.');

        const current = StorageService.getHistory().map(r => StorageService.sanitizeRecord(r)).filter(Boolean);
        const merged = StorageService.mergeHistory(current, valid);
        if (!StorageService.replaceHistory(merged)) throw new Error('Não foi possível gravar (armazenamento cheio ou bloqueado).');

        const summary = { races: valid.length, profile: false, progress: false };
        if (!Array.isArray(data) && data?.profile) {
            const incoming = PlayerProfile.sanitize(data.profile, now);
            const mine = ProfileService.load(now);
            if (incoming.totalXp > mine.totalXp) {
                const ids = [...new Set([...mine.awardedIds, ...incoming.awardedIds])];
                incoming.awardedIds = ids.slice(-300);
                incoming.history = [...mine.history, ...incoming.history.filter(h => !mine.history.some(m => m.id === h.id))].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 100);
                summary.profile = ProfileService.save(incoming);
            } else {
                mine.awardedIds = [...new Set([...mine.awardedIds, ...incoming.awardedIds])].slice(-300);
                ProfileService.save(mine);
            }
        }
        if (!Array.isArray(data) && data?.progress) {
            const dayKey = localDayKey(now);
            summary.progress = ProgressService.save(mergeProgressStates(ProgressService.load(dayKey), sanitizeProgressState(data.progress, dayKey)));
        }
        Logger.info('backup', 'importação concluída', summary);
        return summary;
    }
}
