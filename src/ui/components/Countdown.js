import { t } from '../../i18n/I18n.js';

// Semáforo de largada: uma luz vermelha por segundo; na última, tudo fica verde e aparece "DIGITE!".
export class Countdown {
    constructor(element, onTick = null) {
        this.element = element;
        this.onTick = onTick;
    }

    async run(seconds = 3) {
        for (let value = seconds; value > 0; value--) {
            this.render(seconds - value + 1, seconds, t(`cd.${Math.min(seconds - value, 2) + 1}`), 'red');
            this.onTick?.(value);
            await this.wait(900);
        }

        this.render(seconds, seconds, t('cd.go'), 'go');
        this.onTick?.('GO');
        await this.wait(650);

        this.hide();
    }

    render(lit, total, label, tone) {
        const lamps = Array.from({ length: total }, (_, i) => `<i class="${i < lit ? (tone === 'go' ? 'go' : 'on') : ''}"></i>`).join('');
        this.element.hidden = false;
        this.element.className = `countdown gantry tone-${tone}`;
        this.element.setAttribute?.('aria-label', label);
        this.element.innerHTML = `<div class="tl-lamps">${lamps}</div><strong class="tl-label">${label}</strong>`;
        this.restartPop();
    }

    restartPop() {
        this.element.classList.remove('countdown-pop');
        void this.element.offsetWidth;
        this.element.classList.add('countdown-pop');
    }

    hide() {
        this.element.classList.remove('countdown-pop');
        this.element.innerHTML = '';
        this.element.hidden = true;
    }

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
