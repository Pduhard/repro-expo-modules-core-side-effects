# expo-modules-core: `sideEffects` misses the web file that loads the polyfill

```js
// package.json
"sideEffects": ["*.fx.ts", "*.fx.js", "./src/polyfill/*.ts", "./build/polyfill/*.js"]

// src/ensureNativeModulesAreInstalled.ts (web)
import './polyfill';
export function ensureNativeModulesAreInstalled(): void {}

// src/EventEmitter.ts
ensureNativeModulesAreInstalled();
const EventEmitter = globalThis.expo.EventEmitter;
```

- `ensureNativeModulesAreInstalled.ts` exists on web only to load the polyfill, but `sideEffects` declares it pure.
- Rolldown trusts that: the empty call goes, then the module, then the polyfill it imports.
- `EventEmitter.ts` reads `globalThis.expo` before anything sets it.

## Run

```sh
npm install
node repro.mjs
```

- Bundles `import { EventEmitter } from "expo-modules-core"` for web, then runs it in Node.
- `published`: the package as on npm. `fixed`: the same package with `./src/ensureNativeModulesAreInstalled.ts` and `./build/ensureNativeModulesAreInstalled.js` added to `sideEffects`.

## Result

```
expo-modules-core 57.0.23  rolldown 1.2.14  published FAIL Cannot read properties of undefined (reading 'EventEmitter')
expo-modules-core 57.0.23  rolldown 1.2.14  fixed     OK   EventEmitter is a function
expo-modules-core 57.0.23  esbuild          published OK   EventEmitter is a function
expo-modules-core 57.0.23  esbuild          fixed     OK   EventEmitter is a function
expo-modules-core 58.0.18  rolldown 1.2.14  published FAIL Cannot read properties of undefined (reading 'EventEmitter')
expo-modules-core 58.0.18  rolldown 1.2.14  fixed     OK   EventEmitter is a function
expo-modules-core 58.0.18  esbuild          published BUILD ... No matching export in ".../build/ts-declarations/EventEmitter.js" for import "EventEmitter"
expo-modules-core 58.0.18  esbuild          fixed     BUILD ... No matching export in ".../build/ts-declarations/EventEmitter.js" for import "EventEmitter"
```

- esbuild keeps the polyfill only because it does not drop the empty call.
- The 58 esbuild error is unrelated: `ts-declarations/global.ts` imports type-only names as values. `shimMissingExports` hides the same error from Rolldown here.

## Related

- rolldown/rolldown#11219
