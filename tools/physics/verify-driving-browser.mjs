// Trusted Chromium keyboard/touch through CDP; agent-browser owns the isolated browser and captures.
// No runtime teleport/debug controls, live provider calls, or canonical cache writes.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
const base = process.argv[2] ?? 'http://127.0.0.1:4188';
const output = resolve(process.argv[3] ?? '.zone-cache/phase-03/driving-browser');
mkdirSync(output, { recursive: true });
const session = `driving-${process.pid}`;
const run = (...args) => execFileSync('npx', ['--yes', 'agent-browser', '--session', session, ...args], { encoding: 'utf8', timeout: 60000 }).trim();
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const click = name => run('find', 'role', 'button', 'click', '--name', name, '--exact');
const zones = JSON.parse(readFileSync('public/zones/index.json')).zones;
let socket, id = 0, targetSession;
const pending = new Map();
async function connect() {
  socket = new WebSocket(run('get', 'cdp-url'));
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => {
    const message = JSON.parse(event.data), request = pending.get(message.id);
    if (request) { pending.delete(message.id); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result); }
  };
  const targets = await send('Target.getTargets', {}, false);
  const target = targets.targetInfos.find(t => t.type === 'page' && t.url.startsWith(base));
  targetSession = (await send('Target.attachToTarget', { targetId: target.targetId, flatten: true }, false)).sessionId;
}
function send(method, params = {}, attached = true) {
  return new Promise((resolve, reject) => {
    const request = ++id; pending.set(request, { resolve, reject });
    socket.send(JSON.stringify({ id: request, method, params, ...(attached ? { sessionId: targetSession } : {}) }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
const state = () => evaluate(`({...document.querySelector('canvas').dataset,focus:document.activeElement.tagName,overflow:document.documentElement.scrollWidth>innerWidth,canvases:document.querySelectorAll('canvas').length})`);
const key = (code, down, repeat = false) => send('Input.dispatchKeyEvent', { type: down ? 'keyDown' : 'keyUp', code, key: code === 'Space' ? ' ' : code === 'Escape' ? 'Escape' : code.slice(3).toLowerCase(), windowsVirtualKeyCode: code === 'Space' ? 32 : code === 'Escape' ? 27 : code.slice(3).charCodeAt(0), autoRepeat: repeat });
const steps = amount => evaluate(`new Promise((resolve,reject)=>{const start=Number(document.querySelector('canvas').dataset.physicsSteps),until=performance.now()+15000;let occluded=0,minimumCameraY=Infinity;const tick=()=>{const d=document.querySelector('canvas').dataset,c=JSON.parse(d.chaseCamera||'null');if(c){occluded+=Number(c.occluded);minimumCameraY=Math.min(minimumCameraY,c.position[1]);}if(Number(d.physicsSteps)>=start+${amount})resolve({occluded,minimumCameraY});else if(performance.now()>until)reject(Error('step wait timed out: '+d.physicsStatus));else requestAnimationFrame(tick)};tick()})`);
const shot = name => { const path = join(output, `${name}.png`); run('screenshot', path); return path; };
const observe = [];
try {
  run('open', base); run('wait', '[data-physics-state="paused"]'); run('snapshot', '-i'); await connect();
  for (const zone of ((process.env.TOUCH_ONLY || process.env.CAMERA_ONLY) ? [] : zones.slice(0, 2))) {
    run('set', 'viewport', '1440', '900'); run('open', `${base}/?zone=${zone.id}&qa=1`); run('wait', '[data-physics-state="paused"]'); run('snapshot', '-i');
    const initial = await state(); assert(initial.physicsSteps === '0' && initial.cameraOwner === 'orbit', 'New scene did not start in neutral inspection');
    click('Drive'); assert((await state()).focus === 'CANVAS', 'Drive did not focus canvas');
    await key('KeyW', true); await steps(90); await key('KeyA', true); const motion = await steps(30); await key('KeyA', false); await key('KeyW', false);
    const accelerated = await state(); assert(Number(accelerated.vehicleSpeed) > 3, 'Keyboard failed to accelerate');
    await key('Space', true); await steps(75); const braked = await state(); await key('Space', false);
    assert(Math.abs(Number(braked.vehicleSpeed)) < 0.01, 'Space did not stop');
    await key('KeyS', true); await steps(90); const reversed = await state(); await key('KeyS', false);
    assert(Number(reversed.vehicleSpeed) < -2.5, 'S did not reverse');
    await key('Space', true); await steps(75); await key('Space', false);
    const drivingShot = shot(`desktop-${zone.id}`);
    const beforeView = await state(); click('Reset view'); const afterView = await state();
    assert(afterView.vehicleResets === beforeView.vehicleResets && afterView.drivingMode === 'driving', 'Camera reset changed vehicle or paused');
    await key('KeyW', true); await steps(30); await key('KeyR', true); await key('KeyR', false);
    const reset = await state(); assert(reset.drivingMode === 'paused' && Number(reset.vehicleSpeed) === 0, 'R reset retained input/motion');
    click('Resume driving'); await key('KeyW', true, true); await steps(30); const held = await state();
    assert(Math.abs(Number(held.vehicleSpeed)) < 0.01, 'Held repeat restarted throttle after reset');
    await key('KeyW', false); await key('KeyW', true); await steps(30); await key('KeyW', false); assert(Number((await state()).vehicleSpeed) > 1, 'Fresh key did not rearm');
    await key('Escape', true); await key('Escape', false); const paused = await state();
    await evaluate('new Promise(r=>setTimeout(r,150))'); assert((await state()).physicsSteps === paused.physicsSteps, 'Paused scene advanced');
    click('Inspect'); assert((await state()).cameraOwner === 'orbit', 'Inspection did not release chase');
    run('find', 'label', 'Generated geometry', 'click'); assert(await evaluate('document.querySelector(".drive-primary").disabled'), 'Hidden obstacles allowed driving');
    run('find', 'label', 'Generated geometry', 'check');
    assert(!run('errors') && !run('console'), 'Browser error');
    observe.push({ mode: 'desktop-keyboard', zone: zone.label, initial, accelerated, braked, reversed, reset, held, motion, drivingShot });
    console.log(`Keyboard, steering/brake/reverse/reset/rearming/camera: ${zone.label} passed`);
  }
  for (const [name, width, height] of (process.env.CAMERA_ONLY ? [] : [['tablet-portrait', 820, 1180], ['tablet-landscape', 1180, 820], ['phone-portrait', 390, 844], ['phone-landscape', 844, 390]])) {
    run('set', 'viewport', String(width), String(height));
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    run('open', `${base}/?zone=${zones[1].id}`); run('wait', '[data-physics-state="paused"]'); click('Drive'); run('snapshot', '-i');
    await evaluate(`window.__pointerLog=[];for(const name of ['pointerdown','pointerup','pointercancel','lostpointercapture'])document.addEventListener(name,e=>window.__pointerLog.push({name,id:e.pointerId,target:e.target.dataset.driveInput}))`);
    const button = action => evaluate(`(()=>{const r=document.querySelector('[data-drive-input="${action}"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height}})()`);
    const accelerator = await button('forward'), left = await button('left');
    const p1 = { id: 1, x: accelerator.x, y: accelerator.y }, p2 = { id: 2, x: left.x, y: left.y };
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p1] });
    await steps(60); await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p1, p2] }); await steps(25);
    const combined = await state(), pose = JSON.parse(combined.vehiclePose);
    assert(Number(combined.vehicleSpeed) > 2 && pose.wheels[0].steering > 0.1, 'Trusted simultaneous touch did not steer and accelerate');
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...p1, x: width / 2, y: height / 2 }, p2] }); await steps(5);
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p2] });
    assert(await evaluate('document.querySelector("[data-drive-input=left]").hasAttribute("data-held")'), 'One release lost other touch');
    await send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    const cancelled = await state(); assert(cancelled.drivingMode === 'paused', 'Touch cancel did not pause');
    assert(!await evaluate('!!document.querySelector("[data-held]")'), 'Cancellation left pressed pads');
    click('Reset vehicle'); click('Resume driving');
    const pedal = async (action, duration) => {
      const point = await button(action);
      await send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{id:3,x:point.x,y:point.y}] });
      await steps(duration); const result = await state();
      await send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] }); return result;
    };
    await pedal('forward',60); const touchReverse = await pedal('reverse',150);
    assert(Number(touchReverse.vehicleSpeed)<-2.5,'Touch brake-to-reverse failed');
    const touchStop = await pedal('brake',75); assert(Math.abs(Number(touchStop.vehicleSpeed))<0.01,'Touch Stop failed');
    click('Reset vehicle'); click('Resume driving');
    const screenshot = shot(name);
    const layout = await evaluate(`({overflow:document.documentElement.scrollWidth>innerWidth,scrollY,buttons:[...document.querySelectorAll('.touch-driving button')].map(b=>{const r=b.getBoundingClientRect();return {label:b.textContent,x:r.x,y:r.y,w:r.width,h:r.height,visible:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b}})})`);
    assert(!layout.overflow && layout.scrollY === 0 && layout.buttons.every(b => b.visible && b.w >= 44 && b.h >= 44 && b.y + b.h <= height), 'Controls overflow, scroll, overlap or undersize');
    // Real mouse capture loss is separately forced through the DOM release API while pointer is active.
    await send('Input.dispatchMouseEvent', {type:'mousePressed',x:accelerator.x,y:accelerator.y,button:'left',buttons:1,clickCount:1});
    await send('Input.dispatchMouseEvent', {type:'mouseMoved',x:accelerator.x+1,y:accelerator.y,button:'left',buttons:1});
    await evaluate(`(()=>{const b=document.querySelector('[data-drive-input=forward]');for(let id=1;id<20;id++)if(b.hasPointerCapture(id))b.releasePointerCapture(id)})()`);
    await send('Input.dispatchMouseEvent', {type:'mouseMoved',x:accelerator.x+2,y:accelerator.y,button:'left',buttons:1});
    await send('Input.dispatchMouseEvent', {type:'mouseReleased',x:accelerator.x,y:accelerator.y,button:'left',buttons:0,clickCount:1}); assert((await state()).drivingMode === 'paused', 'Unexpected capture loss did not pause');
    click('Resume driving'); await evaluate('window.dispatchEvent(new Event("orientationchange"))');
    assert((await state()).drivingMode === 'paused', 'Orientation change did not pause');
    assert(!run('errors') && !run('console'), 'Touch browser error');
    observe.push({ mode: name, evidence: 'Linux Chromium touch/viewport emulation, not iPad hardware', combined, cancelled, touchReverse, touchStop, layout, screenshot });
    console.log(`${name}: trusted multi-touch, release/cancel/capture/orientation/layout passed`);
  }
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  execFileSync(process.execPath,['--import','tsx','tools/physics/browser-fixtures.ts']);
  run('set','viewport','1440','900');
  run('open',`${base}/?artifact=/phase03-camera.zone.json`);run('wait','[data-physics-state="paused"]');click('Drive');
  const wallStart=await state();assert(JSON.parse(wallStart.chaseCamera).occluded,'Wall did not retract camera');
  const wallShot=shot('rear-wall-retraction');
  await key('KeyS',true);await steps(180);await key('KeyS',false);
  const wallContact=await state();assert(JSON.parse(wallContact.chaseCamera).overhead,'Close wall did not select overhead camera');
  const overheadShot=shot('rear-wall-overhead');
  click('Reset vehicle');click('Resume driving');const wallReset=await state();
  assert(JSON.parse(wallReset.chaseCamera).position[0]<-10.35,'Reset camera penetrates wall');
  observe.push({check:'rendered wall retraction, reverse to wall, overhead fallback and reset',wallStart,wallContact,wallReset,wallShot,overheadShot});
  run('open',`${base}/?artifact=/phase03-unavailable.zone.json`);run('wait','[data-vehicle-state="unavailable"]');
  const unavailable=await state();assert(unavailable.physicsColliders==='6'&&await evaluate('document.querySelector(".drive-primary").disabled'),'Unavailable spawn allowed driving');
  click('Reset view');observe.push({check:'no safe spawn retains inspection and disables Drive',unavailable,screenshot:shot('unavailable')});

  run('set', 'viewport', '1440', '900');
  run('open', `${base}/?zone=${zones[1].id}`); run('wait','[data-physics-state="paused"]'); click('Drive');
  await steps(120); await key('KeyW',true); await steps(60); await key('KeyA',true); await steps(90);
  await key('KeyW',false); await key('Space',true); await steps(120);
  const offroad=await state(), departureMessage=await evaluate('document.querySelector(".driving-surface")?.textContent');
  assert(departureMessage?.includes('off road'),'Pavement departure feedback missing');
  await key('Space',false);await key('KeyS',true);await steps(160);await key('KeyS',false);await key('Space',true);await steps(120);
  await key('Space',false);await key('KeyA',false);
  await evaluate('new Promise(r=>setTimeout(r,180))');
  const returnedToRoad=await state();assert(!await evaluate('!!document.querySelector(".driving-surface")'),'Did not return fully to pavement');
  assert(returnedToRoad.vehicleRecoveries==='0'&&returnedToRoad.vehicleResets==='0','Offroad movement triggered recovery');
  observe.push({check:'keyboard driven off-road departure and return, Cambridge; no reset/recovery',offroad,departureMessage,returnedToRoad});
  run('open', `${base}/?zone=${zones[0].id}`); run('wait', '[data-physics-state="paused"]'); click('Drive');
  run('tab', 'new', '--label', 'focus-check', 'about:blank'); run('tab', 't1');
  const returned = await state(); assert(returned.drivingMode === 'paused', 'Tab return resumed driving');
  await evaluate('new Promise(r=>setTimeout(r,150))'); assert((await state()).physicsSteps === returned.physicsSteps, 'Hidden elapsed time caught up');
  run('tab', 'close', 'focus-check');
  observe.push({ check: 'actual tab departure/return', returned });
  click('Resume driving'); click('Locations & tools');
  run('fill', '#location-query', 'wasd'); await key('KeyW', true); await key('KeyW', false);
  const editing = await state(); assert(editing.drivingMode === 'paused', 'Editing did not pause');
  observe.push({ check: 'location editing leaves current vehicle paused', editing });
  writeFileSync(join(output, 'results.json'), JSON.stringify({ checkedAt: new Date().toISOString(), base, browser: await evaluate('navigator.userAgent'), observe }, null, 2) + '\n');
} catch(error) { console.log(await state()); console.log(await evaluate('window.__pointerLog')); shot('failure-debug'); throw error; } finally { socket?.close(); run('close'); }
