import { defineConfig } from "tsup";
 
export default defineConfig({
  entry: {

    'index': "src/index.ts",
    'index-browser': 'src/index-browser.ts',
    'index-node': 'src/index-node.ts',
    'index-get-traces': 'src/index-get-traces.ts',
  },
  publicDir: false,
  clean: true,
  minify: false,
  target: ['esnext'],
  external: [],
  format: ['esm'], 
  dts: true
});

