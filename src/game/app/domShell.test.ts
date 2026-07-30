// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { createDomShell } from './domShell';

describe('createDomShell', () => {
  it('opens directly into the Japanese game without login UI', () => {
    const parent = document.createElement('div');
    const shell = createDomShell(document, parent);

    expect(shell.canvas.getAttribute('aria-label')).toBe('カラーウォーターソート');
    expect(shell.undoButton.getAttribute('aria-label')).toBe('一手戻す');
    expect(shell.restartButton.getAttribute('aria-label')).toBe('やり直す');
    expect(shell.soundButton.getAttribute('aria-label')).toBe('サウンド');
    expect(parent.textContent).toContain('色をそろえよう！');
    expect(parent.textContent).not.toMatch(/ログイン|登録|アカウント/);
  });

  it('updates the level and clear panel through its public methods', () => {
    const parent = document.createElement('div');
    const shell = createDomShell(document, parent);

    shell.setLevel(3);
    shell.showClear({ moves: 12, elapsedSeconds: 18.4, hasNext: true });

    expect(shell.levelLabel.textContent).toBe('レベル 03');
    expect(shell.clearPanel.hidden).toBe(false);
    expect(shell.clearPanel.textContent).toContain('手数 12');
    expect(shell.clearPanel.textContent).toContain('タイム 18.4秒');
  });
});
