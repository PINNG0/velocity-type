import { defineConfig } from 'vite';

// Recebe eventos de diagnóstico do navegador e os imprime no terminal do npm run dev.
function velocityDebugTerminal() {
    return {
        name: 'velocity-debug-terminal',
        configureServer(server) {
            server.middlewares.use('/__velocity-debug', (req, res) => {
                if (req.method !== 'POST') {
                    res.statusCode = 405;
                    res.end('POST only');
                    return;
                }
                let body = '';
                req.on('data', chunk => {
                    body += chunk;
                    if (body.length > 8192) req.destroy();
                });
                req.on('end', () => {
                    try {
                        const entry = JSON.parse(body || '{}');
                        const event = String(entry.event || 'event').slice(0, 80);
                        const details = { ...entry };
                        delete details.event;
                        delete details.at;
                        console.log(`\n[Velocity debug ${new Date().toLocaleTimeString()}] ${event}`, details);
                        res.statusCode = 204;
                        res.end();
                    } catch {
                        res.statusCode = 400;
                        res.end('Invalid JSON');
                    }
                });
            });
        }
    };
}

// base './' => o build funciona em qualquer subpasta/host estático (GitHub Pages, itch.io, etc.).
export default defineConfig({ base: './', plugins: [velocityDebugTerminal()] });
