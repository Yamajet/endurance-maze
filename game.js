(()=>{'use strict';
const c=document.getElementById('game'),g=c.getContext('2d'),N=16,T=48,TAU=Math.PI*2;
const el=id=>document.getElementById(id),rand=(a,b)=>a+Math.floor(Math.random()*(b-a+1)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const modes=[
  {key:'none',label:'敵なし',mult:1},
  {key:'small',label:'敵あり（小さくて止まってる）',mult:2},
  {key:'still',label:'敵あり（止まってる）',mult:3},
  {key:'moving',label:'敵あり（動く）',mult:4},
  {key:'swell',label:'敵あり（動くし膨らむ）',mult:5},
  {key:'fast',label:'敵あり（すげー動く）',mult:8},
  {key:'goalMove',label:'ゴールがすげー動く',mult:1},
  {key:'goalTiny',label:'ゴールがすげー小さくなる',mult:4},
  {key:'goalMany',label:'ゴールがだいぶ増える',mult:2},
  {key:'goalManyMove',label:'ゴールがだいぶ増えるしすげー動く',mult:2},
  {key:'swap',label:'俺とゴールがたまに逆になるし、敵も動く',mult:8},
  {key:'wallEnemy',label:'壁が敵になる',mult:5},
  {key:'wallCoin',label:'壁がコインになる',mult:10},
  {key:'coinEnemy',label:'コインも敵になるし動く',mult:11}
];
const storageKey='endurance-maze-unlocks-v1';
let unlockLevel=0;try{unlockLevel=clamp(Number(localStorage.getItem(storageKey))||0,0,modes.length)}catch(e){}
let audio=null,active=false,holding=false,bpm=60,startBpm=60,stageNo=1,score=0,enemyMode='none',barStart=0,last=0;
let board,nextBoard,player={x:2,y:14},target={x:2,y:14},cleared=false,beatSeen=-1,bumpAt=-1,bgmSource=null,explosionSource=null,samples={},toastTimer;
function mode(){return modes.find(m=>m.key===enemyMode)||modes[0]}
function showModes(){document.querySelectorAll('[data-unlock]').forEach(label=>{label.hidden=Number(label.dataset.unlock)>unlockLevel});const selected=document.querySelector('input[name="enemyMode"]:checked');if(!selected||selected.closest('label').hidden)document.querySelector('input[name="enemyMode"][value="none"]').checked=true}
function showToast(title,name){clearTimeout(toastTimer);el('unlockTitle').textContent=title;el('unlockName').textContent=name;el('unlockToast').hidden=false;play('unlock',.66);toastTimer=setTimeout(()=>el('unlockToast').hidden=true,5200)}
function unlockAfterRun(){if(unlockLevel<modes.length-1){unlockLevel++;showModes();showToast('敵の封印が解除されました',modes[unlockLevel].label)}else if(unlockLevel===modes.length-1){unlockLevel=modes.length;showToast('敵の封印が全部解除されました','おつ')}try{localStorage.setItem(storageKey,String(unlockLevel))}catch(e){}}
async function loadAudio(){for(const name of ['bgm60','bgm120','wall','coin','unlock','explosion']){try{const b=await (await fetch('assets/'+name+(name==='explosion'?'.mp3':'.wav'))).arrayBuffer();samples[name]=await audio.decodeAudioData(b)}catch(e){}}}
function play(name,volume=1,rate=1){if(!audio||!samples[name])return;const src=audio.createBufferSource(),gain=audio.createGain();src.buffer=samples[name];src.playbackRate.value=rate;gain.gain.value=volume;src.connect(gain).connect(audio.destination);src.start();return src}
function playBar(){const base=bpm<90?60:120;bgmSource=play('bgm'+base,.576,bpm/base)}
function cell(x,y){return x>=0&&x<N&&y>=0&&y<N}
function canPlaceGoal(b,x,y){const r=.98,eps=1e-8;for(let yy=Math.floor(y-r+eps);yy<=Math.floor(y+r-eps);yy++)for(let xx=Math.floor(x-r+eps);xx<=Math.floor(x+r-eps);xx++)if(!cell(xx,yy)||b.grid[yy][xx])return false;return true}
function makeBoard(){
  const grid=Array.from({length:N},(_,y)=>Array.from({length:N},(_,x)=>x===0||y===0||x===15||y===15?1:0));
  const gy=rand(1,13),path=Array(16).fill(14),detour=Math.random()<.4,gateX=rand(7,10);
  const directY=14+(gy+1-14)*(gateX-2)/12,gateY=directY>7.5?3:12;
  for(let x=1;x<=14;x++)path[x]=clamp(Math.round(detour?(x<=gateX?14+(gateY-14)*(x-2)/(gateX-2):gateY+(gy+1-gateY)*(x-gateX)/(14-gateX)):14+(gy+1-14)*(x-1)/13),2,14);
  const safe=(x,y)=>x>=1&&x<=14&&Math.abs(y-path[x])<=2;
  const count=rand(10,16);for(let i=0;i<count;i++){const x=rand(2,13),y=rand(2,13),horizontal=Math.random()<.65,len=rand(1,3);for(let j=0;j<len;j++){const xx=x+(horizontal?j:0),yy=y+(horizontal?0:j);if(xx>14||yy>14||safe(xx,yy)||xx>=13&&yy>=gy&&yy<=gy+1)continue;grid[yy][xx]=1}}
  if(detour)for(let y=1;y<=14;y++)grid[y][gateX]=Math.abs(y-gateY)<=2?0:1;
  // Keep the wall-free route broad enough for a 2.5 by 2.5 square.
  const start={x:2.5,y:13.5},end={x:13.5,y:clamp(gy+1,2.5,13.5)};
  const waypoints=detour?[start,{x:2.5,y:gateY+.5},{x:13.5,y:gateY+.5},end]:[start,end];
  const protectedCells=new Set();
  for(let i=1;i<waypoints.length;i++){const a=waypoints[i-1],b=waypoints[i],steps=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)*5);
    for(let j=0;j<=steps;j++){const cx=a.x+(b.x-a.x)*j/steps,cy=a.y+(b.y-a.y)*j/steps;
      for(let y=Math.max(1,Math.floor(cy-1.4));y<=Math.min(14,Math.ceil(cy+1.4)-1);y++)for(let x=Math.max(1,Math.floor(cx-1.4));x<=Math.min(14,Math.ceil(cx+1.4)-1);x++){grid[y][x]=0;protectedCells.add(x+','+y)}}}
  const overlapsGoal=(x,y)=>x>=13&&y>=gy&&y<=gy+1;
  const route=[],free=[];for(let y=1;y<=14;y++)for(let x=2;x<=13;x++)if(grid[y][x]===0&&!overlapsGoal(x,y))(protectedCells.has(x+','+y)?route:free).push({x:x+.5,y:y+.5});
  const coins=[];while(coins.length<4&&route.length){const p=route.splice(rand(0,route.length-1),1)[0];if(coins.every(q=>Math.hypot(q.x-p.x,q.y-p.y)>1.3))coins.push(p)}
  const extra=free.length?free[rand(0,free.length-1)]:route.find(p=>coins.every(q=>Math.hypot(q.x-p.x,q.y-p.y)>1));if(extra)coins.push(extra);
  function distanceToRoute(p){let best=Infinity;for(let i=1;i<waypoints.length;i++){const a=waypoints[i-1],b=waypoints[i],dx=b.x-a.x,dy=b.y-a.y,u=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy),0,1);best=Math.min(best,Math.hypot(p.x-a.x-u*dx,p.y-a.y-u*dy))}return best}
  const enemies=[],enemyModes=['small','still','moving','swell','fast','swap','coinEnemy'];
  const roll=Math.random(),enemyCount=enemyModes.includes(enemyMode)?roll<.2?1:roll<.85?2:3:0;
  for(let i=0;i<enemyCount;i++){const candidates=free.filter(p=>p.x>4&&p.x<13&&distanceToRoute(p)>=(enemyMode==='small'?2.5:3.3)&&coins.every(q=>Math.hypot(q.x-p.x,q.y-p.y)>1.3)&&enemies.every(e=>Math.hypot(e.x-p.x,e.y-p.y)>2.1));
    if(candidates.length){const p=candidates[rand(0,candidates.length-1)];enemies.push({x:p.x,y:p.y,axis:Math.random()<.5?'x':'y',phase:Math.random()*TAU})}}
  const reverse=enemyMode==='swap'&&Math.random()<.3;
  const spawn=reverse?{x:14,y:gy+1}:{x:2,y:14};
  const firstGoal=reverse?{x:2,y:14}:{x:14,y:gy+1};
  const goals=[{...firstGoal,axis:'x',phase:Math.random()*TAU,taken:false}];
  const b={grid,path,coins,enemies,goals,spawn,detour,reverse,waypoints};
  if(enemyMode==='goalMany'||enemyMode==='goalManyMove'){
    for(const [lo,hi] of [[3,5],[6,8],[9,11],[12,13]]){
      const candidates=[];for(let y=2;y<=13;y++)for(let x=lo;x<=hi;x++){
        const p={x:x+.5,y:y+.5};if(canPlaceGoal(b,p.x,p.y)&&protectedCells.has(x+','+y)&&Math.hypot(p.x-spawn.x,p.y-spawn.y)>2.3&&goals.every(q=>Math.hypot(q.x-p.x,q.y-p.y)>1.7))candidates.push(p)}
      if(candidates.length){const p=candidates[rand(0,candidates.length-1)];goals.push({...p,axis:Math.random()<.5?'x':'y',phase:Math.random()*TAU,taken:false})}
    }
    while(goals.length<5){
      const candidates=[];for(let y=2;y<=13;y++)for(let x=2;x<=13;x++){
        const p={x:x+.5,y:y+.5};if(canPlaceGoal(b,p.x,p.y)&&Math.hypot(p.x-spawn.x,p.y-spawn.y)>2.3&&goals.every(q=>Math.hypot(q.x-p.x,q.y-p.y)>1.7))candidates.push(p)}
      if(!candidates.length)break;
      const p=candidates[rand(0,candidates.length-1)];goals.push({...p,axis:Math.random()<.5?'x':'y',phase:Math.random()*TAU,taken:false})
    }
  }
  if(enemyMode==='goalMove'){const angle=Math.random()*TAU;goals[0].vx=Math.cos(angle)*8.06;goals[0].vy=Math.sin(angle)*8.06}
  if(enemyMode==='wallCoin')for(let y=1;y<=14;y++)for(let x=1;x<=14;x++)if(grid[y][x]){grid[y][x]=0;coins.push({x:x+.5,y:y+.5})}
  if(enemyMode==='coinEnemy'){for(const coin of coins)enemies.push({x:coin.x,y:coin.y,axis:Math.random()<.5?'x':'y',phase:Math.random()*TAU,coin:true});coins.length=0}
  return b;
}
function blocked(x,y,b=board){const ix=Math.floor(x),iy=Math.floor(y);return !cell(ix,iy)||b.grid[iy][ix]!==0}
// The player's visible body is 2 by 2; its wall/enemy collision square is central 1 by 1.
function hitWall(x,y){const r=.5,eps=1e-8;for(let yy=Math.floor(y-r+eps);yy<=Math.floor(y+r-eps);yy++)for(let xx=Math.floor(x-r+eps);xx<=Math.floor(x+r-eps);xx++)if(!cell(xx,yy)||board.grid[yy][xx]&&(enemyMode!=='wallEnemy'||xx===0||xx===15||yy===0||yy===15))return true;return false}
function touchesInteriorWall(x,y){const r=.5,eps=1e-8;for(let yy=Math.floor(y-r+eps);yy<=Math.floor(y+r-eps);yy++)for(let xx=Math.floor(x-r+eps);xx<=Math.floor(x+r-eps);xx++)if(xx>0&&xx<15&&yy>0&&yy<15&&board.grid[yy][xx])return true;return false}
function fail(reason){if(!active)return;active=false;holding=false;if(bgmSource){try{bgmSource.stop()}catch(e){}bgmSource=null}explosionSource=play('explosion',.3);
  el('result').textContent=`${reason} · 到達 ${stageNo}ステージ / ${score}点\n開始 BPM ${startBpm} · ${mode().label}`;
  const post=`到達ステージ：${stageNo}\nスコア：${score}点\n開始BPM：${startBpm}\n設定：${mode().label}\n\n#エンデュランス迷路\n${new URL('.',location.href).href}`;
  el('shareX').href='https://x.com/intent/post?text='+encodeURIComponent(post);el('shareBsky').href='https://bsky.app/intent/compose?text='+encodeURIComponent(post);
  el('share').classList.remove('hidden');el('start').textContent='もう一度';el('overlay').classList.remove('hidden');unlockAfterRun()}
function scoreGoal(){if(cleared)return;cleared=true;const points=bpm*mode().mult;score+=points;el('score').textContent=score;el('message').textContent='CLEAR! +'+points;if(!nextBoard)nextBoard=makeBoard()}
function wallFeedback(t){if(t-bumpAt>.14){bumpAt=t;play('wall',.27)}}
function enemyPos(e,t,b=board){if(!['moving','swell','fast','swap','coinEnemy'].includes(enemyMode))return {x:e.x,y:e.y};const amp=enemyMode==='fast'?1.44:.36,frequency=enemyMode==='fast'?5.6:2.8,v=Math.sin(t*frequency+e.phase)*amp,x=e.x+(e.axis==='x'?v:0),y=e.y+(e.axis==='y'?v:0);return enemyMode==='fast'||!blocked(x,y,b)?{x,y}:{x:e.x,y:e.y}}
function enemyRadius(e,t){return e.coin ? .34 : enemyMode==='small' ? .5 : enemyMode==='swell' ? 1+.25*(1-Math.cos(TAU*t/.8)) : 1}
function goalPos(goal,t,b){if(enemyMode!=='goalManyMove')return goal;const v=Math.sin(t*5.6+goal.phase)*.36,x=goal.x+(goal.axis==='x'?v:0),y=goal.y+(goal.axis==='y'?v:0);return canPlaceGoal(b,x,y)?{x,y}:goal}
function moveGoal(dt){if(enemyMode!=='goalMove')return;const goal=board.goals[0],s=Math.min(dt,.05);
  if(canPlaceGoal(board,goal.x+goal.vx*s,goal.y))goal.x+=goal.vx*s;else goal.vx=-goal.vx;
  if(canPlaceGoal(board,goal.x,goal.y+goal.vy*s))goal.y+=goal.vy*s;else goal.vy=-goal.vy}
function goalTouched(pos){if(enemyMode==='goalTiny')return Math.hypot(player.x-pos.x,player.y-pos.y)<1.0625;return Math.abs(player.x-pos.x)<2&&Math.abs(player.y-pos.y)<2}
function update(dt,t){if(!active)return;let elapsed=t-barStart,bar=240/bpm,beat=60/bpm;
  if(elapsed>=3*beat&&!nextBoard)nextBoard=makeBoard();
  if(elapsed>=bar){if(!cleared){fail('時間切れ');return}stageNo++;bpm++;board=nextBoard||makeBoard();nextBoard=null;cleared=false;barStart+=bar;elapsed=t-barStart;player={...board.spawn};target={...player};holding=false;beatSeen=-1;el('stage').textContent=stageNo;el('bpm').textContent=bpm;el('message').textContent='マウス／タップを押したまま操作';playBar()}
  moveGoal(dt);
  const bIndex=Math.floor(elapsed/beat);if(bIndex!==beatSeen)beatSeen=bIndex;
  if(holding){let tx=target.x,ty=target.y;if(elapsed>=beat*3){const u=clamp((elapsed-beat*3)/beat,0,1),edge=16*Math.pow(u,4);tx=Math.max(tx,edge+1)}
    const step=Math.min(44*dt,3),steps=Math.ceil(step/.09);
    for(let n=0;n<steps;n++){const d=Math.hypot(tx-player.x,ty-player.y);if(d<.001)break;const s=Math.min(.09,step/steps,d),dx=(tx-player.x)/d*s,dy=(ty-player.y)/d*s;
      if(!hitWall(player.x+dx,player.y))player.x+=dx;else wallFeedback(t);
      if(!hitWall(player.x,player.y+dy))player.y+=dy;else wallFeedback(t);
      if(enemyMode==='wallEnemy'&&touchesInteriorWall(player.x,player.y)){fail('壁の敵に当たった');return}}}
  for(const coin of board.coins)if(!coin.taken&&Math.abs(player.x-coin.x)<1.1&&Math.abs(player.y-coin.y)<1.1){coin.taken=true;score+=30*mode().mult;el('score').textContent=score;play('coin',.66)}
  for(const e of board.enemies){const p=enemyPos(e,t),r=enemyRadius(e,t);if(Math.hypot(clamp(p.x,player.x-.5,player.x+.5)-p.x,clamp(p.y,player.y-.5,player.y+.5)-p.y)<r){fail('敵に当たった');return}}
  if(!cleared){for(const goal of board.goals)if(!goal.taken&&goalTouched(goalPos(goal,t,board))){goal.taken=true;el('message').textContent=`GOAL ${board.goals.filter(x=>x.taken).length}/${board.goals.length}`}
    if(board.goals.every(goal=>goal.taken))scoreGoal()}
  el('time').textContent=Math.max(0,bar-elapsed).toFixed(2)+'s'}
function brick(x,y,glow=0,pulse=0,hostile=false){g.save();g.translate((x+.5)*T,(y+.5)*T);g.scale(1+pulse*.52,1+pulse*.52);g.translate(-T/2,-T/2);g.fillStyle=hostile?'#b13856':glow>0?`rgb(${Math.round(129+glow*90)},${Math.round(143+glow*92)},${Math.round(165+glow*85)})`:'#8d5e5b';g.fillRect(-1,-1,T+2,T+2);g.fillStyle=hostile?'#ff7385':glow>0?'#a1e9f4':'#d88667';g.fillRect(3,3,T-6,6);g.fillRect(3,T/2,T-6,4);g.fillRect(T/2-2,4,4,T/2-4);g.fillRect(T/4-2,T/2+3,4,T/2-7);g.fillStyle='#4b394b';g.fillRect(3,T-7,T-6,4);g.restore()}
function drawBoard(b,t,flash,pulse){g.fillStyle='#36527b';g.fillRect(0,0,768,768);
  for(let y=1;y<15;y++)for(let x=1;x<15;x++){g.fillStyle=(x+y)%2?'#42628a':'#3c5b83';g.fillRect(x*T,y*T,T,T);g.fillStyle='#ffffff08';g.fillRect(x*T,y*T,T,1)}
  g.fillStyle='#a6dbe220';for(let i=0;i<4;i++){const x=(i*207+60)%650,y=110+i*133;g.beginPath();g.ellipse(x,y,35,12,0,0,TAU);g.fill()}
  for(let y=1;y<15;y++)for(let x=1;x<15;x++)if(b.grid[y][x])brick(x,y,0,0,enemyMode==='wallEnemy');
  for(let y=0;y<16;y++)for(let x=0;x<16;x++)if(x===0||x===15||y===0||y===15)brick(x,y,flash,pulse);
  for(const coin of b.coins)if(!coin.taken){const x=coin.x*T,y=coin.y*T;g.fillStyle='#fbc94c';g.beginPath();g.ellipse(x,y,12+Math.sin(t*7+coin.x)*2,16,0,0,TAU);g.fill();g.strokeStyle='#fff3a0';g.lineWidth=3;g.stroke();g.fillStyle='#a87022';g.fillRect(x-2,y-9,4,18)}
  for(const e of b.enemies){const p=enemyPos(e,t,b),x=p.x*T,y=p.y*T,r=enemyRadius(e,t)*T;g.save();g.translate(x,y);g.fillStyle=e.coin?'#ffb438':'#f07885';g.beginPath();g.arc(0,0,r,0,TAU);g.fill();g.fillStyle='#22233e';g.fillRect(-r*.55,-r*.2,r*.28,r*.42);g.fillRect(r*.27,-r*.2,r*.28,r*.42);g.restore()}
  for(const goal of b.goals)if(!goal.taken){const p=goalPos(goal,t,b),x=p.x*T,y=p.y*T,r=enemyMode==='goalTiny'?3:46+Math.sin(t*7),rings=enemyMode==='goalTiny'?2:11;
    for(let k=0;k<rings;k++){g.strokeStyle=`hsl(${(t*140+k*33)%360} 100% 65%)`;g.lineWidth=enemyMode==='goalTiny'?1:4;g.beginPath();g.arc(x,y,Math.max(1,r-k*(enemyMode==='goalTiny'?1:3.4)),t*2+k*.55,t*2+k*.55+Math.PI*1.55);g.stroke()}
    g.fillStyle='#080719';g.beginPath();g.arc(x,y,enemyMode==='goalTiny'?1:9,0,TAU);g.fill()}
  g.fillStyle='#7de7ef';g.fillRect((b.spawn.x-.9)*T,(b.spawn.y-.6)*T,4,38);g.fillStyle='#fff9aa';g.font='bold 18px sans-serif';g.fillText('START',clamp((b.spawn.x-.7)*T,54,674),(b.spawn.y+.2)*T)}
function render(t){const elapsed=active?t-barStart:0,beat=60/bpm,phase=elapsed%beat,flash=active?Math.pow(Math.max(0,1-phase/.15),2):0,pulseDuration=Math.min(.27,beat*.65),pulse=active&&elapsed<pulseDuration?Math.sin(Math.PI*elapsed/pulseDuration):0;
  g.clearRect(0,0,768,768);if(board){drawBoard(board,t,flash,pulse);if(active&&elapsed>=3*beat&&nextBoard){const u=clamp((elapsed-3*beat)/beat,0,1),edge=768*Math.pow(u,4);g.save();g.beginPath();g.rect(0,0,edge,768);g.clip();drawBoard(nextBoard,t,flash,pulse);g.restore();g.fillStyle='#f8e6a2';g.fillRect(edge-3,0,6,768);g.fillStyle='#fff9';g.fillRect(edge-7,0,2,768)}}
  if(pulse){g.strokeStyle=`rgba(255,237,139,${pulse*.7})`;g.lineWidth=8+pulse*18;g.strokeRect(24,24,720,720)}
  const x=player.x*T,y=player.y*T;g.fillStyle='#141a35';g.beginPath();g.arc(x,y,48,0,TAU);g.fill();g.strokeStyle='#ffe884';g.lineWidth=4;g.stroke();g.fillStyle='#fff';g.textAlign='center';g.textBaseline='middle';g.font='900 58px "Yu Gothic",system-ui';g.fillText('俺',x,y+3);g.textAlign='start';g.textBaseline='alphabetic';requestAnimationFrame(frame)}
function frame(ms){const t=audio?audio.currentTime:ms/1000,dt=Math.min(.05,Math.max(0,t-last));last=t;update(dt,t);render(t)}
function point(ev){const r=c.getBoundingClientRect();return {x:clamp((ev.clientX-r.left)/r.width*16,2,14),y:clamp((ev.clientY-r.top)/r.height*16,2,14)}}
c.addEventListener('pointerdown',ev=>{if(!active)return;ev.preventDefault();c.setPointerCapture(ev.pointerId);holding=true;target=point(ev)});c.addEventListener('pointermove',ev=>{if(holding)target=point(ev)});for(const event of ['pointerup','pointercancel','lostpointercapture'])c.addEventListener(event,()=>holding=false);
for(const b of document.querySelectorAll('[data-bpm]'))b.addEventListener('click',()=>{el('customBpm').value=b.dataset.bpm;selectPreset()});
function selectPreset(){document.querySelectorAll('[data-bpm]').forEach(b=>b.classList.toggle('selected',b.dataset.bpm===el('customBpm').value))}el('customBpm').addEventListener('input',selectPreset);selectPreset();showModes();
el('start').addEventListener('click',async()=>{if(!audio)audio=new (window.AudioContext||window.webkitAudioContext)();await audio.resume();if(!samples.bgm60)await loadAudio();if(explosionSource){try{explosionSource.stop()}catch(e){}explosionSource=null}
  bpm=clamp(parseInt(el('customBpm').value,10)||60,30,300);enemyMode=document.querySelector('input[name="enemyMode"]:checked').value;el('customBpm').value=bpm;startBpm=bpm;stageNo=1;score=0;
  board=makeBoard();nextBoard=null;player={...board.spawn};target={...player};active=true;cleared=false;holding=false;beatSeen=-1;barStart=audio.currentTime;last=barStart;
  el('bpm').textContent=bpm;el('stage').textContent=stageNo;el('score').textContent=0;el('result').textContent='';el('share').classList.add('hidden');el('overlay').classList.add('hidden');el('unlockToast').hidden=true;playBar()});
board=makeBoard();requestAnimationFrame(frame);
})();
