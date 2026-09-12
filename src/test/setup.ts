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

// Node >=22 defines a global `localStorage` whose methods throw unless the
// process is started with `--localstorage-file`, and that non-functional
// global shadows jsdom's own (working) implementation. Replace it with a
// simple in-memory store so components that read/write localStorage
// (e.g. BirthdayOverlay) can be tested normally.
class MemoryStorage implements Storage {
  private store = new Map<string, string>()
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value))
  }
  removeItem(key: string) {
    this.store.delete(key)
  }
  clear() {
    this.store.clear()
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null
  }
  get length() {
    return this.store.size
  }
}
Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true, writable: true })
