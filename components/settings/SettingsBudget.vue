<script setup lang="ts">
import {
  RESET_PERIOD_LABELS,
  type BudgetUser, type BudgetResponse, type DefaultBudgetCfg, type BudgetResetPeriod,
} from '~/utils/settings-constants'

const props = defineProps<{ budgetData: BudgetResponse | null }>()
const emit = defineEmits<{ (e: 'refresh'): void }>()

const budgetUsers = computed(() => props.budgetData?.users ?? [])

// ── Default budget form ──────────────────────────────────────────────────
const defBudget = ref<DefaultBudgetCfg>({ limitUsd: null, resetPeriod: 'never' })
watch(() => props.budgetData?.defaultBudget, (v) => { if (v) defBudget.value = { ...v } }, { immediate: true })

const defLimitInput = ref('')
watch(() => defBudget.value.limitUsd, (v) => { defLimitInput.value = v != null ? String(v) : '' }, { immediate: true })

async function saveDefaultBudget() {
  const limitUsd = defLimitInput.value.trim() === '' ? null : parseFloat(defLimitInput.value)
  await $fetch('/api/admin/budget/defaults', {
    method: 'PATCH',
    body: { limitUsd, resetPeriod: defBudget.value.resetPeriod },
  })
  emit('refresh')
}

// ── Per-user budget editing ──────────────────────────────────────────────
const selectedBudgetUserId = ref<string | null>(null)
const selectedBudgetUser = computed(() => budgetUsers.value.find(u => u.id === selectedBudgetUserId.value) ?? null)

const editLimitInput = ref('')
const editResetPeriod = ref<BudgetResetPeriod>('never')

watch(selectedBudgetUser, (u) => {
  if (!u) return
  editLimitInput.value = u.budget?.limitUsd != null ? String(u.budget.limitUsd) : ''
  editResetPeriod.value = u.budget?.resetPeriod ?? 'never'
})

async function saveBudgetUser() {
  if (!selectedBudgetUserId.value) return
  const limitUsd = editLimitInput.value.trim() === '' ? null : parseFloat(editLimitInput.value)
  await $fetch(`/api/admin/budget/${selectedBudgetUserId.value}`, {
    method: 'PATCH',
    body: { limitUsd, resetPeriod: editResetPeriod.value },
  })
  emit('refresh')
}

async function resetBudgetCounter(userId: string) {
  if (!confirm('Opravdu resetovat čítač spotřeby na nulu?')) return
  await $fetch(`/api/admin/budget/${userId}`, {
    method: 'PATCH',
    body: { resetUsedNow: true },
  })
  emit('refresh')
}

function budgetPct(u: BudgetUser) {
  if (!u.budget?.limitUsd) return null
  return Math.min(100, (u.budget.usedUsd / u.budget.limitUsd) * 100)
}
</script>

<template>
  <div class="space-y-5">

    <!-- Default budget config -->
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h2 class="text-base font-semibold text-gray-800 mb-1">Výchozí limit pro nové uživatele</h2>
      <p class="text-sm text-gray-400 mb-4">Automaticky přidělen při registraci. Existujíci uživatelé nejsou ovlivněni.</p>
      <div class="flex items-end gap-4 flex-wrap">
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">Limit (USD, prázdné = neomezeno)</label>
          <div class="flex items-center gap-1">
            <span class="text-gray-400 text-sm">$</span>
            <input
              v-model="defLimitInput"
              type="number" min="0" step="0.5" placeholder="neomezeno"
              class="w-32 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">Reset perioda</label>
          <select
            v-model="defBudget.resetPeriod"
            class="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          >
            <option v-for="(label, val) in RESET_PERIOD_LABELS" :key="val" :value="val">{{ label }}</option>
          </select>
        </div>
        <button
          class="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
          @click="saveDefaultBudget"
        >Uložit výchozí</button>
      </div>
    </div>

    <!-- User list + edit panel -->
    <div class="flex gap-4">

      <!-- User list -->
      <div class="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100">
          <h2 class="text-sm font-semibold text-gray-800">Uživatelé ({{ budgetUsers.length }})</h2>
          <p class="text-xs text-gray-400 mt-0.5">Spotřeba za posledních 30 dní</p>
        </div>
        <ul class="divide-y divide-gray-50">
          <li
            v-for="u in budgetUsers"
            :key="u.id"
            class="px-5 py-3.5 cursor-pointer hover:bg-indigo-50/40 transition-colors"
            :class="{ 'bg-indigo-50': selectedBudgetUserId === u.id }"
            @click="selectedBudgetUserId = selectedBudgetUserId === u.id ? null : u.id"
          >
            <div class="flex items-center gap-3">
              <img v-if="u.image" :src="u.image" :alt="u.name" class="w-7 h-7 rounded-full shrink-0" referrerpolicy="no-referrer" />
              <div v-else class="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 shrink-0 flex items-center justify-center text-xs font-bold text-white">
                {{ u.name.charAt(0) }}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="text-sm font-medium text-gray-800 truncate">{{ u.name }}</span>
                  <span v-if="u.isAdmin" class="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full font-semibold">ADMIN</span>
                </div>
                <div class="mt-1">
                  <div v-if="u.budget?.limitUsd" class="flex items-center gap-2">
                    <div class="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        class="h-1 rounded-full transition-all"
                        :class="(budgetPct(u) ?? 0) > 90 ? 'bg-red-400' : (budgetPct(u) ?? 0) > 70 ? 'bg-amber-400' : 'bg-emerald-400'"
                        :style="`width: ${budgetPct(u)}%`"
                      />
                    </div>
                    <span class="text-[11px] text-gray-400 shrink-0 tabular-nums">
                      ${{ u.budget.usedUsd.toFixed(2) }} / ${{ u.budget.limitUsd.toFixed(2) }}
                    </span>
                  </div>
                  <div v-else class="text-[11px] text-gray-400">
                    <span v-if="u.budget?.limitUsd === null && u.budget">∞ nezomezeno</span>
                    <span v-else>${{ u.stats30d.aiCost.toFixed(3) }} (30d)</span>
                  </div>
                </div>
              </div>
              <div class="hidden sm:flex items-center gap-1.5 shrink-0">
                <span class="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full" title="AI requesty">
                  🤖 {{ u.stats30d.aiCount }}
                </span>
                <span class="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full" title="SerpAPI vyhledávání">
                  🔍 {{ u.stats30d.serpCount }}
                </span>
              </div>
            </div>
          </li>
        </ul>
      </div>

      <!-- Edit panel -->
      <div v-if="selectedBudgetUser" class="w-72 shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 self-start sticky top-6">
        <div class="flex items-center gap-2 mb-4">
          <img v-if="selectedBudgetUser.image" :src="selectedBudgetUser.image" :alt="selectedBudgetUser.name" class="w-8 h-8 rounded-full" referrerpolicy="no-referrer" />
          <div v-else class="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-xs font-bold text-white">
            {{ selectedBudgetUser.name.charAt(0) }}
          </div>
          <div class="min-w-0">
            <div class="text-sm font-semibold text-gray-800 truncate">{{ selectedBudgetUser.name }}</div>
            <div class="text-[11px] text-gray-400 truncate">{{ selectedBudgetUser.email }}</div>
          </div>
        </div>

        <div class="bg-gray-50 rounded-xl p-3 mb-4 text-xs text-gray-600 space-y-1">
          <div class="flex justify-between">
            <span class="text-gray-400">Spotřeba (period.)</span>
            <span class="font-semibold">${{ selectedBudgetUser.budget?.usedUsd.toFixed(3) ?? '0.000' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Limit</span>
            <span class="font-semibold">{{ selectedBudgetUser.budget?.limitUsd != null ? '$' + selectedBudgetUser.budget.limitUsd.toFixed(2) : '∞' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Reset</span>
            <span class="font-semibold">{{ RESET_PERIOD_LABELS[selectedBudgetUser.budget?.resetPeriod ?? 'never'] }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">AI requesty (30d)</span>
            <span>{{ selectedBudgetUser.stats30d.aiCount }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">SerpAPI (30d)</span>
            <span>{{ selectedBudgetUser.stats30d.serpCount }}</span>
          </div>
        </div>

        <div class="space-y-3">
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Limit (USD)</label>
            <div class="flex items-center gap-1">
              <span class="text-gray-400 text-sm">$</span>
              <input
                v-model="editLimitInput"
                type="number" min="0" step="0.5" placeholder="neomezeno"
                class="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Reset perioda</label>
            <select
              v-model="editResetPeriod"
              class="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
            >
              <option v-for="(label, val) in RESET_PERIOD_LABELS" :key="val" :value="val">{{ label }}</option>
            </select>
          </div>
          <button
            class="w-full py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
            @click="saveBudgetUser"
          >Uložit změny</button>
          <button
            class="w-full py-1.5 bg-amber-50 text-amber-700 border border-amber-200 text-sm rounded-lg hover:bg-amber-100 transition-colors"
            @click="resetBudgetCounter(selectedBudgetUser!.id)"
          >Resetovat čítač spotřeby</button>
        </div>
      </div>

    </div>
  </div>
</template>
