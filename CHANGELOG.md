# Changelog

## 0.3.0-beta.11
- **`npm run cleanup`:** remove os restos de versões anteriores que sobram quando um zip novo é extraído por cima de uma pasta antiga (módulos-esqueleto do modelo inicial, `EventBus.js`, `public/assets`, dados de modelo). `npm run cleanup -- --dry-run` só lista.
- **`npm run verify` mais claro:** avisa quando há arquivos antigos e, se um teste falhar, mostra apenas os testes que falharam com a mensagem de erro (antes cortava o final da saída, onde o erro aparece).
- Mensagens dos testes de limpeza apontam o comando `npm run cleanup`; testes cobrem o utilitário com uma pasta de teste.

## 0.3.0-beta.10
Candidata a beta final: funcionalidades pedidas + revisão geral.
- **Dificuldade automática (adaptativa) de volta**, como interruptor no cartão de dificuldade: liga guardando o último nível manual, desliga voltando a ele; escolher um nível à mão desliga. Preferências antigas em "Adaptativo" continuam automáticas.
- **Jogar rápido** de volta (1 clique, usa as últimas configurações); **Iniciar corrida** abre a preparação.
- **Simulação aleatória** de menus e corridas (4 sementes × 220 ações) com regras de consistência a cada passo: uma única tela visível, fases coerentes, configurações sempre válidas, nenhum erro registrado, setas livres na corrida.
- **Limpeza:** removidos 26 módulos-esqueleto do modelo inicial, o barramento de eventos sem ouvintes, chaves de tradução sem uso, ~6 KB de CSS do menu antigo, ids de HUD antigos, dados e pastas de modelo (`cars.json`, `tracks.json`, `words.json`, `public/assets`), exports sem uso. Valor padrão antigo "Sprint · 2,4 km" corrigido.
- **Console limpo em produção** (só avisos/erros); ícone da aba embutido; acessibilidade: abas ligadas aos painéis, grupos de opções com nome, campo do piloto rotulado.
- **Documentação** reescrita (README, arquitetura, checklist) e guardas de teste contra módulos órfãos, chaves de tradução sem uso, CSS legado e restos de depuração.

## 0.3.0-beta.9
Revisão do menu e do pacote.
- **Um único botão "Iniciar corrida"** (primeiro item do menu): abre a tela de preparação; a corrida só larga em "Começar corrida". "Jogar agora" foi removido.
- **Opções como na referência:** distâncias **Curta 1 km, Média 2 km, Longa 5 km** e **4 níveis** (Fácil, Normal, Difícil, Expert). A lógica acompanha: distância-alvo de 1000/2000/5000 m, velocidade dos rivais por nível e os testes simulam corridas completas de cada modo. Preferências antigas migram (Sprint 2,4 km → Média, Resistência → Longa, Adaptativo → Normal, Muito fácil → Fácil); regras, idioma, piloto e pintura salvos são mantidos.
- **XP/metas por caracteres:** corridas de 1 km têm poucas frases longas e passavam por "curtas demais"; agora o mínimo é de 80 caracteres (e 200 para as conquistas de precisão). Registros antigos seguem a regra por frases.
- **Corrida × configurações gerais:** erros ("Corrigir na hora/Livre") e regras de digitação (acentos, pontuação, maiúsculas, números) agora ficam na tela da corrida ("Regras da corrida"); Configurações ficam só com áudio, teclas, interface e desempenho.
- **Teclado nos menus:** ↑ ↓ ← → movem a seleção (visível, com contorno branco e brilho vermelho), Enter confirma (também liga/desliga interruptores), Home/End vão ao primeiro/último, ESC volta; vale para menus, resultados e pausa. Durante a corrida nada é interceptado. Campos de texto e o controle de volume mantêm suas setas.
- **Pacote:** removido o `public/assets/images/backgrounds/menu-scene.webp` (duplicado) e o `package-lock.json` da pasta de cima; `package-lock.json` agora na mesma versão do `package.json`. Testes impedem arquivos de 0 bytes, lock fora de sincronia e imagem duplicada. O zip não leva a pasta `.git`.

## 0.3.0-beta.8
- **Corrigido:** menu principal centralizado na tela e submenus aparecendo embaixo dos botões. Causa: uma regra antiga (`#main-menu {align-items:center; justify-content:center; padding:30px}`) continuava valendo e a regra que esconde o início ao abrir um submenu não existia. Agora os botões ficam no canto esquerdo e cada submenu abre numa janela grande que substitui o início (com mini logo e "Voltar"), como nas referências. Teste de CSS impede a regressão.
- Cartões da corrida personalizada com ícone à esquerda e botão "Começar corrida" com bandeira, como na referência; barras de rolagem escuras e finas; ajustes de altura para telas baixas.

## 0.3.0-beta.7
Menus redesenhados (referência: print enviado) sobre a imagem `src/assets/menu-scene.webp`.
- **Início:** logo em HTML/CSS (traduzível), perfil do piloto no canto (nome, nível, XP) e menu lateral: **Jogar agora** (1 clique, usa as configurações salvas e mostra o resumo), **Corrida personalizada**, **Garagem**, **Histórico**, **Progressão** e **Configurações**. Idioma EN/PT sempre à mão.
- **Corrida personalizada:** chips de distância, dificuldade e tema (Aleatório = todos), prévia da corrida e botão "Começar corrida".
- **Garagem:** palco com o carro grande, setas/miniaturas/amostras para navegar pelas pinturas, bloqueio por nível, "Equipar" e desempenho do piloto.
- **Histórico:** cartões de estatísticas e tabela (a melhor corrida em destaque), exportar/importar/limpar.
- **Progressão:** cartão de nível/XP, desafios do dia com contagem para o reinício (meia-noite), objetivos de longo prazo, conquistas e histórico de XP.
- **Configurações** (abas): áudio (volume geral e som), controles (modo de erro, regras de digitação, teclas), interface (idioma, nome do piloto, reduzir movimento) e desempenho (qualidade visual automática/alta/baixa).
- Versão exibida no menu (vem do `package.json`).
- Mesclado com as mudanças anteriores deste repositório (beta.5 + fundo do menu) e com a preparação para a CrazyGames (beta.6).

## 0.3.0-beta.6
Requisitos mínimos da CrazyGames (Basic) — ver `docs/CRAZYGAMES.md`.
- **SDK da CrazyGames (opcional, só dentro da plataforma):** carregamento/gameplay start-stop pareados, `happytime`, `muteAudio` com prioridade sobre o botão de som, locale do usuário e progresso no módulo Data.
- **Teclas restritas:** pausa por ESC **ou Tab**; sair da tela cheia (ESC) pausa automaticamente.
- **Mobile/tablet:** `user-select: none` no corpo (campo de digitação continua selecionável), retomada do áudio no iOS após interrupção, aviso em aparelhos só de toque (jogo é para teclado).
- **Testes de conformidade:** tamanho/quantidade de arquivos, caminhos relativos, sem links externos/anúncios/tela cheia própria, física igual em 30/60/144/165 Hz, eventos de gameplay pareados.
- **Capas** 1920×1080, 800×1200 e 800×800 em `docs/crazygames/` (`scripts/make_covers.py`) e checklist de submissão.

## 0.3.0-beta.5
Resposta ao diagnóstico de publicação.
- **Interface completa em inglês e português** (`src/i18n/`): menus, opções, HUD, resultados, XP, metas, conquistas, toasts, banners, dica de erro, contagem, histórico e mensagens de importação. Primeira visita usa o idioma do navegador (não-português → inglês); botões EN/PT no topo do menu e o seletor de idioma trocam tudo na hora. Testes garantem chaves iguais nos dois idiomas, nenhum texto em português no modo inglês e nenhum texto novo do HTML sem tradução.
- **Início rápido:** o menu agora tem título, EN/PT e o botão de jogar; opções, garagem (pinturas), temas e regras ficam recolhidos em "Opções e garagem"; lista de recursos removida. Instruções de uma linha só na 1ª corrida.
- **Legibilidade:** nenhuma fonte abaixo de 11 px (exceto etiqueta dos rivais, 10 px); regras para áreas de jogo pequenas (ex.: 907×510 e 821×462): cockpit compacto, pista sempre visível, placar compacto/oculto em telas muito baixas; carros 30% maiores.
- **Comunicação da corrida:** indicador "Catch X: N m ahead" / "You lead by N m" (por que estou ganhando ou perdendo) e brilho ao concluir cada palavra, com tique sonoro.

## 0.3.0-beta.4
- **Sensação de movimento:** câmera que acompanha o jogador (ele fica quase fixo e o mundo passa); cenário em paralaxe (montanhas, colinas, árvores, mureta e postes de luz em velocidades diferentes); pista com faixas que alongam com a velocidade, zebras rolando e linhas quadriculadas de largada/chegada que entram e saem da tela; rastro de velocidade e leve balanço nos carros; etiqueta com o nome dos rivais; depois da chegada o mundo continua rolando e desacelerando.
- **Turbo por combo:** combo 25 = MINI TURBO (+8%, 2 s), 50 = TURBO (+12%, 3 s), 100 e a cada +100 = SUPER TURBO (+16%, 4 s). Chama no escapamento, linhas de velocidade douradas, tranco de câmera, banner e som. Ajustável em `src/domain/race/TurboRules.js`.
- **Erro bem visível:** tela dá um tranco e pisca em vinheta vermelha, o console de digitação treme, o carro tropeça (−8% por 0,5 s) e o combo quebra. "Reduzir movimento" mantém só a cor.
- **Largada em semáforo:** uma luz vermelha por segundo (PREPARAR, ATENÇÃO, QUASE!), tudo verde com "DIGITE!", motor acelerando e chama na partida.

## 0.3.0-beta.3
- **Teclas mortas (´ ~ ^ `) e IME:** o caractere provisório da composição não conta mais como erro; só o resultado final é processado.
- **Modo de erros:** novo seletor "Corrigir na hora" (padrão: tecla errada é recusada, conta como erro e o campo volta ao último valor certo; nunca há erro escondido) ou "Livre".
- **Rivais com personalidade:** Nova (constante), Blaze (arranca forte e cansa), Volt (guarda fôlego para o final) + ajuste leve de ±5% para manter a disputa equilibrada.
- **Pinturas desbloqueáveis por nível** (Clássico, Neon, Dourado, Fantasma, Inferno), com aviso ao desbloquear.
- **Análise pós-corrida** (fora da corrida, sem poluir a tela): gráfico de WPM ao longo do tempo e teclas mais erradas; gravados no histórico e no backup.
- **Conteúdo:** +58 frases (PT/EN) em computação, ciência, pioneiros e código.

## 0.3.0-beta.2
- **Corrigido:** carros (e a pista) sumiam — uma regra CSS nova rebaixava `.track` de `absolute` para `relative`. Teste estático impede a regressão.
- **Corrigido/Melhorado:** frase "travada" quando o texto digitado tem o mesmo tamanho mas um erro fora da área visível (ex.: `,pposição` no lugar de `, posição`). Agora uma dica mostra a posição do erro, o esperado e o digitado; o log `typing-invariant` registra os códigos dos caracteres para diagnóstico.

## 0.3.0-beta.1
**Fundação:** `RaceRecorder` (fluxo único de fim de corrida), `StorageService` único, `Logger`, `EventBus`, `ContentService`, `RaceSetup`, `RaceModes`, `RecordsView`/`ProgressionView` extraídos do `UIManager`.
**Progressão:** perfil, XP, níveis ajustáveis, anti-farm, histórico de progressão, barra de XP e aviso de nível.
**Objetivos:** desafios diários, objetivos de longo prazo, 12 conquistas, notificações, persistência segura.
**Jogabilidade/desempenho:** HUD com limite de frequência, ranking incremental, classificação sem alocação, pausa automática em aba oculta, WPM justo na pausa, tempo de corrida pela simulação.
**Apresentação:** pista em canvas, linhas de velocidade, confete, banners (largada, ultrapassagem, combo, chegada), áudio procedural, feedback de erro, qualidade adaptativa, suporte a "reduzir movimento".
**Beta:** backup v2 (corridas + perfil + objetivos), recuperação de dados corrompidos, acessibilidade (live regions, foco, contraste), `npm run verify`.

### Bugs corrigidos
- Importar registros descartava os **mais novos** quando o histórico estava cheio (ordem invertida).
- Pausar derrubava o WPM (o relógio da digitação continuava correndo).
- `TypingSession` podia ficar O(n²) com rajadas de teclas (buffer sem teto).
- `GameLoop` gerava salto de tempo ao reiniciar; erro em um quadro derrubava o loop.
- Tempo da corrida usava relógio de parede, incoerente com a distância simulada.
- Ranking e HUD reescreviam o DOM a cada quadro.
- WPM absurdo era gravado e depois rejeitado pela própria validação de importação.
- Chaves de armazenamento duplicadas em vários arquivos; falhas de gravação eram engolidas.
