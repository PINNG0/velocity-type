// Câmera lateral que acompanha o jogador: ele fica quase fixo na tela e o mundo passa
// (cenário, pista, linhas de largada/chegada). Rivais aparecem à frente/atrás conforme a distância real.
export const Camera = Object.freeze({ playerX: 36, scale: 0.045, min: 4, max: 94 });

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// Posição em % da largura SEM limitar (serve para saber se a linha de chegada já entrou na tela).
export const worldPercent = (position, playerPosition) => Camera.playerX + (position - playerPosition) * Camera.scale;
// Posição em % limitada às bordas (carros nunca somem: grudam na borda se estiverem muito longe).
export const screenPercent = (position, playerPosition) => clamp(worldPercent(position, playerPosition), Camera.min, Camera.max);
