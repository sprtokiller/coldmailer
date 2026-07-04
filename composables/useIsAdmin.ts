import type { MeResponse } from '~/utils/settings-constants'

export async function useIsAdmin() {
  const { data } = await useFetch<MeResponse>('/api/settings/me')
  return computed(() => data.value?.user.isAdmin ?? false)
}
