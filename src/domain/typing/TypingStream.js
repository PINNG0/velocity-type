export class TypingStream {
    constructor(currentText, upcomingTexts = [], separator = '   ') {
        this.currentText = String(currentText ?? '');
        this.upcomingTexts = Array.isArray(upcomingTexts)
            ? upcomingTexts.map(text => String(text ?? '')).filter(Boolean)
            : [];
        this.separator = separator;
    }

    get text() {
        return [this.currentText, ...this.upcomingTexts]
            .filter(Boolean)
            .join(this.separator);
    }

    get consumedLength() {
        return this._consumedLength ?? 0;
    }

    setConsumedLength(value) {
        const parsed = Number(value);
        this._consumedLength = Number.isFinite(parsed)
            ? Math.max(0, Math.min(this.currentText.length, Math.floor(parsed)))
            : 0;
        return this._consumedLength;
    }

    get currentLength() {
        return this.currentText.length;
    }

    get upcomingCount() {
        return this.upcomingTexts.length;
    }

    get nextText() {
        return this.upcomingTexts[0] ?? '';
    }

    clampInput(input) {
        return String(input ?? '').slice(0, this.currentLength);
    }

    globalOffset(input) {
        return this.clampInput(input).length;
    }
}
