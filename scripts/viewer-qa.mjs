import express from 'express';
import { readFileSync } from 'node:fs';
const html = readFileSync('artifacts/viewer.html', 'utf8');
const scene = {
  kind: 'scene',
  name: 'QA articulated lamp',
  description: 'Explicit development fixture, no AI call.',
  actions: [{ id: 'bend', label: 'Bend arm' }],
  code: `api.material('mint',{color:'#b7ee8a'});api.part('base',{shape:'cylinder',size:[0.8,0.8,0.15],material:'mint',position:[0,0.075,0]});api.part('pivot',{shape:'group',position:[0,0.15,0]});api.part('arm',{shape:'box',size:[0.15,2,0.15],material:'mint',position:[0,1,0],parent:'pivot',action:'bend'});api.part('shade',{shape:'cone',size:[0,0.6,0.6],material:'mint',position:[0,2.1,0],parent:'pivot',action:'bend'});api.action('bend',{tracks:[{part:'pivot',property:'rotation.z',mode:'toggle',value:0.6,seconds:0.6}]});`};
const app = express();
app.get('/', (_, res) =>
  res.type('html')
    .send(`<!doctype html><html><head><title>InteractiveWorld viewer QA</title><style>body{background:#101c20;color:#e8f1e8;font:16px sans-serif;margin:24px}iframe{width:390px;height:400px;border:1px solid #456}button{padding:14px;margin:8px}pre{white-space:pre-wrap}</style></head><body><h1>InteractiveWorld viewer QA</h1><p>Development fixture. No AI calls.</p><iframe title="QA viewer" sandbox="allow-scripts"></iframe><div><button id="action">Bend arm</button><button id="reset">Reset view</button><button id="bad">Load broken replacement</button><button id="loop">Load infinite loop</button></div><pre id="log"></pre><script>
const scene=${JSON.stringify(scene)};const frame=document.querySelector('iframe');let stage=0;
function send(m){frame.contentWindow.postMessage(JSON.stringify(m),'*')}
window.addEventListener('message',e=>{if(e.source!==frame.contentWindow)return;try{const m=JSON.parse(e.data);document.querySelector('#log').textContent+=JSON.stringify(m)+'\\n';if(m.type==='ready')send({type:'load',id:'good',scene});if(m.type==='loaded'&&m.id==='good'){stage=1;send({type:'load',id:'bad',scene:{...scene,code:'window.fetch("https://example.com")'}})}else if(m.type==='error'&&m.id==='bad'&&stage===1){stage=2;send({type:'load',id:'loop',scene:{...scene,code:'while(true){}'}})}else if(m.type==='error'&&m.id==='loop'&&stage===2){stage=3;send({type:'action',id:'bend'})}else if(m.type==='action'&&stage===3){stage=4;document.querySelector('#log').textContent+='PASS: valid render, blocked host access, bounded loop, last working action preserved.\\n'}}catch{}});
document.querySelector('#action').onclick=()=>send({type:'action',id:'bend'});document.querySelector('#reset').onclick=()=>send({type:'reset'});document.querySelector('#bad').onclick=()=>send({type:'load',id:'bad-manual',scene:{...scene,code:'api.part("bad",{shape:"unknown"})'}});document.querySelector('#loop').onclick=()=>send({type:'load',id:'loop-manual',scene:{...scene,code:'while(true){}'}});frame.srcdoc=${JSON.stringify(html).replace(/<\/script/gi, '<\\/script')};
</script></body></html>`));
app.listen(3002, '127.0.0.1', () => console.log('Viewer QA: http://localhost:3002'));
