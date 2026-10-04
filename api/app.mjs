import {readFile} from 'node:fs/promises';
const pages=new Map();
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');
 const url=new URL(req.url,'https://'+req.headers.host);const path=url.searchParams.get('path');if(path)url.pathname='/api/'+path;else if(url.pathname==='/api/app')url.pathname='/';const pageHint=url.searchParams.get('page');if(!path&&pageHint==='dashboard')url.pathname='/dashboard';else if(!path&&pageHint==='visitors')url.pathname='/';
 if(url.pathname.startsWith('/api/')){
 res.setHeader('Content-Type','application/json; charset=utf-8');
 if(req.method==='GET'&&url.pathname==='/api/records'){res.statusCode=200;res.end(JSON.stringify({records:[],preview:true}));return;}
 if(req.method==='GET'&&url.pathname==='/api/audit'){res.statusCode=200;res.end(JSON.stringify({results:[],preview:true}));return;}
 res.statusCode=503;res.end(JSON.stringify({error:'هذه معاينة للواجهة. حفظ البيانات متاح بعد ربط Supabase.'}));return;
 }
 if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;res.end();return;}
 const page=url.pathname==='/dashboard'||url.pathname==='/dashboard/'?'index.html':['/','/visitors','/visitors/'].includes(url.pathname)?'visitors.html':null;if(!page){res.statusCode=404;res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<html lang="ar" dir="rtl"><meta charset="utf-8"><h1>الصفحة غير موجودة</h1><a href="/">العودة إلى الرئيسية</a></html>');return;}if(!pages.has(page))pages.set(page,await readFile(new URL('../public/'+page,import.meta.url),'utf8'));res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');res.end(req.method==='HEAD'?'':pages.get(page));
}
