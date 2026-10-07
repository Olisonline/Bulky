/* Bulky v12 domain model. No DOM, no selected UI dates, no implicit writes. */
(function(root){
'use strict';
const copy=x=>JSON.parse(JSON.stringify(x));
const dateKey=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&dateKey(new Date(s+'T12:00:00'))===s;
const addDays=(s,n)=>{const d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return dateKey(d)};
const exerciseKey=n=>String(n||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const num=v=>Math.max(0,Number(String(v??'').replace(',','.'))||0);
const volume=w=>(w.exercises||[]).reduce((a,e)=>a+(e.sets||[]).reduce((b,s)=>b+(s.done?num(s.kg)*num(s.reps):0),0),0);
const completed=db=>Object.values(db.workouts||{}).filter(w=>w.finished===true);
function migrate(input,now=new Date()){
 const db=copy(input);if(!db||Array.isArray(db)||typeof db!=='object'||db.version>18)throw Error('Ongeldige of nieuwere database');
 for(const k of ['days','plans','workouts','settings','products','meals'])if(db[k]!=null&&(typeof db[k]!=='object'||Array.isArray(db[k])))throw Error('Ongeldig veld: '+k);
 db.days ||= {}; db.workouts ||= {};db.settings ||= {kcal:3150,protein:160};db.legacyWorkouts ||= {};db.activeSessions ||= {};db.scheduleHistory ||= [];
 if(db.modelVersion!==12){
  const history={};
  for(const [key,original] of Object.entries(db.workouts)){
   const w=copy(original);if(!w||typeof w!=='object'){db.legacyWorkouts[key]={raw:original,reason:'Onbekend record'};continue}
   if(!validDate(w.date)){const fallback=key.split('|')[0];if(validDate(fallback)){w.legacyDate=w.date??null;w.date=fallback}}
   const done=w.finished===true||w.finished===1||w.finished==='true'||(w.finished===undefined&&!!w.finishedAt);
   if(w.exercises===undefined)w.exercises=[];if(!validDate(w.date)||!Array.isArray(w.exercises)||!done){db.legacyWorkouts[key]={...w,reason:'Oude onvoltooide of onzekere workout'};continue}
   w.legacySource=copy(original);w.id='legacy:'+key;w.legacyKey=key;w.name ||= key.split('|').slice(1).join('|')||'Workout';w.finished=true;
   w.createdAt=Number(w.createdAt)||null;w.startedAt=Number(w.startedAt)||w.createdAt;w.finishedAt=Number(w.finishedAt)||null;
   w.exercises.forEach(e=>{e.sets ||= []; e.exerciseId=exerciseKey(e.name); e.sets.forEach(s=>{if(s.done===undefined)s.done=num(s.reps)>0;s.done=s.done===true||s.done===1||s.done==='true'})});
   w.volume=volume(w);w.prs ||= [];w.legacy=true;history[w.id]=w;
  }
  db.workouts=history;
  const week={0:'Schouders & Armen',1:'Push',2:'Pull',3:null,4:'Benen',5:'Upper',6:null};
  for(const k in week)if(!db.plans?.[week[k]])week[k]=null;
  db.scheduleHistory.push({effective:dateKey(now),week,activities:{3:'Voetbal · 75 min',6:'Wedstrijd · 90 min'}});
  for(const [d,record] of Object.entries(db.days)){if(!record||typeof record!=='object'||Array.isArray(record)||record.foods!=null&&!Array.isArray(record.foods))throw Error('Ongeldige dag '+d);record.goals ||= copy(db.settings)}
  db.migration={at:now.toISOString(),fromVersion:db.version??null,unknownHistory:'legacyWorkouts'};db.modelVersion=12;
 }
 for(const [key,d] of Object.entries(db.days)){if(!d||typeof d!=='object'||Array.isArray(d)||d.foods!=null&&!Array.isArray(d.foods))throw Error('Ongeldige dag '+key)}
 for(const p of Object.values(db.plans||{})){if(!Array.isArray(p)||p.some(e=>!Array.isArray(e)||e.length<3))throw Error('Ongeldig schema')}
 for(const w of Object.values(db.workouts)){if(!w||!validDate(w.date)||w.finished!==true||!Array.isArray(w.exercises))throw Error('Ongeldige historische sessie');}
 for(const [id,w] of Object.entries(db.activeSessions)){if(!w||w.id!==id||!validDate(w.date)||w.finished||!Array.isArray(w.exercises))throw Error('Ongeldige actieve sessie');}
 db.version=18;return db;
}
function schedule(db,date){
 const d=db.days[date];if(d&&Object.hasOwn(d,'planning'))return copy(d.planning);
 const version=db.scheduleHistory.filter(x=>x.effective<=date).sort((a,b)=>a.effective.localeCompare(b.effective)).at(-1);
 if(!version)return {name:null,activity:null,known:false};
 const dow=new Date(date+'T12:00:00').getDay();return {name:version.week[dow]||null,activity:version.activities?.[dow]||null,known:true};
}
function ensureDay(db,date){if(!validDate(date))throw Error('Ongeldige datum');const planning=schedule(db,date);const d=db.days[date] ||= {foods:[],creatine:false,weight:null};d.foods ||= [];d.goals ||= copy(db.settings);d.planning ||= planning;return d}
function setSchedule(db,week,activities,effective){if(!validDate(effective))throw Error('Ongeldige ingangsdatum');db.scheduleHistory=db.scheduleHistory.filter(x=>x.effective!==effective);db.scheduleHistory.push({effective,week:copy(week),activities:copy(activities)});/* Today may explicitly change; earlier snapshots are immutable. */if(db.days[effective])delete db.days[effective].planning;}
function draft(db,name,now=new Date()) {return {name,date:dateKey(now),finished:false,exercises:(db.plans[name]||[]).map(([name,n,range])=>({name,exerciseId:exerciseKey(name),range,sets:Array.from({length:Math.max(1,Math.min(30,num(n)))},()=>({kg:'',reps:'',done:false}))}))}}
function start(db,name,now=new Date(),id=globalThis.crypto.randomUUID()){
 const active=Object.values(db.activeSessions).find(w=>w.name===name);if(active)return active;
 if(!db.plans[name])throw Error('Schema bestaat niet');const w={...draft(db,name,now),id,startedAt:now.getTime(),createdAt:now.getTime()};db.activeSessions[id]=w;ensureDay(db,w.date);return w;
}
function previous(db,name){const key=exerciseKey(name);for(const w of completed(db).sort((a,b)=>b.date.localeCompare(a.date)||(b.finishedAt||0)-(a.finishedAt||0))){const e=w.exercises.find(e=>exerciseKey(e.name)===key);if(e?.sets.some(s=>s.done&&num(s.reps)))return e}return null}
function finish(db,id,now=new Date()){
 const active=db.activeSessions[id];if(!active)throw Error('Geen actieve sessie');
 if(!active.exercises.some(e=>e.sets.some(s=>s.done&&num(s.reps)>0)))throw Error('Vink eerst minstens één uitgevoerde set met reps af.');
 for(const e of active.exercises)for(const s of e.sets)if(s.done&&(!Number.isFinite(Number(s.kg))||Number(s.kg)<0||!Number.isInteger(Number(s.reps))||Number(s.reps)<=0))throw Error('Controleer de afgevinkte sets: geldig gewicht en positieve hele reps vereist.');
 const w=copy(active);w.finished=true;w.finishedAt=now.getTime();w.volume=volume(w);w.prs=[];
 for(const e of w.exercises){let best=Math.max(0,...completed(db).flatMap(x=>x.exercises.filter(y=>exerciseKey(y.name)===exerciseKey(e.name)).flatMap(y=>y.sets.filter(s=>s.done).map(s=>num(s.kg)*(1+num(s.reps)/30)))));for(const s of e.sets){const e1=num(s.kg)*(1+num(s.reps)/30);if(s.done&&num(s.reps)&&e1>best){w.prs.push({name:e.name,kg:num(s.kg),reps:num(s.reps),e1});best=e1}}}
 db.workouts[id]=w;delete db.activeSessions[id];return w;
}
const SCORE_WEIGHTS={calories:45,protein:30,workout:15,creatine:10};
function summary(db,date){const d=db.days[date]||{foods:[],creatine:false,weight:null},goals=d.goals||db.settings,plan=schedule(db,date),sessions=completed(db).filter(w=>w.date===date),t=(d.foods||[]).reduce((a,f)=>{for(const k of ['kcal','protein','carbs','fat'])a[k]+=num(f[k]);return a},{kcal:0,protein:0,carbs:0,fat:0});
 const cap=(v,g)=>Math.min(1,v/(num(g)||1));let numerator=SCORE_WEIGHTS.calories*cap(t.kcal,goals.kcal)+SCORE_WEIGHTS.protein*cap(t.protein,goals.protein)+SCORE_WEIGHTS.creatine*(d.creatine?1:0),denominator=85;
 if(plan.name){denominator+=15;numerator+=15*(sessions.some(w=>w.name===plan.name)?1:0)}const score=Math.round(100*numerator/denominator);
 return {date,day:d,goals,plan,sessions,totals:t,score,state:score>=100?100:score>=75?75:score>=50?50:score>=25?25:0,volume:sessions.reduce((a,w)=>a+volume(w),0)};
}
const api={copy,dateKey,validDate,addDays,exerciseKey,num,volume,completed,migrate,schedule,ensureDay,setSchedule,draft,start,previous,finish,summary,SCORE_WEIGHTS};if(typeof module!=='undefined')module.exports=api;root.BulkyCore=api;
})(globalThis);
