type Group = { id: string; name: string; slug: string; color: string }

export function useActiveGroup() {
  const cookie = useCookie('activeGroupId', { maxAge: 60 * 60 * 24 * 365 })

  const { data: groupsRaw, refresh } = useFetch<Group[]>('/api/settings/my-groups', {
    key: 'my-groups',
    default: () => [],
  })

  const groups = computed<Group[]>(() => groupsRaw.value ?? [])

  const activeGroup = computed<Group | null>(() => {
    const list = groups.value
    if (!list.length) return null
    return list.find(g => g.id === cookie.value) ?? list[0]
  })

  watch(activeGroup, (g) => {
    if (g && cookie.value !== g.id) cookie.value = g.id
  }, { immediate: true })

  async function setGroup(id: string) {
    if (id === cookie.value) return
    cookie.value = id
    const route = useRoute()
    if (route.params.id) {
      await navigateTo('/')
    } else {
      await refreshNuxtData()
    }
  }

  return { groups, activeGroup, setGroup, refreshGroups: refresh }
}
