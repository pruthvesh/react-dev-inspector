import path from 'node:path'
import type { Plugin, TransformPluginContext } from 'vite'
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { inspectorSource } from './source'

const cwd = '/project'
const tsx = [
  'export function App<T extends string>({ items }: { items: T[] }) {',
  '  return <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>',
  '}',
  '',
].join('\n')

interface Output { code: string; map: { sources: string[] } }

/** runs the plugin's transform hook the way Vite does: with a plugin context that can warn */
function run(plugin: Plugin, code: string, id: string): { output: Output | null; warn: ReturnType<typeof vi.fn> } {
  const warn = vi.fn()
  const hook = plugin.transform
  if (typeof hook !== 'function')
    throw new TypeError('the plugin has no transform function')
  const output = hook.call({ warn } as unknown as TransformPluginContext, code, id) as Output | null
  return { output, warn }
}

describe('inspectorSource', () => {
  it('runs in dev only, and before the plugin that compiles JSX', () => {
    const plugin = inspectorSource()

    expect(plugin.apply).toBe('serve')
    expect(plugin.enforce).toBe('pre')
  })

  it('stamps a tsx file with its line, column and path relative to the cwd', () => {
    const { output } = run(inspectorSource({ cwd }), tsx, path.join(cwd, 'src/App.tsx'))

    expect(output?.code).toContain('data-inspector-relative-path="src/App.tsx"')
    expect(output?.code).toContain('<ul data-inspector-line="2" data-inspector-column="9"')
  })

  it('keeps TypeScript generics and JSX, for the next plugin to compile', () => {
    const { output } = run(inspectorSource({ cwd }), tsx, path.join(cwd, 'src/App.tsx'))

    expect(output?.code).toContain('<T extends string>')
    expect(output?.code).toContain('<li')
  })

  it('returns a source map for the file', () => {
    const id = path.join(cwd, 'src/App.tsx')
    const { output } = run(inspectorSource({ cwd }), tsx, id)

    expect(output?.map.sources).toEqual([id])
  })

  it('stamps a jsx file, and ignores the query Vite adds to a module id', () => {
    const { output } = run(inspectorSource({ cwd }), 'export const a = <p />\n', `${cwd}/src/a.jsx?t=170`)

    expect(output?.code).toContain('data-inspector-relative-path="src/a.jsx"')
  })

  it.each([
    ['a ts file', `${cwd}/src/util.ts`],
    ['a js file', `${cwd}/src/util.js`],
    ['a css file', `${cwd}/src/app.css`],
    ['a virtual module', '\0virtual:thing.tsx'],
    ['a dependency', `${cwd}/node_modules/lib/index.tsx`],
  ])('leaves %s alone', (_name, id) => {
    const { output, warn } = run(inspectorSource({ cwd }), tsx, id)

    expect(output).toBeNull()
    expect(warn).not.toHaveBeenCalled()
  })

  it('leaves a file alone when it matches an exclude pattern', () => {
    const plugin = inspectorSource({ cwd, excludes: [/\/generated\//] })

    expect(run(plugin, tsx, `${cwd}/src/generated/Api.tsx`).output).toBeNull()
    expect(run(plugin, tsx, `${cwd}/src/App.tsx`).output).not.toBeNull()
  })

  it('warns and leaves the file alone when it cannot be parsed, so the app still builds', () => {
    const { output, warn } = run(inspectorSource({ cwd }), 'const = <', `${cwd}/src/Broken.tsx`)

    expect(output).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('src/Broken.tsx')
  })
})
