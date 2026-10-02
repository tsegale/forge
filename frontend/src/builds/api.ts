import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { api, unwrap, type components } from '@/api/client'
import { ApiError } from '@/api/errors'
import { withSession } from '@/auth/session'
import type { Draft } from './draft'

export type BuildDetail = components['schemas']['BuildDetail']
export type CompatibilityReport = components['schemas']['CompatibilityReport']

/** Live check of an unsaved parts list; keeps the last report on screen while the next loads. */
export const compatibilityQuery = (parts: [number, number][]) =>
  queryOptions({
    queryKey: ['compatibility', parts],
    queryFn: () =>
      unwrap(
        api.POST('/api/v1/compatibility/check', {
          body: { items: parts.map(([product_id, quantity]) => ({ product_id, quantity })) },
        }),
      ),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })

export const buildsQuery = queryOptions({
  queryKey: ['builds'],
  queryFn: () => withSession(() => unwrap(api.GET('/api/v1/builds'))),
})

export const buildQuery = (buildId: number) =>
  queryOptions({
    queryKey: ['builds', buildId],
    queryFn: () =>
      withSession(() =>
        unwrap(api.GET('/api/v1/builds/{build_id}', { params: { path: { build_id: buildId } } })),
      ),
  })

const getBuild = (build_id: number) =>
  unwrap(api.GET('/api/v1/builds/{build_id}', { params: { path: { build_id } } }))

/** The linked build, or null if it is gone (deleted, or saved under another account). */
async function getLinked(build_id: number): Promise<BuildDetail | null> {
  try {
    return await getBuild(build_id)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

/**
 * Make the server build match the draft and return it. A draft without a build, or linked to
 * one that has since been ordered (ordered builds are frozen), gets a new build. The sync is a
 * diff against the server's current items, so repeating it after a partial failure is safe.
 * Removals go first so a replacement never trips the per-kind slot limit.
 */
export function saveDraft(draft: Draft): Promise<BuildDetail> {
  return withSession(async () => {
    let build: BuildDetail | null = draft.buildId === null ? null : await getLinked(draft.buildId)
    if (build?.status === 'ordered') build = null
    build ??= await unwrap(api.POST('/api/v1/builds', { body: { name: draft.name } }))
    const build_id = build.id
    if (build.name !== draft.name) {
      await unwrap(
        api.PATCH('/api/v1/builds/{build_id}', {
          params: { path: { build_id } },
          body: { name: draft.name },
        }),
      )
    }

    const wanted = new Map(draft.items.map((item) => [item.product.id, item.quantity]))
    const existing = new Map(build.items.map((item) => [item.product.id, item]))
    for (const item of build.items) {
      if (!wanted.has(item.product.id)) {
        await unwrap(
          api.DELETE('/api/v1/builds/{build_id}/items/{item_id}', {
            params: { path: { build_id, item_id: item.id } },
          }),
        )
      }
    }
    for (const [product_id, quantity] of wanted) {
      const item = existing.get(product_id)
      if (item && item.quantity !== quantity) {
        await unwrap(
          api.PATCH('/api/v1/builds/{build_id}/items/{item_id}', {
            params: { path: { build_id, item_id: item.id } },
            body: { quantity },
          }),
        )
      } else if (!item) {
        await unwrap(
          api.POST('/api/v1/builds/{build_id}/items', {
            params: { path: { build_id } },
            body: { product_id, quantity },
          }),
        )
      }
    }
    return getBuild(build_id)
  })
}

export function validateBuild(build_id: number) {
  return withSession(() =>
    unwrap(api.POST('/api/v1/builds/{build_id}/validate', { params: { path: { build_id } } })),
  )
}

export function deleteBuild(build_id: number) {
  return withSession(() =>
    unwrap(api.DELETE('/api/v1/builds/{build_id}', { params: { path: { build_id } } })),
  )
}
