import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
const base=process.argv[2]??'http://127.0.0.1:4187',output=resolve(process.argv[3]??'.zone-cache/phase-02/vehicle-browser');
mkdirSync(output,{recursive:true});const session=`vehicle-browser-${process.pid}`;
const run=(...args)=>execFileSync('npx',['--yes','agent-browser','--session',session,...args],{encoding:'utf8',timeout:60000}).trim();
const evaluate=code=>JSON.parse(run('eval',code));
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const catalogue=JSON.parse(readFileSync('public/zones/index.json','utf8'));
const state=()=>evaluate(`({...document.querySelector('canvas').dataset,canvases:document.querySelectorAll('canvas').length,overflow:document.documentElement.scrollWidth>innerWidth})`);
const frames=()=>evaluate('new Promise(resolve=>{let i=0;const frame=()=>++i===6?resolve(true):requestAnimationFrame(frame);requestAnimationFrame(frame)})');
const click=name=>run('find','role','button','click','--name',name,'--exact');
const observations=[];
const unavailableFile=resolve('dist/phase02-unavailable.zone.json');
try{
 run('open',base);
 for(const [mode,w,h] of [['desktop',1440,900],['mobile-viewport',390,844]]){
  run('set','viewport',String(w),String(h));
  for(const zone of catalogue.zones.slice(0,2)){
   run('open',`${base}/?zone=${zone.id}&vehicle=1&qa=1`);run('wait','[data-physics-state="paused"]');run('snapshot','-i');
   const initial=state();assert(initial.physicsColliders==='7'&&initial.vehicleStatus==='ready'&&initial.physicsSteps==='0','Vehicle was not paused/ready');
   click('Inspect vehicle');frames();
   const nearby=join(output,`${mode}-${zone.id}-vehicle.png`);run('screenshot',nearby);
   run('find','text','Vehicle development exercises','click');run('snapshot','-i');
   const commands=[];
   for(const name of ['Accelerate','Coast','Brake','Reverse','Brake','Turn left','Turn right']){
    const before=state();click(`${name} · 1 s`);
    run('wait','--fn',`document.querySelector('canvas').dataset.physicsStatus==='paused' && Number(document.querySelector('canvas').dataset.physicsSteps)===${Number(before.physicsSteps)+60}`);
    const after=state();frames();assert(state().physicsSteps===after.physicsSteps,'Exercise kept running');
    if(name==='Accelerate')assert(Number(after.vehicleSpeed)>2.5,'Did not accelerate');
    if(name==='Reverse')assert(Number(after.vehicleSpeed)<-2,'Did not reverse');
    if(name==='Brake')assert(Math.abs(Number(after.vehicleSpeed))<.01,'Did not brake to rest');
    commands.push({name,steps:Number(after.physicsSteps)-Number(before.physicsSteps),speed:Number(after.vehicleSpeed),pose:JSON.parse(after.vehiclePose)});
   }
   click('Inspect vehicle');run('find','text','Vehicle development exercises','click');
   const driven=join(output,`${mode}-${zone.id}-driven.png`);run('screenshot',driven);
   for(let i=1;i<=4;i++){click('Reset vehicle');run('wait','--fn',`document.querySelector('canvas').dataset.vehicleResets==='${i}'`);const reset=state();assert(reset.physicsStatus==='paused'&&Math.abs(Number(reset.vehicleSpeed))<.001,'Reset retained motion');assert(JSON.parse(reset.vehiclePose).position.x===JSON.parse(initial.vehiclePose).position.x,'Reset missed start');}
   // QA toggles and camera reset remain independent. Hidden geometry pauses movement.
   click('Drive');click('Inspect');run('find','label','Generated geometry','click');run('wait','[data-physics-state="paused"]');
   click('Reset view');run('find','label','Collision surfaces','check');const qa=state();assert(qa.collisionVisible==='true'&&qa.generatedVisible==='false','QA/collision regression');
   assert(!run('errors')&&!run('console'),'Unexpected browser output');assert(!qa.overflow&&qa.canvases===1,'Layout/canvas regression');
   observations.push({mode,label:zone.label,initial,commands,repeatedReset:'pass',qaPause:'pass',nearby,driven});console.log(`${mode}: ${zone.label} visible vehicle, commands, reset and QA passed`);
  }
 }
 run('set','viewport','1440','900');
 const fixture=JSON.parse(readFileSync(`public/zones/${catalogue.zones[0].id}.zone.json`,'utf8'));
 fixture.streetGraph.nodes.forEach(node=>{node.position[0]+=10000;node.position[2]+=10000;});
 writeFileSync(unavailableFile,JSON.stringify(fixture));
 run('open',`${base}/?artifact=/phase02-unavailable.zone.json&vehicle=1`);run('wait','[data-vehicle-state="unavailable"]');
 const unavailable=state();assert(unavailable.vehicleStatus==='unavailable'&&unavailable.physicsColliders==='6'&&unavailable.canvases===1,'Unsafe hints created vehicle');
 click('Reset view');run('screenshot',join(output,'unavailable.png'));
 observations.push({check:'translated graph-hint safety fixture: no spawn, valid inspection',state:unavailable,message:evaluate('document.querySelector("[data-vehicle-state]").textContent')});
 run('open',`${base}/?zone=${catalogue.zones[0].id}&vehicle=1`);run('wait','[data-physics-state="paused"]');
 click('Drive');run('tab','new','--label','focus-loss','about:blank');run('tab','t1');run('wait','--fn','document.querySelector("canvas").dataset.physicsStatus==="paused"');
 const returned=state();frames();assert(state().physicsSteps===returned.physicsSteps,'Focus return advanced');
 observations.push({check:'actual tab departure/return pauses vehicle, no hidden catch-up',result:'pass',returned});run('tab','close','focus-loss');
 writeFileSync(join(output,'results.json'),JSON.stringify({base,checkedAt:new Date().toISOString(),browser:evaluate('navigator.userAgent'),observations},null,2)+'\n');
}finally{try{unlinkSync(unavailableFile);}catch{}run('close');}
