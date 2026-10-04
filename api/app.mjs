import {readFile} from 'node:fs/promises';import {handleSupabase,supabaseStatus} from '../supabase.mjs';
const pages=new Map();
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');
 const url=new URL(req.url,'https://'+req.headers.host);const path=url.searchParams.get('path');if(path)url.pathname='/api/'+path;else if(url.pathname==='/api/app')url.pathname='/';const pageHint=url.searchParams.get('page');if(!path&&pageHint==='dashboard')url.pathname='/dashboard';else if(!path&&pageHint==='visitors')url.pathname='/';
 if(url.pathname.startsWith('/api/')){
 let result;
 if(url.pathname==='/api/supabase/status'&&req.method==='GET')result=await supabaseStatus();
 else{let body=req.body;if(body&&typeof body!=='string')body=JSON.stringify(body);if(body&&Buffer.byteLength(body)>65536){res.statusCode=413;res.end();return;}const request=new Request(url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:body});result=await handleSupabase(request);}
 res.statusCode=result.status;for(const [k,v] of result.headers)res.setHeader(k,v);res.end(await result.text());return;
 }
 if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;res.end();return;}
 const page=url.pathname==='/dashboard'||url.pathname==='/dashboard/'?'index.html':['/','/visitors','/visitors/'].includes(url.pathname)?'visitors.html':null;if(!page){res.statusCode=404;res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<html lang="ar" dir="rtl"><meta charset="utf-8"><h1>الصفحة غير موجودة</h1><a href="/">العودة إلى الرئيسية</a></html>');return;}if(!pages.has(page))pages.set(page,await readFile(new URL('../public/'+page,import.meta.url),'utf8'));res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');res.end(req.method==='HEAD'?'':pages.get(page));
}
