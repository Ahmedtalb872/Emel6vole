import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {kinds,validate} from '../core.mjs';
const ok={date:'2026-10-09',type:'وارد (تبرع عيني)',category:'ملابس',item:'ملابس شتوية للأطفال',quantity:'40',unit:'قطعة',donor:'محسن',value:'20000'};
test('storehouse movements are a validated non-cash record kind',()=>{assert.ok(kinds.includes('stock'));assert.equal(validate('stock',{...ok}).item,'ملابس شتوية للأطفال');assert.ok(validate('stock',{...ok,value:''}));assert.ok(validate('stock',{...ok,type:'صادر (توزيع)'}));
 for(const bad of [{item:' '},{quantity:'0'},{quantity:'abc'},{date:'غدًا'},{type:'نقدي'},{value:'-5'}])assert.throws(()=>validate('stock',{...ok,...bad}))});
test('storehouse page, in-kind income notice and report line never touch the cash balance',()=>{const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/expense:'المصروفات',stock:'المخازن'/);assert.match(html,/function stockBalance\(\)/);assert.match(html,/المداخيل العينية \(غير نقدية\)/);assert.match(html,/inKind:inKindValue\(/);
 assert.match(html,/const sum=rs=>rs\.reduce\(\(s,r\)=>s\+Number\(r\.amount\|\|0\),0\)/);assert.doesNotMatch(html.match(/stock:\[\['date'[^\]]*\][^]*?\]\],/)[0],/'amount'/);
 const sql=readFileSync(new URL('../db/stock.sql',import.meta.url),'utf8');assert.match(sql,/'patient','child','stock'\)\)/);assert.match(sql,/NEW\.kind = 'stock'/);});
