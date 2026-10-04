import {readFile,mkdir,writeFile} from 'node:fs/promises';
const connection=process.env.DATABASE_URL||process.env.POSTGRES_URL;
if(connection){
 const {neon}=await import('@neondatabase/serverless');const sql=neon(connection);
 await sql.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',[]);
 const rows=await sql.query('SELECT name FROM schema_migrations WHERE name = $1',['0001_initial']);
 if(!rows.length){const statements=(await readFile('db/vercel.sql','utf8')).split(';').map(s=>s.trim()).filter(Boolean);await sql.transaction([...statements.map(s=>sql.query(s,[])),sql.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING',['0001_initial'])]);console.log('Database initialized');}
}else console.log('Database is not connected; records will remain unavailable until configured');
await mkdir('vercel-output',{recursive:true});await writeFile('vercel-output/.keep','');console.log('Vercel source prepared');
