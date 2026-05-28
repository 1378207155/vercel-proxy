// api/proxy.js
export default async function handler(req, res) {
  // 1. 处理 CORS 跨域预检 (OPTIONS)
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    return res.status(204).end();
  }

  // 2. 获取目标 URL (支持 ?url= 参数)
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing ?url= parameter', usage: '/?url=https://example.com' });
  }

  let targetURL;
  try {
    targetURL = new URL(targetUrl);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  // 3. 生成随机 IP (核心：Vercel 出口不会强制覆盖它)
  const fakeIp = Array.from({length: 4}, () => Math.floor(Math.random() * 254) + 1).join('.');

  // 4. 构造请求头
  const headers = new Headers();
  
  // 透传安全的客户端请求头
  const allowedHeaders = ['accept', 'accept-language', 'authorization', 'cache-control', 'content-type', 'referer'];
  for (const key of allowedHeaders) {
    if (req.headers[key]) headers.set(key, req.headers[key]);
  }
  
  // 【高匿核心】强制伪造 IP 和 Host
  headers.set('X-Forwarded-For', fakeIp);
  headers.set('X-Real-IP', fakeIp);
  headers.set('Host', targetURL.hostname);
  
  // 伪装现代浏览器 (如果客户端没传 UA)
  if (!req.headers['user-agent']) {
    headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
  } else {
    headers.set('User-Agent', req.headers['user-agent']);
  }

  try {
    // 5. 发起请求 (Vercel Node 18+ 原生支持 fetch)
    const response = await fetch(targetURL.toString(), {
      method: req.method,
      headers: headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body), // 简单处理 POST body
      redirect: 'follow'
    });

    // 6. 设置 CORS 响应头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    
    // 7. 透传目标站的响应头 (剔除会导致乱码的编码头)
    response.headers.forEach((value, key) => {
      if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    // 8. 返回数据流
    res.status(response.status);
    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));

  } catch (error) {
    res.status(500).json({ error: 'Proxy failed', message: error.message });
  }
}