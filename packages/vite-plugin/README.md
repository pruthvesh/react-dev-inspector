## `@react-dev-inspector/vite-plugin`

<a href="https://www.npmjs.com/package/@react-dev-inspector/vite-plugin" target="_blank" rel="noopener noreferrer"><img src="https://badgen.net/npm/v/@react-dev-inspector/vite-plugin" alt="NPM Version" /></a>

[`Vite`](https://vitejs.dev) plugin for [`react-dev-inspector`](https://react-dev-inspector.zthxxx.me)


Docs see: https://react-dev-inspector.zthxxx.me/docs/integration/vite


### Setup

At first install the plugin package:

```bash
npm i -D @react-dev-inspector/vite-plugin
```

The `@react-dev-inspector/vite-plugin` only register a `inspectorServer` for middleware to launch the local editor with an endpoint using [`@react-dev-inspector/middleware`](https://react-dev-inspector.zthxxx.me/docs/integration#inspector-middleware),
that compatible with `vite@8` / `vite@5` / `vite@4` / `vite@3` / `vite@2`.

Just add it into `vite.config.ts` and that's all done.


```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { inspectorServer } from '@react-dev-inspector/vite-plugin'

// https://vitejs.dev/config/
export default defineConfig({
  ...

  plugins: [
    react(),

    /**
     * react-dev-inspector server config for vite
     */
    inspectorServer(),
  ],
})
```

### Vite 8 and `@vitejs/plugin-react` 6 (no Babel)

`@vitejs/plugin-react` 6 on Vite 8 has no Babel step, so the `babel: { plugins: ['@react-dev-inspector/babel-plugin'] }`
option from older setups does not exist. Use `inspectorSource` instead: in the dev server it stamps each JSX element in
your own `.jsx` / `.tsx` files with its file, line and column (`data-inspector-*`), which is how the inspector finds a
component's source on React 19 (React 19 fibers no longer carry `_debugSource`).

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { inspectorServer, inspectorSource } from '@react-dev-inspector/vite-plugin'

export default defineConfig(({ command }) => ({
  plugins: [
    // dev only: neither plugin has any use in a production build
    ...(command === 'serve' ? [inspectorServer(), inspectorSource()] : []),
    react(),
  ],
}))
```

- `inspectorSource` runs before the plugin that compiles JSX (`enforce: 'pre'`) and keeps your TypeScript and JSX as they
  were, with a source map, so any JSX compiler can follow it. It only runs in `serve` (`apply: 'serve'`).
- The stamped paths are relative to `process.cwd()`, the same base the editor endpoint resolves them against
  (`inspectorSource({ cwd })` and `excludes` are available). `node_modules/` is always skipped.
- A file it cannot parse is left as it was and reported as a warning: the inspector never breaks the app's own build.
- Tested against Vite 8 with React 19.3; `inspectorServer` is unchanged and works as before on older Vite.

### Example

Example project code you can find in [examples/vite4](https://github.com/zthxxx/react-dev-inspector/blob/dev/examples/vite4/vite.config.ts),
or see online demo via:

[![Open in StackBlitz](https://raw.githubusercontent.com/zthxxx/react-dev-inspector/dev/docs/components/stack-blitz/open-in-stackblitz.svg)](https://stackblitz.com/github/zthxxx/react-dev-inspector/tree/dev/examples/vite4)
