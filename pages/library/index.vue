<script setup lang="ts">
import { STEP_SYSTEM_PROMPTS, STEP_OUTPUT_SCHEMAS, REASONING_STEP_TYPES, formatSchemaForPrompt, getMissingPlaceholders } from '~/config/pipeline'
import { sanitizeAndNormalizeHtml, sanitizeHtml } from '~/utils/html-normalize'

definePageMeta({ middleware: 'auth' })

type Tab = 'prompts' | 'context' | 'selling' | 'drafts' | 'signatures'
type Author = { id: string; name: string; image: string | null }
type LibraryItem = {
  id: string
  name: string
  content?: string
  subject?: string
  stepType?: string
  stepKeys?: string[]
  isTemplate?: boolean
  isSystem?: boolean
  authorId?: string
  author?: Author
  groupId?: string | null
  group?: { id: string; name: string; color: string } | null
  projectId?: string | null
  project?: { id: string; name: string; group: { id: string; name: string; color: string } } | null
  createdAt: string | Date
  derivedFromId: string | null
  order?: number
}

type SignatureItem = {
  id: string
  name: string
  content: string
  isTemplate: boolean
  groupId: string
  group: { id: string; name: string; color: string }
  authorId: string
  author?: { id: string; name: string; image: string | null }
  createdAt: string | Date
  updatedAt: string | Date
}

type SignaturesResponse = { templates: SignatureItem[]; personal: SignatureItem[] }

const route = useRoute()
const router = useRouter()
const { activeProject, groups, groupFont } = useActiveProject()

const VALID_TABS: Tab[] = ['prompts', 'context', 'selling', 'drafts', 'signatures']
const initialTab = VALID_TABS.includes(route.query.tab as Tab) ? (route.query.tab as Tab) : 'prompts'
const tab = ref<Tab>(initialTab)

watch(tab, (newTab) => {
  router.replace({ query: { ...route.query, tab: newTab } })
})

const { data: prompts, refresh: refreshPrompts } = await useFetch('/api/library/prompts', { default: () => [] })
const { data: contextParts, refresh: refreshContext } = await useFetch('/api/library/context-parts', { default: () => [] })
const { data: sellingPoints, refresh: refreshSelling } = await useFetch('/api/library/selling-points', { default: () => [] })
const { data: emailDrafts, refresh: refreshDrafts } = await useFetch('/api/library/email-drafts', { default: () => [] })
const { data: sigData, refresh: refreshSignatures } = await useFetch<SignaturesResponse>('/api/library/signatures', { default: () => ({ templates: [], personal: [] }) })
const canEditSystemSignatures = await useIsAdmin()

const signatureTemplates = computed(() => sigData.value?.templates ?? [])
const signaturePersonal = computed(() => sigData.value?.personal ?? [])

function safeHtml(html: string): string {
  return sanitizeHtml(html)
}

// Only step types with a working pipeline implementation are selectable —
// MARKET_SCANNING/PARTNER_IDENTIFICATION/PARTNER_PROFILING belong to a
// retired pipeline and can no longer be created, edited, or assigned.
const STEP_TYPES: string[] = [...REASONING_STEP_TYPES]


const STEP_CONTENT_TEMPLATES: Partial<Record<string, string>> = STEP_SYSTEM_PROMPTS

// ── Placeholder validation ────────────────────────────────────────────────────
const VALID_PLACEHOLDERS = ['<[[SCHEMA]]>', '<[[CONTEXT]]>', '<[[ARGUMENTS]]>', '<[[DATA]]>', '<[[TEMPLATE]]>', '<[[USER]]>']
const PLACEHOLDER_RE = /<\[\[[A-Z_]+\]\]>/g

const contentPlaceholders = computed(() => {
  if (tab.value !== 'prompts' && tab.value !== 'context') return []
  return [...(form.value.content.matchAll(PLACEHOLDER_RE))].map(m => m[0])
})

const invalidPlaceholders = computed(() =>
  [...new Set(contentPlaceholders.value.filter(p => !VALID_PLACEHOLDERS.includes(p)))],
)

const duplicatePlaceholders = computed(() => {
  const counts: Record<string, number> = {}
  for (const p of contentPlaceholders.value) counts[p] = (counts[p] ?? 0) + 1
  return Object.keys(counts).filter(p => counts[p] > 1)
})

const missingPlaceholders = computed(() => {
  if (tab.value !== 'prompts') return []
  return getMissingPlaceholders(form.value.stepType, form.value.content)
})

const placeholderError = computed<string | null>(() => {
  if (invalidPlaceholders.value.length)
    return `Neznámý placeholder: ${invalidPlaceholders.value.join(', ')}`
  if (duplicatePlaceholders.value.length)
    return `Placeholder smí být použit nejvýše jednou: ${duplicatePlaceholders.value.join(', ')}`
  if (missingPlaceholders.value.length)
    return `Chybí povinný placeholder: ${missingPlaceholders.value.join(', ')}`
  return null
})

const validFoundPlaceholders = computed(() =>
  VALID_PLACEHOLDERS.filter(p => contentPlaceholders.value.includes(p)),
)

const currentStepSchema = computed(() => {
  if (tab.value !== 'prompts') return null
  return STEP_OUTPUT_SCHEMAS[form.value.stepType] ?? null
})

const schemaPreviewExpanded = ref(false)

function highlightPlaceholders(text: string): string {
  return text.replace(
    /<\[\[([A-Z_]+)\]\]>/g,
    '<span class="inline-block px-1 py-px rounded bg-violet-100 text-violet-700 border border-violet-200 text-[9px] font-semibold">&lt;[[$1]]&gt;</span>',
  )
}

// ── Form state ────────────────────────────────────────────────────────────────
const showForm = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)
const editingIsSystem = ref(false)

const form = ref({
  name: '',
  content: '',
  stepType: 'VALUE_ALIGNMENT',
  stepKeys: ['VALUE_ALIGNMENT', 'OUTREACH_PREPARATION'] as string[],
  subject: '',
  body: '',
  signatureContent: '',
  signatureGroupId: '',
  scope: '',
})

const showNewSignatureMenu = ref(false)

function resetForm() {
  form.value = {
    name: '',
    content: '',
    stepType: 'VALUE_ALIGNMENT',
    stepKeys: ['VALUE_ALIGNMENT', 'OUTREACH_PREPARATION'],
    subject: '',
    body: '',
    signatureContent: '',
    signatureGroupId: activeProject.value?.groupId ?? groups.value[0]?.id ?? '',
    scope: activeProject.value ? `project:${activeProject.value.id}` : '',
  }
  editingId.value = null
  editingIsSystem.value = false
  showForm.value = false
  showNewSignatureMenu.value = false
}

function closeMenus(e: MouseEvent) {
  if (showNewSignatureMenu.value) {
    const target = e.target as HTMLElement
    if (!target.closest('.relative')) showNewSignatureMenu.value = false
  }
}
onMounted(() => document.addEventListener('click', closeMenus))
onBeforeUnmount(() => document.removeEventListener('click', closeMenus))

onMounted(() => {
  if (route.query.action === 'new' && typeof route.query.stepType === 'string' && STEP_TYPES.includes(route.query.stepType)) {
    form.value.stepType = route.query.stepType
    showForm.value = true
  }
  if (typeof route.query.editId === 'string') {
    const item = (prompts.value as LibraryItem[]).find(p => p.id === route.query.editId)
    if (item && STEP_TYPES.includes(item.stepType ?? '')) {
      tab.value = 'prompts'
      startEdit(item)
    }
  }
})

function startEdit(item: LibraryItem) {
  editingId.value = item.id
  editingIsSystem.value = item.isSystem ?? false
  form.value.name = item.name
  form.value.content = item.content ?? ''
  form.value.subject = (item as LibraryItem & { subject?: string }).subject ?? ''
  form.value.body = (item as LibraryItem & { body?: string }).body ?? ''
  form.value.stepType = item.stepType ?? 'VALUE_ALIGNMENT'
  const liveStepKeys = item.stepKeys?.filter(k => STEP_TYPES.includes(k)) ?? []
  form.value.stepKeys = liveStepKeys.length ? liveStepKeys : ['VALUE_ALIGNMENT']
  form.value.signatureContent = item.content ?? ''
  form.value.signatureGroupId = (item as unknown as SignatureItem).groupId ?? ''
  form.value.scope = item.projectId
    ? `project:${item.projectId}`
    : item.groupId
      ? `group:${item.groupId}`
      : ''
  showForm.value = true
}

watch(() => form.value.stepType, (newType) => {
  if (editingId.value) return
  form.value.content = STEP_CONTENT_TEMPLATES[newType] ?? ''
})

watch(showForm, (visible) => {
  if (visible && tab.value === 'prompts' && !editingId.value) {
    form.value.content = STEP_CONTENT_TEMPLATES[form.value.stepType] ?? ''
  }
})

function toggleStepKey(key: string) {
  const idx = form.value.stepKeys.indexOf(key)
  if (idx >= 0) {
    if (form.value.stepKeys.length > 1) form.value.stepKeys.splice(idx, 1)
  } else {
    form.value.stepKeys.push(key)
  }
}

function startNewSignature() {
  resetForm()
  tab.value = 'signatures'
  showForm.value = true
  showNewSignatureMenu.value = false
}

function useTemplateAsBase(sig: SignatureItem) {
  resetForm()
  form.value.name = sig.name + ' (kopie)'
  form.value.signatureContent = sig.content
  form.value.signatureGroupId = sig.groupId
  showForm.value = true
}

async function save() {
  if (placeholderError.value) return
  saving.value = true
  try {
    const [scopeType, scopeId] = form.value.scope.split(':')
    const scope = editingIsSystem.value
      ? {}
      : {
          projectId: scopeType === 'project' ? scopeId : null,
          groupId: scopeType === 'group' ? scopeId : null,
        }

    if (tab.value === 'prompts') {
      if (editingId.value) {
        await $fetch(`/api/library/prompts/${editingId.value}`, { method: 'PATCH', body: { name: form.value.name, content: form.value.content, stepType: form.value.stepType, ...scope } })
      } else {
        await $fetch('/api/library/prompts', { method: 'POST', body: { name: form.value.name, content: form.value.content, stepType: form.value.stepType, ...scope } })
      }
      await refreshPrompts()
    } else if (tab.value === 'context') {
      if (editingId.value) {
        await $fetch(`/api/library/context-parts/${editingId.value}`, { method: 'PATCH', body: { name: form.value.name, content: form.value.content, stepKeys: form.value.stepKeys, ...scope } })
      } else {
        await $fetch('/api/library/context-parts', { method: 'POST', body: { name: form.value.name, content: form.value.content, stepKeys: form.value.stepKeys, ...scope } })
      }
      await refreshContext()
    } else if (tab.value === 'selling') {
      if (editingId.value) {
        await $fetch(`/api/library/selling-points/${editingId.value}`, { method: 'PATCH', body: { name: form.value.name, content: form.value.content, ...scope } })
      } else {
        await $fetch('/api/library/selling-points', { method: 'POST', body: { name: form.value.name, content: form.value.content, ...scope } })
      }
      await refreshSelling()
    } else if (tab.value === 'drafts') {
      const cleanBody = sanitizeAndNormalizeHtml(form.value.body)
      if (editingId.value) {
        await $fetch(`/api/library/email-drafts/${editingId.value}`, { method: 'PATCH', body: { name: form.value.name, subject: form.value.subject, body: cleanBody, ...scope } })
      } else {
        await $fetch('/api/library/email-drafts', { method: 'POST', body: { name: form.value.name, subject: form.value.subject, body: cleanBody, ...scope } })
      }
      await refreshDrafts()
    } else {
      const cleanContent = sanitizeAndNormalizeHtml(form.value.signatureContent)
      if (editingId.value) {
        await $fetch(`/api/library/signatures/${editingId.value}`, { method: 'PATCH', body: { name: form.value.name, content: cleanContent, groupId: form.value.signatureGroupId } })
      } else {
        await $fetch('/api/library/signatures', { method: 'POST', body: { name: form.value.name, content: cleanContent, groupId: form.value.signatureGroupId, isTemplate: true } })
      }
      await refreshSignatures()
    }
    resetForm()
  } finally {
    saving.value = false
  }
}

// ── Signature delete ─────────────────────────────────────────────────────────
const deletingSignatureId = ref<string | null>(null)

async function deleteSignature(id: string) {
  if (!confirm('Opravdu smazat tento podpis?')) return
  deletingSignatureId.value = id
  try {
    await $fetch(`/api/library/signatures/${id}`, { method: 'DELETE' })
    await refreshSignatures()
    if (editingId.value === id) resetForm()
  } finally {
    deletingSignatureId.value = null
  }
}

// ── Item delete (prompts / context / selling / drafts) ─────────────────────────
const ITEM_DELETE_ENDPOINT: Record<Exclude<Tab, 'signatures'>, string> = {
  prompts: '/api/library/prompts',
  context: '/api/library/context-parts',
  selling: '/api/library/selling-points',
  drafts: '/api/library/email-drafts',
}

const ITEM_REFRESH: Record<Exclude<Tab, 'signatures'>, () => Promise<void>> = {
  prompts: refreshPrompts,
  context: refreshContext,
  selling: refreshSelling,
  drafts: refreshDrafts,
}

const deletingItemId = ref<string | null>(null)

async function deleteItem(item: LibraryItem) {
  if (!confirm(`Opravdu smazat „${item.name}“?`)) return
  const currentTab = tab.value as Exclude<Tab, 'signatures'>
  deletingItemId.value = item.id
  try {
    await $fetch(`${ITEM_DELETE_ENDPOINT[currentTab]}/${item.id}`, { method: 'DELETE' })
    await ITEM_REFRESH[currentTab]()
    if (editingId.value === item.id) resetForm()
  } finally {
    deletingItemId.value = null
  }
}

// ── Reorder (prompts / context / selling / drafts) ──────────────────────────────
const ITEM_REORDER_ENDPOINT: Record<Exclude<Tab, 'signatures'>, string> = {
  prompts: '/api/library/prompts/reorder',
  context: '/api/library/context-parts/reorder',
  selling: '/api/library/selling-points/reorder',
  drafts: '/api/library/email-drafts/reorder',
}

const draggedItemId = ref<string | null>(null)

function onDragStart(item: LibraryItem) {
  draggedItemId.value = item.id
}

async function onDrop(target: LibraryItem) {
  const draggedId = draggedItemId.value
  draggedItemId.value = null
  if (!draggedId || draggedId === target.id) return
  const dragged = currentItems.value.find(i => i.id === draggedId)
  if (!dragged) return
  // Reordering only makes sense within the same step-type group for prompts.
  if (tab.value === 'prompts' && dragged.stepType !== target.stepType) return

  const groupItems = tab.value === 'prompts'
    ? currentItems.value.filter(i => i.stepType === dragged.stepType)
    : currentItems.value
  const ids = groupItems.map(i => i.id)
  const fromIndex = ids.indexOf(draggedId)
  const toIndex = ids.indexOf(target.id)
  ids.splice(fromIndex, 1)
  ids.splice(fromIndex < toIndex ? toIndex - 1 : toIndex, 0, draggedId)

  const currentTab = tab.value as Exclude<Tab, 'signatures'>
  await $fetch(ITEM_REORDER_ENDPOINT[currentTab], { method: 'POST', body: { ids } })
  await ITEM_REFRESH[currentTab]()
}

// ── Filters ──────────────────────────────────────────────────────────────────
const filterType   = ref('')
const filterAuthor = ref('')
const filterScope = ref('')

watch(tab, () => { filterType.value = ''; filterAuthor.value = ''; filterScope.value = '' })

const canReorder = computed(() => !filterType.value && !filterAuthor.value && !filterScope.value)

const allItems = computed(() => {
  if (tab.value === 'prompts') return prompts.value as LibraryItem[]
  if (tab.value === 'context') return contextParts.value as LibraryItem[]
  if (tab.value === 'selling') return sellingPoints.value as LibraryItem[]
  if (tab.value === 'drafts') return emailDrafts.value as LibraryItem[]
  return [] as LibraryItem[]
})

const currentItems = computed(() => {
  return allItems.value
    .filter((item) => {
      if (tab.value === 'prompts' && !STEP_TYPES.includes(item.stepType ?? '')) return false
      if (filterType.value && item.stepType !== filterType.value) return false
      const authorName = item.author?.name ?? ''
      if (filterAuthor.value && authorName !== filterAuthor.value) return false
      const itemScope = item.projectId
        ? `project:${item.projectId}`
        : item.groupId
          ? `group:${item.groupId}`
          : 'system'
      if (filterScope.value && itemScope !== filterScope.value) return false
      return true
    })
    .sort((a, b) => {
      const stepA = STEP_TYPES.indexOf(a.stepType ?? '')
      const stepB = STEP_TYPES.indexOf(b.stepType ?? '')
      const stepOrder = (stepA === -1 ? Infinity : stepA) - (stepB === -1 ? Infinity : stepB)
      if (stepOrder !== 0) return stepOrder
      const orderDiff = (a.order ?? 0) - (b.order ?? 0)
      if (orderDiff !== 0) return orderDiff
      if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1
      return (a.name ?? '').localeCompare(b.name ?? '', 'cs')
    })
})

const authorOptions = computed(() => {
  const names = allItems.value.map((item) => item.author?.name ?? '').filter(Boolean)
  return [...new Set(names)] as string[]
})

const scopeOptions = computed(() => {
  const result: { groupLabel: string; groupColor: string; options: { value: string; label: string }[] }[] = []
  for (const group of groups.value) {
    const opts: { value: string; label: string }[] = []
    for (const project of group.projects) {
      opts.push({ value: `project:${project.id}`, label: project.name })
    }
    opts.push({ value: `group:${group.id}`, label: `Celý typ: ${group.name}` })
    result.push({ groupLabel: group.name, groupColor: group.color, options: opts })
  }
  return result
})

watch(activeProject, (project) => {
  if (!editingId.value && project) form.value.scope = `project:${project.id}`
}, { immediate: true })

const tabs: { key: Tab; label: string }[] = [
  { key: 'prompts', label: 'Systémové prompty' },
  { key: 'context', label: 'Kontextové části' },
  { key: 'selling', label: 'Prodejní argumenty' },
  { key: 'drafts', label: 'E-mailové šablony' },
]

function handleNew() {
  if (tab.value === 'signatures' && canEditSystemSignatures.value) {
    startNewSignature()
  }
  else {
    showForm.value = !showForm.value
  }
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-semibold text-gray-800">Knihovna</h1>
        <p class="text-sm text-gray-400 mt-1">Sdílené prompty, kontext, prodejní argumenty a šablony.</p>
      </div>
      <button
        class="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        @click="handleNew"
      >
        + Nový
      </button>
    </div>

    <div class="flex gap-1 border-b border-gray-200 mb-5">
      <button
        v-for="t in tabs"
        :key="t.key"
        :class="['px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors', tab === t.key ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300']"
        @click="tab = t.key; showForm = false; showNewSignatureMenu = false"
      >
        {{ t.label }}
      </button>
      <ClientOnly>
        <button
          v-if="canEditSystemSignatures"
          :class="['px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors', tab === 'signatures' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300']"
          @click="tab = 'signatures'; showForm = false; showNewSignatureMenu = false"
        >
          Podpisové šablony
        </button>
      </ClientOnly>
    </div>

    <div v-if="showForm" class="bg-white border border-primary/30 rounded-xl p-5 mb-6">
      <h3 class="font-medium text-gray-800 mb-4">
        {{ editingId ? 'Upravit' : 'Nový' }}
        <template v-if="tab === 'signatures'">podpisová šablona</template>
        <template v-else>{{ tabs.find(t => t.key === tab)?.label }}</template>
      </h3>
      <form class="space-y-3" @submit.prevent="save">
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">Název</label>
          <input v-model="form.name" type="text" required class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>

        <div v-if="tab !== 'signatures' && !editingIsSystem">
          <label class="block text-xs font-medium text-gray-500 mb-1">Platnost položky</label>
          <select
            v-model="form.scope"
            required
            class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="" disabled>Vyberte projekt nebo typ projektu</option>
            <optgroup v-for="group in scopeOptions" :key="group.groupLabel" :label="group.groupLabel">
              <option v-for="option in group.options" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </optgroup>
          </select>
          <p class="mt-1 text-[11px] text-gray-400">
            Projekt je určen pro konkrétní ročník, typ projektu sdílí položku mezi všemi jeho projekty.
          </p>
        </div>

        <div v-if="tab === 'prompts'">
          <label class="block text-xs font-medium text-gray-500 mb-1">Typ kroku</label>
          <select v-model="form.stepType" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option v-for="s in STEP_TYPES" :key="s" :value="s">{{ s.replace(/_/g, ' ') }}</option>
          </select>
        </div>

        <div v-if="tab === 'context'">
          <label class="block text-xs font-medium text-gray-500 mb-1">Přiřazené kroky</label>
          <div class="flex flex-wrap gap-x-4 gap-y-1.5 mt-1">
            <label
              v-for="s in STEP_TYPES"
              :key="s"
              class="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                :checked="form.stepKeys.includes(s)"
                class="accent-primary"
                @change="toggleStepKey(s)"
              />
              {{ s.replace(/_/g, ' ') }}
            </label>
          </div>
        </div>

        <template v-if="tab === 'signatures'">
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Typ projektu</label>
            <select
              v-model="form.signatureGroupId"
              required
              class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="" disabled>Vyberte typ projektu</option>
              <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Obsah podpisu (WYSIWYG)</label>
            <RichTextEditor v-model="form.signatureContent" :default-font="groupFont" />
          </div>
        </template>

        <template v-else-if="tab === 'drafts'">
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Šablona předmětu</label>
            <input v-model="form.subject" type="text" required class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Tělo e-mailu (WYSIWYG)</label>
            <RichTextEditor v-model="form.body" placeholder="Napište tělo e-mailu…" :default-font="groupFont" />
          </div>
        </template>
        <template v-else>
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Obsah</label>
            <textarea
              v-model="form.content"
              rows="5"
              required
              class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
              :class="placeholderError ? 'border-red-300 focus:ring-red-200' : ''"
            />
            <!-- Placeholder feedback -->
            <div v-if="contentPlaceholders.length || placeholderError" class="mt-1.5 flex flex-wrap items-center gap-2">
              <span
                v-for="p in validFoundPlaceholders"
                :key="p"
                class="inline-flex items-center gap-1 text-[11px] font-mono px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200"
              >
                <svg class="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" /></svg>
                {{ p }}
              </span>
              <span
                v-for="p in invalidPlaceholders"
                :key="p"
                class="inline-flex items-center gap-1 text-[11px] font-mono px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200"
                :title="'Neznámý placeholder — platné jsou: ' + VALID_PLACEHOLDERS.join(', ')"
              >
                <svg class="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12" /></svg>
                {{ p }}
              </span>
              <span
                v-for="p in duplicatePlaceholders"
                :key="'dup_' + p"
                class="inline-flex items-center gap-1 text-[11px] font-mono px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200"
              >
                <svg class="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v4m0 4h.01" /></svg>
                {{ p }} ×2+
              </span>
            </div>
            <p v-if="placeholderError" class="mt-1 text-xs text-red-600">{{ placeholderError }}</p>
          </div>
          <!-- Read-only output schema preview -->
          <div v-if="tab === 'prompts' && currentStepSchema" class="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
            <button
              type="button"
              class="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
              @click="schemaPreviewExpanded = !schemaPreviewExpanded"
            >
              <span class="flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                Výstupní schéma (read-only)
              </span>
              <svg class="w-3.5 h-3.5 transition-transform" :class="schemaPreviewExpanded ? 'rotate-180' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
            </button>
            <div v-if="schemaPreviewExpanded" class="border-t border-gray-200 px-3 py-2">
              <pre class="text-[11px] text-gray-600 whitespace-pre-wrap font-mono leading-relaxed max-h-60 overflow-y-auto">{{ JSON.stringify(currentStepSchema, null, 2) }}</pre>
            </div>
          </div>
        </template>

        <div class="flex gap-2 pt-1">
          <button
            type="submit"
            :disabled="saving || !!placeholderError || (tab !== 'signatures' && !editingIsSystem && !form.scope)"
            class="bg-primary text-white px-5 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {{ saving ? 'Ukládám…' : 'Uložit' }}
          </button>
          <button type="button" class="text-sm text-gray-400 hover:text-gray-600 px-3" @click="resetForm">Zrušit</button>
        </div>
      </form>
    </div>

    <!-- Filter bar -->
    <div v-if="tab !== 'signatures' && allItems.length > 0" class="flex flex-wrap gap-2 mb-4">
      <select
        v-if="tab === 'prompts'"
        v-model="filterType"
        class="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <option value="">Všechny typy kroků</option>
        <option v-for="s in STEP_TYPES" :key="s" :value="s">{{ s.replace(/_/g, ' ') }}</option>
      </select>
      <select
        v-if="scopeOptions.length > 0"
        v-model="filterScope"
        class="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <option value="">Všechny projekty a typy</option>
        <template v-for="group in scopeOptions" :key="group.groupLabel">
          <optgroup :label="group.groupLabel">
            <option v-for="option in group.options" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </optgroup>
        </template>
        <option v-if="tab === 'prompts'" value="system">Globální systémové</option>
      </select>
      <select
        v-if="authorOptions.length > 1"
        v-model="filterAuthor"
        class="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <option value="">Všichni autoři</option>
        <option v-for="a in authorOptions" :key="a" :value="a">{{ a }}</option>
      </select>
      <span v-if="!canReorder" class="text-xs text-gray-400 self-center">Vyčistěte filtry pro přeuspořádání pořadí</span>
    </div>

    <!-- Signatures list -->
    <template v-if="tab === 'signatures'">
      <div v-if="signatureTemplates.length === 0 && signaturePersonal.length === 0" class="text-center py-16 text-gray-400 text-sm">
        Zatím žádné podpisy. Vytvořte podpis tlačítkem + Nový podpis.
      </div>
      <template v-else>
        <!-- Podpisové šablony -->
        <div v-if="signatureTemplates.length > 0" class="mb-8">
          <h3 class="text-sm font-semibold text-amber-700 mb-3 flex items-center gap-2">
            <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">S</span>
            Podpisové šablony
          </h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              v-for="sig in signatureTemplates"
              :key="sig.id"
              class="bg-amber-50/30 rounded-xl border border-amber-200 p-5 transition-colors hover:border-amber-300 hover:shadow-sm"
            >
              <div class="flex items-start gap-2 min-w-0 mb-2">
                <h3 class="font-medium text-gray-800 text-sm truncate min-w-0 flex-1">{{ sig.name }}</h3>
                <span class="text-[10px] text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0">šablona</span>
                <span
                  v-if="sig.group"
                  class="text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0 font-medium"
                  :style="{ background: sig.group.color + '22', color: sig.group.color }"
                >{{ sig.group.name }}</span>
              </div>
              <div class="flex items-center gap-1.5 text-xs text-gray-400 mb-3">
                <img v-if="sig.author?.image" :src="sig.author.image" :alt="sig.author.name" class="w-4 h-4 rounded-full shrink-0" referrerpolicy="no-referrer" />
                <span>{{ sig.author?.name ?? 'Systém' }}</span>
                <span class="text-gray-300">&middot;</span>
                <span>{{ new Date(sig.createdAt).toLocaleDateString('cs-CZ') }}</span>
              </div>
              <ClientOnly><div class="text-xs text-gray-500 line-clamp-3 mb-3" v-html="safeHtml(sig.content)" /></ClientOnly>
              <div class="flex items-center gap-2">
                <button
                  class="text-xs text-amber-700 border border-amber-300 px-2.5 py-1 rounded-lg hover:bg-amber-50 transition-colors"
                  @click="useTemplateAsBase(sig)"
                >Použít jako vzor</button>
                <template v-if="canEditSystemSignatures">
                  <button
                    class="text-xs text-primary border border-primary/30 px-2.5 py-1 rounded-lg hover:bg-primary/5 transition-colors"
                    @click="startEdit({ id: sig.id, name: sig.name, content: sig.content, isTemplate: true, groupId: sig.groupId, group: sig.group, authorId: sig.authorId ?? '', createdAt: sig.createdAt, derivedFromId: null })"
                  >Upravit</button>
                  <button
                    class="text-xs text-danger border border-danger/20 px-2.5 py-1 rounded-lg hover:bg-danger/5 transition-colors ml-auto"
                    :disabled="deletingSignatureId === sig.id"
                    @click="deleteSignature(sig.id)"
                  >{{ deletingSignatureId === sig.id ? '…' : 'Smazat' }}</button>
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- Info: personal signatures moved to Settings -->
        <div class="text-center py-4 text-gray-400 text-sm">
          Vlastní podpisy se spravují v
          <NuxtLink to="/settings?tab=signatures" class="text-primary hover:underline">Nastavení → Můj podpis</NuxtLink>.
        </div>
      </template>
    </template>

    <!-- Other tabs list -->
    <template v-else>
      <div v-if="currentItems.length === 0" class="text-center py-16 text-gray-400 text-sm">
        {{ allItems.length === 0 ? 'Zatím nic. Vytvořte položku tlačítkem + Nový.' : 'Žádné položky neodpovídají aktuálním filtrům.' }}
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="item in currentItems"
          :key="item.id"
          :draggable="canReorder"
          class="bg-white rounded-xl border p-5 transition-colors cursor-pointer hover:border-primary/40 hover:shadow-sm"
          :class="[
            editingId === item.id ? 'border-primary ring-1 ring-primary/30' : (item.isSystem ? 'border-amber-200 bg-amber-50/30' : 'border-gray-100'),
            draggedItemId === item.id ? 'opacity-40' : '',
          ]"
          @click="startEdit(item)"
          @dragstart="onDragStart(item)"
          @dragover.prevent
          @drop.prevent="onDrop(item)"
          @dragend="draggedItemId = null"
        >
          <div class="flex items-start gap-2 min-w-0" :class="(item.stepType || item.stepKeys?.length) ? 'mb-1.5' : 'mb-2'">
            <span v-if="canReorder" class="text-gray-300 cursor-move shrink-0 leading-none select-none" title="Přetáhněte pro přeuspořádání">⠿</span>
            <h3 class="font-medium text-gray-800 text-sm truncate min-w-0 flex-1">{{ item.name }}</h3>
            <span
              v-if="item.project"
              class="text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0 border"
              :style="{
                color: item.project.group.color,
                backgroundColor: item.project.group.color + '15',
                borderColor: item.project.group.color + '30'
              }"
            >
              {{ item.project.name }}
            </span>
            <span
              v-else-if="item.group"
              class="text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0 border"
              :style="{
                color: item.group.color,
                backgroundColor: item.group.color + '15',
                borderColor: item.group.color + '30'
              }"
            >
              {{ item.group.name }}
            </span>
            <span v-if="item.stepType" class="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
              {{ item.stepType.replace(/_/g, ' ') }}
            </span>
          </div>
          <div v-if="tab === 'context' && item.stepKeys?.length" class="flex flex-wrap gap-1 mb-2">
            <span
              v-for="sk in item.stepKeys"
              :key="sk"
              class="text-[10px] text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full border border-violet-100 whitespace-nowrap"
            >{{ sk.replace(/_/g, ' ') }}</span>
          </div>

          <div class="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
            <span v-if="item.isSystem" class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold shrink-0">S</span>
            <img v-else-if="item.author?.image" :src="item.author.image" :alt="item.author.name" class="w-4 h-4 rounded-full shrink-0" referrerpolicy="no-referrer" />
            <span>{{ item.isSystem ? 'Systém' : item.author?.name }}</span>
            <template v-if="!item.isSystem">
              <span class="text-gray-300">·</span>
              <span>{{ new Date(item.createdAt).toLocaleDateString('cs-CZ') }}</span>
            </template>
          </div>

          <ClientOnly><div class="text-xs text-gray-500 line-clamp-3 font-mono" v-html="highlightPlaceholders(item.content ?? item.subject ?? '')" /></ClientOnly>
          <div v-if="item.derivedFromId" class="mt-2 text-xs text-gray-400">
            ↗ odvozeno z jiného dokumentu
          </div>
          <div class="flex justify-end mt-3">
            <button
              class="text-xs text-danger border border-danger/20 px-2.5 py-1 rounded-lg hover:bg-danger/5 transition-colors"
              :disabled="deletingItemId === item.id"
              @click.stop="deleteItem(item)"
            >{{ deletingItemId === item.id ? '…' : 'Smazat' }}</button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Tiptap WYSIWYG editor styles */
:deep(.ProseMirror) {
  font-family: 'Parkinsans', sans-serif;
  min-height: 10rem;
  padding: 0.75rem 1rem;
  outline: none;
  font-size: 0.875rem;
  line-height: 1.65;
  color: #374151;
}

:deep(.ProseMirror p) {
  margin: 0 0 0.5em 0;
}

:deep(.ProseMirror strong) {
  font-weight: 600;
}

:deep(.ProseMirror ul) {
  padding-left: 1.5rem;
  margin: 0.25rem 0 0.5rem;
  list-style-type: disc;
}

:deep(.ProseMirror ol) {
  padding-left: 1.5rem;
  margin: 0.25rem 0 0.5rem;
  list-style-type: decimal;
}

:deep(.ProseMirror li) {
  margin-bottom: 0.1rem;
}

:deep(.ProseMirror a) {
  color: var(--color-primary, #6366f1);
  text-decoration: underline;
}

:deep(.ProseMirror p.is-editor-empty:first-child::before) {
  color: #9ca3af;
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}
</style>
