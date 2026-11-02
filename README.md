# vue-peel-card

Vue 3 component: a card you can peel off by its edge. Rendered with WebGL; the card content is plain HTML.
The curl follows your finger and rotates if you drag up or down. Includes shadows, a highlight on the fold and the back side of the paper.

## Installation

```bash
npm i vue-peel-card
```

Requires Vue `^3.3`. No separate CSS import is needed.

## Quick start

```vue
<script setup>
import { PeelCard } from 'vue-peel-card'

const cards = [
  {
    bg: '#f6efe0',     // front side color
    back: '#f1eadb',   // back side paper color
    html: `<div style="padding:30px;font:700 44px Georgia,serif">Serendipity</div>`,
  },
  {
    bg: '#dcebe3',
    back: '#e8f1ec',
    html: `<div style="padding:30px;font:700 44px Georgia,serif">Petrichor</div>`,
  },
]
</script>

<template>
  <div style="height: 480px">
    <PeelCard :cards="cards" @change="i => console.log('on top', i)" />
  </div>
</template>
```

The component fills its parent (`width: 100%; height: 100%`), so the parent must have a height.
Global registration: `app.use(PeelCardPlugin)`.

## Toggle mode

Exactly two cards. The first swipe peels the top card, the second (back) sticks it into place.

```vue
<PeelCard toggle :cards="[front, back]" @toggle="peeled => (isPeeled = peeled)" ref="card" />
<button @click="card.peel()">Toggle</button>
```

The peel looks exactly like in normal mode, and the card then disappears completely; the second card stays underneath.
To bring it back, drag in any direction (the card returns from the opposite side and lays down), or tap / call `peel()`
for the same animation in reverse from the right side.

## Card format

```ts
{ bg: string, back: string, html: string }
```

- `bg` — CSS color of the front side, placed under `html`.
- `back` — color of the back side, `#rrggbb`.
- `html` — content. The default card size is 420×280; fit your layout to `width`/`height`.

`html` restrictions:

- It must be well-formed XHTML: closed tags, `<br/>`, `&#160;` instead of `&nbsp;`.
- Styles only inside: `<style>` or the `style` attribute.
- External files, images by URL and web fonts are unavailable. Embed images as `data:` URIs.

Under the hood the HTML is drawn into a texture via SVG `<foreignObject>`. If the browser does not allow such a canvas in WebGL,
a fallback is drawn: the `bg` color and plain text.

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `cards` | `{bg, back, html}[]` | required | cards; cycled in normal mode |
| `toggle` | `boolean` | `false` | two-card mode; read on mount, use `:key` to change the mode |
| `width` | `number` | `420` | card width in logical units |
| `height` | `number` | `280` | card height |
| `radius` | `number` | `18` | corner radius |
| `background` | `string` | from parent CSS | "table" color |
| `padding` | `number` | `16` | gap between the card and the component edges |
| `maxScale` | `number` | `1.35` | maximum zoom |
| `hint` | `boolean` | `true` | edge wiggle on start |
| `clickPeel` | `boolean` | `false` | a click or tap (without dragging) peels the card from the pressed edge; use `click-peel` in templates |
| `label` | `string` | — | `aria-label` of the canvas |

## Events

| Event | When |
|---|---|
| `grab` | first touch of the card |
| `peel(i)` | normal mode: card `i` is fully peeled off |
| `change(i)` | normal mode: card `i` became the top card |
| `toggle(peeled)` | toggle mode: `true` — peeled, `false` — stuck back |

## Methods

`peel(angle?)` via `ref`: peels the card; in toggle mode switches the state. `angle` is the tilt of the peel direction in degrees
(positive tilts upward, default `12`, `0` is straight).

## Accessibility

The canvas is keyboard-focusable: Right Arrow, Space or Enter peels the card. The hint animation is disabled with
`prefers-reduced-motion`. If WebGL is unavailable, the `fallback` slot is shown.

## Development

```bash
npm install
npm run dev     # playground at http://localhost:5173
npm run build   # dist/vue-peel-card.js (ESM) and dist/vue-peel-card.umd.cjs
```

## License

MIT
