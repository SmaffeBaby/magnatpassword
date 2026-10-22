import { brandProductName, resolveAccountBrand, type AccountBrand } from '~~/shared/utils/branding'

export function useAccountBrand() {
  const auth = useAuthStore()
  const previewBrand = useState<AccountBrand>('registration-brand', () => 'magnat')
  const brand = computed(() => resolveAccountBrand(auth.user, previewBrand.value))
  const productName = computed(() => brandProductName(brand.value))
  return { brand, previewBrand, productName }
}
