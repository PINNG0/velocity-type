# Checklist da beta

## Automático (`npm run verify`)
- [x] Sintaxe de todos os arquivos
- [x] Testes: domínio, progressão, armazenamento/backup, corrida completa, regressão (sequências longas), UI com DOM simulado, estáticos (ids do HTML, imports, acessibilidade básica)
- [ ] Build limpo (`vite build`) — requer `npm install`; o script executa e confere o `dist/`

## Manual (ambiente novo: `npm ci && npm run build && npm run preview`)
- [ ] Menu carrega, perfil mostra NV 1 / 0 XP
- [ ] Corrida Sprint completa: contagem, largada, pausa (ESC / botão), retomada, chegada, resultados com XP
- [ ] Subir de nível exibe banner e toast; barra de XP anima
- [ ] Objetivos do dia aparecem (3) e avançam; conquista dispara toast
- [ ] Exportar → limpar dados do navegador → importar restaura corridas, XP e conquistas
- [ ] Trocar de aba durante a corrida pausa automaticamente
- [ ] Botão SOM alterna e lembra a preferência
- [ ] Teclado: Tab alcança todos os botões; foco visível; leitor de tela anuncia largada/chegada/ultrapassagens
- [ ] "Reduzir movimento" do sistema desliga confete/linhas de velocidade/shake
- [ ] Telas: 1920×1080, 1366×768, tablet e celular em paisagem
- [ ] Console: `velocityType.counters()` sem `error` após uma sessão normal
