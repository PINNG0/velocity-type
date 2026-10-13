import { ProgressionService } from '../services/ProgressionService.js';
import { Logger } from '../services/Logger.js';
import { CarSkins, resolveSkin } from '../config/Unlocks.js';

const EVENT_LABEL = { daily: 'Desafio diário', 'daily-all': 'Bônus do dia', long: 'Objetivo concluído', achievement: 'Conquista' };
const CATEGORY = { speed: 'Velocidade', accuracy: 'Precisão', consistency: 'Consistência', participation: 'Participação' };
const fmt = n => Number(n).toLocaleString('pt-BR');

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
            return `<button type="button" class="skin-chip${s.id === current ? ' selected' : ''}" data-skin="${s.id}" role="radio" aria-checked="${s.id === current}" ${locked ? 'disabled' : ''} title="${locked ? `Desbloqueia no nível ${s.level}` : s.name}"><i class="skin-dot skin-${s.id}"></i>${this.escape(s.name)}${locked ? ` <small>NV ${s.level}</small>` : ''}</button>`;
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
            el.objectivesToggle.textContent = panel.hidden ? 'OBJETIVOS E CONQUISTAS' : 'OCULTAR OBJETIVOS';
            if (!panel.hidden) this.renderObjectives();
        });
    }

    safe(fn, label) { try { fn(); } catch (error) { Logger.error('ui', `${label} falhou`, { error: String(error?.stack ?? error) }); } }

    renderMenu() {
        this.safe(() => {
            const el = this.el, o = ProgressionService.getOverview(), p = o.profile;
            if (el.profileLevel) el.profileLevel.textContent = p.level;
            if (el.profileXpFill) el.profileXpFill.style.width = `${Math.round(p.progress * 100)}%`;
            if (el.profileXpBar) el.profileXpBar.setAttribute('aria-valuenow', String(Math.round(p.progress * 100)));
            if (el.profileXpLabel) el.profileXpLabel.textContent = p.maxed ? 'NÍVEL MÁXIMO' : `${fmt(p.xpIntoLevel)} / ${fmt(p.xpForNext)} XP`;
            if (el.profileTotalXp) el.profileTotalXp.textContent = `${fmt(p.totalXp)} XP total`;
            this.renderSkins(p.level);
            if (el.objectivesPanel && !el.objectivesPanel.hidden) this.renderObjectives(o);
        }, 'renderMenu');
    }

    renderObjectives(overview = ProgressionService.getOverview()) {
        this.safe(() => {
            const el = this.el, e = this.escape;
            const row = (title, desc, progress, target, done, xp) => {
                const pct = Math.round(Math.min(1, progress / target) * 100);
                return `<div class="goal-row${done ? ' done' : ''}"><div><b>${e(title)}</b><small>${e(desc)}</small></div><div class="goal-meta"><span>${done ? '✔ CONCLUÍDO' : `${fmt(Math.floor(progress))}/${fmt(target)}`}</span><i class="goal-bar"><i style="width:${pct}%"></i></i><em>+${xp} XP</em></div></div>`;
            };
            el.dailyList.innerHTML = overview.daily.map(({ def, entry }) => row(def.title, def.description, entry.progress, def.target, entry.done, def.rewardXp)).join('');
            el.longList.innerHTML = overview.long.map(({ def, entry }) => row(def.title, def.description, entry.progress, def.target, entry.done, def.rewardXp)).join('');
            const unlocked = overview.achievements.filter(a => a.unlockedAt).length;
            if (el.achievementsCount) el.achievementsCount.textContent = `${unlocked}/${overview.achievements.length}`;
            el.achievementsList.innerHTML = overview.achievements.map(({ def, unlockedAt }) =>
                `<div class="badge${unlockedAt ? ' unlocked' : ''}" title="${e(def.description)}"><b>${unlockedAt ? '★' : '☆'} ${e(def.title)}</b><small>${e(CATEGORY[def.category] || '')} · ${e(def.description)}</small></div>`).join('');
            el.xpHistoryList.innerHTML = overview.history.length
                ? overview.history.slice(0, 12).map(h => `<div class="xp-row"><span>${e(h.label || h.source)}</span><small>${new Date(h.at).toLocaleDateString()}${h.level > h.levelBefore ? ` · NV ${h.levelBefore}→${h.level}` : ''}</small><strong>+${h.xp} XP</strong></div>`).join('')
                : '<p class="records-empty">Termine uma corrida para ganhar XP.</p>';
        }, 'renderObjectives');
    }

    // Tela de resultados: XP ganho, barra animada, nível e eventos desbloqueados.
    renderResult(progression) {
        this.safe(() => {
            const el = this.el, e = this.escape;
            if (!el.resultXp) return;
            el.resultXp.hidden = !progression;
            if (!progression) return;
            el.resultXpTotal.textContent = progression.duplicate ? 'JÁ CONTABILIZADO' : `+${fmt(progression.xpGained)}`;
            el.resultXpBreakdown.innerHTML = progression.reward.parts.map(p => `<li><span>${e(p.label)}</span><b>+${p.xp}</b></li>`).join('')
                + (progression.reward.flags.includes('repeat-decay') ? `<li class="muted"><span>Configuração repetida hoje</span><b>×${progression.reward.multiplier.toFixed(2)}</b></li>` : '')
                + (progression.reward.flags.includes('low-quality') ? '<li class="muted"><span>Corrida curta/imprecisa</span><b>XP reduzido</b></li>' : '')
                + (progression.bonusXp ? `<li><span>Objetivos e conquistas</span><b>+${progression.bonusXp}</b></li>` : '');
            el.resultLevel.textContent = `NV ${progression.levelAfter}`;
            el.resultEvents.innerHTML = progression.events.filter(ev => ev.rewardXp).map(ev => `<li><b>${e(EVENT_LABEL[ev.type] || 'Evento')}</b> ${e(ev.title)} <em>+${ev.rewardXp} XP</em></li>`).join('');
            el.levelupBanner.hidden = !progression.leveledUp;
            if (progression.leveledUp) el.levelupBanner.textContent = `NÍVEL ${progression.levelAfter}!`;

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
