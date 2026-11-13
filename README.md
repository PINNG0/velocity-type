# Velocity Type

Jogo de corrida movido pela velocidade de digitação, em **português e inglês**. Cada letra certa acelera o seu carro; sequências sem erro dão turbo; erros fazem o carro tropeçar. Rivais, XP, níveis, objetivos diários, conquistas e pinturas desbloqueáveis.

> Typing racing game: every correct letter is your throttle. Chain combos for turbo boosts, pass your rivals and cross the line first.

## Como jogar

- **Jogar rápido:** larga a corrida em um clique com as últimas configurações.
- **Iniciar corrida:** escolha distância (Curta 1 km, Média 2 km, Longa 5 km), dificuldade (Fácil, Normal, Difícil, Expert ou **automática**), temas das frases e regras da corrida, e clique em **Começar corrida**.
- Digite o texto que aparece. Combo 25 = mini turbo, 50 = turbo, 100 = super turbo. Erro quebra o combo.
- **Teclas:** `Backspace` corrige · `ESC` ou `Tab` pausa · nos menus `↑ ↓ ← →` movem a seleção, `Enter` confirma, `ESC` volta.

## Rodar

```bash
npm ci               # instala as dependências
npm run dev          # desenvolvimento (http://localhost:5173)
npm test             # testes automáticos
npm run verify       # sintaxe + testes + build limpo (confere o dist/)
npm run cleanup      # remove arquivos de versões anteriores (depois de extrair um zip por cima)
npm run build        # gera dist/ (funciona em qualquer subpasta: base './')
npm run preview      # serve o dist/ localmente
```

Requer Node 18+. Depuração no navegador: `velocityType.logs()` no console.

## Estrutura

```
src/
  config/        modos (1/2/5 km), progressão, pinturas, UI
  domain/        corrida, carro, digitação, progressão (sem DOM)
  systems/       RaceSystem, TypingSystem
  controllers/   RaceController (ciclo da corrida), InputController, RaceSetup
  services/      armazenamento, backup, XP, áudio, conteúdo, Logger, CrazyGames
  ui/            UIManager, MenuView, KeyboardNav, RecordsView, ProgressionView, estilos
  rendering/     pista, cenário, carros, efeitos (canvas)
  i18n/          dicionários pt/en
public/data/     frases do jogo (words/phrases.json)
docs/            arquitetura, checklist da beta, CrazyGames, notas de versão
tests/           ~180 testes (domínio, UI com DOM simulado, simulação aleatória, conformidade)
```

## Documentação

- `docs/ARCHITECTURE.md` — responsabilidades, fluxos, dados salvos, logs
- `docs/BETA_CHECKLIST.md` — o que conferir antes de publicar
- `docs/CRAZYGAMES.md` — requisitos da plataforma e submissão
- `docs/releases/` e `CHANGELOG.md` — histórico de versões

## Conteúdo do jogo

As frases ficam em `public/data/words/phrases.json` (por idioma e tema). Para adicionar frases, edite esse arquivo; `npm test` confere duplicatas e tamanhos.
