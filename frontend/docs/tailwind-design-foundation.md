# Tailwind Design Foundation

## Scope

The public frontend uses Tailwind CSS v4 through PostCSS. The foundation is
CSS-first so design tokens live next to the global stylesheet instead of in
page-specific CSS blocks.

## Files

| File | Purpose |
| --- | --- |
| `postcss.config.mjs` | Registers `@tailwindcss/postcss` for Next.js builds. |
| `src/app/globals.css` | Imports Tailwind, tokens, and temporary legacy CSS; keeps reset, focus, shell, and accessibility rules. |
| `src/styles/tokens.css` | Central color, typography, spacing, radius, shadow, focus, and layout tokens. |
| `src/styles/public-legacy.css` | Temporary compatibility layer for public components that have not migrated yet. |
| `src/components/ui/*` | Shared primitives for new public UI work. |

## Token Usage

Prefer semantic token utilities over one-off values:

- Colors: `bg-brand`, `text-muted`, `border-border`, `bg-cinema-gold-soft`.
- Typography: `text-display`, `text-section`, `font-sans`.
- Radius: `rounded-control`, `rounded-card`, `rounded-panel`, `rounded-pill`.
- Shadows and focus: `shadow-soft`, `shadow-premium`, `focus-visible:shadow-focus`.
- Layout: `max-w-shell`, `max-w-prose`, `px-gutter`, `py-section`.

For unavoidable CSS, reference the same variables directly:

```css
box-shadow: var(--shadow-soft);
outline: var(--focus-ring);
max-width: var(--layout-shell-max);
```

## UI Primitives

Use shared primitives before adding new selectors:

- `Button` and `ButtonLink` for primary, secondary, ghost, and danger actions.
- `Badge` for status and metadata markers.
- `Tabs` for segmented content.
- `Select` for labeled native selects with description and error states.
- `SectionHeading` for page and section titles with optional actions.
- `CarouselControls` for previous/next icon controls.

## Migration Path

1. Home page: migrate hero actions, catalog section headings, loading states,
   and retry controls to `Button`, `ButtonLink`, `SectionHeading`, and `Badge`.
2. Movie cards and carousels: replace card, skeleton, and carousel selectors
   with Tailwind utilities plus `CarouselControls`.
3. Header: move brand, nav, and account actions to tokenized Tailwind classes
   while preserving current responsive behavior.
4. Movie detail: migrate poster frame, metadata blocks, synopsis panel, date
   selector, and session list.
5. Session selection: migrate seat-map container, legend, reservation actions,
   and summary affordances after visual parity checks.
6. Checkout, tickets, and auth: migrate forms and panels once the public
   catalog journey is stable.

During migration, avoid adding component-specific blocks to `globals.css`.
Use Tailwind utilities first, then CSS Modules for complex isolated behavior.
