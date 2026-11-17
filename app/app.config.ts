export default defineAppConfig({ ui: {
  colors: { primary: 'magnat', neutral: 'slate' },
  modal: { slots: { overlay: 'z-[90]', content: 'z-[91]' } },
  dropdownMenu: { slots: { content: 'z-[120]' } },
  select: { slots: { content: 'z-[120]' } },
  selectMenu: { slots: { content: 'z-[120]' } },
  popover: { slots: { content: 'z-[120]' } },
  tooltip: { slots: { content: 'z-[120]' } }
} })
