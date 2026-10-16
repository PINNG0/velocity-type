# Changelog

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
