const KEYSTROKE_KEEP = 600;
const KEYSTROKE_TRIM_AT = 1200;

export class TypingSession {
    constructor(challenge, config = {}) {
        if (!challenge?.text) {
            throw new Error('TypingSession precisa de um desafio com texto.');
        }

        this.challenge = challenge;
        this.rollingWindowMs = Math.max(Number(config.rollingWindowMs ?? 5000), 1000);
        this.minimumSamplesForStableWpm = Math.max(
            Number(config.minimumSamplesForStableWpm ?? 5),
            1
        );
        // Textos longos precisam ser completáveis; nunca limite o input abaixo do desafio atual.
        this.maxInputLength = Math.max(Number(config.maxInputLength ?? 240), challenge.text.length, 32);

        this.input = '';
        this.correctCharacters = 0;
        this.incorrectCharacters = 0;
        this.totalTypedCharacters = 0;
        this.currentCorrectCharacters = 0;
        this.currentIncorrectCharacters = 0;
        this.completedChallenges = 0;

        // Relógio virtual: congela durante a pausa, para pausar não derrubar o WPM.
        // `config.clock` permite injetar tempo determinístico nos testes.
        this.rawClock = typeof config.clock === 'function' ? config.clock : () => performance.now();
        this.pausedAt = null;
        this.totalPausedMs = 0;
        this.misses = new Map(); // caractere esperado -> vezes errado

        this.startedAt = null;
        this.finishedAt = null;
        this.phraseStartedAt = null;
        this.lastInputAt = null;
        this.keystrokes = [];
        this.combo = 0;
        this.bestCombo = 0;
    }

    clock() {
        const raw = this.rawClock();
        const paused = this.pausedAt === null ? 0 : raw - this.pausedAt;
        return raw - this.totalPausedMs - paused;
    }

    pause() {
        if (this.startedAt !== null && this.finishedAt === null && this.pausedAt === null) this.pausedAt = this.rawClock();
    }

    resume() {
        if (this.pausedAt !== null) {
            this.totalPausedMs += this.rawClock() - this.pausedAt;
            this.pausedAt = null;
        }
    }

    start() {
        this.pausedAt = null;
        this.totalPausedMs = 0;
        const now = this.clock();

        this.input = '';
        this.correctCharacters = 0;
        this.incorrectCharacters = 0;
        this.totalTypedCharacters = 0;
        this.currentCorrectCharacters = 0;
        this.currentIncorrectCharacters = 0;
        this.completedChallenges = 0;
        this.startedAt = now;
        this.finishedAt = null;
        this.phraseStartedAt = now;
        this.lastInputAt = null;
        this.keystrokes = [];
        this.combo = 0;
        this.bestCombo = 0;
    }

    advanceTo(challenge) {
        if (!challenge?.text) {
            throw new Error('A próxima frase precisa ter texto.');
        }

        this.challenge = challenge;
        // Uma nova história pode ser maior que a anterior. Atualiza o limite junto do desafio.
        this.maxInputLength = Math.max(this.maxInputLength, challenge.text.length);
        this.input = '';
        this.currentCorrectCharacters = 0;
        this.currentIncorrectCharacters = 0;
        this.phraseStartedAt = this.clock();
    }

    finish() {
        if (this.startedAt !== null && this.finishedAt === null) {
            this.finishedAt = this.clock();
        }
    }

    // Recebe o valor normalizado pelo controller e contabiliza apenas novos caracteres.
    processInput(value) {
        if (this.startedAt === null || this.finishedAt !== null || this.pausedAt !== null) return;
        if (typeof value !== 'string') return;

        const nextValue = value
            .slice(0, this.maxInputLength)
            .slice(0, this.challenge.length);

        const previousValue = this.input;
        const previousLength = previousValue.length;

        // Detect the changed section, not only growth at the end. This supports
        // backspace, selection replacement, and retyping without losing keystrokes.
        let prefix = 0;
        while (prefix < previousValue.length && prefix < nextValue.length &&
            previousValue[prefix] === nextValue[prefix]) prefix++;

        let suffix = 0;
        while (suffix < previousValue.length - prefix && suffix < nextValue.length - prefix &&
            previousValue[previousValue.length - 1 - suffix] === nextValue[nextValue.length - 1 - suffix]) {
            suffix++;
        }

        const insertedEnd = nextValue.length - suffix;
        for (let index = prefix; index < insertedEnd; index++) {
            this.recordCharacter(nextValue[index], index);
        }

        this.input = nextValue;

        if (this.input === this.challenge.text && previousValue !== this.input) {
            this.completedChallenges++;
        }
    }

    recordCharacter(typed, index) {
        const expected = this.challenge.characterAt(index);
        const correct = typed === expected;
        const now = this.clock();

        this.totalTypedCharacters++;
        this.lastInputAt = now;

        if (correct) {
            this.correctCharacters++;
            this.currentCorrectCharacters++;
            this.combo++;
            this.bestCombo = Math.max(this.bestCombo, this.combo);
        } else {
            this.incorrectCharacters++;
            this.currentIncorrectCharacters++;
            this.combo = 0;
            if (expected) this.misses.set(expected, (this.misses.get(expected) ?? 0) + 1);
        }

        this.keystrokes.push({ time: now, correct });

        // Poda em lote (não a cada tecla) e com teto rígido: antes, uma rajada de teclas dentro da
        // janela fazia o filter rodar a cada caractere sobre um array sem limite (O(n²)).
        if (this.keystrokes.length > KEYSTROKE_TRIM_AT) {
            const cutoff = now - this.rollingWindowMs * 2;
            this.keystrokes = this.keystrokes.filter(key => key.time >= cutoff);
            if (this.keystrokes.length > KEYSTROKE_KEEP) this.keystrokes = this.keystrokes.slice(-KEYSTROKE_KEEP);
        }
    }

    get elapsedSeconds() {
        if (this.startedAt === null) return 0;
        const end = this.finishedAt ?? this.clock();
        return Math.max((end - this.startedAt) / 1000, 0.001);
    }

    get phraseElapsedSeconds() {
        if (this.phraseStartedAt === null) return 0;
        return Math.max((this.clock() - this.phraseStartedAt) / 1000, 0.001);
    }

    get accuracy() {
        if (this.totalTypedCharacters === 0) return 1;
        return this.correctCharacters / this.totalTypedCharacters;
    }

    get wpm() {
        if (this.correctCharacters === 0) return 0;
        return (this.correctCharacters / 5) / (this.elapsedSeconds / 60);
    }

    get stableWpm() {
        const now = this.clock();
        const recent = this.keystrokes.filter(
            key => key.time >= now - this.rollingWindowMs
        );

        if (recent.length < this.minimumSamplesForStableWpm) {
            return Math.min(this.wpm, 180);
        }

        const correct = recent.filter(key => key.correct).length;
        const first = recent[0].time;
        const last = recent[recent.length - 1].time;
        const activeSeconds = Math.max((last - first) / 1000, 0.8);
        const minutes = activeSeconds / 60;

        return Math.min((correct / 5) / minutes, 180);
    }

    get currentWpm() {
        if (this.currentCorrectCharacters === 0) return 0;
        return (this.currentCorrectCharacters / 5) / (this.phraseElapsedSeconds / 60);
    }

    get currentProgress() {
        if (!this.challenge.length) return 0;
        return Math.min(this.input.length / this.challenge.length, 1);
    }

    // Modo "corrigir na hora": a tecla errada é recusada, mas conta como erro (precisão/combo).
    registerRejectedKey() {
        if (this.startedAt === null || this.finishedAt !== null || this.pausedAt !== null) return;
        const expected = this.challenge.characterAt(this.input.length);
        this.totalTypedCharacters++;
        this.incorrectCharacters++;
        this.currentIncorrectCharacters++;
        this.combo = 0;
        if (expected) this.misses.set(expected, (this.misses.get(expected) ?? 0) + 1);
        this.keystrokes.push({ time: this.clock(), correct: false });
    }

    topMisses(limit = 5) {
        return [...this.misses.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([key, count]) => ({ key, count }));
    }

    // Índice do primeiro caractere digitado que difere do texto (-1 se o digitado é prefixo correto).
    get firstMismatchIndex() {
        const text = this.challenge.text;
        const n = Math.min(this.input.length, text.length);
        for (let i = 0; i < n; i++) if (this.input[i] !== text[i]) return i;
        return -1;
    }

    get isComplete() {
        return this.input === this.challenge.text;
    }
}
