# BetterHealth design system v3: "Fresh Press"

Bold, bright, kinetic. Full-colour blocks, giant type, 3D objects, springy motion. Still a real app: readable, accessible, fast.

## Tokens (see src/app/globals.css)
Colors (Tailwind names): `tangerine #ff5a1f`, `sun #ffd23f`, `teal #0fb5a6`, `bubble #ff8cc6`, `lime #d7ff3f`, `ink #0b1f1d`, `ink2`, `muted`, `line`, `bg #f3f7f5`, `surface #fff`.
Text on every colour block is `ink` (or white on `ink`). Never white on tangerine/teal/sun/bubble/lime. `muted` only on bg/surface.
Fonts: Bricolage Grotesque (display, 800) via `font-display`/`h1-h3`/`.display`; Albert Sans body. `.mega` = giant hero type.

## Classes
- Surfaces: `.card` (white, 28px radius), `.block .block-{tangerine|sun|teal|bubble|lime|ink}` (flat colour blocks, 32px radius), `.mesh` (animated gradient blobs behind a block, add to `.block-*`), `.grain` (add `relative` + `.grain`).
- Buttons: `.btn` (ink pill with colour-wipe hover), `.btn.hot` (tangerine), `.btn.secondary` (white), `.btn.ghost`. Legacy: `.c-tangerine`, `.c-teal` still work on `.btn`.
- Inputs: `.field` (2px ink border, hard tangerine offset shadow on focus), `label.lbl`.
- Pills: `.chip` (toggle with `aria-pressed`), `.sticker` (rotated lime tag), `.hscroll`.
- Misc: `.marquee` (use `<Marquee/>`), `.float`, `.wiggle`, `.rowline`.
- Legacy `.piece` still works (white card).

## Motion primitives (`@/components/fx`)
`Reveal` (scroll-in), `CountUp value`, `Tilt` (3D pointer tilt card wrapper; put the card classes on it), `Magnetic` (wrap a button), `Marquee items`, `burst(x,y)` (confetti, call from click handlers e.g. after logging food), `useWebGL()`, `useReducedMotion`.
Page transitions live in `src/app/template.tsx`. `motion/react` is available for anything else (layout animations, AnimatePresence for list add/remove).

## 3D (`@/components/three`)
`HeroScene` (floating 3D objects) and `BodyViewer` (rotatable 3D body, clickable muscle groups). Both are client-only; import them with `next/dynamic({ ssr:false })` and show a static fallback while loading or when `useWebGL()` is false.

## Rules
- Reduced motion: every animation must degrade (the primitives already do). 3D shows a static fallback.
- Keep contrast AA, 44px touch targets, visible focus, semantic headings, labels on inputs.
- One big idea per screen; let the colour block + type carry it. Sentence case, plain verbs on buttons, no arrows on buttons.
- Mobile first: 360px wide must not scroll sideways. Use `grid-cols-[minmax(0,1fr)]` on page grids, `min-w-0` on flex/grid children.
- Do not change data logic, props, or `useApp()` usage: only presentation and motion.
