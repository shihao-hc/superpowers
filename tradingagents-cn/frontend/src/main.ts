import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import Analysis from './views/Analysis.vue'
import History from './views/History.vue'
import Settings from './views/Settings.vue'
import CodeReview from './views/CodeReview.vue'
import { useSettingsStore } from './stores'

const routes = [
  { path: '/', component: Analysis, name: 'analysis' },
  { path: '/history', component: History, name: 'history' },
  { path: '/settings', component: Settings, name: 'settings' },
  { path: '/code-review', component: CodeReview, name: 'code-review' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

const pinia = createPinia()

const app = createApp({})
app.use(pinia)
app.use(router)
app.use(ElementPlus)

const settingsStore = useSettingsStore()
settingsStore.initialize()

app.mount('#app')
