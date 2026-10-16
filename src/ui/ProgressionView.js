import { ProgressionService } from '../services/ProgressionService.js';
import { Logger } from '../services/Logger.js';
import { CarSkins, resolveSkin } from '../config/Unlocks.js';
import { I18n, t } from '../i18n/I18n.js';

const fmt = n => Number(n).toLocaleString(I18n.lang === 'en' ? 'en-US' : 'pt-BR');
export const goalText = (id, field, fallback) => t(`goal.${id}.${field}`, null, fallback);
const eventTitle = ev => ev.type === 'daily-all' ? t('goal.daily-all.title') : goalText(ev.id, 'title', ev.title);
export { eventTitle };

// Perfil/XP/objetivos/conquistas + notificações (toasts).
export class ProgressionView {
    constructor(elements, { escape, getSkin = () => 'classic', setSkin = () => {} }) {
        this.el = elements; this.escape = escape; this.getSkin = getSkin; this.setSkin = setSkin; this.toastCount = 0;
    }

    renderSkins(level) {
        const picker = this.el.skinPicker;
        if (!picker) return;
        const current = resolveSkin(this.getSkin(), level);
        picker.innerHTML = CarSkins.map(s => {
            const locked = level < s.level;
            const name = this.escape(t(`skin.${s.id}`, null, s.name));
            return `<button type="button" class="skin-chip${s.id === current ? ' selected' : ''}" data-skin="${s.id}" role="radio" aria-checked="${s.id === current}" ${locked ? 'disabled' : ''} title="${locked ? this.escape(t('skin.locked', { level: s.level })) : name}"><i class="skin-dot skin-${s.id}"></i>${name}${locked ? ` <small>${this.escape(t('xp.levelShort', { n: s.level }))}</small>` : ''}</button>`;
        }).join('');
    }

    bind() {
        const el = this.el;
        el.skinPicker?.addEventListener('click', event => {
            const button = event.target?.closest?.('[data-skin]');
            if (!button || button.disabled) return;
            this.setSkin(button.dataset.skin);
            this.renderMenu();
        });
        el.objectivesToggle?.addEventListener('click', () => {
            const panel = el.objectivesPanel;
            panel.hidden = !panel.hidden;
            el.objectivesToggle.setAttribute('aria-expanded', String(!panel.hidden));
            el.objectivesToggle.textContent = t(panel.hidden ? 'obj.toggle' : 'obj.hide');
            if (!panel.hidden) this.renderObjectives();
        });
    }

    refreshLabels() {
        const el = this.el;
        if (el.objectivesToggle && el.objectivesPanel) el.objectivesToggle.textContent = t(el.objectivesPanel.hidden ? 'obj.toggle' : 'obj.hide');
        this.renderMenu();
    }

    safe(fn, label) { try { fn(); } catch (error) { Logger.error('ui', `${label} falhou`, { error: String(error?.stack ?? error) }); } }

    renderMenu() {
        this.safe(() => {
            const el = this.el, o = ProgressionService.getOverview(), p = o.profile;
            if (el.profileLevel) el.profileLevel.textContent = p.level;
            if (el.profileXpFill) el.profileXpFill.style.width = `${Math.round(p.progress * 100)}%`;
            if (el.profileXpBar) el.profileXpBar.setAttribute('aria-valuenow', String(Math.round(p.progress * 100)));
            if (el.profileXpLabel) el.profileXpLabel.textContent = p.maxed ? t('xp.maxed') : `${fmt(p.xpIntoLevel)} / ${fmt(p.xpForNext)} XP`;
            if (el.profileTotalXp) el.profileTotalXp.textContent = t('xp.total', { xp: fmt(p.totalXp) });
            this.renderSkins(p.level);
            if (el.objectivesPanel && !el.objectivesPanel.hidden) this.renderObjectives(o);
        }, 'renderMenu');
    }

    renderObjectives(overview = ProgressionService.getOverview()) {
        this.safe(() => {
            const el = this.el, e = this.escape;
            const row = (id, def, entry) => {
                const pct = Math.round(Math.min(1, entry.progress / def.target) * 100);
                return `<div class="goal-row${entry.done ? ' done' : ''}"><div><b>${e(goalText(id, 'title', def.title))}</b><small>${e(goalText(id, 'desc', def.description))}</small></div><div class="goal-meta"><span>${entry.done ? t('goal.done') : `${fmt(Math.floor(entry.progress))}/${fmt(def.target)}`}</span><i class="goal-bar"><i style="width:${pct}%"></i></i><em>+${def.rewardXp} XP</em></div></div>`;
            };
            el.dailyList.innerHTML = overview.daily.map(({ def, entry }) => row(def.id, def, entry)).join('');
            el.longList.innerHTML = overview.long.map(({ def, entry }) => row(def.id, def, entry)).join('');
            const unlocked = overview.achievements.filter(a => a.unlockedAt).length;
            if (el.achievementsCount) el.achievementsCount.textContent = `${unlocked}/${overview.achievements.length}`;
            el.achievementsList.innerHTML = overview.achievements.map(({ def, unlockedAt }) =>
                `<div class="badge${unlockedAt ? ' unlocked' : ''}" title="${e(goalText(def.id, 'desc', def.description))}"><b>${unlockedAt ? '★' : '☆'} ${e(goalText(def.id, 'title', def.title))}</b><small>${e(t(`cat.${def.category}`, null, ''))} · ${e(goalText(def.id, 'desc', def.description))}</small></div>`).join('');
            const sourceLabel = h => h.source === 'race' ? I18n.localize('mode.', h.label) : (h.source === 'daily-all' ? t('goal.daily-all.title') : goalText(h.id.split(':')[1] ?? '', 'title', h.label));
            el.xpHistoryList.innerHTML = overview.history.length
                ? overview.history.slice(0, 12).map(h => `<div class="xp-row"><span>${e(sourceLabel(h))}</span><small>${new Date(h.at).toLocaleDateString(I18n.lang === 'en' ? 'en-US' : 'pt-BR')}${h.level > h.levelBefore ? ` · ${t('xp.levelChange', { a: h.levelBefore, b: h.level })}` : ''}</small><strong>+${h.xp} XP</strong></div>`).join('')
                : `<p class="records-empty">${t('xp.empty')}</p>`;
        }, 'renderObjectives');
    }

    // Tela de resultados: XP ganho, barra animada, nível e eventos desbloqueados.
    renderResult(progression) {
        this.safe(() => {
            const el = this.el, e = this.escape;
            if (!el.resultXp) return;
            el.resultXp.hidden = !progression;
            if (!progression) return;
            el.resultXpTotal.textContent = progression.duplicate ? t('xp.duplicate') : `+${fmt(progression.xpGained)}`;
            el.resultXpBreakdown.innerHTML = progression.reward.parts.map(p => `<li><span>${e(t(`xp.part.${p.id}`, null, p.label))}</span><b>+${p.xp}</b></li>`).join('')
                + (progression.reward.flags.includes('repeat-decay') ? `<li class="muted"><span>${t('xp.repeat')}</span><b>×${progression.reward.multiplier.toFixed(2)}</b></li>` : '')
                + (progression.reward.flags.includes('low-quality') ? `<li class="muted"><span>${t('xp.lowQuality')}</span><b>${t('xp.reduced')}</b></li>` : '')
                + (progression.bonusXp ? `<li><span>${t('xp.bonus')}</span><b>+${progression.bonusXp}</b></li>` : '');
            el.resultLevel.textContent = t('xp.levelShort', { n: progression.levelAfter });
            el.resultEvents.innerHTML = progression.events.filter(ev => ev.rewardXp).map(ev => `<li><b>${e(t(`event.${ev.type}`, null, t('event.default')))}</b> ${e(eventTitle(ev))} <em>+${ev.rewardXp} XP</em></li>`).join('');
            el.levelupBanner.hidden = !progression.leveledUp;
            if (progression.leveledUp) el.levelupBanner.textContent = t('xp.levelBanner', { n: progression.levelAfter });

            // Barra: parte da posição anterior; se subiu de nível, enche, e volta a partir de zero.
            const fill = el.resultXpFill, from = Math.round(progression.before.progress * 100), to = Math.round(progression.after.progress * 100);
            fill.style.transition = 'none'; fill.style.width = `${from}%`;
            const run = () => {
                fill.style.transition = '';
                if (progression.leveledUp) {
                    fill.style.width = '100%';
                    setTimeout(() => { fill.style.transition = 'none'; fill.style.width = '0%'; void fill.offsetWidth; fill.style.transition = ''; fill.style.width = `${to}%`; }, 700);
                } else fill.style.width = `${to}%`;
            };
            if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(run)); else run();
        }, 'renderResult');
    }

    toast(message, kind = 'info') {
        const region = this.el.toastRegion;
        if (!region) return;
        while (region.children.length >= 4 && region.firstChild) region.firstChild.remove();
        const node = document.createElement('div');
        node.className = `toast toast-${kind}`;
        node.textContent = message;
        region.appendChild(node);
        const timer = setTimeout(() => node.remove(), kind === 'error' ? 7000 : 4500);
        timer?.unref?.(); // não segura o processo (testes/Node); no navegador é número e ignora
    }
}
