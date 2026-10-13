export class TypingStats {
    static fromSession(session) {
        return {
            wpm: session.wpm,
            stableWpm: session.stableWpm,
            accuracy: session.accuracy,
            errors: session.incorrectCharacters
        };
    }
}
