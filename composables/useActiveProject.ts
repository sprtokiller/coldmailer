export type ActiveProjectInfo = {
  id: string
  name: string
  slug: string
  groupId: string
  createdAt: string
}

export type ActiveProjectGroupInfo = {
  id: string
  name: string
  slug: string
  color: string
  projects: ActiveProjectInfo[]
}

export function useActiveProject() {
  const cookie = useCookie<string | null>('activeProjectId', {
    maxAge: 60 * 60 * 24 * 365,
  })
  
  const route = useRoute()

  const { data: groupsRaw, refresh } = useFetch<ActiveProjectGroupInfo[]>('/api/settings/my-projects', {
    key: 'my-projects',
    default: () => [],
  })

  const groups = computed<ActiveProjectGroupInfo[]>(() => groupsRaw.value ?? [])
  const projects = computed(() =>
    groups.value.flatMap(group =>
      group.projects.map(project => ({ ...project, group })),
    ),
  )

  const activeProject = computed(() => {
    if (projects.value.length === 0) return null

    // Try to get from cookie
    if (cookie.value) {
      const targetId = cookie.value.startsWith('project:') ? cookie.value.replace('project:', '') : cookie.value
      const found = projects.value.find(project => project.id === targetId)
      if (found) return found
    }

    // Fallback: alphabetically last project
    const sorted = [...projects.value].sort((a, b) => b.name.localeCompare(a.name, 'cs'))
    return sorted[0] ?? null
  })

  const activeGroup = computed(() => activeProject.value?.group ?? null)

  // Watch to sync cookie when activeProject changes
  watch(activeProject, (project) => {
    if (project) {
      const val = `project:${project.id}`
      if (cookie.value !== val) cookie.value = val
    }
  }, { immediate: true })

  async function setProject(id: string) {
    const prefixedId = id.startsWith('project:') ? id : `project:${id}`
    if (prefixedId === cookie.value) return
    cookie.value = prefixedId
    if (route.params.id) {
      await navigateTo('/')
    } else {
      await refreshNuxtData()
    }
  }

  const GROUP_FONTS: Record<string, string> = {
    tda: 'Inter Tight',
    xo: 'Dosis',
    ppt: 'Figtree',
  }

  const groupFont = computed(() => {
    const slug = activeGroup.value?.slug
    return slug ? GROUP_FONTS[slug] ?? '' : ''
  })

  return {
    groups,
    projects,
    activeProject,
    activeGroup,
    groupFont,
    setProject,
    refreshProjects: refresh,
  }
}
