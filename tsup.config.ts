import { defineConfig } from "tsup";
 
export default defineConfig({
  entry: {

    'index': "src/index.ts",
    'index-browser': 'src/index-browser.ts',
    'index-node': 'src/index-node.ts',
    'index-get-traces': 'src/index-get-traces.ts',
    'index-schemas': 'src/index-schemas.ts',
    'index-react': 'src/index-react.ts',
  },
  publicDir: false,
  clean: true,
  minify: false,
  target: ['esnext'],
  external: [
    'zod'
  ],
  format: ['esm'], 
  dts: true
});

