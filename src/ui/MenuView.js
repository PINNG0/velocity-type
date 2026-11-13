import { t, I18n } from '../i18n/I18n.js';
import { CarSkins, resolveSkin } from '../config/Unlocks.js';
import { ProgressionService } from '../services/ProgressionService.js';
import { RaceModes, getRaceMode } from '../config/RaceModes.js';
import { AdaptiveDifficultyService } from '../services/AdaptiveDifficultyService.js';

const SCREENS = {
    race: { icon: '▤', title: 'nav.race', desc: 'sub.race' },
    garage: { icon: '🚗', title: 'menu.garage', desc: 'sub.garage' },
    history: { icon: '▥', title: 'menu.history', desc: 'sub.history' },
    progression: { icon: '🏆', title: 'menu.progression', desc: 'sub.progression' },
    settings: { icon: '⚙', title: 'menu.settings', desc: 'sub.settings' }
};

// Grupos de "chips" ligados a controles nativos (o estado do jogo continua nos selects/checkboxes).
const CHIPS = {
    'race-mode': Object.values(RaceModes).map(mode => [mode.id, `dist.${mode.id}`]),
    'difficulty-mode': [['easy', 'diff.easy'], ['medium', 'diff.medium'], ['hard', 'diff.hard'], ['very-hard', 'diff.very-hard']],
    'error-mode': [['strict', 'mistakes.strict'], ['free', 'mistakes.free']],
    'content-language': [['en', 'lang.en'], ['pt', 'lang.pt']],
    'quality-mode': [['auto', 'quality.auto'], ['high', 'quality.high'], ['low', 'quality.low']],
    topics: [['mixed', 'chip.topic.mixed'], ['computing', 'topics.computing'], ['science', 'topics.science'], ['people', 'topics.people'], ['code', 'topics.code']]
};
const TOPIC_VALUES = ['computing', 'science', 'people', 'code'];

const km = n => (I18n.lang === 'en' ? String(n) : String(n).replace('.', ','));
const carMarkup = skin => `<div class="car garage-car" data-skin="${skin}"><div class="car-shadow"></div><div class="car-body"><div class="car-window"></div><div class="car-light light-left"></div><div class="car-light light-right"></div></div><div class="car-wheel wheel-left"></div><div class="car-wheel wheel-right"></div></div>`;

// Menu principal: início, submenus (corrida, garagem, histórico, progressão, configurações), chips e garagem.
export class MenuView {
    constructor(ui) {
        this.ui = ui;
        this.screen = null;
        this.previewIndex = 0;
        this.resetTimer = null;
    }

    get root() { return document.getElementById('main-menu'); }
    el(id) { return document.getElementById(id); }

    bind() {
        const root = this.root;
        if (!root) return;
        root.addEventListener('click', event => this.onClick(event));
        // ESC volta do submenu (a pausa da corrida usa o próprio handler, só durante a corrida).
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && this.screen && !root.hidden) { event.preventDefault?.(); this.back(); }
        });
        const version = this.el('app-version');
        if (version) version.textContent = `Velocity Type v${typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'}`;
    }

    onClick(event) {
        const find = selector => event.target?.closest?.(selector) ?? null;
        let node;
        if ((node = find('[data-submenu]'))) return this.open(node.dataset.submenu);
        if (find('#submenu-back')) return this.back();
        if ((node = find('[data-chip-target]'))) return this.chip(node.dataset.chipTarget, node.dataset.chipValue);
        if ((node = find('[data-garage]'))) return this.garageAction(node.dataset.garage);
        if ((node = find('[data-skin-preview]'))) return this.previewSkin(Number(node.dataset.skinPreview));
        if ((node = find('[data-settings-tab]'))) return this.settingsTab(node.dataset.settingsTab);
    }

    // ---------- navegação ----------
    open(screen) {
        const meta = SCREENS[screen];
        if (!meta) return;
        this.stopResetTimer();
        this.screen = screen;
        const root = this.root;
        document.querySelectorAll('[data-section]').forEach(section => { section.hidden = section.dataset.section !== screen; });
        this.el('submenu-icon').textContent = meta.icon;
        this.el('submenu-title').textContent = t(meta.title);
        this.el('submenu-description').textContent = t(meta.desc);
        this.el('menu-subscreen').hidden = false;
        root.classList.add('submenu-open');
        this.renderScreen(screen);
        this.focusContent();
    }

    // Seleção visível já na abertura: o primeiro controle do conteúdo (depois do botão Voltar).
    focusContent() {
        const items = this.ui.keyboardNav?.items(this.el('menu-subscreen')) ?? [];
        const target = items.find(el => el.id !== 'submenu-back') ?? this.el('submenu-title');
        target?.focus?.({ preventScroll: true });
    }

    focusHome() {
        const first = this.el('menu-home')?.querySelector?.('button');
        first?.focus?.({ preventScroll: true });
    }

    renderScreen(screen) {
        if (screen === 'race') { this.renderChips(); this.refreshPreview(); }
        else if (screen === 'garage') { this.previewIndex = this.equippedIndex(); this.renderGarage(); }
        else if (screen === 'history') this.ui.recordsView?.renderMenuRecords();
        else if (screen === 'progression') { this.ui.progressionView?.renderMenu(); this.ui.progressionView?.renderObjectives(); this.startResetTimer(); }
        else if (screen === 'settings') this.renderChips();
    }

    back() {
        const previous = this.screen;
        this.showHome();
        if (previous) this.root?.querySelector?.(`[data-submenu="${previous}"]`)?.focus?.({ preventScroll: true });
    }

    showHome() {
        this.stopResetTimer();
        this.screen = null;
        const sub = this.el('menu-subscreen');
        if (sub) sub.hidden = true;
        this.root?.classList.remove('submenu-open');
        this.refresh();
    }

    // ---------- chips ----------
    chip(target, value) {
        if (target === 'topics') return this.topicChip(value);
        if (target === 'difficulty-mode') { this.ui.chooseDifficulty(value); return this.refresh(); }
        const control = this.el(target);
        if (!control) return;
        control.value = value;
        this.ui.persistSettings();
        if (target === 'content-language') this.ui.applyLanguage();
        if (target === 'quality-mode') this.ui.applyQuality();
        this.refresh();
    }

    topicBoxes() { return [...document.querySelectorAll('[data-content-category]')]; }

    topicChip(value) {
        const boxes = this.topicBoxes();
        const individual = boxes.filter(box => box.value !== 'mixed');
        const mixed = boxes.find(box => box.value === 'mixed');
        const active = individual.filter(box => box.checked).map(box => box.value);
        let next;
        if (value === 'mixed') next = TOPIC_VALUES;
        else if (active.length === individual.length) next = [value];            // "Aleatório" ativo → escolhe só esse
        else if (active.includes(value)) next = active.filter(v => v !== value);  // alterna
        else next = [...active, value];
        if (!next.length) next = TOPIC_VALUES;                                    // nunca fica sem tema
        individual.forEach(box => { box.checked = next.includes(box.value); });
        if (mixed) mixed.checked = next.length === individual.length;
        this.ui.persistSettings();
        this.refresh();
    }

    chipLabel(target, value, key) {
        const label = t(key);
        if (target === 'race-mode') return `<b>${label}</b><small>${t('dist.km', { n: km(getRaceMode(value).km) })}</small>`;
        return `<b>${label}</b>`;
    }

    renderChips() {
        const settings = this.ui.getSettings();
        const topics = new Set(settings.categories);
        const allTopics = TOPIC_VALUES.every(v => topics.has(v));
        const current = { 'race-mode': settings.mode, 'difficulty-mode': settings.difficulty, 'error-mode': settings.errorMode, 'content-language': settings.language, 'quality-mode': settings.quality };
        const auto = this.ui.elements.autoDifficulty;
        if (auto) auto.checked = settings.difficulty === 'adaptive';
        document.querySelectorAll('[data-chips]').forEach(group => {
            const target = group.dataset.chips;
            const checks = target === 'topics';
            group.innerHTML = (CHIPS[target] ?? []).map(([value, key]) => {
                const on = checks ? (value === 'mixed' ? allTopics : !allTopics && topics.has(value)) : current[target] === value;
                const dim = target === 'difficulty-mode' && settings.difficulty === 'adaptive';
                return `<button type="button" class="chip${on ? ' on' : ''}${dim ? ' dim' : ''}" role="${checks ? 'checkbox' : 'radio'}" aria-checked="${on}" data-chip-target="${target}" data-chip-value="${value}">${this.chipLabel(target, value, key)}</button>`;
            }).join('');
        });
    }

    // ---------- resumo / prévia ----------
    summary() {
        const s = this.ui.getSettings();
        const mode = getRaceMode(s.mode);
        const distance = `${t(`dist.${mode.id}`)} · ${t('dist.km', { n: km(mode.km) })}`;
        const allTopics = TOPIC_VALUES.every(v => s.categories.includes(v));
        return {
            distance,
            difficulty: s.difficulty === 'adaptive' ? t('diff.auto', { level: this.autoLevelLabel() }) : t(`diff.${s.difficulty}`),
            theme: allTopics ? t('chip.topic.mixed') : s.categories.map(c => t(`topics.${c}`)).join(', '),
            mistakes: t(`mistakes.${s.errorMode}`)
        };
    }

    // Nível que a dificuldade automática usaria agora.
    autoLevelLabel() {
        try { return I18n.localize('diff.', AdaptiveDifficultyService.choose('adaptive').label); } catch { return t('diff.medium'); }
    }

    refreshPreview() {
        const s = this.summary();
        const set = (id, text) => { const node = this.el(id); if (node) node.textContent = text; };
        set('preview-distance', s.distance); set('preview-difficulty', s.difficulty); set('preview-theme', s.theme); set('preview-mistakes', s.mistakes);
        set('quick-play-summary', t('nav.playSummary', { mode: s.distance, difficulty: s.difficulty, topics: s.theme }));
    }

    refresh() {
        this.renderChips();
        this.refreshPreview();
        if (this.screen === 'garage') this.renderGarage();
    }

    // ---------- configurações ----------
    settingsTab(name) {
        document.querySelectorAll('[data-settings-tab]').forEach(tab => { tab.setAttribute('aria-selected', String(tab.dataset.settingsTab === name)); });
        document.querySelectorAll('[data-settings-panel]').forEach(panel => { panel.hidden = panel.dataset.settingsPanel !== name; });
    }

    // ---------- garagem ----------
    level() { try { return ProgressionService.getOverview().profile.level; } catch { return 1; } }
    equippedIndex() { return Math.max(0, CarSkins.findIndex(s => s.id === resolveSkin(this.ui.getSettings().carSkin, this.level()))); }

    previewSkin(index) { this.previewIndex = (index + CarSkins.length) % CarSkins.length; this.renderGarage(); }

    garageAction(action) {
        if (action === 'prev') return this.previewSkin(this.previewIndex - 1);
        if (action === 'next') return this.previewSkin(this.previewIndex + 1);
        if (action === 'equip') {
            const skin = CarSkins[this.previewIndex];
            if (skin && this.level() >= skin.level) { this.ui.equipSkin(skin.id); this.renderGarage(); }
        }
    }

    renderGarage() {
        const level = this.level();
        const overview = (() => { try { return ProgressionService.getOverview(); } catch { return null; } })();
        const equipped = resolveSkin(this.ui.getSettings().carSkin, level);
        const skin = CarSkins[this.previewIndex] ?? CarSkins[0];
        const locked = level < skin.level;
        const name = t(`skin.${skin.id}`, null, skin.name);
        const slot = this.el('garage-car-slot'); if (slot) slot.innerHTML = carMarkup(skin.id);
        const label = this.el('garage-skin-name'); if (label) label.textContent = locked ? `${name} · ${t('garage.locked', { level: skin.level })}` : name;

        const button = (cls, i, s) => {
            const isLocked = level < s.level;
            return `<button type="button" class="${cls}${i === this.previewIndex ? ' selected' : ''}${isLocked ? ' locked' : ''}" data-skin-preview="${i}" role="radio" aria-checked="${i === this.previewIndex}" title="${this.ui.escape(t(`skin.${s.id}`, null, s.name))}"><i class="skin-dot skin-${s.id}"></i>${cls === 'thumb' ? `<b>${this.ui.escape(t(`skin.${s.id}`, null, s.name))}</b>` : ''}${isLocked ? '<span class="lock" aria-hidden="true">🔒</span>' : s.id === equipped ? '<span class="check" aria-hidden="true">✓</span>' : ''}</button>`;
        };
        const picker = this.el('skin-picker'); if (picker) picker.innerHTML = CarSkins.map((s, i) => button('swatch', i, s)).join('');
        const thumbs = this.el('garage-thumbs'); if (thumbs) thumbs.innerHTML = CarSkins.map((s, i) => button('thumb', i, s)).join('');

        const equip = this.el('garage-equip');
        if (equip) {
            equip.textContent = locked ? t('garage.locked', { level: skin.level }) : skin.id === equipped ? t('garage.equipped') : t('garage.equip');
            equip.disabled = locked || skin.id === equipped;
        }
        const stats = overview?.stats ?? {};
        const bar = (key, value, shown) => `<div class="stat-bar"><span>${t(key)}</span><b>${shown}</b><i><i style="width:${Math.round(Math.min(1, value) * 100)}%"></i></i></div>`;
        const statsBox = this.el('garage-stats');
        if (statsBox) statsBox.innerHTML = bar('stat.speed', (stats.bestWpm ?? 0) / 120, `${stats.bestWpm ?? 0} WPM`)
            + bar('stat.accuracy', (stats.bestAccuracy ?? 0) / 100, `${stats.bestAccuracy ?? 0}%`)
            + bar('stat.races', (stats.races ?? 0) / 100, String(stats.races ?? 0));
    }

    // ---------- progressão: contagem para o reinício dos desafios (meia-noite local) ----------
    startResetTimer() {
        const tick = () => {
            if (typeof document === 'undefined') { this.stopResetTimer(); return; }
            const now = new Date();
            const next = new Date(now); next.setHours(24, 0, 0, 0);
            const seconds = Math.max(0, Math.floor((next - now) / 1000));
            const pad = n => String(n).padStart(2, '0');
            const node = this.el('daily-reset');
            if (node) node.textContent = t('prog.resetsIn', { time: `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds % 3600 / 60))}:${pad(seconds % 60)}` });
        };
        tick();
        this.resetTimer = setInterval(tick, 1000);
        this.resetTimer?.unref?.();
    }

    stopResetTimer() { if (this.resetTimer) { clearInterval(this.resetTimer); this.resetTimer = null; } }
}
