<script setup lang="ts">
import type { WorkJobDto, ScheduledEmailDto } from '~/composables/useWork'

definePageMeta({ middleware: 'auth' })

const {
  isAdmin, loading, lastFetchedAt, runningJobs, finishedJobs, scheduledEmails,
  refresh, cancelJob, sendScheduledNow, cancelScheduled,
} = useWork()
const toast = useToast()

const POLL_MS = 3000
let pollTimer: ReturnType<typeof setInterval> | null = null

// tikající "teď" pro živé počítadlo uplynulého času
const nowTick = ref(Date.now())
let tickTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  refresh()
  pollTimer = setInterval(refresh, POLL_MS)
  tickTimer = setInterval(() => { nowTick.value = Date.now() }, 1000)
})
onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  if (tickTimer) clearInterval(tickTimer)
})

const KIND_LABELS: Record<WorkJobDto['kind'], string> = {
  GMAIL_SYNC: 'Gmail synchronizace',
  PARTNER_EMAIL_SYNC: 'Dohledání e-mailů',
  SCHEDULED_EMAIL: 'Plánovaný e-mail',
  OUTREACH_SEND: 'Oslovení',
  AI_ALIGNMENT: 'Value Alignment',
  AI_DRAFT: 'Návrh e-mailu',
}

const KIND_COLORS: Record<WorkJobDto['kind'], string> = {
  GMAIL_SYNC: 'bg-sky-100 text-sky-700',
  PARTNER_EMAIL_SYNC: 'bg-cyan-100 text-cyan-700',
  SCHEDULED_EMAIL: 'bg-amber-100 text-amber-700',
  OUTREACH_SEND: 'bg-emerald-100 text-emerald-700',
  AI_ALIGNMENT: 'bg-indigo-100 text-indigo-700',
  AI_DRAFT: 'bg-violet-100 text-violet-700',
}

const STATUS_LABELS: Record<WorkJobDto['status'], string> = {
  RUNNING: 'Běží',
  COMPLETED: 'Dokončeno',
  FAILED: 'Chyba',
  CANCELLED: 'Zrušeno',
}

const STATUS_COLORS: Record<WorkJobDto['status'], string> = {
  RUNNING: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-600',
}

const SCHEDULED_STATUS_LABELS: Record<ScheduledEmailDto['status'], string> = {
  PENDING: 'Ve frontě',
  SENDING: 'Odesílá se',
  FAILED: 'Chyba',
}

const SCHEDULED_STATUS_COLORS: Record<ScheduledEmailDto['status'], string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  SENDING: 'bg-blue-100 text-blue-700',
  FAILED: 'bg-red-100 text-red-700',
}

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function formatTime(ts: number | string): string {
  return new Date(ts).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function jobElapsed(job: WorkJobDto): string {
  return formatDuration((job.finishedAt ?? nowTick.value) - job.startedAt)
}

function progressPercent(job: WorkJobDto): number | null {
  if (!job.progress.total) return null
  return Math.min(100, Math.round((job.progress.done / job.progress.total) * 100))
}

const actionBusy = ref<string | null>(null)

async function onCancelJob(job: WorkJobDto) {
  actionBusy.value = job.id
  try {
    await cancelJob(job.id)
    toast.show('Úloha zrušena', 'success')
  } catch (err: any) {
    toast.show(err?.data?.message ?? 'Úlohu se nepodařilo zrušit', 'error')
  } finally {
    actionBusy.value = null
  }
}

async function onSendNow(email: ScheduledEmailDto) {
  if (!confirm(`Odeslat e-mail na ${email.toAddress} hned teď?`)) return
  actionBusy.value = email.id
  try {
    await sendScheduledNow(email.id)
    toast.show('E-mail odeslán', 'success')
  } catch (err: any) {
    toast.show(err?.data?.message ?? 'Odeslání selhalo', 'error')
  } finally {
    actionBusy.value = null
  }
}

async function onCancelScheduled(email: ScheduledEmailDto) {
  if (!confirm(`Zrušit naplánovaný e-mail na ${email.toAddress}?`)) return
  actionBusy.value = email.id
  try {
    await cancelScheduled(email.id)
    toast.show('Naplánovaný e-mail zrušen', 'success')
  } catch (err: any) {
    toast.show(err?.data?.message ?? 'Zrušení selhalo', 'error')
  } finally {
    actionBusy.value = null
  }
}
</script>

<template>
  <div class="max-w-5xl mx-auto px-5 py-8 space-y-8">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold text-gray-900">Práce</h1>
        <p class="text-xs text-gray-400 mt-0.5">
          Běžící a nedávno dokončené úlohy na serveru{{ isAdmin ? ' (admin — všichni uživatelé)' : '' }}.
          <span v-if="lastFetchedAt">Aktualizováno {{ formatTime(lastFetchedAt) }}, obnovuje se automaticky.</span>
        </p>
      </div>
      <button
        class="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors text-gray-600 disabled:opacity-50"
        :disabled="loading"
        @click="refresh()"
      >
        Obnovit
      </button>
    </div>

    <!-- Aktivní úlohy -->
    <section>
      <h2 class="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
        Aktivní úlohy
        <span v-if="runningJobs.length" class="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">{{ runningJobs.length }}</span>
      </h2>
      <div v-if="runningJobs.length === 0" class="bg-white border border-gray-200 rounded-xl px-4 py-6 text-center text-xs text-gray-400 italic">
        Žádná úloha právě neběží.
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="job in runningJobs"
          :key="job.id"
          class="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3"
        >
          <span class="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
          <span class="px-2 py-0.5 rounded-md text-[10px] font-semibold shrink-0" :class="KIND_COLORS[job.kind]">{{ KIND_LABELS[job.kind] }}</span>
          <div class="min-w-0 flex-1">
            <div class="text-sm text-gray-800 truncate">{{ job.label }}</div>
            <div class="text-[11px] text-gray-400 flex items-center gap-2">
              <span>{{ jobElapsed(job) }}</span>
              <span v-if="isAdmin && job.userName">· {{ job.userName }}</span>
              <span v-if="job.progress.message" class="truncate">· {{ job.progress.message }}</span>
            </div>
            <div v-if="progressPercent(job) !== null" class="mt-1.5 h-1 rounded-full bg-gray-100 overflow-hidden">
              <div class="h-full bg-blue-500 rounded-full transition-all duration-500" :style="{ width: progressPercent(job) + '%' }" />
            </div>
          </div>
          <button
            v-if="job.cancellable"
            class="text-xs font-medium text-red-600 hover:text-red-800 underline underline-offset-2 shrink-0 disabled:opacity-50"
            :disabled="actionBusy === job.id"
            @click="onCancelJob(job)"
          >
            Zrušit
          </button>
        </div>
      </div>
    </section>

    <!-- Naplánované e-maily -->
    <section>
      <h2 class="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
        Naplánované e-maily
        <span v-if="scheduledEmails.length" class="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">{{ scheduledEmails.length }}</span>
      </h2>
      <div v-if="scheduledEmails.length === 0" class="bg-white border border-gray-200 rounded-xl px-4 py-6 text-center text-xs text-gray-400 italic">
        Žádné čekající ani neúspěšné naplánované e-maily.
      </div>
      <div v-else class="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
              <th class="px-4 py-2 font-semibold">Partner</th>
              <th class="px-4 py-2 font-semibold">Komu / Předmět</th>
              <th class="px-4 py-2 font-semibold">Naplánováno na</th>
              <th class="px-4 py-2 font-semibold">Stav</th>
              <th v-if="isAdmin" class="px-4 py-2 font-semibold">Autor</th>
              <th class="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="email in scheduledEmails" :key="email.id" class="border-b border-gray-50 last:border-0 align-top">
              <td class="px-4 py-2.5">
                <NuxtLink :to="`/negotiations/${email.globalRecordId}`" class="text-indigo-600 hover:underline text-xs font-medium">
                  {{ email.globalRecord.canonicalName }}
                </NuxtLink>
                <div class="text-[10px] text-gray-400">{{ email.project.name }}</div>
              </td>
              <td class="px-4 py-2.5 max-w-[240px]">
                <div class="text-xs text-gray-700 truncate">{{ email.toAddress }}</div>
                <div class="text-[11px] text-gray-400 truncate">{{ email.subject }}</div>
              </td>
              <td class="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">{{ formatTime(email.scheduledFor) }}</td>
              <td class="px-4 py-2.5">
                <span class="px-2 py-0.5 rounded-md text-[10px] font-semibold" :class="SCHEDULED_STATUS_COLORS[email.status]">
                  {{ SCHEDULED_STATUS_LABELS[email.status] }}
                </span>
                <div v-if="email.errorMessage" class="text-[11px] text-red-600 mt-1 max-w-[220px]">{{ email.errorMessage }}</div>
              </td>
              <td v-if="isAdmin" class="px-4 py-2.5 text-xs text-gray-500">{{ email.createdBy.name }}</td>
              <td class="px-4 py-2.5 text-right whitespace-nowrap">
                <template v-if="email.status !== 'SENDING'">
                  <button
                    class="text-xs font-medium text-indigo-600 hover:text-indigo-800 underline underline-offset-2 mr-3 disabled:opacity-50"
                    :disabled="actionBusy === email.id"
                    @click="onSendNow(email)"
                  >
                    {{ email.status === 'FAILED' ? 'Zkusit znovu' : 'Odeslat hned' }}
                  </button>
                  <button
                    class="text-xs font-medium text-red-600 hover:text-red-800 underline underline-offset-2 disabled:opacity-50"
                    :disabled="actionBusy === email.id"
                    @click="onCancelScheduled(email)"
                  >
                    Zrušit
                  </button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Historie -->
    <section>
      <h2 class="text-sm font-semibold text-gray-700 mb-2">Historie úloh <span class="text-[10px] font-normal text-gray-400">(posledních 30 minut)</span></h2>
      <div v-if="finishedJobs.length === 0" class="bg-white border border-gray-200 rounded-xl px-4 py-6 text-center text-xs text-gray-400 italic">
        Zatím žádné dokončené úlohy.
      </div>
      <div v-else class="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
              <th class="px-4 py-2 font-semibold">Typ</th>
              <th class="px-4 py-2 font-semibold">Úloha</th>
              <th class="px-4 py-2 font-semibold">Stav</th>
              <th class="px-4 py-2 font-semibold">Trvání</th>
              <th class="px-4 py-2 font-semibold">Dokončeno</th>
              <th v-if="isAdmin" class="px-4 py-2 font-semibold">Uživatel</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="job in finishedJobs" :key="job.id" class="border-b border-gray-50 last:border-0 align-top">
              <td class="px-4 py-2.5">
                <span class="px-2 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap" :class="KIND_COLORS[job.kind]">{{ KIND_LABELS[job.kind] }}</span>
              </td>
              <td class="px-4 py-2.5 max-w-[280px]">
                <div class="text-xs text-gray-700 truncate">{{ job.label }}</div>
                <div v-if="job.error" class="text-[11px] text-red-600 mt-0.5">{{ job.error }}</div>
                <div v-else-if="job.progress.message" class="text-[11px] text-gray-400 mt-0.5 truncate">{{ job.progress.message }}</div>
              </td>
              <td class="px-4 py-2.5">
                <span class="px-2 py-0.5 rounded-md text-[10px] font-semibold" :class="STATUS_COLORS[job.status]">{{ STATUS_LABELS[job.status] }}</span>
              </td>
              <td class="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">{{ jobElapsed(job) }}</td>
              <td class="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{{ job.finishedAt ? formatTime(job.finishedAt) : '—' }}</td>
              <td v-if="isAdmin" class="px-4 py-2.5 text-xs text-gray-500">{{ job.userName ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
