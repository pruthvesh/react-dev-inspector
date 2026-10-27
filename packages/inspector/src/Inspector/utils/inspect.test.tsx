import { act, version } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import { getElementFiber } from './fiber'
import { getCodeInfoFromDebugSource, getElementCodeInfo, getElementInspect } from './inspect'

// React 19 no longer puts the source of a JSX element on its fiber (`_debugSource` is gone), so the
// inspector finds it in the `data-inspector-*` props that a compiler plugin stamps on the element.
// These tests render with the real React and read the real fibers.

;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const stamp = (line: number, column: number, relativePath = 'src/Page.tsx') => ({
  'data-inspector-line': String(line),
  'data-inspector-column': String(column),
  'data-inspector-relative-path': relativePath,
})

function Card(props: Record<string, string>) {
  // `props` carries the stamp of the <Card /> element; the card's own markup is not stamped.
  void props
  return (
    <div id='card'>
      <h2 id='card-title'>Title</h2>
      <p>Body</p>
    </div>
  )
}

describe('inspector on React 19', () => {
  let container: HTMLElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = (element: React.ReactNode): void => {
    act(() => root.render(element))
  }
  const byId = (id: string): Element => {
    const element = container.querySelector(`#${id}`)
    if (!element)
      throw new Error(`no element #${id}`)
    return element
  }

  it('is running against React 19', () => {
    expect(version).toMatch(/^19\./)
  })

  it('finds the file, line and column of a stamped element, without a fiber _debugSource', () => {
    render(<main><section id='stamped' {...stamp(12, 7)}><span /></section></main>)

    const fiber = getElementFiber(byId('stamped'))

    expect(fiber).toBeDefined()
    expect(getCodeInfoFromDebugSource(fiber)).toBeUndefined()
    expect(getElementCodeInfo(byId('stamped'))).toEqual({
      lineNumber: '12',
      columnNumber: '7',
      relativePath: 'src/Page.tsx',
    })
  })

  it('finds where a component was used, from an element inside it', () => {
    render(<main><Card {...stamp(30, 5, 'src/Dashboard.tsx')} /></main>)

    expect(getElementCodeInfo(byId('card'))).toEqual({
      lineNumber: '30',
      columnNumber: '5',
      relativePath: 'src/Dashboard.tsx',
    })
  })

  it('names the component an element belongs to', () => {
    render(<main><Card {...stamp(30, 5)} /></main>)

    expect(getElementInspect(byId('card')).name).toBe('Card')
  })

  it('finds nothing for an element nothing stamped', () => {
    render(<main id='plain'><p id='unstamped'>hi</p></main>)

    expect(getElementCodeInfo(byId('unstamped'))).toBeUndefined()
  })
})
