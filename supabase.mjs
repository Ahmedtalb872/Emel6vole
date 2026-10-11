import {readFileSync} from 'node:fs';import {validate} from './core.mjs';
const defaults=JSON.parse(readFileSync(new URL('./supabase.config.json',import.meta.url),'utf8'));
const prefix={income:'REV',expense:'EXP',member:'MEM',worker:'WRK',beneficiary:'BEN',aid:'AID',settings:'SET',patient:'PAT',child:'KID',stock:'STK'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export const GROUPS=[{key:'majlis',name:'المجلس التنفيذي',role:'editor'},{key:'lijan',name:'اللجان المتخصصة',role:'viewer'},{key:'jamiya',name:'الجمعية العامة',role:'viewer'}];
export const groupEmail=key=>'group-'+key+'@accounts.emel6vole.vercel.app';
export function supabaseConfig(env=process.env){return {url:env.SUPABASE_URL||defaults.url,publishableKey:env.SUPABASE_PUBLISHABLE_KEY||defaults.publishableKey};}
export function createSupabaseClient(config=supabaseConfig(),accessToken='',fetcher=fetch){
 const origin=new URL(config.url);if(origin.protocol!=='https:'||!origin.hostname.endsWith('.supabase.co'))throw Error('عنوان Supabase غير صالح');
 return {async request(path,options={}){const headers={apikey:config.publishableKey,'content-type':'application/json',...options.headers};if(accessToken)headers.Authorization='Bearer '+accessToken;let response;try{response=await fetcher(new URL(path,origin),{...options,headers,signal:AbortSignal.timeout(15000)});}catch{const e=Error('تعذر الاتصال بمشروع Supabase الآن');e.status=503;throw e;}let data=null;const text=await response.text();if(text){try{data=JSON.parse(text)}catch{data=null;}}
 if(!response.ok){const e=Error(['42P01','PGRST205'].includes(data?.code)?'جداول الجمعية لم تُجهز في Supabase بعد':response.status===401?'جلسة Supabase غير صالحة أو منتهية':response.status===403?'لا توجد صلاحية للوصول إلى سجلات الجمعية':data?.code==='P0001'?'تعذر حفظ السجل: تحقق من بيانات الحالة وارتباط المساعدات بها':'تعذر تنفيذ العملية في Supabase');e.status=['42P01','PGRST205'].includes(data?.code)?503:response.status;e.code=typeof data?.code==='string'?data.code:undefined;throw e;}return data;
 }};
}
export async function supabaseStatus(fetcher=fetch){try{await createSupabaseClient(supabaseConfig(),'',fetcher).request('/rest/v1/');return json({configured:true,reachable:true,projectHost:new URL(supabaseConfig().url).hostname});}catch(e){return json({configured:true,reachable:false,error:e.message},e.status||503)}}
export async function handleSupabase(req,fetcher=fetch){const url=new URL(req.url);const origin=req.headers.get('origin');if(req.method!=='GET'&&origin&&origin!==url.origin)return json({error:'طلب غير مسموح'},403);
 const token=req.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];if(!token){if(req.method==='GET'&&url.pathname==='/api/records')return json({records:[],preview:true});if(req.method==='GET'&&url.pathname==='/api/audit')return json({results:[],preview:true});return json({error:'هذه معاينة للواجهة. حفظ بيانات فعلية يحتاج جلسة Supabase لحساب مصرح له.'},401);}
 try{
 const client=createSupabaseClient(supabaseConfig(),token,fetcher);const user=await client.request('/auth/v1/user');if(!user?.id)return json({error:'جلسة غير صالحة'},401);
 if(url.pathname==='/api/profile'){
 const rows=await client.request('/rest/v1/emel_profiles?select=payload,created_at&user_id=eq.'+encodeURIComponent(user.id));
 const profile=rows?.[0]?{...rows[0].payload,joinedAt:rows[0].created_at}:null;
 const phone=user.user_metadata?.login_phone||user.phone||'';
 if(req.method==='GET')return json({id:user.id,phone,profile});
 if(req.method!=='PUT')return json({error:'غير مسموح'},405);
 const input=await req.json();if(!input||typeof input!=='object'||Array.isArray(input))return json({error:'بيانات غير صالحة'},400);
 const data={};for(const [key,max] of Object.entries({name:120,residence:180,profession:120,interests:700,notes:700})){if(input[key]!==undefined&&typeof input[key]!=='string')return json({error:'بيانات غير صالحة'},400);data[key]=(input[key]||'').trim();if(data[key].length>max)return json({error:'بعض المعلومات أطول من الحد المسموح'},400);}
 if(!data.name||!data.residence)return json({error:'أدخل الاسم الكامل ومحل الإقامة'},400);
 data.photo=input.photo||'';if(typeof data.photo!=='string'||data.photo.length>25000||(data.photo&&!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/=]+$/.test(data.photo)))return json({error:'الصورة غير صالحة أو كبيرة جدًا'},400);
 const saved=await client.request('/rest/v1/emel_profiles?on_conflict=user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({user_id:user.id,payload:data})});
 if(!saved?.[0])return json({error:'تعذر حفظ الملف'},409);
 return json({ok:true,id:user.id,phone,profile:{...saved[0].payload,joinedAt:saved[0].created_at}});
 }
 const members=await client.request('/rest/v1/emel_memberships?select=role&user_id=eq.'+encodeURIComponent(user.id));const role=members?.[0]?.role;if(!role){if(req.method==='GET'&&url.pathname==='/api/records')return json({records:[],preview:true,access:'pending',authenticated:true});if(req.method==='GET'&&url.pathname==='/api/audit')return json({results:[],preview:true,access:'pending'});return json({error:'الحساب غير مصرح له بالوصول إلى سجلات الجمعية'},403);}
 if(url.pathname==='/api/team'||url.pathname.startsWith('/api/team/')){
 if(role!=='owner')return json({error:'إدارة حسابات التشكيلة للرئيس (المالك) فقط'},403);
 const rpc=(name,args={})=>client.request('/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify(args)});
 try{
 if(url.pathname==='/api/team'&&req.method==='GET'){const rows=await rpc('emel_group_list')||[];return json({groups:GROUPS.map(g=>{const r=rows.find(x=>x.email===groupEmail(g.key));return {...g,exists:Boolean(r),active:Boolean(r?.active),role:r?.role||g.role}})})}
 if(req.method!=='POST')return json({error:'غير مسموح'},405);
 const input=await req.json();const g=GROUPS.find(x=>x.key===input?.key);if(!g)return json({error:'الحساب غير موجود'},404);const email=groupEmail(g.key),action=url.pathname.slice('/api/team/'.length);
 const pass=()=>typeof input.password==='string'&&input.password.length>=6&&input.password.length<=72;const roleOk=['editor','viewer'].includes(input.role);
 if(action==='activate'){if(!pass())return json({error:'اختر كلمة مرور من 6 أحرف على الأقل'},400);if(!roleOk)return json({error:'الصلاحية غير صالحة'},400);
  const {authRequest}=await import('./supabase-auth.mjs');let created=false;try{await authRequest('/auth/v1/signup',{email,password:input.password,data:{group:g.key}},fetcher);created=true}catch(e){if(e.code!=='user_already_exists')throw e}
  if(!created)await rpc('emel_group_set_password',{p_email:email,p_password:input.password});
  await rpc('emel_group_activate',{p_email:email,p_role:input.role,p_name:g.name});return json({ok:true})}
 if(action==='password'){if(!pass())return json({error:'اختر كلمة مرور من 6 أحرف على الأقل'},400);await rpc('emel_group_set_password',{p_email:email,p_password:input.password});return json({ok:true})}
 if(action==='role'){if(!roleOk)return json({error:'الصلاحية غير صالحة'},400);await rpc('emel_group_activate',{p_email:email,p_role:input.role,p_name:g.name});return json({ok:true})}
 if(action==='deactivate'){await rpc('emel_group_deactivate',{p_email:email});return json({ok:true})}
 return json({error:'غير موجود'},404);
 }catch(e){if(e.code==='PGRST202'||e.code==='42883')return json({error:'حسابات التشكيلة تحتاج تطبيق db/team.sql في Supabase مرة واحدة'},503);if(e.code==='P0002')return json({error:'فعّل الحساب أولًا بكلمة مرور'},400);throw e}
 }
 if(url.pathname==='/api/membership-requests'||url.pathname.startsWith('/api/membership-requests/')){
 const notReady=e=>['42703','PGRST202','PGRST204'].includes(e.code)?json({error:'طلبات الانتساب تحتاج تطبيق db/membership-requests.sql في Supabase مرة واحدة'},503):null;
 if(url.pathname==='/api/membership-requests'){if(req.method!=='GET')return json({error:'غير مسموح'},405);try{const rows=await client.request('/rest/v1/emel_profiles?select=user_id,name:payload->>name,residence:payload->>residence,profession:payload->>profession,interests:payload->>interests,notes:payload->>notes,status,created_at,reviewed_at&order=created_at.desc&limit=1000');return json({requests:rows,canReview:['owner','editor'].includes(role)});}catch(e){const r=notReady(e);if(r)return r;throw e;}}
 const target=url.pathname.slice('/api/membership-requests/'.length);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target))return json({error:'طلب الانتساب غير موجود'},404);
 if(req.method!=='POST')return json({error:'غير مسموح'},405);if(!['owner','editor'].includes(role))return json({error:'مراجعة طلبات الانتساب تحتاج صلاحية مسؤول أو محرر'},403);
 const input=await req.json();if(!['approved','rejected','pending'].includes(input?.decision))return json({error:'القرار غير صالح'},400);
 try{const row=await client.request('/rest/v1/rpc/emel_review_profile',{method:'POST',body:JSON.stringify({target,decision:input.decision})});return json({ok:true,status:row?.status||input.decision,reviewed_at:row?.reviewed_at||null});}catch(e){const r=notReady(e);if(r)return r;if(e.code==='P0002')return json({error:'طلب الانتساب غير موجود'},404);throw e;}
 }
 if(url.pathname==='/api/records'&&req.method==='GET'){const rows=[];for(let offset=0;offset<100000;offset+=1000){const chunk=await client.request('/rest/v1/emel_records?select=id,kind,payload&deleted=eq.false&order=id.desc&limit=1000&offset='+offset);rows.push(...chunk);if(chunk.length<1000)return json({records:rows.map(r=>({...r.payload,id:r.id,kind:r.kind,code:prefix[r.kind]+'-'+String(r.id).padStart(6,'0')})),preview:false,role});}return json({error:'عدد السجلات كبير جدًا للعرض دفعة واحدة'},503);}
 if(url.pathname==='/api/audit'&&req.method==='GET'){const rows=await client.request('/rest/v1/emel_audit?select=id,record_id,action,created_at&order=id.desc&limit=100');return json({results:rows.map(r=>({...r,at:r.created_at}))});}
 const match=url.pathname.match(/^\/api\/records(?:\/(\d+))?$/);if(!match)return json({error:'غير موجود'},404);if(!['POST','PUT','DELETE'].includes(req.method))return json({error:'غير مسموح'},405);if(!['owner','editor'].includes(role))return json({error:'الحساب يملك صلاحية الاطلاع فقط'},403);
 const id=match[1]?Number(match[1]):null;if(id&&!Number.isSafeInteger(id))return json({error:'رقم السجل غير صالح'},400);let previous;if(id){previous=(await client.request('/rest/v1/emel_records?select=id,kind,payload&deleted=eq.false&id=eq.'+id))[0];if(!previous)return json({error:'السجل غير موجود'},404);}
 if(req.method==='DELETE'){if(!id)return json({error:'حدد السجل المطلوب'},400);await client.request('/rest/v1/emel_records?id=eq.'+id,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({deleted:true})});return json({ok:true});}
 if((req.method==='PUT'&&!id)||(req.method==='POST'&&id))return json({error:'طلب غير صالح'},400);
 const input=await req.json();const kind=previous?.kind||input.kind;let payload;try{payload=validate(kind,input.data);}catch(e){return json({error:e.message},400)}delete payload.id;delete payload.kind;delete payload.code;const beneficiaryId=kind==='aid'?Number(payload.beneficiaryId):null;if(kind==='aid'){if(!Number.isSafeInteger(beneficiaryId)||beneficiaryId<1)return json({error:'رقم المستفيد غير صالح'},400);payload.beneficiaryId=beneficiaryId;}
 const body=id?{payload,beneficiary_id:beneficiaryId}:{kind,payload,beneficiary_id:beneficiaryId};const rows=await client.request('/rest/v1/emel_records'+(id?'?id=eq.'+id:''),{method:id?'PATCH':'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(body)});if(!rows?.[0])return json({error:'تعذر حفظ السجل'},409);return json({ok:true,id:rows[0].id},id?200:201);
 }catch(e){return json({error:e.message||'تعذر الوصول إلى قاعدة البيانات'},e.status||503)}
}
