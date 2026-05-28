// api/proxy.js (套娃高匿版)
export default async function handler(req, res) {
  // 1. 处理 CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    return res.status(204).end();
  }

  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing ?url=' });
  }

  // 2. 核心：使用公共代理池进行“套娃”转发
  // 这里使用 corsproxy.io 作为中间人，彻底切断 Vercel 与目标站的直接联系
  const proxyMiddleman = "https://corsproxy.io/?";
  const finalUrl = proxyMiddleman + encodeURIComponent(targetUrl);

  // 3. 构造请求头 (只传基础头，IP 伪造交给中间人)
  const headers = new Headers();
  headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
  headers.set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
  
  // 透传客户端的 Cookie 和 Authorization (如果需要登录态)
  if (req.headers['cookie']) headers.set('Cookie', req.headers['cookie']);
  if (req.headers['authorization']) headers.set('Authorization', req.headers['authorization']);

  try {
    // 4. Vercel 请求中间人，中间人请求目标站
    const response = await fetch(finalUrl, {
      method: req.method,
      headers: headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
      redirect: 'follow'
    });

    // 5. 设置 CORS 并返回
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    
    response.headers.forEach((value, key) => {
      if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    res.status(response.status);
    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));

  } catch (error) {
    res.status(500).json({ error: 'Proxy chain failed', message: error.message });
  }
}
