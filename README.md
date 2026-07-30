# Water Sort H5

## Local preview

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. The public build is available at
https://aazhihui12-dotcom.github.io/youxi/ and does not require a login.

The game supports portrait viewports from 320 to 480 CSS pixels wide. In landscape,
the board stays centered and playable; controls move around the board rather than
requiring rotation.

Rendering adapts to three quality levels:

- `high`: up to 2× resolution, full glass highlights and glow, 32 confetti pieces.
- `balanced`: up to 1.5× resolution, simplified glow, 20 confetti pieces.
- `low`: 1× resolution, no outer glow, while retaining glass outlines, liquid gradients,
  and 12 confetti pieces.

## Production build

```sh
npm run check
```

Deploy the generated `dist/` directory to a static HTTPS host.

## Current integrations

Analytics and advertising adapters are no-op implementations. The game makes no external analytics or ad requests.
