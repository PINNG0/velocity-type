export class TypingSystem {
    constructor(session) {
        this.session = session;
    }

    process(value) {
        this.session.processInput(value);
    }
}
