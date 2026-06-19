<script setup lang="ts">
import { VueFlow, useVueFlow } from '@vue-flow/core'
import type { NodeMouseEvent, EdgeMouseEvent } from '@vue-flow/core'
import { markRaw } from 'vue'
import MarketScanningNode from '~/components/canvas/nodes/MarketScanningNode.vue'
import PartnerIdentificationNode from '~/components/canvas/nodes/PartnerIdentificationNode.vue'
import PlaceholderStepNode from '~/components/canvas/nodes/PlaceholderStepNode.vue'
import MsInputSourceNode from '~/components/canvas/nodes/MsInputSourceNode.vue'
import { canvasKey, usePipelineCanvas } from '~/composables/usePipelineCanvas'

const props = defineProps<{ runId: string }>()

const canvas = usePipelineCanvas(props.runId)
provide(canvasKey, canvas)

const nodeTypes = {
  marketScanning: markRaw(MarketScanningNode),
  partnerIdentification: markRaw(PartnerIdentificationNode),
  placeholder: markRaw(PlaceholderStepNode),
  msInputSource: markRaw(MsInputSourceNode),
  piInputSource: markRaw(MsInputSourceNode),
}

const { setViewport } = useVueFlow()

onMounted(async () => {
  await canvas.fetchCanvasData()
  await nextTick()
  const canvasHeight = window.innerHeight - 180
  const nodeHeight = 220 // approximate card height
  setViewport({
    x: 60,
    y: Math.max(32, (canvasHeight - nodeHeight) / 2),
    zoom: 1,
  })
})

// Keyboard: Escape closes overlay / selection
onMounted(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') canvas.closeOverlay()
  }
  window.addEventListener('keydown', handler)
  onUnmounted(() => window.removeEventListener('keydown', handler))
})

let lastInteractionAt = 0

function onNodeClick({ node }: NodeMouseEvent) {
  lastInteractionAt = Date.now()
  canvas.openOverlay(node.id, node.data.stepId as string | null, node.data.stepType as string)
}

function onPaneClick() {
  if (Date.now() - lastInteractionAt < 50) return
  canvas.closeOverlay()
}

function onEdgeClick({ edge }: EdgeMouseEvent) {
  lastInteractionAt = Date.now()
  canvas.selectEdge(edge.id)
}

// Edge styles: highlighted selected edge / dimmed others when something selected
const styledEdges = computed(() =>
  canvas.edges.value.map(edge => {
    const hasSelection = canvas.selectedNodeId.value !== null || canvas.selectedEdgeId.value !== null
    const isHighlighted = canvas.highlightedEdgeIds.value.has(edge.id)
    return {
      ...edge,
      style: hasSelection
        ? isHighlighted
          ? { stroke: '#6366f1', strokeWidth: 2.5 }
          : { stroke: '#d1d5db', strokeWidth: 1, opacity: 0.4 }
        : { stroke: '#9ca3af', strokeWidth: 1.5 },
      animated: isHighlighted && !!canvas.selectedEdgeId.value,
    }
  })
)
</script>

<template>
  <div class="relative w-full" style="height: calc(100vh - 180px)">
    <VueFlow
      :nodes="canvas.nodes.value"
      :edges="styledEdges"
      :node-types="nodeTypes"
      :zoom-on-scroll="true"
      :pan-on-drag="true"
      :nodes-draggable="false"
      :nodes-connectable="false"
      :elements-selectable="true"
      @node-click="onNodeClick"
      @edge-click="onEdgeClick"
      @pane-click="onPaneClick"
    />

    <CanvasStepDetailOverlay />
    <CanvasOutreachWorkspace />
  </div>
</template>
