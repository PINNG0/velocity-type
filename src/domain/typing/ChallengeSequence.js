export class ChallengeSequence {
    constructor(texts = [], options = {}) {
        if (!Array.isArray(texts)) {
            throw new TypeError('ChallengeSequence precisa receber um array.');
        }

        this.texts = texts
            .filter(text => typeof text === 'string')
            .map(text => text.trim())
            .filter(Boolean);

        if (this.texts.length === 0) {
            throw new Error('ChallengeSequence não pode ficar vazia.');
        }

        this.shuffle = Boolean(options.shuffle);
        this.index = 0;
        if (this.shuffle) this.shuffleTexts();
    }

    shuffleTexts() {
        for (let i = this.texts.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.texts[i], this.texts[j]] = [this.texts[j], this.texts[i]];
        }
    }

    current() {
        return this.texts[this.index % this.texts.length];
    }

    next() {
        this.index++;
        if (this.shuffle && this.index % this.texts.length === 0 && this.texts.length > 1) {
            const previous = this.texts[this.texts.length - 1];
            this.shuffleTexts();
            if (this.texts[0] === previous) [this.texts[0], this.texts[1]] = [this.texts[1], this.texts[0]];
        }
        return this.current();
    }

    get completed() {
        return this.index;
    }

    reset() {
        // Recomeça a sequência usando a opção de embaralhamento já configurada.
        this.index = 0;
        if (this.shuffle) this.shuffleTexts();
    }
}
