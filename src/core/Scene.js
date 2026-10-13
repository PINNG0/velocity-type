export class Scene {
    constructor(name) {
        this.name = name;
        this.active = false;
    }

    enter() {
        this.active = true;
    }

    exit() {
        this.active = false;
    }

    update(_deltaTime) {}
}
