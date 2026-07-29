import type { ColorId } from '../domain/types';

export const COLOR_STOPS = {
  pink: { top: 0xffa6c4, middle: 0xff6f9e, bottom: 0xe9528b },
  yellow: { top: 0xffff9a, middle: 0xffc84b, bottom: 0xeead2f },
  mint: { top: 0x8bf5db, middle: 0x44d7b0, bottom: 0x2fac91 },
  blue: { top: 0xa8c7ff, middle: 0x5e94ff, bottom: 0x426ed6 },
  purple: { top: 0xc8b7ff, middle: 0x9a78e8, bottom: 0x7457c8 },
  orange: { top: 0xffc08c, middle: 0xff925c, bottom: 0xdd6b3c },
} as const satisfies Record<
  ColorId,
  { readonly top: number; readonly middle: number; readonly bottom: number }
>;
