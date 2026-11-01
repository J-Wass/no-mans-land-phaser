import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import path from 'path';
import fs from 'fs';

/**
 * Dev-server-only endpoint the playtest harness (src/testing/TestHarness.ts)
 * uses to write evidence — screenshots, saves, logs — into qa-reports/.
 * Writes are confined to that directory.
 */
function qaReportsPlugin(): Plugin {
  const root = path.resolve(__dirname, 'qa-reports');
  const MAX_BODY = 25 * 1024 * 1024;
  return {
    name: 'qa-reports',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__qa/write', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('POST only'); return; }
        const chunks: Buffer[] = [];
        let size = 0;
        req.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BODY) { res.statusCode = 413; res.end('too large'); req.destroy(); return; }
          chunks.push(chunk);
        });
        req.on('end', () => {
          if (res.writableEnded) return;
          try {
            const { path: rel, content, encoding } = JSON.parse(Buffer.concat(chunks).toString('utf8')) as
              { path: string; content: string; encoding?: 'utf8' | 'base64' };
            const target = path.resolve(root, rel);
            if (!target.startsWith(root + path.sep)) throw new Error('path escapes qa-reports/');
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, Buffer.from(content, encoding === 'base64' ? 'base64' : 'utf8'));
            res.statusCode = 200;
            res.end(path.relative(__dirname, target));
          } catch (err) {
            res.statusCode = 400;
            res.end(String(err));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [qaReportsPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  base: './',
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    minify: 'esbuild',
    sourcemap: false
  }
});
