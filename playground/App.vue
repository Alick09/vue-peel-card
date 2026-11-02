<script setup>
import { ref } from 'vue'

const word = (text, color) =>
  `<div style="padding:30px;font:700 44px Georgia,serif;color:${color}">${text}</div>`

const cards = [
  { bg: '#f6efe0', back: '#f1eadb', html: word('Serendipity', '#3b2f1e') },
  { bg: '#dcebe3', back: '#e8f1ec', html: word('Petrichor', '#1f3a2c') },
  { bg: '#e3e6f6', back: '#eceef9', html: word('Ephemeral', '#26305c') },
]

const front = { bg: '#fbe9e7', back: '#fff3f1', html: word('Front', '#7a2e22') }
const back = { bg: '#e7f3fb', back: '#f1f8fd', html: word('Back', '#1f4a66') }

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
      <button @click="card?.peel()">peel()</button>
    </header>

    <main style="background: #ece7dc">
      <PeelCard
        v-if="mode === 'normal'"
        key="normal"
        ref="card"
        :cards="cards"
        :click-peel="clickPeel"
        @grab="push('grab')"
        @peel="i => push(`peel(${i})`)"
        @change="i => push(`change(${i})`)"
      />
      <PeelCard
        v-else
        key="toggle"
        ref="card"
        toggle
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
