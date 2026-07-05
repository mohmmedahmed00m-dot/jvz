/**
 * API client — talks to the backend (Section 8 endpoints).
 * - Injects `Authorization: Bearer <access_token>` on every call.
 * - On 401, transparently calls /auth/refresh (using the httpOnly cookie) and
 *   retries the original request once (Section 6.4 session expiry UX).
 * - Refresh tokens never touch JS (httpOnly cookie set by the backend).
 */

const BASE = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let accessToken: string | null = null;
let onAuthFailure: (() => void) | null = null;

export function setAccessToken(t: string | null) { accessToken = t; }
export function getAccessToken() { return accessToken; }
export function setOnAuthFailure(cb: () => void) { onAuthFailure = cb; }

let refreshing: Promise<boolean> | null = null;
async function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
        if (!res.ok) return false;
        const data = await res.json();
        accessToken = data.access_token;
        return true;
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

async function request<T = any>(
  method: string,
  path: string,
  body?: unknown,
  attempt = 0,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });

  if (res.status === 401 && attempt === 0) {
    // Transparent refresh + retry once (Section 6.4).
    const ok = await tryRefresh();
    if (ok) return request<T>(method, path, body, attempt + 1);
    onAuthFailure?.();
    throw new ApiError(401, 'SESSION_EXPIRED', 'Session expired, please log in again');
  }

  const text = await res.text();
  let data: any = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!res.ok) {
    const code = data?.error?.code || 'ERROR';
    const message = data?.error?.message || (typeof data === 'string' ? data : 'Request failed');
    throw new ApiError(res.status, code, message);
  }
  // 204 No Content
  if (res.status === 204) return undefined as T;
  return data as T;
}

export const api = {
  // Auth & Licensing (8.1)
  register: (email: string, password: string) =>
    request<{ user_id: string; access_token: string }>('POST', '/auth/register', { email, password }),
  login: (email: string, password: string) =>
    request<{ user_id: string; access_token: string; license_status: string }>('POST', '/auth/login', { email, password }),
  refresh: () => request<{ access_token: string }>('POST', '/auth/refresh'),
  logout: () => request<void>('POST', '/auth/logout'),
  activateLicense: (license_key: string) =>
    request<{ status: string; activated_at: string }>('POST', '/auth/activate-license', { license_key }),

  // Campaigns (8.2 / 8.3)
  createCampaign: (payload: any) => request<{ campaign_id: string; status: string }>('POST', '/campaigns', payload),
  listCampaigns: (query: Record<string, any>) =>
    request<{ campaigns: any[]; total: number; page: number }>('GET', `/campaigns?${new URLSearchParams(query)}`),
  getCampaign: (id: string) => request<{ campaign: any }>('GET', `/campaigns/${id}`),
  getAssets: (id: string) => request<{ assets: Record<string, any> }>('GET', `/campaigns/${id}/assets`),
  duplicateCampaign: (id: string) => request<{ new_campaign_id: string }>('POST', `/campaigns/${id}/duplicate`),
  deleteCampaign: (id: string) => request<void>('DELETE', `/campaigns/${id}`),
  updateAsset: (id: string, assetType: string, content: string) =>
    request<{ asset: any; version: number; is_manual_edit: boolean }>('PATCH', `/campaigns/${id}/assets/${assetType}`, { content }),
  regenerateAsset: (id: string, assetType: string, custom_instruction?: string) =>
    request<{ asset: any; version: number }>('POST', `/campaigns/${id}/assets/${assetType}/regenerate`, { custom_instruction }),

  // Export (8.4)
  createExport: (id: string, formats: string[], bundle_as_zip: boolean) =>
    request<{ export_id: string; status: string }>('POST', `/campaigns/${id}/export`, { formats, bundle_as_zip }),
  listExports: (id: string) => request<{ exports: any[] }>('GET', `/campaigns/${id}/exports`),
  downloadUrl: (id: string) => `${BASE}/exports/${id}/download`,

  // AI Provider info
  getAiProvider: () => request<{ provider: string; use_real_llm: boolean }>('GET', '/campaigns/ai-provider'),
};

export async function downloadFile(exportId: string) {
  const url = `${BASE}/exports/${exportId}/download`;
  const headers: Record<string, string> = {};
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(url, { headers, credentials: 'include' });
  if (!res.ok) throw new ApiError(res.status, 'DOWNLOAD_FAILED', 'Download failed');

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = `campaign-export.zip`;
  a.click();
  URL.revokeObjectURL(objectUrl);
}
