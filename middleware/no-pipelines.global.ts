/**
 * Global middleware – skryje veškerou funkcionalitu Pipelines.
 * - /           → přesměruje na /negotiations
 * - /pipeline/* → vyhodí 404
 */
export default defineNuxtRouteMiddleware((to) => {
  if (to.path === '/') {
    return navigateTo('/negotiations', { replace: true })
  }

  if (to.path.startsWith('/pipeline')) {
    throw createError({ statusCode: 404, statusMessage: 'Stránka nenalezena' })
  }
})
