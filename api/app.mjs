import {readFile} from 'node:fs/promises';import {createHash,createHmac,timingSafeEqual} from 'node:crypto';import {handlePostgres} from '../postgres.mjs';
const hash=s=>createHash('sha256').update(String(s)).digest();
export function authorized(header,env=process.env){if(!env.ADMIN_PASSWORD||env.ADMIN_PASSWORD.length<12)return false;if(!header||!header.startsWith('Basic ')||header.length>4096)return false;try{const text=Buffer.from(header.slice(6),'base64').toString('utf8'),split=text.indexOf(':');if(split<0)return false;const user=text.slice(0,split),password=text.slice(split+1);return timingSafeEqual(hash(user),hash(env.ADMIN_USER||'admin'))&&timingSafeEqual(hash(password),hash(env.ADMIN_PASSWORD));}catch{return false}}
const cookieName='emel_session';const sessionSeconds=30*24*60*60;
export function createSession(env=process.env,now=Date.now()){const payload=Buffer.from(JSON.stringify({user:env.ADMIN_USER||'admin',expires:now+sessionSeconds*1000})).toString('base64url');const signature=createHmac('sha256',env.ADMIN_PASSWORD).update(payload).digest('base64url');return payload+'.'+signature}
export function sessionAuthorized(cookie,env=process.env,now=Date.now()){if(!env.ADMIN_PASSWORD||env.ADMIN_PASSWORD.length<12)return false;try{const token=String(cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);if(!token||token.length>1024)return false;const parts=token.split('.');if(parts.length!==2)return false;const expected=createHmac('sha256',env.ADMIN_PASSWORD).update(parts[0]).digest('base64url');if(!timingSafeEqual(hash(expected),hash(parts[1])))return false;const data=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));return data.user===(env.ADMIN_USER||'admin')&&Number.isFinite(data.expires)&&data.expires>now;}catch{return false}}
const sendJson=(res,value,status=200)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(value));};
let cachedHtml,cachedLogin;let database;
async function loginPage(){if(!cachedLogin){cachedHtml ||=await readFile(new URL('../public/index.html',import.meta.url),'utf8');const logo=cachedHtml.match(/<div class="brand-logo"><img src="([^"]+)"/)?.[1]||'';cachedLogin=(await readFile(new URL('../public/login.html',import.meta.url),'utf8')).replace('__LOGO__',logo);}return cachedLogin}

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');
 if(!process.env.ADMIN_PASSWORD||process.env.ADMIN_PASSWORD.length<12){res.statusCode=503;res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<html lang="ar" dir="rtl"><meta charset="utf-8"><h1>لوحة أمل الطفولة قيد التجهيز</h1><p>يجب إعداد كلمة مرور الإدارة قبل إتاحة الموقع.</p></html>');return;}
 const base='https://'+req.headers.host;const url=new URL(req.url,base);const path=url.searchParams.get('path');if(path)url.pathname='/api/'+path;else if(url.pathname==='/api/app')url.pathname='/';url.searchParams.delete('path');
 if(['POST','PUT','DELETE'].includes(req.method)&&req.headers.origin&&req.headers.origin!==url.origin){sendJson(res,{error:'طلب غير مسموح'},403);return;}
 if(url.pathname==='/api/login'){
 if(req.method!=='POST'){sendJson(res,{error:'غير مسموح'},405);return;}
 if(!String(req.headers['content-type']||'').startsWith('application/json')){sendJson(res,{error:'طلب غير صالح'},415);return;}
 let input;try{input=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{sendJson(res,{error:'طلب غير صالح'},400);return;}
 if(!input||typeof input.username!=='string'||typeof input.password!=='string'||input.username.length>256||input.password.length>1024){sendJson(res,{error:'بيانات الدخول غير صالحة'},400);return;}
 const credentials='Basic '+Buffer.from(input.username+':'+input.password).toString('base64');
 if(!authorized(credentials)){sendJson(res,{error:'اسم المستخدم أو كلمة المرور غير صحيحة'},401);return;}
 res.setHeader('Set-Cookie',cookieName+'='+createSession()+'; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age='+sessionSeconds);sendJson(res,{ok:true});return;
 }
 if(url.pathname==='/api/logout'){if(req.method!=='POST'){sendJson(res,{error:'غير مسموح'},405);return;}res.setHeader('Set-Cookie',cookieName+'=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');sendJson(res,{ok:true});return;}
 if(!sessionAuthorized(req.headers.cookie)&&!authorized(req.headers.authorization)){
 if(url.pathname.startsWith('/api/')){sendJson(res,{error:'يرجى تسجيل الدخول'},401);return;}
 res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');res.end(req.method==='HEAD'?'':await loginPage());return;
 }
 if(url.pathname.startsWith('/api/')){
 if(!process.env.DATABASE_URL&&!process.env.POSTGRES_URL){res.statusCode=503;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify({error:'قاعدة البيانات غير مرتبطة بعد'}));return;}
 try{if(!database){const {neon}=await import('@neondatabase/serverless');database=neon(process.env.DATABASE_URL||process.env.POSTGRES_URL);}
 let body=req.body;if(body&&typeof body!=='string')body=JSON.stringify(body);if(body&&Buffer.byteLength(body)>65536){res.statusCode=413;res.end();return;}
 const request=new Request(url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:body});const result=await handlePostgres(request,database);res.statusCode=result.status;for(const [key,value] of result.headers)res.setHeader(key,value);res.end(await result.text());return;
 }catch(e){console.error('Service unavailable:',e.code||e.name);res.statusCode=503;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify({error:'تعذر الاتصال بقاعدة البيانات الآن'}));return;}
 }
 if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;res.end();return;}
 cachedHtml ||=await readFile(new URL('../public/index.html',import.meta.url),'utf8');res.setHeader('Content-Type','text/html; charset=utf-8');res.end(req.method==='HEAD'?'':cachedHtml);
}
