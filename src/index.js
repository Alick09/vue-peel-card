import PeelCard from './PeelCard.vue'

// Plugin: app.use(PeelCardPlugin) registers the component globally as <PeelCard>.
export const PeelCardPlugin = {
  install(app) { app.component('PeelCard', PeelCard) },
}

export { PeelCard }
export default PeelCard
