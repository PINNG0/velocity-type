import { StorageService } from '../services/StorageService.js';
import { BackupService } from '../services/BackupService.js';
import { Logger } from '../services/Logger.js';
import { I18n, t } from '../i18n/I18n.js';

const lang = r => r.language === 'en' ? 'English' : 'Português';
const yesNo = v => t(v ? 'yes' : 'no');
const mode = r => I18n.localize('mode.', r.modeLabel || t('records.race'));
const difficulty = r => I18n.localize('diff.', r.difficultyLabel || '—');
const topics = r => (r.categories || []).map(c => t(`topics.${c}`, null, c)).join(', ') || t('topics.all');

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
            el.recordDetailsToggle.textContent = t(open ? 'result.hideDetails' : 'result.details');
        });
        el.openRecords?.addEventListener('click', () => {
            const panel = el.recordsPanel;
            panel.hidden = !panel.hidden;
            if (!panel.hidden) this.renderRecords();
            el.openRecords.textContent = t(panel.hidden ? 'result.records' : 'result.recordsHide');
        });
        el.menuRecordsToggle?.addEventListener('click', () => {
            const panel = el.menuRecordsPanel;
            panel.hidden = !panel.hidden;
            el.menuRecordsToggle.setAttribute('aria-expanded', String(!panel.hidden));
            el.menuRecordsToggle.textContent = t(panel.hidden ? 'menu.records' : 'menu.recordsHide');
            if (!panel.hidden) this.renderMenuRecords();
        });
        el.exportRecords?.addEventListener('click', () => this.exportRecords());
        el.importRecords?.addEventListener('click', () => el.importRecordsFile?.click());
        el.importRecordsFile?.addEventListener('change', event => void this.importRecords(event.target.files?.[0]));
        el.clearRecords?.addEventListener('click', () => this.clearRecords());
    }

    // Reaplica textos dependentes do estado dos botões quando o idioma muda.
    refreshLabels() {
        const el = this.el;
        if (el.menuRecordsToggle && el.menuRecordsPanel) el.menuRecordsToggle.textContent = t(el.menuRecordsPanel.hidden ? 'menu.records' : 'menu.recordsHide');
        if (el.openRecords && el.recordsPanel) el.openRecords.textContent = t(el.recordsPanel.hidden ? 'result.records' : 'result.recordsHide');
        if (el.recordDetailsToggle && el.recordDetails) el.recordDetailsToggle.textContent = t(el.recordDetails.hidden ? 'result.details' : 'result.hideDetails');
        if (el.menuRecordsPanel && !el.menuRecordsPanel.hidden) this.renderMenuRecords();
    }

    clearRecords() {
        if (!window.confirm(t('records.confirmClear'))) return;
        StorageService.clearHistory();
        this.renderMenuRecords(); this.renderRecords();
        this.notify(t('records.cleared'), 'info');
    }

    exportRecords() {
        const backup = BackupService.export();
        if (!backup.races.length && !backup.profile.totalXp) { this.notify(t('records.nothingExport'), 'warn'); return; }
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `velocity-type-backup-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        Logger.info('backup', 'exportação gerada', { races: backup.races.length });
        this.notify(t('records.exported', { n: backup.races.length }), 'success');
    }

    async importRecords(file) {
        if (!file) return;
        try {
            if (file.size > 5 * 1024 * 1024) throw Object.assign(new Error('O arquivo excede o limite de 5 MB.'), { code: 'tooBig' });
            const summary = BackupService.import(BackupService.parse(await file.text(), file.size));
            this.onDataChanged?.();
            this.renderMenuRecords(); this.renderRecords();
            this.notify(t('records.imported', { n: summary.races, profile: summary.profile ? t('records.profileUpdated') : '' }), 'success');
        } catch (error) {
            Logger.warn('backup', 'importação rejeitada', { error: String(error.message) });
            this.notify(t('records.importFail', { msg: t(`err.${error.code}`, null, error.message) }), 'error');
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
            this.el.playerSummary.innerHTML = `<div><strong>${completed}</strong><span>${t('records.stat.races')}</span></div><div><strong>${wins}</strong><span>${t('records.stat.wins')}</span></div><div><strong>${avgWpm}</strong><span>${t('records.stat.avgWpm')}</span></div><div><strong>${avgAccuracy}%</strong><span>${t('records.stat.avgAcc')}</span></div>`;
        }
        if (!this.el.menuRecordsList) return;
        const e = this.escape;
        this.el.menuRecordsList.innerHTML = history.length ? history.slice(0, 12).map((r, i) => `
            <button class="record-row" type="button" data-menu-record-index="${i}">
                <span><b>${e(mode(r))} · ${e(r.position || '?')}/4</b><small>${e(difficulty(r))} · ${e(lang(r))} · ${new Date(r.date || Date.now()).toLocaleString(I18n.lang === 'en' ? 'en-US' : 'pt-BR')}</small></span>
                <strong>${Number(r.timeSeconds || 0).toFixed(1)}s</strong>
            </button>`).join('') : `<p class="records-empty">${t('records.empty')}</p>`;
        this.el.menuRecordsList.querySelectorAll('[data-menu-record-index]').forEach(button => button.addEventListener('click', () => {
            const r = history[Number(button.dataset.menuRecordIndex)];
            const rules = r.rules || {};
            window.alert([
                t('rd.position', { v: r.position || '?' }), t('rd.time', { v: Number(r.timeSeconds || 0).toFixed(1) }),
                t('rd.wpm', { v: Math.round(r.wpm || 0) }), t('rd.accuracy', { v: Math.round((r.accuracy || 0) * 100) }),
                t('rd.errors', { v: r.errors ?? 0 }), t('rd.combo', { v: r.bestCombo || 0 }),
                t('rd.distance', { v: r.distance || 0 }), t('rd.difficulty', { v: difficulty(r) }),
                t('rd.mode', { v: mode(r) }), t('rd.language', { v: lang(r) }), t('rd.topics', { v: topics(r) }),
                t('rd.rules', { a: yesNo(rules.accents), p: yesNo(rules.punctuation), c: yesNo(rules.caseSensitive), n: yesNo(rules.numbersExact) })
            ].join('\n'));
        }));
    }

    renderRecords() {
        const history = StorageService.getHistory();
        const e = this.escape;
        this.el.recordsList.innerHTML = history.length ? history.map((r, i) => `
          <button class="record-row" type="button" data-record-index="${i}">
            <span><b>#${i + 1} · ${e(r.position || '?')}/4</b><small>${e(mode(r))} · ${new Date(r.date || Date.now()).toLocaleDateString(I18n.lang === 'en' ? 'en-US' : 'pt-BR')}</small></span>
            <strong>${Number(r.timeSeconds || 0).toFixed(1)}s</strong>
          </button>`).join('') : `<p class="records-empty">${t('records.emptyShort')}</p>`;
        this.el.recordsList.querySelectorAll('[data-record-index]').forEach(button => button.addEventListener('click', () => {
            const r = history[Number(button.dataset.recordIndex)];
            const el = this.el;
            el.recordDetails.hidden = false;
            el.recordDetailsToggle.textContent = t('result.hideDetails');
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
        return t('cfg.line', {
            diff: difficulty(r), mode: mode(r), lang: lang(r), topics: topics(r),
            accents: yesNo(rules.accents), punct: yesNo(rules.punctuation), case: yesNo(rules.caseSensitive),
            numbers: t(rules.numbersExact ? 'cfg.exact' : 'cfg.flexible'), combo: r.bestCombo || 0,
            date: new Date(r.date || Date.now()).toLocaleString(I18n.lang === 'en' ? 'en-US' : 'pt-BR')
        });
    }
}
