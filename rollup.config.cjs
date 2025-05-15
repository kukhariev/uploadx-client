const typescript = require("@rollup/plugin-typescript");
const { nodeResolve } = require("@rollup/plugin-node-resolve");
const commonjs = require("@rollup/plugin-commonjs");
const terser = require("@rollup/plugin-terser");

module.exports = [

  // Browser UMD version
  {
    input: "src/browser.ts",
    output: {
      file: "lib/browser/index.js",
      format: "umd",
      name: "UploadxClient",
      sourcemap: true,
      globals: {
        axios: "axios",
      },
      exports: "default",
    },
    external: ["axios"],
    plugins: [
      typescript({
        tsconfig: "./tsconfig.browser.json",
        sourceMap: true,
      }),
      nodeResolve({
        browser: true,
      }),
      commonjs(),
    ],
  },
  // Minified browser UMD version
  {
    input: "src/browser.ts",
    output: {
      file: "lib/browser/index.min.js",
      format: "umd",
      name: "UploadxClient",
      sourcemap: true,
      globals: {
        axios: "axios",
      },
      exports: "default",
    },
    external: ["axios"],
    plugins: [
      typescript({
        tsconfig: "./tsconfig.browser.json",
        sourceMap: true,
      }),
      nodeResolve({
        browser: true,
      }),
      commonjs(),
      terser(),
    ],
  },
  // Browser UMD version with bundled axios
  {
    input: "src/browser.ts",
    output: {
      file: "lib/browser/index.bundled.js",
      format: "umd",
      name: "UploadxClient",
      sourcemap: true,
      exports: "default",
    },
    plugins: [
      typescript({
        tsconfig: "./tsconfig.browser.json",
        sourceMap: true,
      }),
      nodeResolve({
        browser: true,
      }),
      commonjs(),
    ],
  },
  // Minified browser UMD version with bundled axios
  {
    input: "src/browser.ts",
    output: {
      file: "lib/browser/index.bundled.min.js",
      format: "umd",
      name: "UploadxClient",
      sourcemap: true,
      exports: "default",
    },
    plugins: [
      typescript({
        tsconfig: "./tsconfig.browser.json",
        sourceMap: true,
      }),
      nodeResolve({
        browser: true,
      }),
      commonjs(),
      terser(),
    ],
  },
];