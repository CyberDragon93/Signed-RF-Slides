import { defineAppSetup } from '@slidev/types'

// Workaround for a Slidev base-path bug (v52): navigation paths are built as
// `${BASE_URL}${no}` (client/logic/slides.ts getSlidePath) and then pushed
// through a router whose history already carries BASE_URL, so the base gets
// duplicated on every navigation (/Signed-RF/Signed-RF/2 -> 404) whenever the
// deck is deployed under a subpath. Strip the redundant prefix before it
// reaches vue-router. This is a no-op at base '/' and once upstream stops
// prefixing.
export default defineAppSetup(({ router }) => {
  const base = import.meta.env.BASE_URL || '/'
  if (base === '/')
    return

  const fix = (to: any): any => {
    if (typeof to === 'string' && to.startsWith(base))
      return `/${to.slice(base.length)}`
    if (to && typeof to === 'object' && typeof to.path === 'string' && to.path.startsWith(base))
      return { ...to, path: `/${to.path.slice(base.length)}` }
    return to
  }

  const push = router.push.bind(router)
  const replace = router.replace.bind(router)
  router.push = (to: any) => push(fix(to))
  router.replace = (to: any) => replace(fix(to))
})
