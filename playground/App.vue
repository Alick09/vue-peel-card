<script setup>
import { computed, ref } from 'vue'

const entry = (w, h, title, kind, text, example, color) =>
  `<div style="box-sizing:border-box;width:${w}px;height:${h}px;padding:26px 30px;color:${color};font:15px/1.45 Georgia,serif">
  <div style="font:700 34px Georgia,serif">${title}</div>
  <div style="font:italic 14px Georgia,serif;opacity:.65;margin:2px 0 14px">${kind}</div>
  <p style="margin:0 0 10px">${text}</p>
  <p style="margin:0;opacity:.75">${example}</p>
</div>`

const defs = [
  {
    bg: '#f6efe0', back: '#f1eadb', color: '#3b2f1e', title: 'Serendipity', kind: 'noun',
    text: 'The occurrence of fortunate discoveries by accident, especially while looking for something else entirely.',
    example: 'Finding the perfect cafe only because your original plan fell through.',
  },
  {
    bg: '#dcebe3', back: '#e8f1ec', color: '#1f3a2c', title: 'Petrichor', kind: 'noun',
    text: 'The pleasant, earthy smell that rises from dry ground when the first rain falls after a long dry spell.',
    example: 'The street smelled of petrichor as the summer storm finally arrived.',
  },
  {
    bg: '#e3e6f6', back: '#eceef9', color: '#26305c', title: 'Ephemeral', kind: 'adjective',
    text: 'Lasting for a very short time; fleeting, like morning mist, a soap bubble or a sunset.',
    example: 'Their fame was ephemeral: a bright flash, then quiet again.',
  },
]
const frontDef = {
  bg: '#fbe9e7', back: '#fff3f1', color: '#7a2e22', title: 'Front', kind: 'the visible side',
  text: 'This is the side you see first. Drag any edge to peel it off and reveal the card underneath, or use the peel() button above.',
  example: 'In toggle mode the second card stays in place while this one comes off.',
}
const backDef = {
  bg: '#e7f3fb', back: '#f1f8fd', color: '#1f4a66', title: 'Back', kind: 'the hidden side',
  text: 'Revealed once the front card is gone. Drag in any direction, or tap, to bring the front card back and stick it down again.',
  example: 'The returning card enters from the side opposite to your drag.',
}

const portrait = ref(false)
const size = computed(() => portrait.value ? { width: 280, height: 420 } : { width: 420, height: 280 })
const make = d => ({ bg: d.bg, back: d.back, html: entry(size.value.width, size.value.height, d.title, d.kind, d.text, d.example, d.color) })
const cards = computed(() => defs.map(make))
const front = computed(() => make(frontDef))
const back = computed(() => make(backDef))

const mode = ref('normal')
const clickPeel = ref(false)
const card = ref(null)
const log = ref([])
const push = msg => log.value = [msg, ...log.value].slice(0, 8)
</script>

<template>
  <div class="page">
    <header>
      <h1>vue-peel-card playground</h1>
      <label><input type="radio" v-model="mode" value="normal" /> Normal</label>
      <label><input type="radio" v-model="mode" value="toggle" /> Toggle</label>
      <label><input type="checkbox" v-model="clickPeel" /> click-peel</label>
      <label><input type="checkbox" v-model="portrait" /> portrait</label>
      <button @click="card?.peel()">peel()</button>
    </header>

    <main style="background: #ece7dc">
      <PeelCard
        v-if="mode === 'normal'"
        :key="`normal-${portrait}`"
        ref="card"
        :cards="cards"
        v-bind="size"
        :click-peel="clickPeel"
        @grab="push('grab')"
        @peel="i => push(`peel(${i})`)"
        @change="i => push(`change(${i})`)"
      />
      <PeelCard
        v-else
        :key="`toggle-${portrait}`"
        ref="card"
        toggle
        v-bind="size"
        :click-peel="clickPeel"
        :cards="[front, back]"
        @grab="push('grab')"
        @toggle="peeled => push(`toggle(${peeled})`)"
      />
    </main>

    <aside>
      <strong>Events</strong>
      <div v-for="(l, i) in log" :key="i">{{ l }}</div>
    </aside>
  </div>
</template>

<style>
.page { height: 100%; display: grid; grid-template-rows: auto 1fr; grid-template-columns: 1fr 160px; font: 14px system-ui, sans-serif; }
header { grid-column: 1 / -1; display: flex; gap: 16px; align-items: center; padding: 8px 16px; border-bottom: 1px solid #ccc; }
header h1 { font-size: 16px; margin: 0 auto 0 0; }
main { min-height: 0; }
aside { padding: 12px; border-left: 1px solid #ccc; }
</style>
