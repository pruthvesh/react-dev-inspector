import path from 'path'
import {
  parse,
  type ParserPlugin,
  type ParserOptions,
} from '@babel/parser'
import generate from '@babel/generator'
import traverse from '@babel/traverse'
import type {
  Node,
  JSXOpeningElement,
} from '@babel/types'
import {
  pathMatch,
  doJSXOpeningElement,
} from './visitor'


export interface TransformOptions {
  /** patterns to exclude matched files */
  excludes?: (string | RegExp)[];
  babelPlugins?: ParserPlugin[];
  babelOptions?: ParserOptions;
}

export interface TransformResult {
  code: string;
  /** source map from the stamped code back to the original; `null` when the file was left as it was */
  map: ReturnType<typeof generate>['map'];
}

/**
 * inject line, column, relative-path to JSX html data attribute in source code,
 * and return the source map along with the code, for a bundler plugin to chain
 *
 * @type webpack.loader.Loader
 * ref: https://astexplorer.net  +  @babel/parser
 */
export const transformWithSourceMap = ({
  rootPath = process.cwd(),
  filePath,
  sourceCode,
  options,
}: {
  /**
   * path for project root path
   * @default process.cwd()
   */
  rootPath?: string;
  /**
   * path of source file
   * MUST keep consistent relative or absolute with `rootPath`
   */
  filePath: string;
  sourceCode: string;
  options?: TransformOptions;
}): TransformResult => {
  /**
   * example:
   * rootPath: /home/xxx/project
   * filePath: /home/xxx/project/src/ooo/xxx.js
   * relativePath: src/ooo/xxx.js
   */
  const relativePath = path.relative(rootPath, filePath)

  const isSkip = pathMatch(filePath, options?.excludes)
  if (isSkip) {
    return { code: sourceCode, map: null }
  }

  const ast: Node = parse(sourceCode, {
    sourceType: 'module',
    allowUndeclaredExports: true,
    allowImportExportEverywhere: true,
    plugins: [
      'typescript',
      'jsx',
      'decorators-legacy',
      'classProperties',
      ...options?.babelPlugins ?? [],
    ],
    ...options?.babelOptions,
  })


  /**
   * astexplorer + @babel/parser
   * https://astexplorer.net
   */
  traverse(ast, {
    JSXOpeningElement: {
      enter(path) {
        doJSXOpeningElement(
          path.node as JSXOpeningElement,
          { relativePath },
        )
      },
    },
  })

  const {
    code,
    map,
  } = generate(
    ast,
    {
      decoratorsBeforeExport: true,
      sourceMaps: true,
      sourceFileName: filePath,
    },
    sourceCode,
  )

  return { code, map }
}

/**
 * inject line, column, relative-path to JSX html data attribute in source code
 *
 * @type webpack.loader.Loader
 * ref: https://astexplorer.net  +  @babel/parser
 */
export const transform = (
  params: Parameters<typeof transformWithSourceMap>[0],
): string => transformWithSourceMap(params).code
