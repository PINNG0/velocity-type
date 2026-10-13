# Arquitetura — Velocity Type

## Responsabilidades (Etapa 1)

| Módulo | Faz | NÃO faz |
|---|---|---|
| `RaceController` | Orquestra o ciclo: menu → contagem → corrida → pausa → fim. Liga domínio, UI e áudio. | Não monta HTML, não calcula XP, não grava dados, não escolhe frases. |
| `UIManager` | Tudo que toca o DOM: telas, HUD (com limite de frequência), leaderboard, banners, feedback. | Não decide regras de jogo, não acessa `localStorage`. |
| `RecordsView` | Histórico, exportar/importar/limpar. | — |
| `ProgressionView` | Barra de XP, objetivos, conquistas, toasts, XP na tela de resultados. | — |
| `RaceRecorder` | **Fluxo único** de fim de corrida (ver abaixo). | — |
| `ProgressionService` | XP + objetivos + conquistas de uma corrida, gravados de uma vez. | — |
| `StorageService` | **Único** acesso a `localStorage` (teste estático garante). Recupera valores corrompidos. | — |
| `BackupService` | Exportar/importar o save completo (corridas + perfil + objetivos). | — |
| `ContentService` / `RaceSetup` | Seleção de frases / montagem da configuração da corrida (funções puras). | — |
| `Logger` | Buffer circular de logs + console; `velocityType.logs()` no navegador. | — |

## Fluxo único de fim de corrida

```
RaceController.update → race.finished
  └─ RaceController.finishRace()            (idempotente: finishedHandled)
       ├─ trava entrada/pausa, para o motor
       ├─ RaceRecorder.finalize()           (cada etapa isolada em try/catch)
       │    1. RaceResult (id único)
       │    2. AdaptiveDifficultyService.record
       │    3. StorageService.saveResult    (ignora id duplicado)
       │    4. StorageService.saveBest
       │    5. ProgressionService.processRace (XP uma vez por id)
       ├─ animação de chegada (config.ui.finishDelayMs)
       └─ presentResults(): tela + toasts (nível, conquistas, erros de gravação)
```

## Dados persistentes (todas as chaves em `StorageKeys`)

`velocity-type-race-history-v1` (corridas, máx. 200) · `velocity-type-profile-v1` (XP, histórico de progressão) ·
`velocity-type-progress-v1` (objetivos, conquistas, estatísticas) · `velocity-type-settings-v2` · `velocity-type-audio-v1` ·
`velocity-type-adaptive-v1` / `velocity-type-history-v2` (dificuldade adaptativa) · `velocity-type-best-result:*` (recordes).
Valor ilegível é movido para `<chave>:corrupt` e o jogo segue com o padrão.

## Progressão (Etapas 2–3)

- Ajuste tudo em `src/config/ProgressionConfig.js`: XP por nível = `round(baseXp × nível^exponent)`.
- XP da corrida: participação + velocidade + precisão + posição + recorde, escalados por distância e dificuldade.
- Anti-farm: (1) cada corrida só paga XP **uma vez** (id); (2) mesma configuração repetida no dia perde valor
  (2 grátis, depois −20% por repetição, piso 25%); (3) corrida curta/imprecisa paga ~25%; (4) WPM > 250 é limitado.
- Desafios diários: 3 por dia, determinísticos pela data local (não reiniciam no mesmo dia; relógio voltando não apaga nada).
- Conquistas por velocidade, precisão, consistência e participação; recompensas em XP, também concedidas uma única vez.

## Desempenho (Etapa 4)

HUD de texto ~15 Hz e ponteiros ~30 Hz, só escrevendo no DOM quando o valor muda; ranking reconstruído apenas quando a ordem muda;
classificação sem alocação por quadro; `PerformanceMonitor` reduz efeitos se o quadro passar de ~26 ms.

## Logs

`Logger` (níveis debug/info/warn/error, 400 entradas). Escopos: `state`, `race`, `recorder`, `progress`, `storage`, `backup`,
`audio`, `perf`, `ui`, `game`, `window`. No console do navegador: `velocityType.logs()`, `velocityType.logEntries({level:'error'})`,
`velocityType.counters()`.
