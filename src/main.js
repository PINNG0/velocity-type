import { Game } from './core/Game.js';
import { GameConfig } from './config/GameConfig.js';
import { Logger } from './services/Logger.js';
import { StorageService } from './services/StorageService.js';
import { CrazyGamesService } from './services/CrazyGamesService.js';

// Em produção o console só recebe avisos e erros (o histórico completo continua em velocityType.logs()).
if (import.meta.env?.PROD) Logger.minLevel = 'warn';

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

async function boot() {
    // Na CrazyGames o SDK é iniciado antes do jogo (tela de carregamento); em qualquer outro host não faz nada.
    await CrazyGamesService.init();
    CrazyGamesService.loadingStart();

    const backend = CrazyGamesService.dataBackend();
    if (backend) StorageService.backend = backend; // progresso na conta CrazyGames (ou local para visitantes)

    const game = new Game(GameConfig);
    game.start();
    window.velocityType.game = game;

    // muteAudio da plataforma prevalece sobre o botão de som do jogo.
    const audio = game.raceController.audio;
    audio.setExternalMute(CrazyGamesService.muteAudio());
    CrazyGamesService.onMuteChange(muted => audio.setExternalMute(muted));

    CrazyGamesService.loadingStop();
}

boot().catch(error => {
    Logger.error('boot', 'falha ao iniciar o jogo', { error: String(error?.stack ?? error) });
    const box = document.createElement('div');
    box.setAttribute('role', 'alert');
    box.style.cssText = 'margin:24px;padding:16px;border:1px solid #ff6677;border-radius:12px;background:#1a0a0e;color:#ffd6dc;font-family:system-ui';
    box.textContent = `Velocity Type could not start / Não foi possível iniciar: ${error.message}. Reload the page / Recarregue a página (console: velocityType.logs()).`;
    document.body.prepend(box);
});
