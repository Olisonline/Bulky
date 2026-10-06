const CACHE='bulky-v11-4';
const CORE=['./','./index.html','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>/^bulky-v/.test(k)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;
 e.respondWith(fetch(e.request).then(async r=>{if(r.ok){try{const c=await caches.open(CACHE);await c.put(e.request,r.clone())}catch{}}return r}).catch(async()=>{const r=await caches.match(e.request);if(r)return r;if(e.request.mode==='navigate')return caches.match('./index.html');return Response.error()}));
});
