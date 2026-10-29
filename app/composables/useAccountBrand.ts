import { applicationForPath, brandProductName, resolveAccountBrand, type AccountBrand } from '~~/shared/utils/branding'

export function useAccountBrand() {
  const auth = useAuthStore()
  const previewBrand = useState<AccountBrand>('registration-brand', () => 'magnat')
  const brand = computed(() => resolveAccountBrand(auth.user, previewBrand.value))
  const route = useRoute()
  const application = computed(() => applicationForPath(route.path))
  const productName = computed(() => brandProductName(brand.value, application.value))
  return { brand, previewBrand, productName, application }
}
