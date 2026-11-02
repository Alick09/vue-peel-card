import { createApp } from 'vue'
import { PeelCardPlugin } from '../src/index.js'
import App from './App.vue'

createApp(App).use(PeelCardPlugin).mount('#app')
