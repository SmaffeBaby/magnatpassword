import { addTemplate, defineNuxtModule } from '@nuxt/kit'
import { breakpoints } from '../shared/config/breakpoints'

export default defineNuxtModule({
  meta: { name: 'vetro-breakpoints' },
  setup(_options, nuxt) {
    const css = addTemplate({
      filename: 'vetro-breakpoints.css',
      write: true,
      getContents: () => `@theme {
  --breakpoint-sm: ${breakpoints.tablet.min}px;
  --breakpoint-md: ${breakpoints.tablet.min}px;
  --breakpoint-lg: ${breakpoints.desktop.min}px;
  --breakpoint-xl: ${breakpoints.desktop.min}px;
  --breakpoint-2xl: ${breakpoints.desktop.min}px;
${Object.entries(breakpoints).map(([name, range]) => `  --breakpoint-${name}: ${range.min}px;`).join('\n')}
}`
    })
    nuxt.options.alias['#vetro/breakpoints.css'] = css.dst
  }
})
