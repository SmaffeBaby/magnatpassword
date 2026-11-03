export default defineNuxtPlugin({
  name: 'backend',
  enforce: 'pre',
  setup() {
    configureBackend(useRuntimeConfig().public.backendOrigin)
  }
})
