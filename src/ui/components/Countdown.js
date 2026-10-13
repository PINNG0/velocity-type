export class Countdown {
    constructor(element, onTick = null) {
        this.element = element;
        this.onTick = onTick;
    }

    async run(seconds = 3) {
        this.show('3');

        for (let value = seconds; value > 0; value--) {
            this.show(String(value));
            this.onTick?.(value);
            await this.wait(850);
        }

        this.show('GO!');
        this.onTick?.('GO');
        await this.wait(550);

        this.hide();
    }

    show(value) {
        this.element.hidden = false;
        this.element.textContent = value;
        this.element.classList.remove('countdown-pop');

        void this.element.offsetWidth;

        this.element.classList.add('countdown-pop');
    }

    hide() {
        this.element.classList.remove('countdown-pop');
        this.element.textContent = '';
        this.element.hidden = true;
    }

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
