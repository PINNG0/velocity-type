import { Game } from './core/Game.js';
import { GameConfig } from './config/GameConfig.js';
import { Logger } from './services/Logger.js';
import { StorageService } from './services/StorageService.js';

// Erros não tratados vão para o Logger (consulte com `velocityType.logs()` no console).
window.addEventListener('error', event => Logger.error('window', String(event.message), { at: `${event.filename}:${event.lineno}` }));
window.addEventListener('unhandledrejection', event => Logger.error('promise', 'rejeição não tratada', { reason: String(event.reason?.stack ?? event.reason) }));

window.velocityType = {
    logs: () => Logger.dump(),
    logEntries: filter => Logger.getEntries(filter),
    counters: () => ({ ...Logger.counters }),
    clearLogs: () => Logger.clear(),
    storageError: () => StorageService.lastError
};

try {
    const game = new Game(GameConfig);
    game.start();
    window.velocityType.game = game;
} catch (error) {
    Logger.error('boot', 'falha ao iniciar o jogo', { error: String(error?.stack ?? error) });
    const box = document.createElement('div');
    box.setAttribute('role', 'alert');
    box.style.cssText = 'margin:24px;padding:16px;border:1px solid #ff6677;border-radius:12px;background:#1a0a0e;color:#ffd6dc;font-family:system-ui';
    box.textContent = `Velocity Type could not start / Não foi possível iniciar: ${error.message}. Reload the page / Recarregue a página (console: velocityType.logs()).`;
    document.body.prepend(box);
}
