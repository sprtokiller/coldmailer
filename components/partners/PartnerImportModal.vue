<script setup lang="ts">
const props = defineProps<{ prefill?: string }>()
const emit = defineEmits<{ close: []; saved: [{ id: string }] }>()

const text = ref(props.prefill ?? '')
const loading = ref(false)
const error = ref('')
const showSchema = ref(false)

const PARTNER_PAYLOAD_FIELDS = [
  'website', 'linkedinUrl', 'instagramUrl', 'industry', 'size', 'sizeNote',
  'parentCompany', 'summary', 'activities', 'socialInvolvement', 'researchNotes', 'contacts',
]

const SCHEMA_HINT = `{
  "canonicalName": "Název firmy (povinné)",
  "website": "https://...",
  "linkedinUrl": "https://linkedin.com/...",
  "industry": "Technologie",
  "size": "micro|small|medium|large|enterprise",
  "summary": "Popis firmy",
  "activities": "Aktivity a služby",
  "contacts": [
    { "firstName": "Jan", "lastName": "Novák", "role": "CEO", "email": "jan@firma.cz" }
  ]
}`

function stripFences(raw: string): string {
  const t = raw.trim()
  const m = t.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/s)
  if (m) return m[1].trim()
  const o = t.match(/^```(?:json)?\s*\n?([\s\S]*)$/s)
  if (o) return o[1].replace(/```\s*$/, '').trim()
  return t
}

function tryParseObject(stripped: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(stripped)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
  } catch {}
  return null
}

function buildPartnerBody(obj: Record<string, unknown>): { canonicalName: string; payload: Record<string, unknown> } | null {
  const canonicalName = String(obj.canonicalName ?? obj.name ?? '').trim()
  if (!canonicalName) return null
  const payload: Record<string, unknown> = {}
  for (const key of PARTNER_PAYLOAD_FIELDS) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') payload[key] = obj[key]
  }
  return { canonicalName, payload }
}

type ValidationState =
  | { status: 'empty' }
  | { status: 'valid'; canonicalName: string }
  | { status: 'no-name' }
  | { status: 'invalid-json' }

const validation = computed<ValidationState>(() => {
  if (!text.value.trim()) return { status: 'empty' }
  const stripped = stripFences(text.value)
  const parsed = tryParseObject(stripped)
  if (!parsed) return { status: 'invalid-json' }
  const body = buildPartnerBody(parsed)
  if (!body) return { status: 'no-name' }
  return { status: 'valid', canonicalName: body.canonicalName }
})

const isValidJSON = computed(() => validation.value.status === 'valid')

async function doImport() {
  if (!text.value.trim() || loading.value) return
  loading.value = true
  error.value = ''

  try {
    if (isValidJSON.value) {
      // Direct import — no AI needed
      const stripped = stripFences(text.value)
      const parsed = tryParseObject(stripped)!
      const body = buildPartnerBody(parsed)!
      const res = await $fetch<{ record: { id: string } }>('/api/partners', {
        method: 'POST',
        body: { canonicalName: body.canonicalName, payload: body.payload },
      })
      emit('saved', { id: res.record.id })
    } else {
      // AI conversion
      const res = await $fetch<{ record: { id: string } }>('/api/partners/import-text', {
        method: 'POST',
        body: { rawText: text.value },
      })
      emit('saved', { id: res.record.id })
    }
    emit('close')
  } catch (e: unknown) {
    const err = e as { data?: { message?: string }; statusMessage?: string }
    error.value = err?.data?.message ?? err?.statusMessage ?? 'Nepodařilo se uložit'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-16 px-4" @click.self="emit('close')">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 class="text-lg font-semibold text-gray-800">Importovat partnera</h2>
          <button class="text-gray-400 hover:text-gray-600 transition-colors" @click="emit('close')">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Content -->
        <div class="px-6 py-5">
          <p class="text-xs text-gray-400 mb-3">
            Vložte JSON nebo popis partnera. Pokud je vstup validní JSON se jménem, importuje se přímo — jinak pomůže AI
            <span class="text-amber-500">(není 100% zaručeno)</span>.
          </p>

          <textarea
            v-model="text"
            rows="9"
            placeholder='{ "canonicalName": "Acme s.r.o.", "website": "https://acme.cz", ... }'
            class="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg resize-none focus:outline-none focus:border-indigo-300 font-mono"
          />

          <!-- Validation status -->
          <div class="mt-2 flex items-center gap-2">
            <template v-if="validation.status === 'valid'">
              <span class="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
                </svg>
                Validní JSON — {{ validation.canonicalName }}
              </span>
            </template>
            <template v-else-if="validation.status === 'no-name'">
              <span class="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M12 3C7.029 3 3 7.029 3 12s4.029 9 9 9 9-4.029 9-9-4.029-9-9-9z" />
                </svg>
                Chybí "canonicalName" — použije se AI
              </span>
            </template>
            <template v-else-if="validation.status === 'invalid-json'">
              <span class="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Neplatný JSON — použije se AI
              </span>
            </template>

            <!-- Schema info icon -->
            <div class="relative ml-auto">
              <button
                class="w-5 h-5 rounded-full border border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400 flex items-center justify-center text-xs font-semibold transition-colors"
                @click="showSchema = !showSchema"
              >i</button>
              <div
                v-if="showSchema"
                class="absolute right-0 top-7 bg-white border border-gray-200 rounded-xl shadow-lg p-3 z-10 w-80"
              >
                <p class="text-xs font-medium text-gray-600 mb-2">Očekávané schéma partnera</p>
                <pre class="text-xs text-gray-700 bg-gray-50 rounded-lg p-2.5 overflow-x-auto font-mono leading-relaxed">{{ SCHEMA_HINT }}</pre>
                <div class="fixed inset-0 -z-10" @click="showSchema = false" />
              </div>
            </div>
          </div>

          <p v-if="error" class="mt-2 text-xs text-red-500">{{ error }}</p>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button class="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 transition-colors" @click="emit('close')">Zrušit</button>
          <button
            :disabled="loading || !text.trim()"
            class="text-sm font-medium text-white bg-primary px-5 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            @click="doImport"
          >
            <span v-if="loading">{{ isValidJSON ? 'Importuji...' : 'Konvertuji pomocí AI...' }}</span>
            <span v-else-if="isValidJSON">Importovat JSON</span>
            <span v-else>Importovat s AI</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
