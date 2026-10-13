# Velocity Type

Jogo single-player de corrida baseado em digitação, com cockpit neon, fita contínua de texto, adversários controlados pelo jogo e histórico local.

## Requisitos

- Node.js 20.19+ ou 22.12+ (compatível com Vite 7).
- npm.

## Instalação e execução

```bash
npm install
npm run dev
```

Abra a URL local exibida pelo Vite. Para gerar a versão de produção:

```bash
npm test
npm run build
npm run preview
```

O ZIP de distribuição não inclui `node_modules`: o npm instala os binários nativos apropriados para o sistema operacional em que o projeto for aberto.

## Funcionalidades

- Idiomas português e inglês e temas de computação, ciência, pessoas, código e misto.
- Modos Sprint (2,4 km), Longa (5 km) e Resistência (10 km).
- Dificuldades fixas e adaptativa com progressão limitada para manter a corrida competitiva.
- Regras configuráveis para acentos, pontuação, maiúsculas/minúsculas e números.
- WPM, precisão, erros, combo, velocidade, posição e distância.
- Pausa/retomada, reinício, resultados, histórico local e importação/exportação JSON.
- Configurações e registros persistidos no navegador via `localStorage`.
- Fita de texto com janela visual limitada para evitar crescimento indefinido do DOM em corridas longas.

## Conteúdo

As frases ficam em `public/data/words/phrases.json`. O tema `mixed` usa sua própria seleção curada; selecionar temas individuais combina os conjuntos escolhidos.

## Diagnóstico e testes

Os diagnósticos são focados em eventos importantes (início, pausa, retomada, conclusão e anomalias), não em cada tecla. `npm test` executa os testes automatizados de domínio e regressão. A aprovação dos testes não substitui um teste manual no navegador: iniciar corrida, digitar por vários minutos, terminar, recarregar a página e confirmar persistência.

## Estrutura

- `src/domain`: regras e modelos de domínio.
- `src/controllers`: fluxo do jogo e entrada.
- `src/services`: persistência, áudio, configurações e dificuldade.
- `src/systems`: atualização de corrida e digitação.
- `src/ui`: telas e componentes.
- `tests`: testes automatizados.

---

## Versão 0.3.0-beta.1 — novidades

Perfil com **XP e níveis**, **desafios diários**, **objetivos de longo prazo** e **conquistas**; pista renderizada em canvas com
animações de largada/ultrapassagem/chegada, áudio procedural e feedback de erros e combos.

```bash
npm install        # uma vez
npm run dev        # desenvolvimento
npm test           # testes
npm run verify     # sintaxe + testes + build limpo (confere o dist/)
npm run build && npm run preview
```

Documentação: `docs/ARCHITECTURE.md` (responsabilidades, fluxo de fim de corrida, dados, logs) e `docs/BETA_CHECKLIST.md`.
Depuração: no console do navegador use `velocityType.logs()`.
