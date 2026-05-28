// api/proxy.js
export const config = {
  runtime: 'edge', // 使用 Edge Runtime，完美兼容 Web API，速度极快
};

export default async function handler(req) {
  // 1. 处理 CORS 跨域预检 (OPTIONS)
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  }

  const url = new URL(req.url);
  const targetUrl = url.searchParams.get('url');

  // 2. 校验参数
  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing ?url= parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    new URL(targetUrl); // 验证 URL 合法性
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid URL format' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // 3. 核心：拼接 AllOrigins 免费代理接口 (套娃开始)
  // Vercel 只是去请求 AllOrigins，AllOrigins 去请求目标 PHP，彻底切断真实 IP
  const proxyMiddleman = "https://api.allorigins.win/raw?url=";
  const finalUrl = proxyMiddleman + encodeURIComponent(targetUrl);

  try {
    // 4. 发起请求
    const response = await fetch(finalUrl, {
      method: 'GET', 
      headers: {
        // 伪装 UA，防止 AllOrigins 拦截爬虫
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
      }
    });

    // 5. 处理响应头 (透传目标站头信息，并强制开启 CORS)
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    
    // 剔除可能导致乱码或冲突的底层头
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('content-length');
    responseHeaders.delete('transfer-encoding');

    // 6. 直接返回数据流 (Edge Runtime 支持直接 return Response.body)
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });

  } catch (error) {
    // 捕获套娃链路断裂的错误
    return new Response(JSON.stringify({ error: 'Proxy chain failed', message: error.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
