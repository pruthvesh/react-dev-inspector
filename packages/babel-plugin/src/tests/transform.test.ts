import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { transform, transformWithSourceMap } from '../transform'

const rootPath = '/project'
const filePath = path.join(rootPath, 'src/App.tsx')
const sourceCode = [
  'export function App({ items }: { items: string[] }) {',
  '  return <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>',
  '}',
  '',
].join('\n')

describe('transformWithSourceMap', () => {
  it('stamps every JSX element with its line, column and path relative to the root', () => {
    const { code } = transformWithSourceMap({ rootPath, filePath, sourceCode })

    expect(code).toContain('data-inspector-relative-path="src/App.tsx"')
    expect(code).toContain('<ul data-inspector-line="2" data-inspector-column="9"')
    expect(code).toContain('<li data-inspector-line="2"')
  })

  it('keeps TypeScript and JSX syntax, so a later plugin compiles them', () => {
    const { code } = transformWithSourceMap({ rootPath, filePath, sourceCode })

    expect(code).toContain('items: string[]')
    expect(code).toContain('<ul')
  })

  it('returns a source map that names the original file', () => {
    const { map } = transformWithSourceMap({ rootPath, filePath, sourceCode })

    expect(map?.sources).toEqual([filePath])
    expect(map?.mappings).not.toBe('')
  })

  it('leaves an excluded file as it was, without a map', () => {
    const result = transformWithSourceMap({
      rootPath,
      filePath: '/project/node_modules/lib/index.tsx',
      sourceCode,
      options: { excludes: ['node_modules/'] },
    })

    expect(result).toEqual({ code: sourceCode, map: null })
  })

  it('gives the same code as transform', () => {
    const { code } = transformWithSourceMap({ rootPath, filePath, sourceCode })

    expect(code).toBe(transform({ rootPath, filePath, sourceCode }))
  })

  it('throws on code it cannot parse, naming nothing private', () => {
    expect(() => transformWithSourceMap({ rootPath, filePath, sourceCode: 'const = <' })).toThrow()
  })
})
