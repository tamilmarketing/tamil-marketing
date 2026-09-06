import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';
import createOrderHandler from './api/create-order.js';
import verifyOrderHandler from './api/verify-order.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  process.env.CASHFREE_APP_ID = env.CASHFREE_APP_ID || process.env.CASHFREE_APP_ID;
  process.env.CASHFREE_SECRET_KEY = env.CASHFREE_SECRET_KEY || process.env.CASHFREE_SECRET_KEY;
  process.env.CASHFREE_ENV = env.CASHFREE_ENV || process.env.CASHFREE_ENV || 'production';

  return {
    plugins: [
      {
        name: 'cashfree-local-api-middleware',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const url = new URL(req.url, `http://${req.headers.host}`);
            if (url.pathname === '/api/create-order') {
              let body = '';
              req.on('data', chunk => body += chunk);
              req.on('end', async () => {
                try {
                  req.body = body ? JSON.parse(body) : {};
                  res.status = (code) => { res.statusCode = code; return res; };
                  res.json = (data) => {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(data));
                  };
                  await createOrderHandler(req, res);
                } catch (e) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: e.message }));
                }
              });
              return;
            }
            if (url.pathname === '/api/verify-order') {
              req.query = Object.fromEntries(url.searchParams);
              res.status = (code) => { res.statusCode = code; return res; };
              res.json = (data) => {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(data));
              };
              await verifyOrderHandler(req, res);
              return;
            }
            next();
          });
        }
      }
    ],
    server: {
      port: 5173,
      host: true
    },
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          admin: resolve(__dirname, 'admin.html')
        }
      }
    }
  };
});
