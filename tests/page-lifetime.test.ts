import {afterEach,describe,expect,it,vi} from 'vitest';
import {onPageExit} from '../src/lib/scene/page-lifetime';
afterEach(()=>vi.unstubAllGlobals());
function fixture(){const win=Object.assign(new EventTarget(),{location:{reload:vi.fn()}});vi.stubGlobal('window',win);const fire=(name:string,persisted=false)=>win.dispatchEvent(Object.assign(new Event(name),{persisted}));return {win,fire};}
describe('navigation ownership',()=>{
 it('cleans a cached loading/scene owner once, detaches before cleanup and reloads restoration once',()=>{
  const {win,fire}=fixture();let detach=()=>{};const cleanup=vi.fn(()=>detach());detach=onPageExit(cleanup);
  fire('pagehide',true);fire('pagehide',true);expect(cleanup).toHaveBeenCalledOnce();
  fire('pageshow',true);fire('pageshow',true);expect(win.location.reload).toHaveBeenCalledOnce();
 });
 it('shares one restoration callback when multiple owners exit and does not reload ordinary navigation',()=>{
  const {win,fire}=fixture();const a=vi.fn(),b=vi.fn();onPageExit(a);onPageExit(b);fire('pagehide',true);fire('pageshow',true);
  expect(a).toHaveBeenCalledOnce();expect(b).toHaveBeenCalledOnce();expect(win.location.reload).toHaveBeenCalledOnce();
  onPageExit(a);fire('pagehide');fire('pageshow',true);expect(win.location.reload).toHaveBeenCalledOnce();
 });
 it('component unmount detaches without installing a future restoration callback',()=>{
  const {win,fire}=fixture(),cleanup=vi.fn(),detach=onPageExit(cleanup);detach();detach();fire('pagehide',true);fire('pageshow',true);
  expect(cleanup).not.toHaveBeenCalled();expect(win.location.reload).not.toHaveBeenCalled();
 });
});
