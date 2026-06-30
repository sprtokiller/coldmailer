const registry = new Map<string, AbortController>()

export function registerJob(stepId: string): AbortController {
  const controller = new AbortController()
  registry.set(stepId, controller)
  return controller
}

export function cancelJob(stepId: string): boolean {
  const controller = registry.get(stepId)
  if (!controller) return false
  controller.abort(new Error('ZruĹˇeno uĹľivatelem'))
  registry.delete(stepId)
  return true
}

export function cleanupJob(stepId: string): void {
  registry.delete(stepId)
}

