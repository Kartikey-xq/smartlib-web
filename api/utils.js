export function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.end(JSON.stringify(data));
}

export function sendError(res, statusCode, message, details = null) {
  sendJson(res, statusCode, {
    error: message,
    details: details ? (details.message || details) : null,
  });
}

export async function parseBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON format: ' + err.message));
      }
    });
    req.on('error', reject);
  });
}

export function parseQuery(req) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const query = {};
    for (const [key, value] of url.searchParams.entries()) {
      query[key] = value;
    }
    return query;
  } catch {
    return {};
  }
}
