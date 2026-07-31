export interface DomShell {
  root: HTMLElement;
  board: HTMLElement;
  canvas: HTMLCanvasElement;
  undoButton: HTMLButtonElement;
  soundButton: HTMLButtonElement;
  restartButton: HTMLButtonElement;
  levelLabel: HTMLElement;
  guide: HTMLElement;
  clearPanel: HTMLElement;
  nextButton: HTMLButtonElement;
  replayButton: HTMLButtonElement;
  retryButton: HTMLButtonElement;
  setLevel(level: number): void;
  setGuideVisible(visible: boolean): void;
  setSoundEnabled(enabled: boolean): void;
  setControlsEnabled(input: {
    undo: boolean;
    restart: boolean;
    sound: boolean;
  }): void;
  showClear(input: {
    moves: number;
    elapsedSeconds: number;
    hasNext: boolean;
  }): void;
  hideClear(): void;
  showFatalError(input: { code: string; error: unknown }): void;
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

function button(
  document: Document,
  className: string,
  label: string,
  text: string,
): HTMLButtonElement {
  const element = document.createElement('button');
  element.className = className;
  element.setAttribute('aria-label', label);
  element.textContent = text;
  return element;
}

export function createDomShell(document: Document, parent: HTMLElement): DomShell {
  const root = document.createElement('main');
  root.className = 'game-shell';

  const hud = document.createElement('header');
  hud.className = 'hud';
  const undoButton = button(document, 'icon-button undo', '一手戻す', '↶');
  const levelLabel = document.createElement('strong');
  levelLabel.className = 'level-label';
  const soundButton = button(document, 'icon-button sound', 'サウンド', '♫');
  hud.append(undoButton, levelLabel, soundButton);

  const guide = document.createElement('section');
  guide.className = 'title-block';
  const title = document.createElement('h1');
  title.textContent = '色をそろえよう！';
  const instruction = document.createElement('p');
  instruction.textContent = 'ボトルをタップして水を移動しよう';
  guide.append(title, instruction);

  const board = document.createElement('section');
  board.className = 'board-wrap';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'カラーウォーターソート');
  board.append(canvas);

  const footer = document.createElement('footer');
  footer.className = 'footer-controls';
  const restartButton = button(document, 'restart-button', 'やり直す', '↻');
  footer.append(restartButton);

  const clearPanel = document.createElement('section');
  clearPanel.className = 'clear-panel';
  clearPanel.hidden = true;
  const clearTitle = document.createElement('h2');
  clearTitle.textContent = 'クリア！';
  const clearMoves = document.createElement('p');
  clearMoves.className = 'clear-moves';
  const clearTime = document.createElement('p');
  clearTime.className = 'clear-time';
  const nextButton = button(document, 'next-button', '次のレベル', '次のレベル');
  const replayButton = button(document, 'replay-button', 'もう一度遊ぶ', 'もう一度遊ぶ');
  clearPanel.append(clearTitle, clearMoves, clearTime, nextButton, replayButton);

  const fatalError = document.createElement('section');
  fatalError.className = 'fatal-error';
  fatalError.hidden = true;
  const fatalMessage = document.createElement('p');
  fatalMessage.textContent = 'ゲームを読み込めませんでした';
  const fatalDetail = document.createElement('small');
  fatalDetail.className = 'fatal-detail';
  const retryButton = button(document, 'retry-button', 'もう一度試す', 'もう一度試す');
  fatalError.append(fatalMessage, fatalDetail, retryButton);

  root.append(hud, guide, board, footer, clearPanel, fatalError);
  parent.replaceChildren(root);

  const setLevel = (level: number) => {
    levelLabel.textContent = `レベル ${String(level).padStart(2, '0')}`;
  };

  setLevel(1);

  return {
    root,
    board,
    canvas,
    undoButton,
    soundButton,
    restartButton,
    levelLabel,
    guide,
    clearPanel,
    nextButton,
    replayButton,
    retryButton,
    setLevel,
    setGuideVisible: (visible) => {
      guide.hidden = !visible;
    },
    setSoundEnabled: (enabled) => {
      soundButton.setAttribute('aria-pressed', String(enabled));
      soundButton.classList.toggle('is-muted', !enabled);
    },
    setControlsEnabled: ({ undo, restart, sound }) => {
      undoButton.disabled = !undo;
      restartButton.disabled = !restart;
      soundButton.disabled = !sound;
    },
    showClear: ({ moves, elapsedSeconds, hasNext }) => {
      clearMoves.textContent = `手数 ${moves}`;
      clearTime.textContent = `タイム ${elapsedSeconds.toFixed(1)}秒`;
      nextButton.hidden = !hasNext;
      clearPanel.hidden = false;
    },
    hideClear: () => {
      clearPanel.hidden = true;
    },
    showFatalError: ({ code, error }) => {
      fatalDetail.textContent = `診断: ${code} / ${describeError(error)}`;
      fatalError.hidden = false;
    },
  };
}
