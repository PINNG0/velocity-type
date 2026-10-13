import { TypingChallenge } from './TypingChallenge.js';

export class TypingQueue {
    constructor(sequence, previewCount = 4) {
        if (!sequence) {
            throw new Error('TypingQueue precisa de uma ChallengeSequence.');
        }

        this.sequence = sequence;
        this.previewCount = Math.max(2, previewCount);
        this.completedCount = 0;

        this.current = new TypingChallenge(sequence.current());
        this.upcoming = [];
        this.fillPreview();
    }

    fillPreview() {
        while (this.upcoming.length < this.previewCount) {
            this.upcoming.push(new TypingChallenge(this.sequence.next()));
        }
    }

    advance() {
        this.current = this.upcoming.shift();
        this.completedCount++;
        this.fillPreview();
        return this.current;
    }

    get currentText() {
        return this.current.text;
    }

    get upcomingTexts() {
        return this.upcoming.map(challenge => challenge.text);
    }

    get totalVisible() {
        return 1 + this.upcoming.length;
    }
}
