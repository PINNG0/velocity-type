# Checklist da beta

## Automático (`npm run verify`)
- [x] Sintaxe de todos os arquivos
- [x] Testes: domínio, serviços, UI (DOM simulado), simulação aleatória, conformidade CrazyGames, guardas de limpeza
- [ ] Build limpo (`vite build`) — requer `npm ci`; o script executa e confere o `dist/`

## Empacotar
- Compacte a pasta do projeto **sem** `.git`, `node_modules` e `dist` (ex.: `zip -r velocity-type.zip velocity-type-starter -x "*/.git/*" "*/node_modules/*" "*/dist/*"`).
- Só um `package-lock.json`, dentro do projeto, na mesma versão do `package.json` (um teste confere). Depois de mudar a versão: `npm install --package-lock-only`.
- **Ao extrair um zip novo por cima de uma pasta antiga**, arquivos removidos do projeto continuam lá (módulos vazios do modelo inicial, `EventBus.js`, `public/assets` com o `menu-scene.webp` duplicado…). Rode `npm run cleanup` (ou `npm run cleanup -- --dry-run` para só listar) e depois `git add -A`. O `npm run verify` avisa quando sobra algo.

## Manual (ambiente novo: `npm ci && npm run build && npm run preview`)
- [ ] **Jogar rápido** larga a corrida em 1 clique; **Iniciar corrida** abre a preparação e só **Começar corrida** larga
- [ ] Distâncias 1/2/5 km e níveis Fácil/Normal/Difícil/Expert; dificuldade automática liga/desliga e lembra o nível
- [ ] Corrida completa: contagem em semáforo, largada, turbo no combo 25, tropeço ao errar, pausa (ESC/Tab/botão/aba oculta/sair da tela cheia), retomada, chegada, resultados com XP
- [ ] Menus só pelo teclado: ↑ ↓ ← → Enter ESC; durante a corrida nada é interceptado
- [ ] Garagem (bloqueio por nível, equipar), histórico (tabela), progressão (reinício dos desafios), configurações (áudio, interface, desempenho)
- [ ] Exportar → limpar dados do navegador → importar restaura corridas, XP e conquistas
- [ ] Inglês e português: nenhum texto sobrando em outro idioma
- [ ] Telas: 1920×1080, 1366×768, 907×510 e 821×462; "reduzir movimento" ligado; som mudo
- [ ] Console: `velocityType.counters()` sem `error` após uma sessão normal
