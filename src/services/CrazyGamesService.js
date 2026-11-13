import { Logger } from './Logger.js';

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

// Integração com o SDK da CrazyGames (HTML5 v3). 100% opcional: fora da plataforma tudo vira "não faz nada".
// - Só carrega o script quando o jogo roda na CrazyGames (ou com ?useLocalSdk=true), nunca em outros hosts.
// - Chama gameplayStart/Stop, loadingStart/Stop, happytime; respeita muteAudio e o locale do usuário.
export class CrazyGamesService {
    static state = { available: false, environment: 'disabled', playing: false, initialized: false };
    static muteListeners = new Set();

    static get sdk() { return globalThis.window?.CrazyGames?.SDK ?? null; }
    static get active() { return this.state.available; }

    // Está rodando dentro da CrazyGames (iframe do CDN deles) ou em teste local do SDK?
    static shouldLoad(win = globalThis.window) {
        try {
            const host = String(win?.location?.hostname ?? '');
            const search = String(win?.location?.search ?? '');
            const ancestors = [...(win?.location?.ancestorOrigins ?? [])].join(' ');
            const referrer = String(win?.document?.referrer ?? globalThis.document?.referrer ?? '');
            return /crazygames/i.test(`${host} ${ancestors} ${referrer}`) || /[?&]useLocalSdk=true/.test(search);
        } catch { return false; }
    }

    static loadScript(timeoutMs) {
        return new Promise(resolve => {
            if (this.sdk) { resolve(true); return; }
            try {
                const script = document.createElement('script');
                script.src = SDK_URL; script.async = true;
                script.onload = () => resolve(true);
                script.onerror = () => resolve(false);
                document.head.appendChild(script);
            } catch { resolve(false); return; }
            setTimeout(() => resolve(Boolean(this.sdk)), timeoutMs);
        });
    }

    // Nunca lança: se algo falhar o jogo segue normalmente, só sem integração.
    static async init({ timeoutMs = 4000, win = globalThis.window } = {}) {
        if (this.state.initialized) return this.state.available;
        this.state.initialized = true;
        if (!this.shouldLoad(win)) { Logger.info('crazygames', 'fora da plataforma: SDK não carregado'); return false; }
        try {
            if (!(await this.loadScript(timeoutMs)) || !this.sdk) throw new Error('script do SDK indisponível');
            await Promise.race([this.sdk.init(), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout ao iniciar o SDK')), timeoutMs))]);
            this.state.environment = this.sdk.environment ?? 'disabled';
            this.state.available = this.state.environment !== 'disabled';
            Logger.info('crazygames', 'SDK iniciado', { environment: this.state.environment });
            if (this.state.available) this.watchSettings();
        } catch (error) {
            this.state.available = false;
            Logger.warn('crazygames', 'SDK indisponível, seguindo sem integração', { error: String(error?.message ?? error) });
        }
        return this.state.available;
    }

    static call(fn, label) {
        if (!this.active) return;
        try { const result = fn(this.sdk); if (result?.catch) result.catch(error => Logger.debug('crazygames', `${label} falhou`, { error: String(error?.message ?? error) })); }
        catch (error) { Logger.debug('crazygames', `${label} falhou`, { error: String(error?.message ?? error) }); }
    }

    static loadingStart() { this.call(s => s.game.loadingStart(), 'loadingStart'); }
    static loadingStop() { this.call(s => s.game.loadingStop(), 'loadingStop'); }
    // Idempotente: o SDK espera pares start/stop (jogar, retomar / pausar, menu, fim de corrida).
    static gameplayStart() { if (this.state.playing) return; this.state.playing = true; this.call(s => s.game.gameplayStart(), 'gameplayStart'); }
    static gameplayStop() { if (!this.state.playing) return; this.state.playing = false; this.call(s => s.game.gameplayStop(), 'gameplayStop'); }
    static happytime() { this.call(s => s.game.happytime(), 'happytime'); }

    // Idioma do usuário informado pela plataforma ("pt-BR", "en-US"...), se disponível.
    static locale() {
        try { return this.sdk?.user?.systemInfo?.locale ?? null; } catch { return null; }
    }

    // muteAudio da plataforma tem prioridade sobre o botão de som do jogo.
    static muteAudio() {
        try { return Boolean(this.sdk?.game?.settings?.muteAudio); } catch { return false; }
    }

    static onMuteChange(callback) { this.muteListeners.add(callback); return () => this.muteListeners.delete(callback); }

    static watchSettings() {
        this.call(s => s.game.addSettingsChangeListener(settings => {
            for (const listener of this.muteListeners) listener(Boolean(settings?.muteAudio));
        }), 'addSettingsChangeListener');
    }

    // Progresso salvo pela plataforma (nuvem para contas CrazyGames, local para visitantes).
    static dataBackend() {
        const data = this.active ? this.sdk?.data : null;
        if (!data) return null;
        return {
            getItem: key => data.getItem(key),
            setItem: (key, value) => data.setItem(key, value),
            removeItem: key => data.removeItem(key)
        };
    }

    static reset() { this.state = { available: false, environment: 'disabled', playing: false, initialized: false }; this.muteListeners.clear(); }
}
