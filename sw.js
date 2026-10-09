const CACHE='bulky-v12-1';
const CORE=['./','./index.html','./core.js','./reliability.js','./app.js','./v12-ui.js','./nutrition121.js','./scanner121.js','./alive121.js','./v12.css','./v121.css','./base.css','./vendor/zxing-browser.min.js','./assets/bulky-level-1.png','./assets/bulky-level-2.png','./assets/bulky-level-3.png','./assets/bulky-level-4.png','./assets/bulky-level-5.png','./assets/mascot-manifest.json','./manifest.webmanifest','./icon.svg'];
// No skipWaiting: an open app keeps its complete previous shell until closed.
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE.map(p=>new Request(p,{cache:'reload'}))))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>/^bulky-v/.test(k)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(caches.open(CACHE).then(async c=>{const hit=await c.match(e.request,{ignoreSearch:true});if(hit)return hit;if(e.request.mode==='navigate')return c.match('./index.html');return fetch(e.request)}))});
