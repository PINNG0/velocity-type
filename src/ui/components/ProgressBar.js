export class ProgressBar {
    constructor(element) {
        this.element = element;
        this.last = -1;
    }

    setProgress(progress) {
        const safe = Math.round(Math.max(0, Math.min(progress, 1)) * 1000) / 10;
        if (safe === this.last) return;
        this.last = safe;
        this.element.style.width = `${safe}%`;
    }
}
