import { StorageService } from '../services/StorageService.js';
import { BackupService } from '../services/BackupService.js';
import { Logger } from '../services/Logger.js';

const lang = r => r.language === 'en' ? 'English' : 'Português';

// Histórico de corridas: listas, estatísticas, exportação, importação e limpeza.
export class RecordsView {
    constructor(elements, { escape, notify, onDataChanged }) {
        this.el = elements; this.escape = escape; this.notify = notify; this.onDataChanged = onDataChanged;
    }

    bind() {
        const el = this.el;
        el.recordDetailsToggle?.addEventListener('click', () => {
            const open = el.recordDetails.hidden;
            el.recordDetails.hidden = !open;
            el.recordDetailsToggle.setAttribute('aria-expanded', String(open));
            el.recordDetailsToggle.textContent = open ? 'OCULTAR DETALHES' : 'DETALHES DA CORRIDA';
        });
        el.openRecords?.addEventListener('click', () => {
            const panel = el.recordsPanel;
            panel.hidden = !panel.hidden;
            if (!panel.hidden) this.renderRecords();
            el.openRecords.textContent = panel.hidden ? 'MEUS RECORDES' : 'OCULTAR RECORDES';
        });
        el.menuRecordsToggle?.addEventListener('click', () => {
            const panel = el.menuRecordsPanel;
            panel.hidden = !panel.hidden;
            el.menuRecordsToggle.setAttribute('aria-expanded', String(!panel.hidden));
            el.menuRecordsToggle.textContent = panel.hidden ? 'MEUS RECORDES E ESTATÍSTICAS' : 'OCULTAR HISTÓRICO';
            if (!panel.hidden) this.renderMenuRecords();
        });
        el.exportRecords?.addEventListener('click', () => this.exportRecords());
        el.importRecords?.addEventListener('click', () => el.importRecordsFile?.click());
        el.importRecordsFile?.addEventListener('change', event => void this.importRecords(event.target.files?.[0]));
        el.clearRecords?.addEventListener('click', () => this.clearRecords());
    }

    clearRecords() {
        if (!window.confirm('Apagar todo o histórico de corridas deste navegador? (O perfil, XP e conquistas são mantidos.)')) return;
        StorageService.clearHistory();
        this.renderMenuRecords(); this.renderRecords();
        this.notify('Histórico de corridas apagado.', 'info');
    }

    exportRecords() {
        const backup = BackupService.export();
        if (!backup.races.length && !backup.profile.totalXp) { this.notify('Ainda não há dados para exportar.', 'warn'); return; }
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `velocity-type-backup-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        Logger.info('backup', 'exportação gerada', { races: backup.races.length });
        this.notify(`Backup exportado (${backup.races.length} corridas, perfil e conquistas).`, 'success');
    }

    async importRecords(file) {
        if (!file) return;
        try {
            if (file.size > 5 * 1024 * 1024) throw new Error('O arquivo excede o limite de 5 MB.');
            const summary = BackupService.import(BackupService.parse(await file.text(), file.size));
            this.onDataChanged?.();
            this.renderMenuRecords(); this.renderRecords();
            this.notify(`${summary.races} corrida(s) importada(s)${summary.profile ? ' e perfil atualizado' : ''}.`, 'success');
        } catch (error) {
            Logger.warn('backup', 'importação rejeitada', { error: String(error.message) });
            this.notify(`Não foi possível importar: ${error.message}`, 'error');
        } finally {
            if (this.el.importRecordsFile) this.el.importRecordsFile.value = '';
        }
    }

    renderMenuRecords() {
        const history = StorageService.getHistory();
        const completed = history.length;
        const wins = history.filter(r => r.playerWon || Number(r.position) === 1).length;
        const avgWpm = completed ? Math.round(history.reduce((s, r) => s + Number(r.wpm || 0), 0) / completed) : 0;
        const avgAccuracy = completed ? Math.round(history.reduce((s, r) => s + Number(r.accuracy || 0), 0) / completed * 100) : 0;
        if (this.el.playerSummary) {
            this.el.playerSummary.innerHTML = `<div><strong>${completed}</strong><span>corridas</span></div><div><strong>${wins}</strong><span>vitórias</span></div><div><strong>${avgWpm}</strong><span>WPM médio</span></div><div><strong>${avgAccuracy}%</strong><span>precisão média</span></div>`;
        }
        if (!this.el.menuRecordsList) return;
        const e = this.escape;
        this.el.menuRecordsList.innerHTML = history.length ? history.slice(0, 12).map((r, i) => `
            <button class="record-row" type="button" data-menu-record-index="${i}">
                <span><b>${e(r.modeLabel || 'Corrida')} · ${e(r.position || '?')}/4</b><small>${e(r.difficultyLabel || 'Médio')} · ${e(lang(r))} · ${new Date(r.date || Date.now()).toLocaleString()}</small></span>
                <strong>${Number(r.timeSeconds || 0).toFixed(1)}s</strong>
            </button>`).join('') : '<p class="records-empty">Complete uma corrida para começar seu histórico.</p>';
        this.el.menuRecordsList.querySelectorAll('[data-menu-record-index]').forEach(button => button.addEventListener('click', () => {
            const r = history[Number(button.dataset.menuRecordIndex)];
            window.alert([
                `Posição: ${r.position || '?'} / 4`, `Tempo: ${Number(r.timeSeconds || 0).toFixed(1)} s`,
                `WPM: ${Math.round(r.wpm || 0)}`, `Precisão: ${Math.round((r.accuracy || 0) * 100)}%`,
                `Erros: ${r.errors ?? 0}`, `Combo máximo: ${r.bestCombo || 0}`,
                `Distância: ${r.distance || 0} m`, `Dificuldade: ${r.difficultyLabel || '—'}`,
                `Modo: ${r.modeLabel || '—'}`, `Idioma: ${lang(r)}`,
                `Temas: ${(r.categories || []).join(', ') || 'Todos'}`,
                `Regras: acentos ${r.rules?.accents ? 'sim' : 'não'}, pontuação ${r.rules?.punctuation ? 'sim' : 'não'}, maiúsculas ${r.rules?.caseSensitive ? 'sim' : 'não'}, números exatos ${r.rules?.numbersExact ? 'sim' : 'não'}`
            ].join('\n'));
        }));
    }

    renderRecords() {
        const history = StorageService.getHistory();
        const e = this.escape;
        this.el.recordsList.innerHTML = history.length ? history.map((r, i) => `
          <button class="record-row" type="button" data-record-index="${i}">
            <span><b>#${i + 1} · ${e(r.position || '?')}/4</b><small>${e(r.modeLabel || 'Corrida')} · ${new Date(r.date || Date.now()).toLocaleDateString()}</small></span>
            <strong>${Number(r.timeSeconds || 0).toFixed(1)}s</strong>
          </button>`).join('') : '<p class="records-empty">Ainda não há corridas registradas.</p>';
        this.el.recordsList.querySelectorAll('[data-record-index]').forEach(button => button.addEventListener('click', () => {
            const r = history[Number(button.dataset.recordIndex)];
            const el = this.el;
            el.recordDetails.hidden = false;
            el.recordDetailsToggle.textContent = 'OCULTAR DETALHES';
            el.recordDetailsToggle.setAttribute('aria-expanded', 'true');
            el.resultWpm.textContent = Math.round(r.wpm || 0);
            el.resultAccuracy.textContent = `${Math.round((r.accuracy || 0) * 100)}%`;
            el.resultErrors.textContent = r.errors ?? 0;
            el.resultTime.textContent = `${Number(r.timeSeconds || 0).toFixed(1)}s`;
            el.resultSpeed.textContent = `${Math.round(r.maxSpeed || 0)} km/h`;
            el.resultPhrases.textContent = r.phrasesCompleted ?? 0;
            el.resultConfig.textContent = this.describeConfig(r);
        }));
    }

    describeConfig(r) {
        const rules = r.rules || {};
        return `Dificuldade: ${r.difficultyLabel || '—'} · ${r.modeLabel || '—'} · ${lang(r)} · Temas: ${(r.categories || []).join(', ') || 'Todos os temas'} · Acentos: ${rules.accents ? 'sim' : 'não'} · Pontuação: ${rules.punctuation ? 'sim' : 'não'} · Maiúsculas: ${rules.caseSensitive ? 'sim' : 'não'} · Números: ${rules.numbersExact ? 'exatos' : 'flexíveis'} · Combo máx.: ${r.bestCombo || 0} · Data: ${new Date(r.date || Date.now()).toLocaleString()}`;
    }
}
