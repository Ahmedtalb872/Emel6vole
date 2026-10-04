import {readFile,mkdir,writeFile} from 'node:fs/promises';
await mkdir('dist/server',{recursive:true});
const logo=await readFile('public/logo.jpg');
const html=(await readFile('public/index.html','utf8')).replaceAll('/logo.jpg','data:image/jpeg;base64,'+logo.toString('base64'));
const core=await readFile('core.mjs','utf8');
await writeFile('dist/server/index.js',core+'\nconst html='+JSON.stringify(html)+';\nexport default {async fetch(request,env){if(new URL(request.url).pathname.startsWith("/api/"))return handle(request,env.DB);return new Response(html,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}})}};');
console.log('Worker built');
