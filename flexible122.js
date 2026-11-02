/* v12.2 domain operations. Callers persist atomically; no DOM or implicit dates. */
(function(root){'use strict';
const C=root.BulkyCore,R=root.BulkyReliable,copy=C.copy;
function migrate(db){
 if(db.flexVersion!==undefined&&db.flexVersion!==1)throw Error('Onbekende nieuwere v12.2-gegevensstructuur.');
 for(const key of ['productCorrections','exerciseNotes']){if(db[key]===undefined)db[key]={};else if(!db[key]||typeof db[key]!=='object'||Array.isArray(db[key]))throw Error('Ongeldig veld: '+key)}
 if(db.bodyMeasurements===undefined)db.bodyMeasurements=[];
 if(!Array.isArray(db.bodyMeasurements))throw Error('Ongeldige lichaamsmetingen');
 db.flexVersion=1;db.version=20;return db;
}
function productKey(p){const code=String(p.barcode||'').replace(/[\s-]/g,'');if(/^\d{8,14}$/.test(code))return 'barcode:'+code;if(p.localId||p.id)return 'local:'+String(p.localId||p.id);return null}
function corrected(db,p){const key=productKey(p),c=key&&db.productCorrections[key];return c?{...copy(p),...copy(c.values),correctionKey:key}:copy(p)}
function correctProduct(db,p,values){const key=productKey(p);if(!key)throw Error('Bewaar dit product eerst als eigen product; er is geen betrouwbare product-ID.');if(!String(values.name||'').trim())throw Error('Vul een productnaam in.');if(!['100g','100ml','unit'].includes(values.type))throw Error('Ongeldige eenheid.');const v={name:values.name.trim().slice(0,250),type:values.type,unit:values.type==='100ml'?'ml':values.type==='100g'?'g':String(values.unit||'portie')};for(const k of R.keys){const raw=values[k];if(raw!=null&&String(raw).trim()!==''&&R.number(raw)===null)throw Error('Controleer '+k+': positief getal, nul of leeg.');v[k]=R.number(raw)}v.serving=values.serving==null||values.serving===''?null:R.positive(values.serving);db.productCorrections[key]={original:db.productCorrections[key]?.original||copy(p),values:v};return corrected(db,p)}
// Only conservative exact generic names: never infer portions for banana bread etc.
const portions={appel:{grams:135,label:'1 appel'},banaan:{grams:130,label:'1 middelgrote banaan'},'kiwi':{grams:75,label:'1 kiwi'},'kiwi groen':{grams:75,label:'1 kiwi'},mandarijn:{grams:55,label:'1 mandarijn'},ei:{grams:50,label:'1 ei'},'gekookt ei':{grams:50,label:'1 ei'},'hard gekookt ei':{grams:50,label:'1 ei'},boterham:{grams:35,label:'1 boterham'},volkorenbrood:{grams:35,label:'1 snee'},bruinbrood:{grams:35,label:'1 snee'},'brood volkoren':{grams:35,label:'1 snee'}};
function portion(p){if(p.type==='unit')return null;if(p.serving>0)return {grams:p.serving,label:p.servingName||'1 portie',estimated:false};const ref=p.type==='100g'&&portions[R.norm(p.name)];return ref?{...ref,estimated:true}:null}
function exerciseId(e){return e.exerciseId||C.exerciseKey(e.name)}
function replaceExercise(db,id,index,name){const w=db.activeSessions[id];if(!w)throw Error('Geen actieve workout.');const e=w.exercises[index];if(!e)throw Error('Oefening ontbreekt.');name=String(name||'').trim();if(!name||C.exerciseKey(name)===C.exerciseKey(e.name))throw Error('Kies een andere oefening.');const remaining=e.sets.filter(s=>!s.done&&String(s.kg??'').trim()===''&&String(s.reps??'').trim()==='');if(!remaining.length)throw Error('Alle sets bevatten al invoer. Er zijn geen lege sets om te vervangen.');
 const kept=e.sets.filter(s=>!remaining.includes(s)),replacement={name,exerciseId:C.exerciseKey(name),range:e.range,sets:copy(remaining),replaces:exerciseId(e)};
 // Filled but unchecked sets are also retained, including kg-only input.
 if(kept.length){e.sets=kept;w.exercises.splice(index+1,0,replacement)}else {w.replacedExercises ||= [];w.replacedExercises.push(copy(e));w.exercises.splice(index,1,replacement)}return replacement;
}
function moveWorkout(db,id,date,now=new Date()){const w=db.workouts[id];if(!w?.finished)throw Error('Geen voltooide sessie.');if(!C.validDate(date)||date>C.dateKey(now))throw Error('Kies een geldige datum tot en met vandaag.');if(w.date===date)return false;w.dateChanges ||= [];w.dateChanges.push({from:w.date,to:date,at:now.toISOString()});w.date=date;return true}
function undoMove(db,id){const w=db.workouts[id],change=w?.dateChanges?.at(-1);if(!change||w.date!==change.to)throw Error('Geen verplaatsing om ongedaan te maken.');w.date=change.from;w.dateChanges.pop()}
function note(db,e,text){text=String(text).slice(0,4000);const id=exerciseId(e);if(text.trim())db.exerciseNotes[id]=text;else delete db.exerciseNotes[id]}
root.BulkyFlexible={migrate,productKey,corrected,correctProduct,portion,portions,exerciseId,replaceExercise,moveWorkout,undoMove,note};if(typeof module!=='undefined')module.exports=root.BulkyFlexible;
})(globalThis);
