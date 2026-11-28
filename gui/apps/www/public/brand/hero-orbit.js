(() => {
 const hero=document.querySelector("[data-hero-orbit]");
 if(!hero)return;
 const reduced=matchMedia("(prefers-reduced-motion: reduce)");
 const toggle=document.querySelector("[data-homepage-motion]");
 const grid=hero.querySelector(".orbit-grid");
 const logo=hero.querySelector(".orbit-mark");
 const links=[...hero.querySelectorAll("[data-orbit-link]")];
 let geometry=null;
 const lanes=[...hero.querySelectorAll("[data-orbit-lane]")].map(element=>({
  direction:element.dataset.orbitLane==="up"?-1:1,
  track:element.querySelector(".orbit-track"),
  items:[...element.querySelectorAll("[data-orbit-item]")],
  step:0, height:0, phase:0, focus:0,
 }));
 let frame=0,last=0,visible=true,paused=false;
 const wrap=(value,modulus)=>((value%modulus)+modulus)%modulus;
 function draw(lane){
  if(!lane.step)return;
  const span=lane.items.length*lane.step;
  lane.focus=0;
  for(const [i,item] of lane.items.entries()){
   const y=wrap(i*lane.step+lane.phase+lane.step,span)-lane.step;
   const distance=Math.abs(y+lane.step/2-lane.height/2);
   const focus=Math.max(0,1-distance/(lane.step*1.3));
   lane.focus=Math.max(lane.focus,focus);
   item.style.transform=`translate(-50%, ${y.toFixed(2)}px) scale(${(.78+.56*focus).toFixed(3)})`;
   item.style.opacity=(.32+.68*focus).toFixed(3);
   item.style.zIndex=String(Math.round(focus*10));
  }
 }
 function drawLinks(){
  if(!geometry)return;
  for(const [i,path] of links.entries()){
   const focus=Math.max(0,Math.min(1,(lanes[i].focus-.58)/.42));
   path.style.opacity=String(.10+.29*focus);
  }
 }
 function measures(){
  if(grid&&logo&&links.length===2){
   const g=grid.getBoundingClientRect(),m=logo.getBoundingClientRect();
   const [left,right]=lanes.map(lane=>lane.track.getBoundingClientRect());
   const y=m.top+m.height/2-g.top, gap=Math.max(29,Math.min(49,g.width*.09));
   links[0].setAttribute("d", "M "+(left.left+left.width/2-g.left+gap)+" "+y+" H "+(m.left-g.left-21));
   links[1].setAttribute("d", "M "+(m.right-g.left+21)+" "+y+" H "+(right.left+right.width/2-g.left-gap));
   geometry=true;
  }
  for(const lane of lanes){
   lane.step=lane.items[0].offsetHeight;
   lane.height=lane.track.clientHeight;
   draw(lane);
  }
  drawLinks();
 }
 function tick(now){
  frame=0;
  if(paused||!visible||reduced.matches||document.hidden){last=0;return;}
  const delta=last?Math.min(48,now-last):0;
  last=now;
  for(const lane of lanes){
   const total=lane.step*lane.items.length;
   if(total)lane.phase=wrap(lane.phase+lane.direction*.026*delta,total);
   draw(lane);
  }
  drawLinks();
  frame=requestAnimationFrame(tick);
 }
 const mark=logo?.querySelector(".orbit-eye-pupils");
 const pointer=matchMedia("(hover: hover) and (pointer: fine)");
 function resetMark(){
  mark?.style.removeProperty("--eye-x");
  mark?.style.removeProperty("--eye-y");
 }
 grid?.addEventListener("pointermove",event=>{
  if(!mark||!pointer.matches||reduced.matches||paused||event.pointerType==="touch")return;
  const box=logo.getBoundingClientRect();
  const offsetX=event.clientX-(box.left+box.width/2);
  const offsetY=event.clientY-(box.top+box.height/2);
  mark.style.setProperty("--eye-x",Math.max(-3,Math.min(3,offsetX*.028)).toFixed(2)+"px");
  mark.style.setProperty("--eye-y",Math.max(-2.2,Math.min(2.2,offsetY*.028)).toFixed(2)+"px");
 });
 grid?.addEventListener("pointerleave",resetMark);
 function sync(){
  if(paused||reduced.matches||!visible)resetMark();
  hero.toggleAttribute("data-title-paused",paused||!visible||document.hidden);
  if(toggle)toggle.hidden=reduced.matches;
  if(toggle)toggle.textContent=paused?"Resume decorative motion":"Pause decorative motion";
  if(frame){cancelAnimationFrame(frame);frame=0;}
  last=0;
  if(reduced.matches)for(const lane of lanes){lane.phase=0;draw(lane);}
  else if(!paused&&visible&&!document.hidden)frame=requestAnimationFrame(tick);
 }
 toggle?.addEventListener("click",()=>{
  paused=!paused;
  sync();
  document.dispatchEvent(new CustomEvent("bapx-page-motion",{detail:{paused}}));
 });
 reduced.addEventListener("change",sync);
 document.addEventListener("visibilitychange",sync);
 if("ResizeObserver" in window)new ResizeObserver(measures).observe(hero);
 else window.addEventListener("resize",measures,{passive:true});
 if("IntersectionObserver" in window)new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;sync();}).observe(hero);
 measures();
 sync();
})();
