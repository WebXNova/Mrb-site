const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

async function request(path, { method = 'GET', body, token, headers = {} } = {}) {
  const runId = `run-${Date.now()}`;
  const requestUrl = `${API_BASE}${path}`;
  // #region agent log
  fetch('http://127.0.0.1:7905/ingest/eaded629-97a7-47cb-9dfd-e65da1eb1aed',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'02d6a5'},body:JSON.stringify({sessionId:'02d6a5',runId,hypothesisId:'H1',location:'client/src/api/http.js:7',message:'HTTP request started',data:{method,path,apiBase:API_BASE,hasToken:Boolean(token)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  try {
    const response = await fetch(requestUrl, {
      method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    // #region agent log
    fetch('http://127.0.0.1:7905/ingest/eaded629-97a7-47cb-9dfd-e65da1eb1aed',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'02d6a5'},body:JSON.stringify({sessionId:'02d6a5',runId,hypothesisId:'H2',location:'client/src/api/http.js:23',message:'HTTP response received',data:{method,path,status:response.status,ok:response.ok},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      // #region agent log
      fetch('http://127.0.0.1:7905/ingest/eaded629-97a7-47cb-9dfd-e65da1eb1aed',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'02d6a5'},body:JSON.stringify({sessionId:'02d6a5',runId,hypothesisId:'H3',location:'client/src/api/http.js:31',message:'HTTP request failed with non-2xx status',data:{method,path,status:response.status,errorMessage:data?.message||null},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      throw new Error(data.message || 'Request failed');
    }
    return data;
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7905/ingest/eaded629-97a7-47cb-9dfd-e65da1eb1aed',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'02d6a5'},body:JSON.stringify({sessionId:'02d6a5',runId,hypothesisId:'H4',location:'client/src/api/http.js:38',message:'HTTP request threw before response',data:{method,path,errorName:error?.name||null,errorMessage:error?.message||'unknown'},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    throw error;
  }
}

export const http = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
};
