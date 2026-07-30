export const JA = {
  title: '色をそろえよう！',
  guide: 'ボトルをタップして水を移動しよう',
  clear: 'クリア！',
  nextLevel: '次のレベル',
  playAgain: 'もう一度遊ぶ',
  level(id: number): string {
    return `レベル ${String(Math.trunc(id)).padStart(2, '0')}`;
  },
} as const;
