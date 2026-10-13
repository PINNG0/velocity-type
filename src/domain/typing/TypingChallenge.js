export class TypingChallenge {
    constructor(text) {
        this.text = text;
    }

    get length() {
        return this.text.length;
    }

    characterAt(index) {
        return this.text[index] ?? '';
    }
}
