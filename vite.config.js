import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    host: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  plugins: [
    {
      name: 'api-dev-middleware',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!req.url.startsWith('/api/')) {
            return next();
          }

          const pathname = req.url.split('?')[0];
          try {
            if (pathname === '/api/books') {
              const mod = await import('./api/books.js');
              return mod.default(req, res);
            }
            if (pathname === '/api/students') {
              const mod = await import('./api/students.js');
              return mod.default(req, res);
            }
            if (pathname === '/api/issues') {
              const mod = await import('./api/issues.js');
              return mod.default(req, res);
            }
            if (pathname === '/api/return') {
              const mod = await import('./api/return.js');
              return mod.default(req, res);
            }
            if (pathname === '/api/reservations') {
              const mod = await import('./api/reservations.js');
              return mod.default(req, res);
            }
            if (pathname === '/api/stats') {
              const mod = await import('./api/stats.js');
              return mod.default(req, res);
            }
            next();
          } catch (err) {
            console.error('API Error in dev server:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message, stack: err.stack }));
          }
        });
      },
    },
  ],
});
