import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises'
import { createServer as createHttpServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer, type ViteDevServer } from 'vite'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { inspectorServer, inspectorSource } from './index'

// A real Vite dev server, so a Vite release that changes the plugin API fails here, not in a project.

const app = [
  'export function App() {',
  '  return <main><h1>Hello</h1></main>',
  '}',
  '',
].join('\n')

describe('inspector plugins on a Vite dev server', () => {
  let root: string
  let vite: ViteDevServer
  let http: Server
  let editorOutput: string
  const originalCwd = process.cwd()
  const originalEditor = process.env.LAUNCH_EDITOR

  beforeEach(async () => {
    // Resolved, as Vite resolves module ids: the stamped paths are relative to the real cwd.
    root = await realpath(await mkdtemp(path.join(tmpdir(), 'inspector-vite-')))
    await mkdir(path.join(root, 'src'))
    await writeFile(path.join(root, 'src/App.tsx'), app)
    // A stand-in `react`, so the compiled JSX resolves its runtime without installing React.
    const reactDir = path.join(root, 'node_modules/react')
    await mkdir(reactDir, { recursive: true })
    await writeFile(path.join(reactDir, 'package.json'), JSON.stringify({
      name: 'react',
      version: '0.0.0',
      exports: { './jsx-dev-runtime': './jsx-dev-runtime.js', './jsx-runtime': './jsx-runtime.js' },
    }))
    const runtime = 'export const jsxDEV = () => null\nexport const jsx = jsxDEV\nexport const Fragment = null\n'
    await writeFile(path.join(reactDir, 'jsx-dev-runtime.js'), runtime)
    await writeFile(path.join(reactDir, 'jsx-runtime.js'), runtime)
    // a stand-in editor: records the arguments it is started with
    editorOutput = path.join(root, 'editor-args.txt')
    const fakeEditor = path.join(root, 'fake-editor.sh')
    await writeFile(fakeEditor, `#!/bin/sh\nprintf '%s' "$*" > '${editorOutput}'\n`)
    await chmod(fakeEditor, 0o755)
    process.env.LAUNCH_EDITOR = fakeEditor
    // the endpoint resolves the stamped relative paths against the server's cwd
    process.chdir(root)

    vite = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      appType: 'custom',
      server: { middlewareMode: true },
      optimizeDeps: { noDiscovery: true },
      plugins: [inspectorSource(), inspectorServer()],
    })
    http = createHttpServer(vite.middlewares)
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    if (originalEditor === undefined)
      delete process.env.LAUNCH_EDITOR
    else process.env.LAUNCH_EDITOR = originalEditor
    await new Promise((resolve) => http.close(resolve))
    await vite.close()
    await rm(root, { recursive: true, force: true })
  })

  it('serves a component stamped with the file it came from', async () => {
    const result = await vite.transformRequest('/src/App.tsx')

    expect(result?.code).toContain('data-inspector-relative-path')
    expect(result?.code).toContain('"src/App.tsx"')
    expect(result?.code).toContain('data-inspector-line')
  })

  it('opens the editor at the stamped file, line and column', async () => {
    const { port } = http.address() as AddressInfo
    const query = 'fileName=src/App.tsx&lineNumber=2&colNumber=10'

    const response = await fetch(`http://127.0.0.1:${port}/__inspect-open-in-editor?${query}`)

    expect(response.status).toBe(200)
    await vi.waitFor(async () => {
      const args = await readFile(editorOutput, 'utf8')
      // An editor it has no flags for is started with the file, then the line and the column.
      expect(args).toBe(`${path.join(root, 'src/App.tsx')} 2 10`)
    })
  })

  it('refuses to open the editor without a file name', async () => {
    const { port } = http.address() as AddressInfo

    const response = await fetch(`http://127.0.0.1:${port}/__inspect-open-in-editor`)

    expect(response.status).toBe(400)
  })
})
