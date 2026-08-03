import { describe, it, expect } from 'vitest'
import { makeCacheKey, createRequestCoordinator, createCache, rangeFor } from './dashboardData.js'

describe('makeCacheKey', () => {
  it('is stable regardless of param key order', () => {
    expect(makeCacheKey('m', { a: 1, b: 2 })).toBe(makeCacheKey('m', { b: 2, a: 1 }))
  })
  it('differs by metric and by params', () => {
    expect(makeCacheKey('m', { a: 1 })).not.toBe(makeCacheKey('m', { a: 2 }))
    expect(makeCacheKey('m', { a: 1 })).not.toBe(makeCacheKey('n', { a: 1 }))
  })
})

describe('request coordinator — de-duplication', () => {
  it('shares one in-flight fetcher call for the same key', async () => {
    const c = createRequestCoordinator()
    let calls = 0
    let resolveFetch
    const fetcher = () => { calls++; return new Promise((r) => { resolveFetch = r }) }

    const p1 = c.run('k', fetcher)
    const p2 = c.run('k', fetcher)
    expect(p1).toBe(p2)                 // same promise handed back
    expect(c.inflightCount()).toBe(1)

    await Promise.resolve()             // let the scheduled fetcher run
    expect(calls).toBe(1)              // fetcher invoked exactly once

    resolveFetch('done')
    await p1
    expect(c.inflightCount()).toBe(0)  // cleared after settle

    c.run('k', fetcher)                 // a fresh run after settle calls again
    await Promise.resolve()
    expect(calls).toBe(2)
  })
})

describe('request coordinator — stale-response guard', () => {
  it('marks only the newest sequence for a key as fresh', () => {
    const c = createRequestCoordinator()
    const s1 = c.issue('k')
    const s2 = c.issue('k')
    expect(c.isFresh('k', s1)).toBe(false)  // older response must be dropped
    expect(c.isFresh('k', s2)).toBe(true)
  })
  it('tracks sequences per key independently', () => {
    const c = createRequestCoordinator()
    const a = c.issue('a')
    const b = c.issue('b')
    expect(c.isFresh('a', a)).toBe(true)
    expect(c.isFresh('b', b)).toBe(true)
  })
})

describe('cache', () => {
  it('honors TTL', () => {
    const cache = createCache()
    cache.set('k', 42)
    expect(cache.get('k', 10_000).value).toBe(42)
    expect(cache.get('k', -1)).toBeUndefined() // already older than a negative ttl
  })
})

describe('rangeFor', () => {
  it('all-time has no bounds; ytd starts on Jan 1', () => {
    const all = rangeFor('all')
    expect(all.from).toBeNull()
    expect(all.to).toBeNull()
    const ytd = rangeFor('ytd', new Date('2026-06-15T12:00:00Z'))
    expect(ytd.from).toBe('2026-01-01')
  })
})
