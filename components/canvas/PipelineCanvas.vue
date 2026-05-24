<script setup lang="ts">
import { VueFlow, useVueFlow } from '@vue-flow/core'
import type { NodeMouseEvent, EdgeMouseEvent } from '@vue-flow/core'
import { markRaw } from 'vue'
import MarketScanningNode from '~/components/canvas/nodes/MarketScanningNode.vue'
import PartnerIdentificationNode from '~/components/canvas/nodes/PartnerIdentificationNode.vue'
import PlaceholderStepNode from '~/components/canvas/nodes/PlaceholderStepNode.vue'
import { canvasKey, usePipelineCanvas } from '~/composables/usePipelineCanvas'

const props = defineProps<{ runId: string }>()

const canvas = usePipelineCanvas(props.runId)
provide(canvasKey, canvas)

const nodeTypes = {
  marketScanning: markRaw(MarketScanningNode),
  partnerIdentification: markRaw(PartnerIdentificationNode),
  placeholder: markRaw(PlaceholderStepNode),
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

function onNodeClick({ node }: NodeMouseEvent) {
  canvas.openOverlay(node.id, node.data.stepId as string | null, node.data.stepType as string)
}

function onPaneClick() {
  canvas.closeOverlay()
}

function onEdgeClick({ edge }: EdgeMouseEvent) {
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
      :elements-selectable="false"
      @node-click="onNodeClick"
      @edge-click="onEdgeClick"
      @pane-click="onPaneClick"
    />

    <CanvasStepDetailOverlay />
  </div>
</template>
