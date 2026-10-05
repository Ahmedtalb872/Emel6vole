import {handleAdminLogin,adminRole} from '../admin-auth.mjs';
import {handleAssociationChat} from '../association-chat.mjs';
import {readFile} from 'node:fs/promises';import {handleSupabase,supabaseStatus} from '../supabase.mjs';import {handleAuth,requestAccessToken,refreshSession,applySession,clearSession} from '../supabase-auth.mjs';
const pages=new Map();
export default async function handler(req,res,fetcher=fetch){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');
 const url=new URL(req.url,'https://'+req.headers.host);const path=url.searchParams.get('path');if(path)url.pathname='/api/'+path;else if(url.pathname==='/api/app')url.pathname='/';const pageHint=url.searchParams.get('page');if(!path&&pageHint==='dashboard')url.pathname='/dashboard';else if(!path&&pageHint==='admin')url.pathname='/admin';else if(!path&&pageHint==='admin-login')url.pathname='/admin/login';else if(!path&&pageHint==='visitors')url.pathname='/';else if(!path&&pageHint==='profile')url.pathname='/profile';else if(!path&&pageHint==='account')url.pathname='/account';
 if(url.pathname.startsWith('/api/')){
 let body=req.body;if(body&&typeof body!=='string')body=JSON.stringify(body);if(body&&Buffer.byteLength(body)>65536){res.statusCode=413;res.end();return;}const request=new Request(url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:body});
 let result;
 if(url.pathname==='/api/admin/login')result=await handleAdminLogin(request,fetcher);
 else if(url.pathname==='/api/association-chat')result=await handleAssociationChat(request);
 else if(url.pathname.startsWith('/api/auth/'))result=await handleAuth(request);
 else if(url.pathname==='/api/supabase/status'&&req.method==='GET')result=await supabaseStatus();
 else{
 let token=requestAccessToken(request),session,clear=false;
 if(!token){try{session=await refreshSession(request);token=session?.access_token;}catch{clear=true;}}
 const authenticatedRequest=()=>{const headers=new Headers(request.headers);if(token)headers.set('authorization','Bearer '+token);return new Request(url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:body});};
 result=await handleSupabase(authenticatedRequest());
 if(result.status===401&&token){try{session=await refreshSession(request);if(session?.access_token){token=session.access_token;result=await handleSupabase(authenticatedRequest());}else clear=true;}catch{clear=true;}}
 if(session)applySession(result,session);else if(clear)clearSession(result);
 }
 res.statusCode=result.status;for(const [k,v] of result.headers)if(k!=='set-cookie')res.setHeader(k,v);const cookies=result.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);res.end(await result.text());return;
 }
 if(['/dashboard','/dashboard/'].includes(url.pathname)){res.statusCode=302;res.setHeader('Location','/admin');res.end();return;}
 if(['/admin','/admin/'].includes(url.pathname)){
 const request=new Request(url,{headers:req.headers});let token=requestAccessToken(request),session;
 const redirect=()=>{res.statusCode=302;res.setHeader('Location','/admin/login');res.end();};
 try{if(!token){session=await refreshSession(request,fetcher);token=session?.access_token;}if(!token){redirect();return;}let role;try{role=await adminRole(token,fetcher)}catch(error){if(error.status!==401)throw error;session=await refreshSession(request,fetcher);if(!session?.access_token){redirect();return;}token=session.access_token;role=await adminRole(token,fetcher)}if(!role){res.statusCode=403;res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<html lang="ar" dir="rtl"><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><body style="font:16px/2 Arial;padding:30px"><h1>هذه الصفحة مخصصة لإدارة الجمعية</h1><p>حسابك لا يملك صلاحية الدخول إلى لوحة الإدارة.</p><a href="/">موقع الجمعية</a> · <a href="/profile">ملفي</a> · <a href="/admin/login">دخول الإدارة</a></body></html>');return;}if(session){const response=applySession(new Response(),session);res.setHeader('Set-Cookie',response.headers.getSetCookie());}}
 catch(error){if(error.status===401||error.status===400){redirect();return;}res.statusCode=error.status||503;res.setHeader('Content-Type','text/plain; charset=utf-8');res.end(error.message||'تعذر فتح لوحة الإدارة');return;}
 }
 if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;res.end();return;}
 const page=['/admin/login','/admin/login/'].includes(url.pathname)?'admin-login.html':['/admin','/admin/'].includes(url.pathname)?'index.html':['/profile','/profile/'].includes(url.pathname)?'profile.html':url.pathname==='/dashboard'||url.pathname==='/dashboard/'?'index.html':['/account','/account/'].includes(url.pathname)?'account.html':['/','/visitors','/visitors/'].includes(url.pathname)?'visitors.html':null;if(!page){res.statusCode=404;res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<html lang="ar" dir="rtl"><meta charset="utf-8"><h1>الصفحة غير موجودة</h1><a href="/">العودة إلى الرئيسية</a></html>');return;}if(!pages.has(page))pages.set(page,await readFile(new URL('../public/'+page,import.meta.url),'utf8'));res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');res.end(req.method==='HEAD'?'':pages.get(page));
}
