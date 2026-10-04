import {readFile,mkdir,writeFile,cp,access,rm} from 'node:fs/promises';
const connection=process.env.DATABASE_URL||process.env.POSTGRES_URL;
if(connection){
 const {neon}=await import('@neondatabase/serverless');const sql=neon(connection);
 await sql.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',[]);
 const rows=await sql.query('SELECT name FROM schema_migrations WHERE name = $1',['0001_initial']);
 if(!rows.length){const statements=(await readFile('db/vercel.sql','utf8')).split(';').map(s=>s.trim()).filter(Boolean);await sql.transaction([...statements.map(s=>sql.query(s,[])),sql.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING',['0001_initial'])]);console.log('Database initialized');}
}else console.log('Database is not connected; records will remain unavailable until configured');
const output='.vercel/output';const func=output+'/functions/app.func';
await rm(output,{recursive:true,force:true});
await mkdir(func+'/api',{recursive:true});await mkdir(func+'/public',{recursive:true});
for(const file of ['core.mjs','postgres.mjs'])await cp(file,func+'/'+file);
await cp('api/app.mjs',func+'/api/app.mjs');await cp('public/index.html',func+'/public/index.html');await cp('public/login.html',func+'/public/login.html');
await writeFile(func+'/package.json',JSON.stringify({type:'module'}));
await writeFile(func+'/index.mjs','export { default } from "./api/app.mjs";\n');
await writeFile(func+'/.vc-config.json',JSON.stringify({runtime:'nodejs24.x',handler:'index.mjs',launcherType:'Nodejs',shouldAddHelpers:true},null,2));
try{await access('node_modules');await cp('node_modules',func+'/node_modules',{recursive:true});}catch{if(connection)throw Error('Runtime dependencies are missing');console.log('No database dependency installed locally; production install is required');}
await writeFile(output+'/config.json',JSON.stringify({version:3,routes:[{src:'^/api/(.*)$',dest:'/app?path=$1'},{src:'^/.*$',dest:'/app'}]},null,2));
console.log('Vercel application function and routes built');
