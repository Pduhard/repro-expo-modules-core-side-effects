import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { build as esbuild } from "esbuild";
import { build as viteBuild, version as viteVersion } from "vite";
import { rolldown, VERSION } from "rolldown";

const cwd = import.meta.dirname;
const packages = ["expo-modules-core", "expo-modules-core-58"];
const extensions = [".web.ts", ".web.tsx", ".web.js", ".ts", ".tsx", ".js"];

async function fix(pkg) {
  const fixed = `${cwd}/node_modules/.fixed/${pkg}`;
  await rm(fixed, { recursive: true, force: true });
  await cp(`${cwd}/node_modules/${pkg}`, fixed, { recursive: true });
  const manifest = JSON.parse(await readFile(`${fixed}/package.json`, "utf8"));
  manifest.sideEffects.push(
    "./src/ensureNativeModulesAreInstalled.ts",
    "./build/ensureNativeModulesAreInstalled.js",
  );
  await writeFile(`${fixed}/package.json`, JSON.stringify(manifest, null, 2));
  return fixed;
}

const bundlers = {
  [`rolldown ${VERSION}`]: async (pkg, outfile) => {
    const bundle = await rolldown({
      input: `${cwd}/entry.js`,
      cwd,
      logLevel: "silent",
      platform: "browser",
      tsconfig: false,
      shimMissingExports: true,
      external: [/^react(-dom)?(\/|$)/, /^react-native-web/],
      resolve: { alias: { "expo-modules-core": pkg, "react-native": "react-native-web" }, extensions },
    });
    await bundle.write({ file: outfile, format: "esm" });
    await bundle.close();
  },
  [`vite ${viteVersion}`]: async (pkg, outfile) => {
    await viteBuild({
      root: cwd,
      configFile: false,
      logLevel: "silent",
      resolve: { alias: { "expo-modules-core": pkg, "react-native": "react-native-web" }, extensions },
      build: {
        outDir: dirname(outfile),
        emptyOutDir: false,
        minify: false,
        lib: { entry: `${cwd}/entry.js`, formats: ["es"], fileName: () => basename(outfile) },
        rolldownOptions: { external: [/^react(-dom)?(\/|$)/, /^react-native-web/], shimMissingExports: true },
      },
    });
  },
  "esbuild": async (pkg, outfile) => {
    await esbuild({
      entryPoints: [`${cwd}/entry.js`],
      outfile,
      bundle: true,
      format: "esm",
      platform: "browser",
      logLevel: "silent",
      external: ["react", "react-dom", "react-native-web"],
      alias: { "expo-modules-core": pkg, "react-native": "react-native-web" },
      resolveExtensions: extensions,
    });
  },
};

for (const name of packages) {
  const { version } = JSON.parse(await readFile(`${cwd}/node_modules/${name}/package.json`, "utf8"));
  const variants = [["published", `${cwd}/node_modules/${name}`], ["fixed", await fix(name)]];
  for (const [bundler, build] of Object.entries(bundlers)) {
    for (const [label, pkg] of variants) {
    const outfile = `${cwd}/dist/${version}/${bundler.split(" ")[0]}-${label}.js`;
    delete globalThis.expo;
    globalThis.__DEV__ = true;
    let result;
    try {
      await build(pkg, outfile);
    } catch (error) {
      console.log(`expo-modules-core ${version.padEnd(8)} ${bundler.padEnd(16)} ${label.padEnd(9)} BUILD ${error.message.replace(/\x1b\[[0-9;]*m/g, "").split("\n").filter((line) => line.includes("ERROR"))[0] ?? error.message}`);
      continue;
    }
    try {
      const { kind } = await import(outfile);
      result = `OK   EventEmitter is a ${kind}`;
    } catch (error) {
      result = `FAIL ${error.message}`;
    }
    console.log(`expo-modules-core ${version.padEnd(8)} ${bundler.padEnd(16)} ${label.padEnd(9)} ${result}`);
    }
  }
}
