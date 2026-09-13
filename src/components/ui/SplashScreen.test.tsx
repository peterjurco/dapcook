import { afterEach, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { SplashScreen, SPLASH_GATE_SCRIPT, SPLASH_SESSION_KEY } from './SplashScreen'

function runGateScript() {
  // eslint-disable-next-line no-new-func
  new Function(SPLASH_GATE_SCRIPT)()
}

afterEach(() => {
  sessionStorage.clear()
  document.documentElement.removeAttribute('data-splash')
})

describe('SplashScreen gate script', () => {
  it('shows the splash and sets the session flag on first load', () => {
    runGateScript()

    expect(sessionStorage.getItem(SPLASH_SESSION_KEY)).toBe('1')
    expect(document.documentElement.getAttribute('data-splash')).toBeNull()
  })

  it('skips the splash on a later load in the same session', () => {
    sessionStorage.setItem(SPLASH_SESSION_KEY, '1')

    runGateScript()

    expect(document.documentElement.getAttribute('data-splash')).toBe('skip')
  })

  it('falls back to showing the splash if sessionStorage throws', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'sessionStorage')
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        getItem() {
          throw new Error('blocked')
        },
        setItem() {
          throw new Error('blocked')
        },
      },
    })

    expect(runGateScript).not.toThrow()
    expect(document.documentElement.getAttribute('data-splash')).toBeNull()

    Object.defineProperty(window, 'sessionStorage', original!)
  })
})

describe('SplashScreen markup', () => {
  it('renders the dap/cook lockup hidden from assistive tech', () => {
    const { container } = render(<SplashScreen />)

    const overlay = container.querySelector('#dapcook-splash')
    expect(overlay).not.toBeNull()
    expect(overlay).toHaveAttribute('aria-hidden', 'true')
    expect(overlay!.querySelectorAll('.splash-letter')).toHaveLength(3)
    expect(overlay!.querySelector('.splash-tile')).toHaveTextContent('d')
    expect(overlay!.querySelector('.splash-word')).toHaveTextContent('dapcook')
  })
})
