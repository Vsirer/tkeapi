/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

// https://vite.dev/config/
// Docker: VITE_API_TARGET=http://backend:3000；本地多实例由 dev 脚本注入
const apiTarget = process.env.VITE_API_TARGET || 'http://127.0.0.1:3000'
const frontendPort = Number(process.env.FRONTEND_PORT || process.env.VITE_PORT || 5173) || 5173

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      {
        name: 'vite-plugin-deps-fallback',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url && req.url.includes('/node_modules/.vite/deps/')) {
              const cleanUrl = req.url.split('?')[0];
              const fileName = path.basename(cleanUrl);
              const depsDir = path.resolve(__dirname, 'node_modules/.vite/deps');
              const targetPath = path.join(depsDir, fileName);

              if (!fs.existsSync(targetPath)) {
                const prefixMatch = fileName.match(/^([a-zA-Z0-9_-]+-)[a-zA-Z0-9_]+\.js$/);
                if (prefixMatch) {
                  const prefix = prefixMatch[1];
                  try {
                    const existing = fs.readdirSync(depsDir).find(f => f.startsWith(prefix) && f.endsWith('.js'));
                    if (existing) {
                      req.url = req.url.replace(fileName, existing);
                    }
                  } catch (e) {}
                }
              }
              res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            }
            next();
          });
        },
      },
      react(),
      tailwindcss(),
    ],
    define: {
      'import.meta.env.VITE_ENABLE_PLUGINS': JSON.stringify(
        env.VITE_ENABLE_PLUGINS ?? 'true'
      ),
    },
    server: {
      host: '0.0.0.0',
      port: frontendPort,
      strictPort: Boolean(process.env.FRONTEND_PORT || process.env.VITE_PORT),
      watch: {
        usePolling: true,  // Docker 挂载卷需要轮询监听文件变动
      },
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/v1': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/v2': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/v1beta': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/assets/icons/': {
          target: apiTarget,
          changeOrigin: true,
        },
        // /home/models 由 React 模型广场页面处理，其余 /home 门户页面代理到后端
        '^/home(?:/(?!models(?:[/?#]|$))|$)': {
          target: apiTarget,
          changeOrigin: true,
        },
        // 站点门户增强版公开页（排除 /home-pro/docs 由前端 React 接管）
        '^/home-pro(?:$|/(?!docs(?:/|$)))': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/portal-pro': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/portal': {
          target: apiTarget,
          changeOrigin: true,
        }
      }
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react-router-dom',
        'react-is',
        'antd',
        '@ant-design/icons',
        'dayjs',
        'zustand',
        'axios',
        'lucide-react',
        'recharts',
        'i18next',
        'react-i18next',
        'react-resizable',
        '@radix-ui/react-popover',
        '@radix-ui/react-dialog',
        '@radix-ui/react-dropdown-menu',
        '@radix-ui/react-select',
        '@radix-ui/react-slider',
        '@radix-ui/react-switch',
        '@radix-ui/react-tooltip',
        '@radix-ui/react-avatar',
        '@radix-ui/react-checkbox',
        'three',
        '@react-three/fiber',
        'html2canvas',
        'jspdf',
      ],
    },
    build: {
      assetsDir: 'static', // 避免默认的 assets 目录与前端路由 /assets 冲突，导致 Nginx 报 403
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('three') || id.includes('@react-three')) {
                return 'three-vendor';
              }
              if (id.includes('recharts') || id.includes('d3-')) {
                return 'recharts-vendor';
              }
              if (id.includes('highlight.js') || id.includes('rehype') || id.includes('remark')) {
                return 'markdown-vendor';
              }
            }
          },
        },
      },
    }
  }
})

