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
export const signUp = (email: string, password: string) => authRequest('signup', { email, password, options:{emailRedirectTo:window.location.origin} });
export async function resendConfirmation(email:string) {
  if(!supabaseConfigured)throw new Error('Supabase environment variables are missing.');
  const response=await fetch(`${SUPABASE_URL}/auth/v1/resend`,{method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_KEY!},body:JSON.stringify({type:'signup',email,options:{emailRedirectTo:window.location.origin}})});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||data.msg||data.error_description||'Could not resend confirmation email.');return true;
}
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
    'Contract Financial Details':'payments','Payment Certificates':'payments','Monthly Payment ':'payments','Quarterly Payment ':'payments',
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

export type PbcAttachment = { id: string; record_id?: string | null; asset_id?:string; file_name: string; storage_path: string; mime_type?: string; description?: string; uploaded_at?: string; signed_url?: string };
const STORAGE_BUCKET = 'pbc-attachments';
export async function uploadRecordAttachment(recordId: string, file: File, description = ''): Promise<PbcAttachment> {
  const session = getSession();
  if (!session) throw new Error('Please sign in before uploading attachments.');
  if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name}: maximum file size is 25 MB.`);
  const safeName = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
  const path = `${session.user.id}/${recordId}/${crypto.randomUUID()}-${safeName}`;
  const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST', headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${session.access_token}`, 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' }, body: file
  });
  if (!upload.ok) { const t = await upload.text(); throw new Error(`File upload failed: ${t}`); }
  try {
    const rows = await dbRequest<PbcAttachment[]>('record_attachments', '', { method: 'POST', prefer: 'return=representation', body: { record_id: recordId, file_name: file.name, storage_path: path, mime_type: file.type || null, description: description || null, uploaded_by: session.user.id } });
    return rows[0];
  } catch (e) {
    await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'DELETE', headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${session.access_token}` } });
    throw e;
  }
}
export async function loadRecordAttachments(recordId: string): Promise<PbcAttachment[]> {
  const rows = await dbRequest<PbcAttachment[]>('record_attachments', `select=*&record_id=eq.${encodeURIComponent(recordId)}&order=uploaded_at.asc`);
  return Promise.all(rows.map(async item => ({ ...item, signed_url: await getAttachmentSignedUrl(item.storage_path) })));
}
export async function getAttachmentSignedUrl(path: string): Promise<string> {
  const session = getSession();
  if (!session) throw new Error('Please sign in to open attachments.');
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${STORAGE_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST', headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 3600 })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error || 'Could not create attachment link.');
  return `${SUPABASE_URL}/storage/v1${data.signedURL.startsWith('/') ? data.signedURL : `/${data.signedURL}`}`;
}

export async function loadUserProfile() {
  const session=getSession(); if(!session) return null;
  const rows=await dbRequest<any[]>('user_profiles',`select=user_id,display_name,role&user_id=eq.${encodeURIComponent(session.user.id)}&limit=1`);
  return rows[0]||null;
}
export async function loadAuditLogs(limit=250) {
  return dbRequest<any[]>('audit_logs',`select=*&order=changed_at.desc&limit=${limit}`);
}
export async function loadProjectSettings() {
  const rows=await dbRequest<any[]>('project_settings','select=key,value');
  return Object.fromEntries(rows.map(r=>[r.key,r.value]));
}
export async function saveProjectSetting(key:string,value:any) {
  return dbRequest<any[]>('project_settings','on_conflict=key', {method:'POST',body:{key,value},prefer:'resolution=merge-duplicates,return=representation'});
}
export async function deleteRecordAttachment(id:string) {
  const session=getSession(); if(!session) throw new Error('Please sign in to delete attachments.');
  const rows=await dbRequest<PbcAttachment[]>('record_attachments',`select=id,storage_path&id=eq.${encodeURIComponent(id)}&limit=1`);
  const item=rows[0]; if(!item) return;
  const path=item.storage_path.split('/').map(encodeURIComponent).join('/');
  const removed=await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`,{method:'DELETE',headers:{apikey:SUPABASE_KEY!,Authorization:`Bearer ${session.access_token}`}});
  if(!removed.ok) throw new Error(`Storage delete failed: ${await removed.text()}`);
  await dbRequest('record_attachments',`id=eq.${encodeURIComponent(id)}`,{method:'DELETE',prefer:'return=minimal'});
}

export async function loadWorkspaceUsers() {
  return dbRequest<any[]>('rpc/pbc_admin_user_list','',{method:'POST',body:{}});
}
export async function setWorkspaceUserRole(userId:string,role:string) {
  return dbRequest('rpc/pbc_admin_set_user_role','',{method:'POST',body:{p_user_id:userId,p_role:role}});
}

export async function loadSharedAssets() {
  return dbRequest<any[]>('assets','select=*&order=asset_name.asc');
}
export async function saveSharedAsset(asset:Record<string,any>,id?:string) {
  if(id) return dbRequest<any[]>('assets',`id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:asset,prefer:'return=representation'});
  return dbRequest<any[]>('assets','on_conflict=asset_key',{method:'POST',body:asset,prefer:'resolution=merge-duplicates,return=representation'});
}
export async function deleteSharedAsset(id:string) {
  return dbRequest('assets',`id=eq.${encodeURIComponent(id)}`,{method:'DELETE',prefer:'return=minimal'});
}

export async function loadAssetAttachments(assetId:string):Promise<PbcAttachment[]> {
  const rows=await dbRequest<PbcAttachment[]>('record_attachments',`select=*&asset_id=eq.${encodeURIComponent(assetId)}&order=uploaded_at.asc`);
  return Promise.all(rows.map(async item=>({...item,signed_url:await getAttachmentSignedUrl(item.storage_path)})));
}
export async function uploadAssetAttachment(assetId:string,file:File):Promise<PbcAttachment> {
  const session=getSession();if(!session)throw new Error('Please sign in before uploading attachments.');
  if(file.size>25*1024*1024)throw new Error(`${file.name}: maximum file size is 25 MB.`);
  const safeName=file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-');
  const path=`${session.user.id}/assets/${assetId}/${crypto.randomUUID()}-${safeName}`;
  const url=`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
  const upload=await fetch(url,{method:'POST',headers:{apikey:SUPABASE_KEY!,Authorization:`Bearer ${session.access_token}`,'Content-Type':file.type||'application/octet-stream','x-upsert':'false'},body:file});
  if(!upload.ok)throw new Error(`File upload failed: ${await upload.text()}`);
  try{const rows=await dbRequest<PbcAttachment[]>('record_attachments','',{method:'POST',prefer:'return=representation',body:{asset_id:assetId,file_name:file.name,storage_path:path,mime_type:file.type||null,uploaded_by:session.user.id}});return {...rows[0],signed_url:await getAttachmentSignedUrl(path)}}catch(e){await fetch(url,{method:'DELETE',headers:{apikey:SUPABASE_KEY!,Authorization:`Bearer ${session.access_token}`}});throw e}
}

export async function loadAttachmentsForRecords(recordIds:string[]):Promise<PbcAttachment[]> {
  const ids=Array.from(new Set(recordIds.filter(Boolean)));if(!ids.length)return [];
  const rows=await dbRequest<PbcAttachment[]>('record_attachments',`select=*&record_id=in.(${ids.join(',')})&order=uploaded_at.asc`);
  return Promise.all(rows.map(async item=>({...item,signed_url:await getAttachmentSignedUrl(item.storage_path)})));
}

export async function loadAttachmentsForAssets(assetIds:string[]):Promise<PbcAttachment[]> {
  const ids=Array.from(new Set(assetIds.filter(Boolean)));if(!ids.length)return [];
  const rows=await dbRequest<PbcAttachment[]>('record_attachments',`select=*&asset_id=in.(${ids.join(',')})&order=uploaded_at.asc`);
  return Promise.all(rows.map(async item=>({...item,signed_url:await getAttachmentSignedUrl(item.storage_path)})));
}
export async function resetPassword(email: string) {
  if (!supabaseConfigured) {
    throw new Error('Supabase environment variables are missing.');
  }

  const redirectTo = 'https://pbc-project-control-management.vercel.app/';

  const response = await fetch(
    ${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)},
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY!
      },
      body: JSON.stringify({ email })
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.msg ||
      data.message ||
      data.error_description ||
      'Could not send password recovery email.'
    );
  }

  return true;
}
