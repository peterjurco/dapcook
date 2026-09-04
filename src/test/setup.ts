import '@testing-library/jest-dom'

// jsdom doesn't implement ResizeObserver. Components that measure their own
// size (RecipeTagStrip, and @dnd-kit/sortable internally) need at least a
// no-op so mounting them doesn't throw; tests don't need it to actually fire.
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).ResizeObserver = ResizeObserverMock

// jsdom has no real layout engine, so offsetWidth/clientWidth are always 0.
// That breaks components which measure available space to decide what fits
// (e.g. RecipeTagStrip) — with everything at 0 width, only the first item
// would ever "fit". Stub generous non-zero defaults; individual tests can
// still override via Object.defineProperty on a specific element.
// Guarded: files using `@vitest-environment node` (API route tests) run
// this same setup file without HTMLElement existing at all.
if (typeof HTMLElement !== 'undefined') {
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 60 })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 2000 })
}
