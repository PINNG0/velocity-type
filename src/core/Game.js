import { GameLoop } from './GameLoop.js';
import { GameState } from './GameState.js';
import { PerformanceMonitor } from './PerformanceMonitor.js';
import { RaceController } from '../controllers/RaceController.js';
import { UIManager } from '../ui/UIManager.js';
import { Logger } from '../services/Logger.js';

export class Game {
    constructor(config) {
        this.config = config;
        this.state = new GameState();
        this.ui = new UIManager();
        this.raceController = new RaceController(this.state, this.ui, config);
        this.perf = new PerformanceMonitor();
        this.loop = new GameLoop(deltaTime => this.update(deltaTime), { onFrame: ms => this.perf.sample(ms) });
        this.loop.onError = error => this.reportFrameError(error);
        this.frameErrors = 0;
    }

    start() {
        this.ui.initialize();
        this.raceController.initialize();
        this.perf.onChange(quality => this.ui.setQuality(quality));
        this.loop.start();
        Logger.info('game', 'jogo iniciado');
    }

    update(deltaTime) {
        this.raceController.update(deltaTime);
    }

    // Erros de quadro são registrados (com limite) e o loop continua.
    reportFrameError(error) {
        this.frameErrors++;
        if (this.frameErrors <= 5) Logger.error('game', 'erro no quadro', { error: String(error?.stack ?? error) });
        if (this.frameErrors === 5) Logger.error('game', 'erros de quadro repetidos: suprimindo novos registros');
    }
}
