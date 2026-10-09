import {validate} from './core.mjs';
const prefixes={income:'REV',expense:'EXP',member:'MEM',worker:'WRK',beneficiary:'BEN',aid:'AID',settings:'SET',patient:'PAT',child:'KID'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export async function handlePostgres(req,sql){
 try{
 const url=new URL(req.url),origin=req.headers.get('origin');if(req.method!=='GET'&&origin&&origin!==url.origin)return json({error:'طلب غير مسموح'},403);
 const path=url.pathname;
 if(path==='/api/records'&&req.method==='GET'){const rows=await sql.query('SELECT id,kind,payload FROM records WHERE deleted = 0 ORDER BY id DESC',[]);return json({records:rows.map(r=>({...JSON.parse(r.payload),id:Number(r.id),kind:r.kind,code:prefixes[r.kind]+'-'+String(r.id).padStart(6,'0')}))});}
 if(path==='/api/audit'&&req.method==='GET'){const rows=await sql.query('SELECT id,record_id,action,at FROM audit ORDER BY id DESC LIMIT 100',[]);return json({results:rows});}
 const match=path.match(/^\/api\/records(?:\/(\d+))?$/);if(!match)return json({error:'غير موجود'},404);if(!['POST','PUT','DELETE'].includes(req.method))return json({error:'غير مسموح'},405);
 const id=match[1]?Number(match[1]):null;const old=id?(await sql.query('SELECT id,kind,payload FROM records WHERE id = $1 AND deleted = 0',[id]))[0]:null;
 if(id&&!old)return json({error:'السجل غير موجود'},404);
 if(req.method==='DELETE'){
 if(!old)return json({error:'السجل مطلوب'},400);
 const rows=await sql.query(`WITH changed AS (UPDATE records SET deleted = 1, updated_at = $2 WHERE id = $1 AND deleted = 0 AND NOT (kind = 'beneficiary' AND EXISTS (SELECT 1 FROM records a WHERE a.kind = 'aid' AND a.deleted = 0 AND a.payload::jsonb->>'beneficiaryId' = $1::text)) RETURNING id,payload), logged AS (INSERT INTO audit (record_id,action,before,at) SELECT id,'delete',payload,$2 FROM changed) SELECT id FROM changed`,[id,new Date().toISOString()]);
 if(!rows.length)return json({error:'لا يمكن حذف مستفيد له مساعدات مسجلة'},409);return json({ok:true});
 }
 const input=await req.json();const kind=old?old.kind:input.kind;const p=validate(kind,input.data);delete p.id;delete p.kind;delete p.code;const now=new Date().toISOString();
 if(kind==='aid'){p.beneficiaryId=Number(p.beneficiaryId);const ben=(await sql.query("SELECT id FROM records WHERE id = $1 AND kind = 'beneficiary' AND deleted = 0",[p.beneficiaryId]))[0];if(!ben)return json({error:'المستفيد غير موجود'},400);}
 const payload=JSON.stringify(p);
 if(old){const rows=await sql.query(`WITH previous AS (SELECT id,payload FROM records WHERE id = $1 AND deleted = 0 FOR UPDATE), changed AS (UPDATE records SET payload = $2, updated_at = $3 FROM previous WHERE records.id = previous.id RETURNING records.id), logged AS (INSERT INTO audit (record_id,action,before,after,at) SELECT previous.id,'update',previous.payload,$2,$3 FROM previous JOIN changed ON previous.id = changed.id) SELECT id FROM changed`,[id,payload,now]);if(!rows.length)return json({error:'السجل غير موجود'},404);return json({ok:true,id});}
 const rows=await sql.query(`WITH created AS (INSERT INTO records (kind,payload,created_at,updated_at) VALUES ($1,$2,$3,$3) RETURNING id), logged AS (INSERT INTO audit (record_id,action,after,at) SELECT id,'create',$2,$3 FROM created) SELECT id FROM created`,[kind,payload,now]);return json({ok:true,id:Number(rows[0].id)},201);
 }catch(e){console.error('Database request failed:',e.code||e.name);return json({error:'تعذر حفظ البيانات أو تحميلها. تحقق من البيانات وحاول مجددًا.'},400)}
}
