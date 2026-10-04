import {readFile} from 'node:fs/promises';import {createHash,timingSafeEqual} from 'node:crypto';import {handlePostgres} from '../postgres.mjs';
const hash=s=>createHash('sha256').update(String(s)).digest();
export function authorized(header,env=process.env){if(!env.ADMIN_PASSWORD||env.ADMIN_PASSWORD.length<12)return false;if(!header||!header.startsWith('Basic ')||header.length>4096)return false;try{const text=Buffer.from(header.slice(6),'base64').toString('utf8'),split=text.indexOf(':');if(split<0)return false;const user=text.slice(0,split),password=text.slice(split+1);return timingSafeEqual(hash(user),hash(env.ADMIN_USER||'admin'))&&timingSafeEqual(hash(password),hash(env.ADMIN_PASSWORD));}catch{return false}}
let cachedHtml;let database;
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');
 if(!process.env.ADMIN_PASSWORD||process.env.ADMIN_PASSWORD.length<12){res.statusCode=503;res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<html lang="ar" dir="rtl"><meta charset="utf-8"><h1>لوحة أمل الطفولة قيد التجهيز</h1><p>يجب إعداد كلمة مرور الإدارة قبل إتاحة الموقع.</p></html>');return;}
 if(!authorized(req.headers.authorization)){res.statusCode=401;res.setHeader('WWW-Authenticate','Basic realm="Amal Childhood", charset="UTF-8"');res.end('Sign in required');return;}
 const base='https://'+req.headers.host;const url=new URL(req.url,base);const path=url.searchParams.get('path');if(path)url.pathname='/api/'+path;else if(url.pathname==='/api/app')url.pathname='/';url.searchParams.delete('path');
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
