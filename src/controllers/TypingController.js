export class TypingController {
    constructor(session, inputController) {
        this.session = session;
        this.inputController = inputController;
    }

    initialize() {
        this.inputController.enable();
    }
}
