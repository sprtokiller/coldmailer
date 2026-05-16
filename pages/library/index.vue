<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import { STEP_SYSTEM_PROMPTS } from '~/config/pipeline'

definePageMeta({ middleware: 'auth' })

type Tab = 'prompts' | 'context' | 'selling' | 'drafts'
type Author = { id: string; name: string; image: string | null }
type LibraryItem = {
  id: string
  name: string
  content?: string
  subject?: string
  stepType?: string
  stepKeys?: string[]
  isSystem?: boolean
  author?: Author
  createdAt: string | Date
  derivedFromId: string | null
}

const tab = ref<Tab>('prompts')

const { data: prompts, refresh: refreshPrompts } = await useFetch('/api/library/prompts', { default: () => [] })
const { data: contextParts, refresh: refreshContext } = await useFetch('/api/library/context-parts', { default: () => [] })
const { data: sellingPoints, refresh: refreshSelling } = await useFetch('/api/library/selling-points', { default: () => [] })
const { data: emailDrafts, refresh: refreshDrafts } = await useFetch('/api/library/email-drafts', { default: () => [] })

const STEP_TYPES = [
  'MARKET_SCANNING', 'PARTNER_IDENTIFICATION', 'PARTNER_PROFILING',
  'VALUE_ALIGNMENT', 'OUTREACH_PREPARATION', 'OUTREACH_EXECUTION',
]

const PROMPT_STEP_TYPES = STEP_TYPES.filter(s => s !== 'OUTREACH_EXECUTION')

const STEP_CONTENT_TEMPLATES: Partial<Record<string, string>> = STEP_SYSTEM_PROMPTS

// ── Placeholder validation ────────────────────────────────────────────────────
const VALID_PLACEHOLDERS = ['<[[CONTEXT]]>', '<[[DATA]]>']
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

const placeholderError = computed<string | null>(() => {
  if (invalidPlaceholders.value.length)
    return `Neznámý placeholder: ${invalidPlaceholders.value.join(', ')}`
  if (duplicatePlaceholders.value.length)
    return `Placeholder smí být použit nejvýše jednou: ${duplicatePlaceholders.value.join(', ')}`
  return null
})

const validFoundPlaceholders = computed(() =>
  VALID_PLACEHOLDERS.filter(p => contentPlaceholders.value.includes(p)),
)

// ── Form state ────────────────────────────────────────────────────────────────
const showForm = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)

const form = ref({
  name: '',
  content: '',
  stepType: 'MARKET_SCANNING',
  stepKeys: ['VALUE_ALIGNMENT', 'OUTREACH_PREPARATION'] as string[],
  subject: '',
  body: '',
})

function resetForm() {
  form.value = { name: '', content: '', stepType: 'MARKET_SCANNING', stepKeys: ['VALUE_ALIGNMENT', 'OUTREACH_PREPARATION'], subject: '', body: '' }
  editingId.value = null
  showForm.value = false
  editor.value?.commands.setContent('')
}

// ── Tiptap editor ─────────────────────────────────────────────────────────────
const editor = useEditor({
  extensions: [
    StarterKit,
    Underline,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Placeholder.configure({ placeholder: 'Napište tělo e-mailu…' }),
  ],
  content: '',
  editorProps: {
    attributes: {
      class: 'prose prose-sm max-w-none min-h-[10rem] focus:outline-none px-4 py-3 font-[Parkinsans,sans-serif]',
    },
  },
  onUpdate({ editor: e }) {
    form.value.body = e.getHTML()
  },
})

watch(showForm, (visible) => {
  if (!visible) return
  if (tab.value === 'drafts') {
    nextTick(() => {
      editor.value?.commands.setContent(form.value.body || '')
    })
  }
})

watch(tab, (t) => {
  if (t === 'drafts' && showForm.value) {
    nextTick(() => editor.value?.commands.setContent(form.value.body || ''))
  }
})

// Predefined signature presets
const SIGNATURES = [
  {
    label: 'Standardní',
    html: `<p>S pozdravem,</p><p><strong>[Jméno]</strong><br>[Pozice] | SCG<br>[Email] | [Telefon]</p>`,
  },
  {
    label: 'Krátká',
    html: `<p>--<br><strong>[Jméno]</strong>, SCG</p>`,
  },
  {
    label: 'S odkazem',
    html: `<p>S pozdravem,<br><strong>[Jméno]</strong><br>[Pozice] | SCG<br><a href="https://scg.cz">scg.cz</a></p>`,
  },
]

function insertSignature(html: string) {
  editor.value?.chain().focus().insertContent('<p></p>' + html).run()
}

const route = useRoute()
onMounted(() => {
  if (route.query.action === 'new' && typeof route.query.stepType === 'string') {
    form.value.stepType = route.query.stepType
    showForm.value = true
  }
  if (typeof route.query.editId === 'string') {
    const item = (prompts.value as LibraryItem[]).find(p => p.id === route.query.editId)
    if (item) {
      tab.value = 'prompts'
      startEdit(item)
    }
  }
})

function startEdit(item: LibraryItem) {
  editingId.value = item.id
  form.value.name = item.name
  form.value.content = item.content ?? ''
  form.value.subject = (item as LibraryItem & { subject?: string }).subject ?? ''
  form.value.body = (item as LibraryItem & { body?: string }).body ?? ''
  form.value.stepType = item.stepType ?? 'MARKET_SCANNING'
  form.value.stepKeys = item.stepKeys?.length ? [...item.stepKeys] : ['VALUE_ALIGNMENT']
  showForm.value = true
  if (tab.value === 'drafts') {
    nextTick(() => editor.value?.commands.setContent(form.value.body || ''))
  }
}

watch(() => form.value.stepType, (newType, oldType) => {
  if (editingId.value) return
  const prevTemplate = (STEP_CONTENT_TEMPLATES[oldType] ?? '').trim()
  const current = form.value.content.trim()
  if (!current || current === prevTemplate) {
    form.value.content = STEP_CONTENT_TEMPLATES[newType] ?? ''
  }
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

async function save() {
  if (placeholderError.value) return
  saving.value = true
  try {
    if (tab.value === 'prompts') {
      if (editingId.value) {
        await $fetch(`/api/library/prompts/${editingId.value}`, { method: 'PATCH', body: { name: form.value.name, content: form.value.content, stepType: form.value.stepType } })
      } else {
        await $fetch('/api/library/prompts', { method: 'POST', body: { name: form.value.name, content: form.value.content, stepType: form.value.stepType } })
      }
      await refreshPrompts()
    } else if (tab.value === 'context') {
      if (editingId.value) {
        await $fetch(`/api/library/context-parts/${editingId.value}`, { method: 'PATCH', body: { name: form.value.name, content: form.value.content, stepKeys: form.value.stepKeys } })
      } else {
        await $fetch('/api/library/context-parts', { method: 'POST', body: { name: form.value.name, content: form.value.content, stepKeys: form.value.stepKeys } })
      }
      await refreshContext()
    } else if (tab.value === 'selling') {
      if (editingId.value) {
        await $fetch(`/api/library/selling-points/${editingId.value}`, { method: 'PATCH', body: { name: form.value.name, content: form.value.content } })
      } else {
        await $fetch('/api/library/selling-points', { method: 'POST', body: { name: form.value.name, content: form.value.content } })
      }
      await refreshSelling()
    } else {
      if (editingId.value) {
        await $fetch(`/api/library/email-drafts/${editingId.value}`, { method: 'PATCH', body: { name: form.value.name, subject: form.value.subject, body: form.value.body } })
      } else {
        await $fetch('/api/library/email-drafts', { method: 'POST', body: { name: form.value.name, subject: form.value.subject, body: form.value.body } })
      }
      await refreshDrafts()
    }
    resetForm()
  } finally {
    saving.value = false
  }
}

// ── Filters ──────────────────────────────────────────────────────────────────
const filterType   = ref('')
const filterAuthor = ref('')

watch(tab, () => { filterType.value = ''; filterAuthor.value = '' })

const allItems = computed(() => {
  if (tab.value === 'prompts') return prompts.value as LibraryItem[]
  if (tab.value === 'context') return contextParts.value as LibraryItem[]
  if (tab.value === 'selling') return sellingPoints.value as LibraryItem[]
  return emailDrafts.value as LibraryItem[]
})

const currentItems = computed(() => {
  return allItems.value
    .filter((item) => {
      if (filterType.value && item.stepType !== filterType.value) return false
      const authorName = item.author?.name ?? ''
      if (filterAuthor.value && authorName !== filterAuthor.value) return false
      return true
    })
    .sort((a, b) => {
      const stepA = STEP_TYPES.indexOf(a.stepType ?? '')
      const stepB = STEP_TYPES.indexOf(b.stepType ?? '')
      const stepOrder = (stepA === -1 ? Infinity : stepA) - (stepB === -1 ? Infinity : stepB)
      if (stepOrder !== 0) return stepOrder
      if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1
      return (a.name ?? '').localeCompare(b.name ?? '', 'cs')
    })
})

const authorOptions = computed(() => {
  const names = allItems.value.map((item) => item.author?.name ?? '').filter(Boolean)
  return [...new Set(names)] as string[]
})

const tabs: { key: Tab; label: string }[] = [
  { key: 'prompts', label: 'Systémové prompty' },
  { key: 'context', label: 'Kontextové části' },
  { key: 'selling', label: 'Prodejní argumenty' },
  { key: 'drafts', label: 'E-mailové šablony' },
]
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
        @click="showForm = !showForm"
      >
        + Nový
      </button>
    </div>

    <div class="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
      <button
        v-for="t in tabs"
        :key="t.key"
        class="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
        :class="tab === t.key ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'"
        @click="tab = t.key; showForm = false"
      >
        {{ t.label }}
      </button>
    </div>

    <div v-if="showForm" class="bg-white border border-primary/30 rounded-xl p-5 mb-6">
      <h3 class="font-medium text-gray-800 mb-4">{{ editingId ? 'Upravit' : 'Nový' }} {{ tabs.find(t => t.key === tab)?.label }}</h3>
      <form class="space-y-3" @submit.prevent="save">
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">Název</label>
          <input v-model="form.name" type="text" required class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>

        <div v-if="tab === 'prompts'">
          <label class="block text-xs font-medium text-gray-500 mb-1">Typ kroku</label>
          <select v-model="form.stepType" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option v-for="s in PROMPT_STEP_TYPES" :key="s" :value="s">{{ s.replace(/_/g, ' ') }}</option>
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

        <template v-if="tab === 'drafts'">
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Šablona předmětu</label>
            <input v-model="form.subject" type="text" required class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Tělo e-mailu (WYSIWYG)</label>
            <!-- Tiptap toolbar -->
            <div v-if="editor" class="flex flex-wrap items-center gap-1 p-2 bg-gray-50 border border-gray-200 rounded-t-lg">
              <button
                type="button"
                class="px-2 py-1 text-xs rounded hover:bg-gray-200 transition-colors"
                :class="editor.isActive('bold') ? 'bg-gray-200 font-bold' : ''"
                title="Tučné"
                @click="editor.chain().focus().toggleBold().run()"
              ><strong>B</strong></button>
              <button
                type="button"
                class="px-2 py-1 text-xs rounded hover:bg-gray-200 transition-colors italic"
                :class="editor.isActive('italic') ? 'bg-gray-200' : ''"
                title="Kurzíva"
                @click="editor.chain().focus().toggleItalic().run()"
              ><em>I</em></button>
              <button
                type="button"
                class="px-2 py-1 text-xs rounded hover:bg-gray-200 transition-colors underline"
                :class="editor.isActive('underline') ? 'bg-gray-200' : ''"
                title="Podtržení"
                @click="editor.chain().focus().toggleUnderline().run()"
              >U</button>
              <span class="w-px h-4 bg-gray-200 mx-1"></span>
              <button
                type="button"
                class="px-2 py-1 text-xs rounded hover:bg-gray-200 transition-colors"
                :class="editor.isActive('bulletList') ? 'bg-gray-200' : ''"
                title="Nečíslovaný seznam"
                @click="editor.chain().focus().toggleBulletList().run()"
              >• —</button>
              <button
                type="button"
                class="px-2 py-1 text-xs rounded hover:bg-gray-200 transition-colors"
                :class="editor.isActive('orderedList') ? 'bg-gray-200' : ''"
                title="Číslovaný seznam"
                @click="editor.chain().focus().toggleOrderedList().run()"
              >1. —</button>
              <span class="w-px h-4 bg-gray-200 mx-1"></span>
              <span class="text-[11px] text-gray-400 ml-1 mr-0.5">Podpis:</span>
              <button
                v-for="sig in SIGNATURES"
                :key="sig.label"
                type="button"
                class="px-2 py-1 text-[11px] rounded border border-gray-200 hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-colors"
                @click="insertSignature(sig.html)"
              >+ {{ sig.label }}</button>
            </div>
            <!-- Tiptap editor area -->
            <div class="border border-t-0 border-gray-200 rounded-b-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary/30 bg-white">
              <EditorContent :editor="editor" class="text-sm" />
            </div>
            <p class="mt-1 text-[11px] text-gray-400">Formátování se uloží jako HTML a AI je při generování e-mailů rozumí.</p>
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
                class="inline-flex items-center gap-1 text-[11px] font-mono px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200"
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
        </template>

        <div class="flex gap-2 pt-1">
          <button
            type="submit"
            :disabled="saving || !!placeholderError"
            class="bg-primary text-white px-5 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {{ saving ? 'Ukládám…' : 'Uložit' }}
          </button>
          <button type="button" class="text-sm text-gray-400 hover:text-gray-600 px-3" @click="resetForm">Zrušit</button>
        </div>
      </form>
    </div>

    <!-- Filter bar -->
    <div v-if="allItems.length > 0" class="flex flex-wrap gap-2 mb-4">
      <select
        v-if="tab === 'prompts'"
        v-model="filterType"
        class="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <option value="">Všechny typy kroků</option>
        <option v-for="s in PROMPT_STEP_TYPES" :key="s" :value="s">{{ s.replace(/_/g, ' ') }}</option>
      </select>
      <select
        v-if="authorOptions.length > 1"
        v-model="filterAuthor"
        class="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <option value="">Všichni autoři</option>
        <option v-for="a in authorOptions" :key="a" :value="a">{{ a }}</option>
      </select>
    </div>

    <div v-if="currentItems.length === 0" class="text-center py-16 text-gray-400 text-sm">
      {{ allItems.length === 0 ? 'Zatím nic. Vytvořte položku tlačítkem + Nový.' : 'Žádné položky neodpovídají aktuálním filtrům.' }}
    </div>

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="item in currentItems"
        :key="item.id"
        class="bg-white rounded-xl border p-5 transition-colors cursor-pointer hover:border-primary/40 hover:shadow-sm"
        :class="item.isSystem ? 'border-amber-200 bg-amber-50/30' : 'border-gray-100'"
        @click="startEdit(item)"
      >
        <div class="flex items-start gap-2 min-w-0" :class="(item.stepType || item.stepKeys?.length) ? 'mb-1.5' : 'mb-2'">
          <h3 class="font-medium text-gray-800 text-sm truncate min-w-0 flex-1">{{ item.name }}</h3>
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

        <p class="text-xs text-gray-500 line-clamp-3 font-mono">
          {{ item.content ?? item.subject }}
        </p>
        <div v-if="item.derivedFromId" class="mt-2 text-xs text-gray-400">
          ↗ odvozeno z jiného dokumentu
        </div>
      </div>
    </div>
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

:deep(.ProseMirror ul),
:deep(.ProseMirror ol) {
  padding-left: 1.5rem;
  margin: 0.25rem 0 0.5rem;
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
