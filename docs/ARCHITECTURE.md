# Arquitetura — Velocity Type

## Responsabilidades

| Módulo | Faz | NÃO faz |
|---|---|---|
| `RaceController` | Ciclo da corrida: menu → contagem → corrida → pausa → fim; teclas ESC/Tab; liga domínio, UI, áudio e plataforma. | Não monta HTML, não calcula XP, não grava dados. |
| `UIManager` | Tudo que toca o DOM da corrida e das configurações; HUD com limite de frequência; leaderboard; banners e feedback. | Não decide regras de jogo, não acessa `localStorage`. |
| `MenuView` | Menu principal e submenus (corrida, garagem, histórico, progressão, configurações), chips, garagem, cronômetro dos desafios. | — |
| `KeyboardNav` | ↑ ↓ ← → / Home / End / Enter nos menus, resultados e pausa; nunca atua durante a corrida. | — |
| `RecordsView` / `ProgressionView` | Histórico e backup / XP, objetivos, conquistas, toasts. | — |
| `RaceRecorder` | **Fluxo único** de fim de corrida (abaixo). | — |
| `ProgressionService` | XP + objetivos + conquistas de uma corrida, gravados de uma vez. | — |
| `StorageService` | **Único** acesso a `localStorage` (ou ao módulo Data da CrazyGames). Isola valores corrompidos. | — |
| `BackupService` | Exportar/importar o save completo. | — |
| `CrazyGamesService` | SDK da plataforma (só carrega dentro dela): gameplay start/stop, mute, locale, dados. | — |
| `I18n` | `t(chave, params)`, idioma do navegador, `data-i18n` no HTML. | — |

## Iniciar uma corrida

```
Jogar rápido ───────────────────────────┐        (1 clique, configurações salvas)
Iniciar corrida → preparação → Começar corrida ┘
   RaceController.startRace → RaceSetup (distância + dificuldade) → contagem → largada
```

- Distâncias: **Curta 1000 m, Média 2000 m, Longa 5000 m** (`config/RaceModes.js`; ids antigos migram).
- Dificuldade: Fácil / Normal / Difícil / Expert, ou **automática** (`AdaptiveDifficultyService`: ajusta o nível pelo histórico; o último nível manual é lembrado).
- **Definem a corrida** (tela de preparação): distância, dificuldade, temas, modo de erro, regras de digitação.
- **Gerais** (Configurações): áudio, teclas, idioma, nome do piloto, reduzir movimento, qualidade visual; pintura na Garagem.

## Fim de corrida (fluxo único)

```
RaceController.finishRace()            idempotente
  ├─ trava entrada/pausa, para o motor, gameplayStop
  ├─ RaceRecorder.finalize()           cada etapa isolada em try/catch
  │    1 RaceResult (id único, caracteres digitados)  2 adaptativo  3 histórico (ignora id repetido)
  │    4 recorde  5 ProgressionService (XP uma vez por id)
  ├─ animação de chegada (config.ui.finishDelayMs)
  └─ presentResults(): tela + toasts (nível, conquistas, erros de gravação)
```

## Dados salvos (`StorageKeys`)

`velocity-type-race-history-v1` · `velocity-type-profile-v1` · `velocity-type-progress-v1` · `velocity-type-settings-v2` (idioma, modo, dificuldade + último nível manual, temas, regras, erro, pintura, piloto, qualidade, reduzir movimento) · `velocity-type-audio-v1` · `velocity-type-adaptive-v1` / `velocity-type-history-v2` · `velocity-type-onboarding-v1` · recordes. Valor ilegível vai para `<chave>:corrupt` e o jogo segue com o padrão. Configurações antigas são migradas ao carregar.

## Progressão

Ajuste em `config/ProgressionConfig.js`. XP por nível = `baseXp × nível^expoente`. Recompensa por participação, velocidade, precisão, posição e recorde, escalada por distância e dificuldade. Anti-farm: cada corrida paga uma vez; a mesma configuração repetida no dia perde valor; corridas com menos de 80 caracteres pagam ~25%. Desafios diários determinísticos pela data local.

## Desempenho e movimento

HUD de texto ~15 Hz, só escreve no DOM quando o valor muda; ranking incremental; câmera acompanha o jogador; qualidade visual automática/alta/baixa; "reduzir movimento" (sistema ou jogo).

## Logs

`Logger` (400 entradas). Em produção o console só recebe avisos/erros; o histórico completo está em `velocityType.logs()`, `velocityType.logEntries({level:'error'})`, `velocityType.counters()`.

## Testes

`npm test`: domínio, serviços, UI com DOM simulado, **simulação aleatória** de menus e corridas (consistência de telas/configurações), conformidade CrazyGames (tamanho, caminhos relativos, sem links externos, física em 30–165 Hz) e guardas de limpeza (sem módulos órfãos, sem chaves de tradução sem uso, sem arquivos vazios, lock consistente).
