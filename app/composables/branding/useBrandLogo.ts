export function useBrandLogo(props: { admin?: boolean }) {
  const { brand, productName, application } = useAccountBrand()
  const label = computed(() => `${productName.value} — ${props.admin ? 'панель управления' : 'главная'}`)
  return { brand, label, application }
}
