/* Local, bounded streaming Apple Health XML reader. No uploads or dependencies. */
(function(root){'use strict';
const C=root.BulkyCore;
const types={HKQuantityTypeIdentifierBodyMass:'weight',HKQuantityTypeIdentifierBodyFatPercentage:'fat',HKQuantityTypeIdentifierLeanBodyMass:'lean',HKQuantityTypeIdentifierBodyMassIndex:'bmi',HKQuantityTypeIdentifierHeight:'height'};
function decode(s){return s.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi,x=>{const k=x.slice(1,-1);if(k[0]==='#'){const n=k[1].toLowerCase()==='x'?parseInt(k.slice(2),16):+k.slice(1);return n>0&&n<=0x10ffff?String.fromCodePoint(n):''}return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[k]})}
function attributes(tag){const a={};for(const m of tag.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))a[m[1]]=decode(m[2]??m[3]);return a}
function record(a){const kind=types[a.type];if(!kind)return null;const raw=String(a.value||''),v=/^\d+(\.\d+)?$/.test(raw)?Number(raw):NaN;const time=String(a.startDate||'');const match=time.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/);if(!match||!C.validDate(match[1])||!Number.isFinite(v)||v<=0)throw Error('Ongeldige meetwaarde of tijd');const timestamp=Date.parse(match[1]+'T'+match[2]+match[3]+':'+match[4]);if(!Number.isFinite(timestamp))throw Error('Ongeldige tijd');
 let value=v,unit=a.unit;
 if(['weight','lean'].includes(kind)){if(unit==='lb')value=v*0.45359237;else if(unit==='g')value=v/1000;else if(unit!=='kg')throw Error('Onbekende gewichtseenheid');unit='kg'}
 if(kind==='height'){if(unit==='cm')value=v;else if(unit==='m')value=v*100;else if(unit==='in')value=v*2.54;else throw Error('Onbekende lengteeenheid');unit='cm'}
 if(kind==='fat'){if(unit==='%')value=v;else if(unit==='count')value=v*100;else throw Error('Onbekende veteenheid');if(value>100)throw Error('Ongeldig vetpercentage');unit='%'}
 if(kind==='bmi'&&unit!=='count')throw Error('Onbekende BMI-eenheid');
 const source=String(a.sourceName||'Apple Gezondheid'),id='health:'+JSON.stringify([a.type,source,timestamp,Number(value.toFixed(8)),unit]);
 return {id,kind,value,unit,date:match[1],timestamp,originalTime:time,originalValue:raw,originalUnit:a.unit,source,device:String(a.device||'')};
}
async function parse(file,onProgress=()=>{}){
 if(!file||!Number.isFinite(file.size)||file.size>600*1024*1024)throw Error('Kies export.xml tot 600 MB.');const decoder=new TextDecoder();let buffer='',seenRoot=false,closed=false,rejected=0,relevant=0,rows=[],seen=new Set();
 for(let offset=0;offset<file.size;offset+=256*1024){buffer+=decoder.decode(await file.slice(offset,offset+256*1024).arrayBuffer(),{stream:offset+256*1024<file.size});if(/<!ENTITY\b|<!DOCTYPE[^>]*\b(?:SYSTEM|PUBLIC)\b/i.test(buffer))throw Error('Externe of aangepaste XML-entiteiten worden niet ondersteund.');if(/<HealthData\b/.test(buffer))seenRoot=true;if(/<\/HealthData\s*>/.test(buffer))closed=true;
 let match;const rx=/<Record\s+(?:"[^"]*"|'[^']*'|[^'">])*>/g;let consumed=0;while((match=rx.exec(buffer))){consumed=rx.lastIndex;const a=attributes(match[0]);if(!types[a.type])continue;relevant++;try{const m=record(a);if(!seen.has(m.id)){seen.add(m.id);rows.push(m)}}catch{rejected++}if(rows.length>100000)throw Error('Meer dan 100.000 lichaamsmetingen. Gebruik een kleinere export.');}
 buffer=buffer.slice(consumed);const start=buffer.lastIndexOf('<');if(start>=0)buffer=buffer.slice(start);else buffer=buffer.slice(-100);if(buffer.length>2*1024*1024)throw Error('Ongeldig of te groot XML-element.');onProgress(Math.min(100,Math.round((offset+256*1024)/file.size*100)));await new Promise(r=>setTimeout(r,0));
 }
 if(!seenRoot||!closed)throw Error('Geen volledige Apple Gezondheid export.xml. Pak eerst export.zip uit in Bestanden.');return {rows,rejected,relevant};
}
function preview(db,rows){const ids=new Set((db.bodyMeasurements||[]).map(m=>m.id));return rows.filter(m=>!ids.has(m.id))}
function add(db,rows){const fresh=preview(db,rows),ids=new Set();for(const m of fresh){if(ids.has(m.id))continue;ids.add(m.id);db.bodyMeasurements.push(C.copy(m))}return ids.size}
function weights(db){const by=new Map();for(const m of db.bodyMeasurements||[]){if(m.kind!=='weight')continue;const old=by.get(m.date);if(!old||m.timestamp>old.timestamp)by.set(m.date,{date:m.date,value:m.value,timestamp:m.timestamp})}for(const [date,d] of Object.entries(db.days))if(d.weight)by.set(date,{date,value:+d.weight,manual:true});return [...by.values()].sort((a,b)=>a.date.localeCompare(b.date))}
root.BulkyHealth={types,attributes,record,parse,preview,add,weights};if(typeof module!=='undefined')module.exports=root.BulkyHealth;
})(globalThis);
