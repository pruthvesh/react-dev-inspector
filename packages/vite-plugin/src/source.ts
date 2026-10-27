import { transformWithSourceMap } from '@react-dev-inspector/babel-plugin'
import type { Plugin } from 'vite'

export interface InspectorSourceOptions {
  /**
   * What the stamped paths are relative to. The editor endpoint resolves them against the dev
   * server's `process.cwd()`, so only change this if that is not the project root.
   * @default process.cwd()
   */
  cwd?: string;
  /** more patterns to leave alone; `node_modules/` is always left alone */
  excludes?: (string | RegExp)[];
}

const JSX_FILE = /\.[jt]sx$/
const QUERY = /\?.*$/
const VIRTUAL_MODULE_PREFIX = '\0'

/**
 * Stamps each JSX element in the app's own `.jsx` / `.tsx` files with its file, line and column
 * (`data-inspector-*` attributes), which is how the inspector finds a component's source on React 19,
 * where fibers no longer carry it.
 *
 * It does what `@react-dev-inspector/babel-plugin` does under `@vitejs/plugin-react`'s `babel`
 * option, but without needing Babel in the app's toolchain: `@vitejs/plugin-react` 6 on Vite 8 has no
 * Babel step, and the JSX is compiled by whatever plugin runs after this one. Dev server only.
 */
export const inspectorSource = (options: InspectorSourceOptions = {}): Plugin => ({
  name: 'react-dev-inspector:source',
  enforce: 'pre',
  apply: 'serve',
  transform(code, id) {
    const filePath = id.replace(QUERY, '')
    if (filePath.startsWith(VIRTUAL_MODULE_PREFIX) || !JSX_FILE.test(filePath))
      return null

    try {
      const result = transformWithSourceMap({
        ...options.cwd === undefined ? {} : { rootPath: options.cwd },
        filePath,
        sourceCode: code,
        options: { excludes: ['node_modules/', ...options.excludes ?? []] },
      })
      return result.map === null ? null : { code: result.code, map: result.map }
    }
    catch (error) {
      // A dev tool must never break the app it inspects: leave the file as it was and say why.
      const reason = error instanceof Error ? error.message : String(error)
      this.warn(`react-dev-inspector: could not stamp ${filePath}: ${reason}`)
      return null
    }
  },
})
