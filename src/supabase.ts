const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;
const SESSION_KEY = 'pbc_supabase_session_v1';
export type PbcSession = { access_token: string; refresh_token?: string; user: { id: string; email?: string } };
export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);
export function getSession(): PbcSession | null {
  try { const raw = localStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) as PbcSession : null; } catch { return null; }
}
function saveSession(session: PbcSession | null) { if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session)); else localStorage.removeItem(SESSION_KEY); }
async function authRequest(path: string, body: unknown): Promise<PbcSession> {
  if (!supabaseConfigured) throw new Error('Supabase environment variables are missing.');
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY! }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.msg || data.message || data.error_description || data.error || 'Authentication failed.');
  if (!data.access_token || !data.user) throw new Error('Account created. Please verify your email, then sign in.');
  const session: PbcSession = { access_token: data.access_token, refresh_token: data.refresh_token, user: data.user };
  saveSession(session); return session;
}
export const signIn = (email: string, password: string) => authRequest('token?grant_type=password', { email, password });
export const signUp = (email: string, password: string) => authRequest('signup', { email, password });
export function signOut() { saveSession(null); }
export async function dbRequest<T = any>(table: string, query = '', options: { method?: string; body?: unknown; prefer?: string } = {}): Promise<T> {
  const session = getSession();
  if (!session) throw new Error('Please sign in to access the shared project database.');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query ? `?${query}` : ''}`, {
    method: options.method || 'GET',
    headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', ...(options.prefer ? { Prefer: options.prefer } : {}) },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
  });
  const text = await response.text();
  if (!response.ok) { let message = text; try { const parsed = JSON.parse(text); message = parsed.message || parsed.hint || parsed.details || text; } catch {} throw new Error(message || `Database request failed (${response.status}).`); }
  return (text ? JSON.parse(text) : null) as T;
}
export async function replaceImportedRows(rowsBySheet: Record<string, Record<string, any>[]>) {
  const modules: Record<string,string> = {
    'Task list-Civil':'work_orders','Task list-MEP':'work_orders','Over all Project Task ':'other',
    'Contract Financial Details':'payments','Monthly Payment ':'payments','Quarterly Payment ':'payments',
    'Project Risk':'risks','Project Issue':'issues','Project Change Request ':'change_requests',
    'NCR Summary':'ncr','Upcoming_Deadlines':'deadlines','Stakeholder_Satisfaction':'client_satisfaction'
  };
  for (const [sheet, rows] of Object.entries(rowsBySheet)) {
    if (!rows.length) continue;
    const module = modules[sheet] || 'other';
    await dbRequest('project_records', `source_sheet=eq.${encodeURIComponent(sheet)}`, { method: 'DELETE' });
    const payload = rows.map((data, index) => ({ module, record_key: String(data['Work Order'] || data['WO Number'] || data.ID || data['Field ID'] || `${sheet}-${index+1}`), discipline: sheet.endsWith('Civil') ? 'Civil' : sheet.endsWith('MEP') ? 'MEP' : null, status: String(data.Status || data.STATUS || data['STATUS Rev 0'] || ''), source_sheet: sheet, source_row: index + 1, data, is_imported: true }));
    for (let i=0; i<payload.length; i+=400) await dbRequest('project_records', '', { method: 'POST', body: payload.slice(i,i+400), prefer: 'return=minimal' });
  }
}
export async function loadImportedRows() {
  return dbRequest<any[]>('project_records', 'select=id,module,source_sheet,source_row,data,discipline,status,is_imported,asset_id,record_key,record_date,created_at,updated_at&is_imported=eq.true&order=source_row.asc');
}
export async function loadAllProjectRecords() {
  return dbRequest<any[]>('project_records', 'select=*&order=created_at.desc');
}
export async function saveProjectRecord(record: Record<string, any>, id?: string) {
  if (id) return dbRequest<any[]>('project_records', `id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: record, prefer: 'return=representation' });
  return dbRequest<any[]>('project_records', '', { method: 'POST', body: record, prefer: 'return=representation' });
}
export async function deleteProjectRecord(id: string) {
  return dbRequest('project_records', `id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', prefer: 'return=minimal' });
}
