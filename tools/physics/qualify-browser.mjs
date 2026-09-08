/** Actual production app, optional passive instrumentation, trusted browser keyboard input.
 * PUPPETEER_MODULE points to an external Puppeteer 25 installation; no runtime dependency.
 */
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {cpus,release,loadavg} from 'node:os';
import {execFileSync} from 'node:child_process';
import {bounded,memoryAcceptance,processMemory} from './qualification-support.mjs';
import {createHash} from 'node:crypto';
import {installQualificationProtocol} from './qualification-protocol.mjs';
const {default:puppeteer}=await import(process.env.PUPPETEER_MODULE ?? 'puppeteer');
const engine=process.argv[2]??'chromium',base=process.argv[3]??'http://127.0.0.1:4191';
const output=resolve(process.argv[4]??`.zone-cache/phase-04/${engine}`);mkdirSync(output,{recursive:false});
const catalogue=JSON.parse(readFileSync('public/zones/index.json')).zones;
const sustainedZone=process.env.SUSTAINED_ZONE;
const sustainedIndices=[1,0,3,4].filter(index=>!sustainedZone||catalogue[index].id===sustainedZone);
if(!sustainedIndices.length)throw Error('SUSTAINED_ZONE must name one of the four planned sustained cells');
if(sustainedZone&&(process.env.FUNCTIONAL_ONLY||process.env.LIFECYCLE_ONLY))throw Error('SUSTAINED_ZONE cannot be combined with FUNCTIONAL_ONLY or LIFECYCLE_ONLY');
const report={checkedAt:new Date().toISOString(),engine,base,os:`Fedora Linux 44 / ${release()}`,cpu:cpus()[0].model,viewport:{width:1440,height:900,deviceScaleFactor:1},headless:process.env.HEADED!=='1',budgetsCommit:'d6dd37f',artifacts:catalogue.map(z=>({id:z.id,sha256:createHash('sha256').update(readFileSync(`public/zones/${z.id}.zone.json`)).digest('hex')})),cold:[],functional:[],sustained:[],lifecycle:[],failures:[]};
report.build=Object.fromEntries(readdirSync('dist/assets').map(name=>[name,createHash('sha256').update(readFileSync('dist/assets/'+name)).digest('hex')]));
report.runnerSha256=createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
report.protocolObserverSha256=createHash('sha256').update(readFileSync(new URL('./qualification-protocol.mjs',import.meta.url))).digest('hex');
report.sustainedSelection=sustainedZone??null;
report.commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
report.diffSha256=createHash('sha256').update(execFileSync('git',['diff','HEAD'])).digest('hex');
report.supportSha256=createHash('sha256').update(readFileSync(new URL('./qualification-support.mjs',import.meta.url))).digest('hex');
report.workload=process.env.QUALIFICATION_WORKLOAD??'Unspecified; no idle-host claim';
report.loadBefore=loadavg();
const save=()=>writeFileSync(`${output}/results.json`,JSON.stringify(report,null,2)+'\n');
save();
let browser,diagnosticPage;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const state=page=>page.evaluate(()=>({...document.querySelector('canvas')?.dataset,canvases:document.querySelectorAll('canvas').length,focus:document.activeElement.tagName,hidden:document.hidden}));
async function click(page,label){
 const point=await page.evaluate(text=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);if(!b||b.disabled)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};},label);
 if(!point)throw Error('Button unavailable: '+label);await page.mouse.click(point.x,point.y);
 await page.evaluate(()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('No rendered frame after click')),10000);requestAnimationFrame(()=>requestAnimationFrame(()=>{clearTimeout(timer);resolve();}));}));
}
async function contextPage(){const context=await browser.createBrowserContext(),page=await context.newPage();diagnosticPage=page;await page.setViewport(report.viewport);
 await page.evaluateOnNewDocument(()=>{
  window.__qualification={active:false,rafCount:0,lastRaf:null,timerCount:0,lastTimer:null,step:[],frame:[],raf:[],poses:[],errors:[],focusEvents:[]};
  const q=window.__qualification;
  setInterval(()=>{q.timerCount++;q.lastTimer=performance.now();},100);
  for(const name of ['blur','focus','focusin','visibilitychange','pagehide','pageshow'])window.addEventListener(name,e=>{if(q.focusEvents.length<100)q.focusEvents.push({name,at:performance.now(),hidden:document.hidden,hasFocus:document.hasFocus(),target:e.target?.tagName??null});},true);
  new PerformanceObserver(list=>{if(q.active)for(const e of list.getEntries()){const k=e.name==='driveability:step'?'step':e.name==='driveability:frame'?'frame':null;if(k&&q[k].length<50000)q[k].push(e.duration);}}).observe({entryTypes:['measure']});
  let last;const tick=now=>{q.rafCount++;q.lastRaf=now;if(q.active){if(last!==undefined&&q.raf.length<50000)q.raf.push(now-last);if(q.raf.length%60===0){const d=document.querySelector('canvas')?.dataset;if(d)q.poses.push({at:now,steps:d.physicsSteps,speed:d.vehicleSpeed,pose:JSON.parse(d.vehiclePose??'null'),recoveries:d.vehicleRecoveries,mode:d.drivingMode,hidden:document.hidden,hasFocus:document.hasFocus(),phase:window.__qualificationProtocol?.phase??'idle'});}}last=q.active?now:undefined;requestAnimationFrame(tick);};requestAnimationFrame(tick);
  window.addEventListener('error',e=>q.errors.push(e.message));
  const nativeFetch=window.fetch;window.fetch=(input,...rest)=>String(input instanceof Request?input.url:input).includes('/api/zone-generation')?Promise.reject(new TypeError('Qualification: generation service intentionally unavailable')):nativeFetch(input,...rest);
 });return {context,page};}
async function load(page,zone){await page.bringToFront();const start=performance.now();await page.goto(`${base}/?zone=${zone.id}&qualify=1`,{waitUntil:'load'});await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.vehiclePose&&document.querySelector('canvas').dataset.vehicleStatus==='ready',{timeout:15000,polling:100});await page.waitForFunction(()=>!document.querySelector('.drive-primary')?.disabled);const elapsedMs=performance.now()-start;const viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio}));if(viewport.width!==1440||viewport.height!==900||Math.abs(viewport.dpr-1)>1e-6)throw Error('Qualification viewport mismatch: '+JSON.stringify(viewport));return {elapsedMs,state:await state(page),viewport};}
async function renderer(page){return page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2');const e=gl?.getExtension('WEBGL_debug_renderer_info');return {userAgent:navigator.userAgent,renderer:gl?.getParameter(e?.UNMASKED_RENDERER_WEBGL??gl.RENDERER),vendor:gl?.getParameter(e?.UNMASKED_VENDOR_WEBGL??gl.VENDOR),version:gl?.getParameter(gl.VERSION),memoryApi:!!performance.memory,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},hidden:document.hidden,hasFocus:document.hasFocus()};});}
async function frames(page,n){await bounded(page.evaluate(n=>new Promise((resolve,reject)=>{let start=+document.querySelector('canvas').dataset.physicsSteps,deadline=performance.now()+10000;const t=()=>{const d=document.querySelector('canvas').dataset;if(+d.physicsSteps>=start+n)resolve();else if(performance.now()>deadline)reject(Error('Physics did not advance: '+JSON.stringify({dataset:{...d},hidden:document.hidden,hasFocus:document.hasFocus(),focus:document.activeElement.tagName,events:window.__qualification.focusEvents})));else requestAnimationFrame(t);};t();}),n),12000,'External physics-progress deadline exceeded');}
async function closeContext(context,page){
 try{report.lastPageSnapshot=await bounded(page.evaluate(()=>({at:performance.now(),state:{...document.querySelector('canvas')?.dataset},hidden:document.hidden,hasFocus:document.hasFocus(),focus:document.activeElement?.tagName,diagnostics:window.__qualification&&{rafCount:window.__qualification.rafCount,lastRaf:window.__qualification.lastRaf,timerCount:window.__qualification.timerCount,lastTimer:window.__qualification.lastTimer,focusEvents:window.__qualification.focusEvents,errors:window.__qualification.errors},protocol:window.__qualificationProtocol?.snapshot()})),3000,'Final page snapshot unavailable');}catch(error){report.lastPageSnapshot={error:String(error)};}
 save();await bounded(context.close(),10000,'Context close deadline');
}
function check(ok,message){if(!ok){report.failures.push(message);save();throw Error(message);}}
function stats(xs){xs.sort((a,b)=>a-b);return {count:xs.length,p50:xs[Math.ceil(xs.length*.5)-1]??null,p95:xs[Math.ceil(xs.length*.95)-1]??null,p99:xs[Math.ceil(xs.length*.99)-1]??null,max:xs.at(-1)??null};}
try{
 browser=await puppeteer.launch({browser:engine==='firefox'?'firefox':'chrome',executablePath:process.env.BROWSER_PATH,headless:report.headless,args:engine==='firefox'?[]:['--enable-precise-memory-info',...(report.headless?[]:['--window-size=1460,1020'])],defaultViewport:report.viewport,protocolTimeout:20000});
report.browser=await browser.version();
report.launchArgs=browser.process().spawnargs;
for(const [name,hash] of Object.entries(report.build)){const response=await fetch(new URL('/assets/'+name,base),{signal:AbortSignal.timeout(10000)});if(!response.ok||createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex')!==hash)throw Error('Served build mismatch: '+name);}
report.servedBuildVerified=true;

 if(!process.env.PERF_ONLY&&!process.env.LIFECYCLE_ONLY&&!sustainedZone)for(const zone of catalogue){
  for(let attempt=1;attempt<=3;attempt++){
   const {context,page}=await contextPage();try{const cold=await load(page,zone);report.cold.push({id:zone.id,attempt,...cold,pass:cold.elapsedMs<=5000&&+cold.state.physicsSetupMs<=1000&&+cold.state.physicsInitializationMs<=3000});report.renderer??=await renderer(page);save();}finally{await closeContext(context,page);}
  }
  const {context,page}=await contextPage();try{
   const initial=await load(page,zone);await click(page,'Drive');await frames(page,120);await page.keyboard.down('w');await frames(page,90);await page.keyboard.down('a');await frames(page,20);await page.keyboard.up('a');await page.keyboard.up('w');const moving=await state(page);check(+moving.vehicleSpeed>2,'keyboard acceleration failed '+zone.label);
   await page.keyboard.down(' ');await frames(page,90);await page.keyboard.up(' ');const stopped=await state(page);check(Math.abs(+stopped.vehicleSpeed)<.01,'brake failed '+zone.label);
   await page.keyboard.down('s');await frames(page,100);await page.keyboard.up('s');const reverse=await state(page);check(+reverse.vehicleSpeed< -2.5,'reverse failed '+zone.label);
   await page.keyboard.down(' ');await frames(page,90);await page.keyboard.up(' ');await page.screenshot({path:`${output}/${zone.id}-driving.png`});
   await click(page,'Reset vehicle');const reset=await state(page);check(reset.drivingMode==='paused'&&+reset.vehicleSpeed===0,'reset failed');
   await click(page,'Resume driving');await page.keyboard.down('w');await frames(page,30);await page.keyboard.press('Escape');await page.keyboard.up('w');const paused=await state(page);await sleep(300);check((await state(page)).physicsSteps===paused.physicsSteps,'pause advanced');
   await click(page,'Inspect');check((await state(page)).cameraOwner==='orbit','camera ownership failed');await click(page,'Reset view');await page.screenshot({path:`${output}/${zone.id}-overview.png`});
   check(!(await page.evaluate(()=>window.__qualification.errors.length)),'unexpected browser errors');report.functional.push({id:zone.id,initial,moving,stopped,reverse,reset,paused,result:'pass'});save();console.log(engine,zone.label,'cold and keyboard functional pass');
  }finally{await closeContext(context,page);}
 }
 if(!process.env.FUNCTIONAL_ONLY&&!process.env.LIFECYCLE_ONLY)for(const index of sustainedIndices){
  const zone=catalogue[index],seconds=index<2?60:120;
  const {context,page}=await contextPage();
  const actions=[];
  let start,attemptError,result;
  try{
   await load(page,zone);report.renderer??=await renderer(page);await click(page,'Drive');await frames(page,120);
   await page.evaluate(installQualificationProtocol);
   await page.evaluate(()=>{window.__qualification.active=true;window.__qualificationProtocol.start();});
   start=performance.now();
   // Keep the original wall-duration protocol and explicit resets. All driving
   // intervals must remain foreground/running; reset windows are marked exactly.
   let cycle=0;
   while(performance.now()-start<seconds*1000){
    cycle++;
    let commandIndex=0;
    for(const [keys,ms] of [[['w'],1200],[['w','a'],350],[[' '],700],[['s'],1300],[[' '],700]]){
     const label=`cycle ${cycle} command ${++commandIndex}`;
     const before=await page.evaluate(label=>window.__qualificationProtocol.checkpoint(label+' before'),label);
     try{for(const k of keys)await page.keyboard.down(k);await sleep(ms);}
     finally{for(const k of keys)await page.keyboard.up(k);}
     await page.evaluate(({label,steps})=>{
      const after=window.__qualificationProtocol.checkpoint(label+' after');
      if(after.steps<=steps)window.__qualificationProtocol.noProgress(label);
     },{label,steps:before.steps});
    }
    await page.evaluate(cycle=>window.__qualificationProtocol.checkpoint(`cycle ${cycle} endpoint`),cycle);
    actions.push({cycle,atMs:performance.now()-start,state:await state(page)});
    await page.evaluate(cycle=>window.__qualificationProtocol.beginReset(cycle),cycle);
    await click(page,'Reset vehicle');await click(page,'Resume driving');
    await page.evaluate(cycle=>window.__qualificationProtocol.endReset(cycle),cycle);
    if(cycle%5===0)console.log(engine,zone.label,Math.round((performance.now()-start)/1000),'s');
   }
  }catch(error){attemptError=String(error);}
  finally{
   // Save the partial interval/command evidence before closing the context, even
   // when a checkpoint rejects an interruption. Percentiles alone never pass it.
   try{
    const protocol=await page.evaluate(completed=>{
     window.__qualification.active=false;
     return window.__qualificationProtocol?.finish(completed)??{accepted:false,complete:false,notStarted:true};
    },!attemptError);
    const elapsedMs=start===undefined?0:performance.now()-start;
    const final=await state(page),raw=await page.evaluate(()=>window.__qualification);
    const resources=JSON.parse(final.qualificationResources??'{}');
    result={id:zone.id,seconds,elapsedMs,step:stats(raw.step),frame:stats(raw.frame),raf:stats(raw.raf),resources,actions,poses:raw.poses,errors:raw.errors,focusEvents:raw.focusEvents,final,protocol,error:attemptError};
    result.numericBudgets={step:result.step.count>0&&result.step.p95<=2&&result.step.p99<=4,frame:result.frame.count>0&&result.frame.p95<=16.7,raf:result.raf.count>0&&result.raf.p95<=33.4&&result.raf.p99<=50,dropped:Number.isFinite(resources.droppedMs)&&elapsedMs>0&&resources.droppedMs/elapsedMs<=.01};
    result.correctness={noRecovery:+final.vehicleRecoveries===0,resources:final.canvases===1&&resources.bodies===1&&resources.controllers===1&&resources.colliders===7,noPageErrors:raw.errors.length===0};
    result.acceptance={numericBudgets:Object.values(result.numericBudgets).every(Boolean),foregroundProtocol:protocol.accepted&&elapsedMs>=seconds*1000,correctness:Object.values(result.correctness).every(Boolean)};
    result.acceptance.overall=!attemptError&&Object.values(result.acceptance).every(Boolean);
    report.sustained.push(result);save();
    await page.screenshot({path:`${output}/${zone.id}-sustained.png`});
    console.log(engine,zone.label,JSON.stringify(result.acceptance));
   }catch(error){
    attemptError??=String(error);
    if(!result){report.sustained.push({id:zone.id,seconds,actions,error:attemptError,acceptance:{overall:false},evidenceError:String(error)});save();}
    else{result.evidenceError=String(error);result.acceptance.overall=false;save();}
   }finally{await closeContext(context,page);}
  }
  check(!attemptError&&result?.acceptance.overall,`${zone.label}: sustained qualification incomplete or failed; ${attemptError??'see numeric/protocol/correctness results'}`);
 }
 if(!process.env.FUNCTIONAL_ONLY&&!sustainedZone){const {context,page}=await contextPage();try{
  const cdp=engine==='firefox'?null:await page.createCDPSession();
  for(let cycle=1;cycle<=20;cycle++){
   const zone=catalogue[cycle%2===1?3:4];const loaded=await load(page,zone);report.renderer??=await renderer(page);
   const drives=[];report.lifecycleAttempt={cycle,id:zone.id,drives,resetsCompleted:0};save();
   for(let r=0;r<3;r++){
    await click(page,r===0?'Drive':'Resume driving');
    await page.evaluate(installQualificationProtocol);await page.evaluate(()=>window.__qualificationProtocol.start());
    await page.keyboard.down('w');await frames(page,45);await page.keyboard.up('w');
    const protocol=await page.evaluate(()=>{window.__qualificationProtocol.checkpoint('before planned reset');return window.__qualificationProtocol.finish(true);});
    drives.push(protocol);check(protocol.accepted,'Invalid lifecycle drive');
    await click(page,'Reset vehicle');
    const reset=await state(page);check(reset.drivingMode==='paused'&&+reset.vehicleSpeed===0&&+reset.vehicleResets===r+1,'Lifecycle reset failed');report.lifecycleAttempt.resetsCompleted=r+1;save();
   }
   await sleep(170);if(cdp)await cdp.send('HeapProfiler.collectGarbage');const s=await state(page),heap=await page.evaluate(()=>performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize,limit:performance.memory.jsHeapSizeLimit}:null),dom=cdp?await cdp.send('Memory.getDOMCounters'):null;
   const resources=JSON.parse(s.qualificationResources??'{}');
   const previous=report.lifecycle.find(c=>c.id===zone.id)?.resources;
   check(s.canvases===1&&resources.bodies===1&&resources.controllers===1&&resources.colliders===7&&+s.vehicleRecoveries===0&&+s.physicsSteps>=135,'Lifecycle resources/recovery/progress failed');
   if(previous)check(['geometries','textures','programs'].every(k=>resources[k]===previous[k]),'Renderer counts changed for same cell');
   const processMemorySample=processMemory(browser.process().pid);
   report.lifecycle.push({cycle,id:zone.id,loadedMs:loaded.elapsedMs,state:s,heap,dom,drives,resources,processMemory:processMemorySample,focusEvents:await page.evaluate(()=>window.__qualification.focusEvents)});save();console.log(engine,'lifecycle',cycle,heap?.used??'memory API unavailable');
  }
  await page.goBack({waitUntil:'load'});
  await page.waitForFunction(()=>{const d=document.querySelector('canvas')?.dataset;return d?.vehiclePose&&d.physicsSteps==='0'&&d.vehicleResets==='0'&&d.drivingMode==='inspect';},{timeout:15000});
  report.historyRestoration={state:await state(page),url:page.url(),navigationType:await page.evaluate(()=>performance.getEntriesByType('navigation')[0]?.type),result:'fresh neutral inspection after Back'};
  report.memoryAcceptance=memoryAcceptance(report.lifecycle);save();
  check(report.memoryAcceptance.result==='unmeasured'||(report.memoryAcceptance.postGcHeap&&report.memoryAcceptance.growthPass),'JS heap budget failed');
 }finally{await closeContext(context,page);}}
}catch(error){
 report.error=String(error);report.interruption=report.lastPageSnapshot;
 if(diagnosticPage&&!diagnosticPage.isClosed())try{report.interruption=await bounded(diagnosticPage.evaluate(()=>({at:performance.now(),state:{...document.querySelector('canvas')?.dataset},hidden:document.hidden,hasFocus:document.hasFocus(),focus:document.activeElement?.tagName,qualification:window.__qualification,protocol:window.__qualificationProtocol?.snapshot()})),3000,'Diagnostic snapshot unavailable');}catch(diagnosticError){report.diagnosticError=String(diagnosticError);}
 save();process.exitCode=1;
}finally{report.loadAfter=loadavg();save();if(browser)await bounded(browser.close(),10000,'Browser close deadline');}
