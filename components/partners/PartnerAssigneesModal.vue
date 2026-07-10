<script setup lang="ts">
const props = defineProps<{
  partner: { id: string; canonicalName: string }
}>()

const emit = defineEmits<{ close: []; changed: [] }>()

interface AppUser { id: string; name: string; image: string | null; email: string }
interface AssigneeUser { id: string; name: string; image: string | null }

const { activeProject } = useActiveProject()
const toast = useToast()

const loading = ref(true)
const error = ref('')
const outreachAssignee = ref<AssigneeUser | null>(null)
const negotiationAssignees = ref<AssigneeUser[]>([])

const { data: allUsers } = useFetch<AppUser[]>('/api/users')

async function load() {
  loading.value = true
  try {
    const data = await $fetch<{ assignees: AssigneeUser[]; outreachAssignment: AssigneeUser | null }>(`/api/partners/${props.partner.id}`)
    negotiationAssignees.value = data.assignees
    outreachAssignee.value = data.outreachAssignment
  } catch (e: any) {
    error.value = e.statusMessage ?? 'Nepodařilo se načíst přiřazení.'
  } finally {
    loading.value = false
  }
}

onMounted(load)

const showOutreachPicker = ref(false)
const showNegotiationPicker = ref(false)

const unassignedForNegotiation = computed(() => {
  const assigned = new Set(negotiationAssignees.value.map(a => a.id))
  return (allUsers.value ?? []).filter(u => !assigned.has(u.id))
})

async function setOutreachAssignee(userId: string | null) {
  showOutreachPicker.value = false
  try {
    const res = await $fetch<{ assignment: { assignee: AssigneeUser } | null }>(
      `/api/projects/${activeProject.value?.id}/outreach/${props.partner.id}/assign`,
      { method: 'POST', body: { userId } },
    )
    outreachAssignee.value = res.assignment?.assignee ?? null
    toast.show(userId ? 'Oslovovatel přiřazen' : 'Oslovovatel odebrán', 'success')
    emit('changed')
  } catch (e: any) {
    toast.show(e.statusMessage ?? 'Nepodařilo se uložit.', 'error')
  }
}

async function addNegotiationAssignee(userId: string) {
  showNegotiationPicker.value = false
  try {
    await $fetch(`/api/partners/${props.partner.id}/status`, { method: 'PATCH', body: { addAssigneeId: userId } })
    await load()
    toast.show('Jednatel přidán', 'success')
    emit('changed')
  } catch (e: any) {
    toast.show(e.statusMessage ?? 'Nepodařilo se uložit.', 'error')
  }
}

async function removeNegotiationAssignee(userId: string) {
  try {
    await $fetch(`/api/partners/${props.partner.id}/status`, { method: 'PATCH', body: { removeAssigneeId: userId } })
    negotiationAssignees.value = negotiationAssignees.value.filter(a => a.id !== userId)
    toast.show('Jednatel odebrán', 'success')
    emit('changed')
  } catch (e: any) {
    toast.show(e.statusMessage ?? 'Nepodařilo se uložit.', 'error')
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-20 px-4" @click.self="emit('close')">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 class="text-base font-semibold text-gray-800">Přiřazení lidí</h2>
            <p class="text-xs text-gray-400 mt-0.5">{{ partner.canonicalName }}</p>
          </div>
          <button class="text-gray-400 hover:text-gray-600" @click="emit('close')">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="px-5 py-4 space-y-5">
          <div v-if="loading" class="text-xs text-gray-400 py-6 text-center">Načítám...</div>
          <div v-else-if="error" class="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{{ error }}</div>

          <template v-else>
            <!-- Oslovovatel (single) -->
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-2">Oslovovatel</label>
              <div class="flex items-center gap-2 flex-wrap">
                <button
                  v-if="outreachAssignee"
                  class="group relative flex items-center gap-1.5"
                  :title="outreachAssignee.name"
                  @click="setOutreachAssignee(null)"
                >
                  <img v-if="outreachAssignee.image" :src="outreachAssignee.image" class="w-7 h-7 rounded-full ring-2 ring-white object-cover group-hover:opacity-60" referrerpolicy="no-referrer" />
                  <div v-else class="w-7 h-7 rounded-full ring-2 ring-white bg-indigo-400 flex items-center justify-center text-white text-[11px] font-medium group-hover:opacity-60">{{ outreachAssignee.name.charAt(0).toUpperCase() }}</div>
                  <span class="text-xs text-gray-500 group-hover:text-red-400">{{ outreachAssignee.name }}</span>
                  <span class="absolute -top-0.5 -left-0.5 hidden group-hover:flex w-3.5 h-3.5 bg-red-400 rounded-full items-center justify-center text-white text-[9px]">×</span>
                </button>
                <span v-else class="text-xs text-gray-300">Nikdo</span>

                <div class="relative">
                  <button
                    class="w-7 h-7 rounded-full border border-dashed flex items-center justify-center text-xs transition-colors"
                    :class="showOutreachPicker ? 'border-indigo-300 text-indigo-500 bg-indigo-50' : 'border-gray-300 text-gray-400 hover:text-indigo-500 hover:border-indigo-300'"
                    :title="outreachAssignee ? 'Změnit oslovovatele' : 'Přiřadit oslovovatele'"
                    @click.stop="showOutreachPicker = !showOutreachPicker"
                  >+</button>
                  <div
                    v-if="showOutreachPicker"
                    class="absolute left-0 top-full mt-1 z-50 bg-white rounded-xl border border-gray-200 shadow-xl py-1 min-w-36 max-h-48 overflow-y-auto"
                    @click.stop
                  >
                    <button
                      v-for="u in allUsers"
                      :key="u.id"
                      class="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-indigo-50 text-left transition-colors"
                      @click="setOutreachAssignee(u.id)"
                    >
                      <img v-if="u.image" :src="u.image" class="w-5 h-5 rounded-full object-cover" referrerpolicy="no-referrer" />
                      <div v-else class="w-5 h-5 rounded-full bg-indigo-400 flex items-center justify-center text-white text-[10px] font-medium">{{ u.name.charAt(0).toUpperCase() }}</div>
                      <span class="text-xs text-gray-700">{{ u.name }}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Jednatelé (multi) -->
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-2">Jednatelé</label>
              <div class="flex items-center gap-2 flex-wrap">
                <button
                  v-for="a in negotiationAssignees"
                  :key="a.id"
                  class="group relative flex items-center gap-1.5"
                  :title="a.name"
                  @click="removeNegotiationAssignee(a.id)"
                >
                  <img v-if="a.image" :src="a.image" class="w-7 h-7 rounded-full ring-2 ring-white object-cover group-hover:opacity-60" referrerpolicy="no-referrer" />
                  <div v-else class="w-7 h-7 rounded-full ring-2 ring-white bg-indigo-400 flex items-center justify-center text-white text-[11px] font-medium group-hover:opacity-60">{{ a.name.charAt(0).toUpperCase() }}</div>
                  <span class="text-xs text-gray-500 group-hover:text-red-400">{{ a.name }}</span>
                  <span class="absolute -top-0.5 -left-0.5 hidden group-hover:flex w-3.5 h-3.5 bg-red-400 rounded-full items-center justify-center text-white text-[9px]">×</span>
                </button>
                <span v-if="negotiationAssignees.length === 0" class="text-xs text-gray-300">Nikdo</span>

                <div class="relative">
                  <button
                    class="w-7 h-7 rounded-full border border-dashed flex items-center justify-center text-xs transition-colors"
                    :class="showNegotiationPicker ? 'border-indigo-300 text-indigo-500 bg-indigo-50' : 'border-gray-300 text-gray-400 hover:text-indigo-500 hover:border-indigo-300'"
                    @click.stop="showNegotiationPicker = !showNegotiationPicker"
                  >+</button>
                  <div
                    v-if="showNegotiationPicker && unassignedForNegotiation.length"
                    class="absolute left-0 top-full mt-1 z-50 bg-white rounded-xl border border-gray-200 shadow-xl py-1 min-w-36 max-h-48 overflow-y-auto"
                    @click.stop
                  >
                    <button
                      v-for="u in unassignedForNegotiation"
                      :key="u.id"
                      class="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-indigo-50 text-left transition-colors"
                      @click="addNegotiationAssignee(u.id)"
                    >
                      <img v-if="u.image" :src="u.image" class="w-5 h-5 rounded-full object-cover" referrerpolicy="no-referrer" />
                      <div v-else class="w-5 h-5 rounded-full bg-indigo-400 flex items-center justify-center text-white text-[10px] font-medium">{{ u.name.charAt(0).toUpperCase() }}</div>
                      <span class="text-xs text-gray-700">{{ u.name }}</span>
                    </button>
                  </div>
                  <div
                    v-else-if="showNegotiationPicker"
                    class="absolute left-0 top-full mt-1 z-50 bg-white rounded-xl border border-gray-200 shadow-xl py-2 px-3 min-w-36"
                  >
                    <span class="text-xs text-gray-400">Nikdo další</span>
                  </div>
                </div>
              </div>
              <p class="text-[11px] text-gray-400 mt-2">Přidání prvního jednatele posune stav jednání na „V jednání", pokud partner ještě čeká na oslovení.</p>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
