# Velocity Type — checklist CrazyGames

Fonte: https://docs.crazygames.com/ (requisitos lidos em 16/10/2026). Alvo: **Basic Launch** (obrigatório para entrar) com a base do **Full Launch** já pronta.

## Requisitos mínimos (Basic Implementation)

| Requisito | Situação | Como é garantido |
|---|---|---|
| Download inicial ≤ 50 MB, total ≤ 250 MB (≤ 50 MB sem SDK; ≤ 20 MB p/ home mobile) | ✅ ~1 MB | teste `Basic/Technical` limita src+public a 20 MB |
| ≤ 1500 arquivos | ✅ ~100 | mesmo teste |
| Só caminhos relativos | ✅ | `vite base './'`, `index.html` e CSS sem `/…` (teste) |
| Chrome/Edge; Safari ok; Chromebook 4 GB | ⚠️ por teste manual | canvas com DPR ≤ 1,5; sem bibliotecas pesadas |
| Mouse/teclado/toque se houver mobile | ✅ desktop (teclado) | aviso em aparelhos só de toque; **marcar "desktop only" na submissão** |
| Paisagem no desktop | ✅ | |
| Texto legível em 907×510, 821×462, 1216×684, 1077×606, 1366×768, 1920×1080, 1536×864, 1280×720 (DPR 1) | ⚠️ por teste manual | fontes ≥ 11 px (teste), CSS para `max-height: 640px`/`520px` |
| Física consistente em 144/165 Hz | ✅ | teste simula 30/60/144/165 Hz e compara distâncias (±3%) |
| Localização em inglês; idioma do usuário via SDK `locale`, senão inglês | ✅ | `I18n.detect()`: locale do SDK → navegador; teste de paridade PT/EN |
| Controles intuitivos; evitar teclas restritas (ESC sai da tela cheia, Ctrl/Cmd+W) | ✅ | Pausa por **ESC ou Tab** ou botão; sair da tela cheia pausa sozinho |
| Sem botão de tela cheia próprio | ✅ | teste proíbe `requestFullscreen` |
| Sem promoção cruzada / links externos | ✅ | teste: nenhuma URL externa no HTML/código (exceto o SDK) |
| PEGI 12 | ✅ | frases educativas (computação, ciência, pioneiros, código) |
| Originalidade do nome/arte | ⚠️ conferir | procure "Velocity Type" na plataforma antes de enviar |
| Sem anúncios externos / monetização desligada | ✅ | teste proíbe SDKs de anúncio |
| Sem login externo | ✅ | |
| `user-select: none` no body (mobile/tablet) | ✅ | campo de digitação continua selecionável |
| Áudio retoma no iOS após interrupção | ✅ | `AudioService` retoma em touchend/pointerdown/keydown |
| Política de privacidade | n/a | o jogo só guarda progresso no próprio aparelho/conta CrazyGames; nenhum dado pessoal extra é coletado |

## SDK (opcional no Basic, já integrado)

`src/services/CrazyGamesService.js` — só carrega `sdk.crazygames.com` dentro da CrazyGames (ou com `?useLocalSdk=true`); em qualquer outro host não faz nada.
- `init` na tela de carregamento, `loadingStart/Stop`
- `gameplayStart` ao largar/retomar; `gameplayStop` ao pausar, terminar a corrida ou voltar ao menu (pareados; teste garante)
- `happytime` só em recorde ou subida de nível
- `muteAudio` da plataforma prevalece sobre o botão de som
- progresso (XP, histórico, metas) no módulo **Data** (nuvem para contas CrazyGames)
- Para testar localmente: abra o jogo com `?useLocalSdk=true`.

## Ainda é preciso (Full Launch — só depois de selecionado)

- Anúncios **somente via SDK** (midgame entre corridas, respeitando as diretrizes) e funcionamento com AdBlock.
- Integração de conta: nome/avatar do usuário CrazyGames (módulo `user`), login automático.
- "Cair direto na jogabilidade ou no máximo 1 clique": ✅ o botão **Jogar rápido** (primeiro item do menu) larga a corrida em 1 clique com as últimas configurações; **Iniciar corrida** abre a preparação completa.

## O que enviar na submissão

1. **Build:** `npm ci && npm run build` → compactar o **conteúdo** da pasta `dist/` (com `index.html` na raiz) em um `.zip`.
2. **Capas** (3 obrigatórias, só o título, sem bordas/ícones): `docs/crazygames/` — paisagem 1920×1080, retrato 800×1200, quadrada 800×800 (geradas por `python3 scripts/make_covers.py`; substitua por arte final se quiser).
3. **Vídeos de prévia** (obrigatórios; **precisam ser gravados por você**, não há como gerar aqui): 15–20 s, ≤ 50 MB, sem som, sem cursor do mouse, sem texto promocional, sem barras pretas; 1080p paisagem **e** 1080p retrato (2:3); o primeiro quadro deve ser a capa. Mostre: largada em semáforo, turbo, ultrapassagem, chegada.
4. **Metadados** (sugestão):
   - Nome: Velocity Type
   - Descrição curta: *Race by typing! Every correct letter is your throttle. Chain combos for turbo boosts, pass your rivals and cross the line first.*
   - Controles: *Keyboard: type the text to accelerate. Backspace to correct. ESC or Tab to pause.*
   - Categoria/tags sugeridas: Skill / Racing — typing, racing, keyboard, words, speed
   - Dispositivos: **Desktop**; orientação: paisagem; idiomas: English, Português
5. Use a **Preview tool** (developer.crazygames.com) e confira: tamanhos de iframe da lista acima, corrida completa, pausa (ESC/Tab/sair da tela cheia), som mudo pela plataforma.
