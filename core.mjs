export const kinds=['income','expense','member','beneficiary','aid','settings'];
const prefixes={income:'REV',expense:'EXP',member:'MEM',beneficiary:'BEN',aid:'AID',settings:'SET'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export function validate(kind,p){
 if(!kinds.includes(kind)||!p||typeof p!=='object'||Array.isArray(p))throw Error('بيانات غير صالحة');
 if(JSON.stringify(p).length>30000)throw Error('البيانات طويلة جدًا');
 if(['income','expense','aid'].includes(kind)){if(!/^\d{4}-\d{2}-\d{2}$/.test(p.date||'')||isNaN(Date.parse(p.date)))throw Error('التاريخ غير صالح');if(!Number.isFinite(Number(p.amount))||Number(p.amount)<=0)throw Error('أدخل مبلغًا أكبر من صفر');p.amount=Math.round(Number(p.amount)*100)/100;}
 if(['member','beneficiary'].includes(kind)&&!String(p.name||'').trim())throw Error('الاسم مطلوب');
 if(kind==='income'&&!String(p.contributor||'').trim())throw Error('اسم المساهم مطلوب');
 if(kind==='expense'&&!String(p.recipient||'').trim())throw Error('المستفيد من الصرف مطلوب');
 if(kind==='beneficiary'){if(!Number.isInteger(Number(p.age))||Number(p.age)<0||Number(p.age)>120)throw Error('العمر غير صالح');if(!Array.isArray(p.categories))throw Error('حدد تصنيفات الحالة');}
 if(kind==='member'&&(!Number.isFinite(Number(p.subscription))||Number(p.subscription)<0))throw Error('قيمة الاشتراك غير صالحة');
 if(kind==='aid'&&(!p.beneficiaryId||!['نقدية','عينية'].includes(p.mode)))throw Error('حدد المستفيد وطبيعة المساعدة');
 return p;
}
export async function handle(req,db){
 try{
 if(!db)return json({error:'قاعدة البيانات غير متاحة الآن'},503);
 const u=new URL(req.url); const origin=req.headers.get('origin');
 if(req.method!=='GET'&&origin&&origin!==u.origin)return json({error:'طلب غير مسموح'},403);
 const all=async()=>{const r=await db.prepare('SELECT * FROM records WHERE deleted = 0 ORDER BY id DESC').all();return r.results.map(r=>({...JSON.parse(r.payload),id:r.id,kind:r.kind,code:prefixes[r.kind]+'-'+String(r.id).padStart(6,'0')}));};
 if(u.pathname==='/api/records'&&req.method==='GET')return json({records:await all()});
 if(u.pathname==='/api/audit'&&req.method==='GET')return json(await db.prepare('SELECT id,record_id,action,at FROM audit ORDER BY id DESC LIMIT 100').all());
 const match=u.pathname.match(/^\/api\/records(?:\/(\d+))?$/);if(!match)return json({error:'غير موجود'},404);
 if(!['POST','PUT','DELETE'].includes(req.method))return json({error:'غير مسموح'},405);
 const id=match[1]?Number(match[1]):null;
 const old=id?await db.prepare('SELECT * FROM records WHERE id = ? AND deleted = 0').bind(id).first():null;
 if(id&&!old)return json({error:'السجل غير موجود'},404);
 if(req.method==='DELETE'){
 if(!old)return json({error:'السجل مطلوب'},400);
 if(old.kind==='beneficiary'&&(await all()).some(r=>r.kind==='aid'&&Number(r.beneficiaryId)===id))return json({error:'لا يمكن حذف مستفيد له مساعدات مسجلة'},409);
 await db.batch([db.prepare('UPDATE records SET deleted = 1, updated_at = ? WHERE id = ?').bind(new Date().toISOString(),id),db.prepare('INSERT INTO audit (record_id,action,before,at) VALUES (?,?,?,?)').bind(id,'delete',old.payload,new Date().toISOString())]);return json({ok:true});
 }
 const body=await req.json();const kind=old?old.kind:body.kind;const p=validate(kind,body.data);delete p.id;delete p.kind;delete p.code;
 if(kind==='aid'){const ben=await db.prepare('SELECT id FROM records WHERE id = ? AND kind = ? AND deleted = 0').bind(Number(p.beneficiaryId),'beneficiary').first();if(!ben)return json({error:'المستفيد غير موجود'},400);}
 const now=new Date().toISOString();const payload=JSON.stringify(p);
 if(old){await db.batch([db.prepare('UPDATE records SET payload = ?, updated_at = ? WHERE id = ?').bind(payload,now,id),db.prepare('INSERT INTO audit (record_id,action,before,after,at) VALUES (?,?,?,?,?)').bind(id,'update',old.payload,payload,now)]);return json({ok:true,id});}
 const results=await db.batch([db.prepare('INSERT INTO records (kind,payload,created_at,updated_at) VALUES (?,?,?,?)').bind(kind,payload,now,now),db.prepare('INSERT INTO audit (record_id,action,after,at) VALUES (last_insert_rowid(),?,?,?)').bind('create',payload,now)]);
 return json({ok:true,id:results[0].meta.last_row_id},201);
 }catch(e){console.error(e);return json({error:e.message||'تعذر حفظ البيانات'},400);}
}
