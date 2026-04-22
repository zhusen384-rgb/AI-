const { createServer } = require('http');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT || process.env.DEPLOY_RUN_PORT || 3000);

// 创建 Next.js 应用（不指定 hostname，让它自动监听所有接口）
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(async (req, res) => {
    const hostHeader = req.headers.host || '';
    const shouldRedirectToLocalhost =
      dev &&
      (hostHeader === '0.0.0.0' || hostHeader.startsWith('0.0.0.0:'));

    try {
      if (shouldRedirectToLocalhost) {
        const redirectUrl = `http://localhost:${port}${req.url || '/'}`;
        res.statusCode = 307;
        res.setHeader('Location', redirectUrl);
        res.end(`Redirecting to ${redirectUrl}`);
        return;
      }

      // 处理请求（让 Next.js 自动设置正确的 Content-Type）
      await handle(req, res);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  })
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, '0.0.0.0', () => {
      console.log(`> Ready on http://localhost:${port} (listening on 0.0.0.0:${port})`);
    });
});
