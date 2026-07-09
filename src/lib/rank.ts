// Título de "rank" (PlayerProfile.rank) derivado do nível do jogador.
// Não é persistido em BD — é calculado a pedido para evitar duplicação de estado.
const RANK_THRESHOLDS: Array<{ level: number; title: string }> = [
  { level: 1, title: "Recruta" },
  { level: 5, title: "Aventureiro" },
  { level: 10, title: "Explorador" },
  { level: 20, title: "Veterano" },
  { level: 35, title: "Elite" },
  { level: 50, title: "Campeão" },
  { level: 75, title: "Herói" },
  { level: 100, title: "Lenda" },
];

export function rankTitleForLevel(level: number): string {
  let title = RANK_THRESHOLDS[0].title;
  for (const threshold of RANK_THRESHOLDS) {
    if (level >= threshold.level) {
      title = threshold.title;
    } else {
      break;
    }
  }
  return title;
}
