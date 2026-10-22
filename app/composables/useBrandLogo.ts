export function useBrandLogo(props: { admin?: boolean }) {
  const { brand, productName } = useAccountBrand()
  const label = computed(() => `${productName.value} — ${props.admin ? 'панель управления' : 'главная'}`)
  return { brand, label }
}
