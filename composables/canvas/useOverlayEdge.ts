import type { OverlayCoreState } from './useOverlayCore'

const SOURCE_HEX: Record<string, string> = {
  MINI_DEEP_RESEARCH: '#6366f1', AI_IMPORT: '#a855f7',
  MANUAL_ADD: '#9ca3af', GLOBAL_DB_SELECT: '#4f46e5', legacy: '#f59e0b',
}
export const DONUT_C = 2 * Math.PI * 36

export interface DonutSegment {
  key: string; label: string; color: string
  count: number; total: number
  dash: number; gap: number; offset: number
}

export function useOverlayEdge(core: OverlayCoreState) {
  const { canvas, activeEdgeId } = core

  const edgeDetail = computed(() => {
    if (!activeEdgeId.value) return null
    const edge = canvas.edges.value.find(e => e.id === activeEdgeId.value)
    if (!edge) return null
    const sourceNode = canvas.nodes.value.find(n => n.id === edge.source)
    const sid = sourceNode?.data.stepId as string | null
    const sourceRecords = sid ? (canvas.stepRecords.value[sid] ?? []) : []
    return { edge, sourceNode, sourceRecords }
  })

  const edgeChartData = computed(() => {
    if (!edgeDetail.value) return null
    const recs = edgeDetail.value.sourceRecords
    const total = recs.length
    if (total === 0) return null

    const groups = new Map<string, { key: string; label: string; type: string; selected: number; all: number }>()
    for (const rec of recs) {
      const key = rec.inputSource?.id ?? 'legacy'
      if (!groups.has(key)) groups.set(key, { key, label: rec.inputSource?.label ?? 'Legacy', type: rec.inputSource?.type ?? 'legacy', selected: 0, all: 0 })
      const g = groups.get(key)!
      g.all++
      if (rec.isSelectedForProcessing) g.selected++
    }

    const totalSelected = recs.filter(r => r.isSelectedForProcessing).length
    const segments: DonutSegment[] = []
    let cumulative = 0
    for (const g of groups.values()) {
      if (g.selected === 0) continue
      const dash = (g.selected / total) * DONUT_C
      segments.push({ key: g.key, label: g.label, color: SOURCE_HEX[g.type] ?? '#6366f1', count: g.selected, total: g.all, dash, gap: DONUT_C - dash, offset: DONUT_C - cumulative })
      cumulative += dash
    }
    const unselected = total - totalSelected
    if (unselected > 0) {
      const dash = (unselected / total) * DONUT_C
      segments.push({ key: '__unselected', label: 'Nevybráno', color: '#e5e7eb', count: unselected, total: unselected, dash, gap: DONUT_C - dash, offset: DONUT_C - cumulative })
    }
    return { segments, totalSelected, total }
  })

  watch(activeEdgeId, async (id) => {
    if (!id) return
    const edge = canvas.edges.value.find(e => e.id === id)
    if (!edge) return
    const sourceNode = canvas.nodes.value.find(n => n.id === edge.source)
    const sid = sourceNode?.data.stepId as string | null
    if (sid && !canvas.stepRecords.value[sid]) await canvas.fetchStepRecords(sid)
  })

  return { edgeDetail, edgeChartData }
}
