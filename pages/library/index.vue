<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

type Tab = 'prompts' | 'context' | 'selling' | 'drafts'
type Author = { id: string; name: string; image: string | null }
type LibraryItem = {
  id: string
  name: string
  content?: string
  subject?: string
  stepType?: string
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
  'CONTACT_DISCOVERY', 'VALUE_ALIGNMENT', 'OUTREACH_PREPARATION', 'OUTREACH_EXECUTION',
]

const STEP_CONTENT_TEMPLATES: Partial<Record<string, string>> = {
  MARKET_SCANNING: `You are a market research expert with live web access. Search for high school competitions, events, and channels active in the Czech Republic.

Return a JSON array. Each item must contain exactly these fields:
- url: string — homepage of the competition/event/channel
- name: string — full official name (in the original language)
- type: string — category, e.g. "programming", "mathematics", "robotics", "science", "language", "business"
- level: string — one of "local" | "regional" | "national" | "international"
- status: string — one of "active" | "inactive" | "unknown"
- frequency: string — e.g. "ročně", "pololetně", "jednorázová"
- organizer: string — name of the organizing institution
- description: string — 1–2 sentences describing the competition and what participants do
- target_group: string — primary audience, e.g. "SŠ", "ZŠ", "SŠ+ZŠ"

Return ONLY the JSON array, no other text or markdown outside the code block.`,

  PARTNER_PROFILING: `You are a due-diligence analyst with live web access. Research the given potential partnership candidate in depth and return a structured JSON report.

Use your web search capability to look for:
1. Their official website — about page, services, mission, target audience
2. LinkedIn company page — employee count, recent posts/news, company updates
3. Instagram and other social media — community events, sponsorships they appear in
4. Press mentions and news articles about their partnerships, sponsorships, prizes
5. Evidence of past involvement in events, competitions, education, or charity
6. Whether the entity is an independent company or a subsidiary/brand of a larger corporation

Return a SINGLE JSON object inside a \`\`\`json code block:

\`\`\`json
{
  "name": "string",
  "website": "string|null",
  "linkedinUrl": "string|null",
  "instagramUrl": "string|null",
  "industry": "string",
  "size": "micro|small|medium|large|enterprise",
  "sizeNote": "string — evidence, e.g. '~120 employees per LinkedIn 2024'",
  "parentCompany": "string|null",
  "summary": "string — 3–5 sentences about what they do and their positioning",
  "activities": "string — detailed products/services/activities",
  "recentHighlights": ["string — recent news or milestone (max 5)"],
  "partnershipStyle": ["string — e.g. 'generální partner', 'věcné ceny'"],
  "partnershipEvidence": [
    { "event": "string", "role": "string", "year": "string|null", "source": "string|null" }
  ],
  "socialInvolvement": "string",
  "researchNotes": "string"
}
\`\`\`

Size: micro <10, small 10–50, medium 50–500, large 500–5000, enterprise >5000 employees.
Return ONLY the JSON object inside the code block.`,
}

const showForm = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)

const form = ref({
  name: '',
  content: '',
  stepType: 'MARKET_SCANNING',
  subject: '',
  body: '',
})

function resetForm() {
  form.value = { name: '', content: '', stepType: 'MARKET_SCANNING', subject: '', body: '' }
  editingId.value = null
  showForm.value = false
}

function startEdit(item: LibraryItem) {
  editingId.value = item.id
  form.value.name = item.name
  form.value.content = item.content ?? ''
  form.value.stepType = item.stepType ?? 'MARKET_SCANNING'
  showForm.value = true
}

watch(() => form.value.stepType, (stepType) => {
  if (!form.value.content.trim()) {
    form.value.content = STEP_CONTENT_TEMPLATES[stepType] ?? ''
  }
})

watch(showForm, (visible) => {
  if (visible && tab.value === 'prompts') {
    form.value.content = STEP_CONTENT_TEMPLATES[form.value.stepType] ?? ''
  }
})

async function save() {
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
      await $fetch('/api/library/context-parts', { method: 'POST', body: { name: form.value.name, content: form.value.content } })
      await refreshContext()
    } else if (tab.value === 'selling') {
      await $fetch('/api/library/selling-points', { method: 'POST', body: { name: form.value.name, content: form.value.content } })
      await refreshSelling()
    } else {
      await $fetch('/api/library/email-drafts', { method: 'POST', body: { name: form.value.name, subject: form.value.subject, body: form.value.body } })
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
  return allItems.value.filter((item) => {
    if (filterType.value && item.stepType !== filterType.value) return false
    const authorName = item.author?.name ?? ''
    if (filterAuthor.value && authorName !== filterAuthor.value) return false
    return true
  })
})

const authorOptions = computed(() => {
  const names = allItems.value.map((item) => item.author?.name ?? '').filter(Boolean)
  return [...new Set(names)] as string[]
})

const tabs: { key: Tab; label: string }[] = [
  { key: 'prompts', label: 'Strategy Prompts' },
  { key: 'context', label: 'Context Parts' },
  { key: 'selling', label: 'Selling Points' },
  { key: 'drafts', label: 'Email Drafts' },
]
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-semibold text-gray-800">Library</h1>
        <p class="text-sm text-gray-400 mt-1">Shared strategy prompts, context, selling points, and templates.</p>
      </div>
      <button
        class="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        @click="showForm = !showForm"
      >
        + New
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
      <h3 class="font-medium text-gray-800 mb-4">{{ editingId ? 'Edit' : 'New' }} {{ tabs.find(t => t.key === tab)?.label.replace(/s$/, '') }}</h3>
      <form class="space-y-3" @submit.prevent="save">
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">Name</label>
          <input v-model="form.name" type="text" required class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>

        <div v-if="tab === 'prompts'">
          <label class="block text-xs font-medium text-gray-500 mb-1">Step Type</label>
          <select v-model="form.stepType" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option v-for="s in STEP_TYPES" :key="s" :value="s">{{ s.replace(/_/g, ' ') }}</option>
          </select>
        </div>

        <template v-if="tab === 'drafts'">
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Subject template</label>
            <input v-model="form.subject" type="text" required class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Body template</label>
            <textarea v-model="form.body" rows="6" required class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
          </div>
        </template>
        <template v-else>
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Content</label>
            <textarea v-model="form.content" rows="5" required class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
          </div>
        </template>

        <div class="flex gap-2 pt-1">
          <button type="submit" :disabled="saving" class="bg-primary text-white px-5 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
          <button type="button" class="text-sm text-gray-400 hover:text-gray-600 px-3" @click="resetForm">Cancel</button>
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
        <option value="">All step types</option>
        <option v-for="s in STEP_TYPES" :key="s" :value="s">{{ s.replace(/_/g, ' ') }}</option>
      </select>
      <select
        v-if="authorOptions.length > 1"
        v-model="filterAuthor"
        class="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <option value="">All authors</option>
        <option v-for="a in authorOptions" :key="a" :value="a">{{ a }}</option>
      </select>
    </div>

    <div v-if="currentItems.length === 0" class="text-center py-16 text-gray-400 text-sm">
      {{ allItems.length === 0 ? 'Nothing here yet. Create one with the + New button.' : 'No items match the current filters.' }}
    </div>

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="item in currentItems"
        :key="item.id"
        class="bg-white rounded-xl border p-5 transition-colors"
        :class="item.isSystem ? 'border-amber-200 bg-amber-50/30' : 'border-gray-100'"
      >
        <div class="flex items-start justify-between mb-2">
          <h3 class="font-medium text-gray-800 text-sm">{{ item.name }}</h3>
          <div class="flex items-center gap-1 ml-2 shrink-0">
            <!-- System badge -->
            <span v-if="item.isSystem" class="text-xs text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">
              System
            </span>
            <span v-if="item.stepType" class="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full whitespace-nowrap">
              {{ item.stepType.replace(/_/g, ' ') }}
            </span>
            <!-- Allow editing for regular prompts (own author) and system prompts (any user) -->
            <button
              v-if="tab === 'prompts'"
              class="text-xs text-gray-400 hover:text-primary px-1.5 py-0.5 rounded transition-colors"
              @click="startEdit(item)"
            >
              Edit
            </button>
          </div>
        </div>
        <p class="text-xs text-gray-500 line-clamp-3 mb-3 font-mono">
          {{ item.content ?? item.subject }}
        </p>
        <div class="flex items-center gap-2">
          <span v-if="item.isSystem" class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold shrink-0">S</span>
          <img v-else-if="item.author?.image" :src="item.author.image" :alt="item.author.name" class="w-4 h-4 rounded-full" />
          <span class="text-xs text-gray-400">
            {{ item.isSystem ? 'System' : item.author?.name }}
            · {{ new Date(item.createdAt).toLocaleDateString('en-US') }}
          </span>
        </div>
        <div v-if="item.derivedFromId" class="mt-2 text-xs text-gray-400">
          ↗ derived from another document
        </div>
      </div>
    </div>
  </div>
</template>
