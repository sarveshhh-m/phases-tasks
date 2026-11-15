/* Phases & tasks as a dependency graph. No build step, no dependencies. */
const NS='http://www.w3.org/2000/svg', W=264, H=104, P=60, KEY='phase-task-graph.v1';
const $=s=>document.querySelector(s);
const uid=()=>Math.random().toString(36).slice(2,9);
const STAT=['todo','doing','done'];
const LABEL={todo:'To do',doing:'In progress',done:'Done'};
const CAP={todo:'TO DO',doing:'DOING',done:'DONE',blocked:'BLOCKED',early:'EARLY'};

/* ---------- icons (24x24, square caps) ---------- */
const ICON={
  todo:'<rect x="4" y="4" width="16" height="16"/>',
  doing:'<rect x="4" y="4" width="16" height="16"/><path class="fill" d="M12 4h8v16h-8z"/>',
  done:'<rect class="fill" x="4" y="4" width="16" height="16"/><path class="inv" d="M8 12.5l3 3 5-6"/>',
  blocked:'<rect x="5" y="11" width="14" height="10"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  early:'<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  ready:'<rect x="4" y="4" width="16" height="16"/><path class="fill" d="M10 8l6 4-6 4z"/>',
  menu:'<path d="M4 7h16M4 12h16M4 17h10"/>',
  home:'<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',
  fit:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  comment:'<path d="M4 5h16v11H10l-5 4v-4H4z"/>',
  pencil:'<path d="M4 20l1-4L16.5 4.5l3 3L8 19z"/>'
};
const svgIcon=(n,cls='i')=>`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;
function iconG(name,parent,x,y,size){
  const g=E('g',{class:'ico',transform:`translate(${x} ${y}) scale(${size/24})`},parent);
  g.innerHTML=ICON[name];return g;
}

/* ---------- data ---------- */
const mkNode=(title,status='todo',notes='')=>({id:uid(),title,notes,status,log:[],graph:{nodes:[],edges:[]}});
function sample(){
  const P_=(t,s,n)=>mkNode(t,s,n), link=(g,a,b)=>g.edges.push({from:a.id,to:b.id});
  const g={nodes:[],edges:[]};
  const disc=P_('Discovery','done'),des=P_('Design','doing'),bld=P_('Build','todo'),tst=P_('Test','todo'),lnc=P_('Launch','todo');
  g.nodes.push(disc,des,bld,tst,lnc);
  [[disc,des],[des,bld],[bld,tst],[tst,lnc]].forEach(([a,b])=>link(g,a,b));
  const sub=(node,specs,links)=>{const ns=specs.map(([t,s])=>P_(t,s));node.graph.nodes=ns;links.forEach(([i,j])=>link(node.graph,ns[i],ns[j]));return ns};
  sub(disc,[['Interview users','done'],['Define scope','done'],['Write brief','done']],[[0,2],[1,2]]);
  const d=sub(des,[['Wireframes','done'],['Visual design','doing'],['Design review','todo']],[[0,1],[1,2]]);
  d[1].log.push({at:Date.now()-36e5,status:'doing',text:'Waiting on logo from client'});
  const b=sub(bld,[['Data model','todo'],['API','todo'],['UI screens','todo'],['Integrate','todo']],[[0,1],[1,3],[2,3]]);
  sub(b[1],[['Auth','todo'],['CRUD endpoints','todo']],[[0,1]]);
  sub(tst,[['Write test plan','todo'],['QA pass','todo'],['Fix bugs','todo']],[[0,1],[1,2]]);
  sub(lnc,[['Deploy','todo'],['Announce','todo']],[[0,1]]);
  return {name:'',graph:g};
}
let proj=load()||sample(), path=[], selEdge=null, filter='all', hoverId=null, view={x:40,y:40,k:1};
function load(){try{const s=localStorage.getItem(KEY);return s?JSON.parse(s):null}catch(e){return null}}
function save(noWrite){try{localStorage.setItem(KEY,JSON.stringify(proj))}catch(e){} if(!noWrite)flush()}

/* ---------- graph helpers ---------- */
const lvlOf=p=>{let g=proj.graph;for(const id of p){const n=g.nodes.find(n=>n.id===id);if(!n)break;g=n.graph}return g};
const level=()=>lvlOf(path);
const hasKids=n=>n.graph.nodes.length>0;
function leaves(n){return hasKids(n)?n.graph.nodes.flatMap(leaves):[n]}
function eff(n){
  if(!hasKids(n))return n.status;
  const s=n.graph.nodes.map(eff);
  if(s.every(x=>x==='done'))return 'done';
  if(s.every(x=>x==='todo'))return 'todo';
  return 'doing';
}
function progress(n){const l=leaves(n);return l.filter(x=>x.status==='done').length/l.length}
const preds=(g,n)=>g.edges.filter(e=>e.to===n.id).map(e=>g.nodes.find(x=>x.id===e.from)).filter(Boolean);
const openPreds=(g,n)=>preds(g,n).filter(p=>eff(p)!=='done');
const blocked=(g,n)=>openPreds(g,n).length>0;
/* ready = can be worked on now; blocked = waiting on something (incl. started too early); done */
const cat=(g,n)=>eff(n)==='done'?'done':(blocked(g,n)?'blocked':'ready');
function reaches(g,from,to,seen=new Set()){
  if(from===to)return true; if(seen.has(from))return false; seen.add(from);
  return g.edges.some(e=>e.from===from&&reaches(g,e.to,to,seen));
}
function addEdge(a,b){
  const g=level();
  if(a===b)return toast("a card can't depend on itself");
  if(g.edges.some(e=>e.from===a&&e.to===b))return toast('already linked');
  if(reaches(g,b,a))return toast('rejected: that would create a dependency loop');
  g.edges.push({from:a,to:b});change();
}
function autoLayout(g){
  const memo={};
  const depth=id=>memo[id]!==undefined?memo[id]:(memo[id]=0,memo[id]=Math.max(-1,...g.edges.filter(e=>e.to===id).map(e=>depth(e.from)))+1);
  const cols={};
  g.nodes.forEach(n=>{const d=depth(n.id);(cols[d]=cols[d]||[]).push(n)});
  Object.entries(cols).forEach(([d,ns])=>{
    const total=ns.length*(H+32)-32;
    ns.forEach((n,i)=>{n.x=d*(W+84);n.y=i*(H+32)-total/2+200});
  });
}
const ago=t=>{const s=(Date.now()-t)/1000;
  if(s<60)return 'just now';if(s<3600)return Math.floor(s/60)+' min ago';
  if(s<86400)return Math.floor(s/3600)+' h ago';return new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric'})};

/* ---------- rendering ---------- */
const svg=$('#cv'),world=$('#world'),gE=$('#edges'),gN=$('#nodes');
function E(tag,attrs={},parent){const e=document.createElementNS(NS,tag);for(const k in attrs)e.setAttribute(k,attrs[k]);if(parent)parent.appendChild(e);return e}
function wrap(t,max){const w=t.split(' '),lines=[];let cur='';
  for(const x of w){if((cur+' '+x).trim().length>max&&cur){lines.push(cur);cur=x}else cur=(cur+' '+x).trim()}
  if(cur)lines.push(cur);
  if(lines.length>2){lines.length=2;lines[1]=lines[1].slice(0,max-1)+'…'}
  return lines.map(l=>l.length>max?l.slice(0,max-1)+'…':l)}
const applyView=()=>{world.setAttribute('transform',`translate(${view.x} ${view.y}) scale(${view.k})`);$('#zLbl').textContent=Math.round(view.k*100)+'%'};
function render(){
  const g=level();
  if(g.nodes.some(n=>n.x===undefined))autoLayout(g);
  applyView();
  gE.innerHTML='';gN.innerHTML='';
  $('#empty').style.display=g.nodes.length?'none':'flex';
  const match=n=>filter==='all'||cat(g,n)===filter;
  g.edges.forEach(e=>{
    const a=g.nodes.find(n=>n.id===e.from),b=g.nodes.find(n=>n.id===e.to);if(!a||!b)return;
    const x1=a.x+W+5,y1=a.y+H/2,x2=b.x-5,y2=b.y+H/2,xm=x2>x1+24?(x1+x2)/2:x1+14;
    /* right-angle routing, like box-drawing characters */
    const d=x2>x1+24?`M${x1} ${y1}H${xm}V${y2}H${x2}`:`M${x1} ${y1}H${xm}V${(y1+y2)/2+(y1===y2?H:0)}H${x2-14}V${y2}H${x2}`;
    const ea=eff(a),eb=eff(b);
    const cls=ea==='done'?'sat':(eb!=='todo'?'bad':'');
    const sel=selEdge&&selEdge.from===e.from&&selEdge.to===e.to;
    const p=E('path',{d,class:'edge '+cls+(sel?' sel':''),'marker-end':`url(#a-${sel?'todo':(cls||'todo')})`},gE);
    if(filter!=='all'&&!(match(a)||match(b)))p.style.opacity='.15';
    const hit=E('path',{d,class:'edge-hit'},gE);
    hit.onclick=ev=>{ev.stopPropagation();selEdge=e;render();toast('dependency selected — press Delete to remove it')};
  });
  const isRoot=path.length===0;
  g.nodes.forEach((n,i)=>{
    const st=eff(n),bl=blocked(g,n),kids=hasKids(n),early=bl&&st!=='todo';
    const shown=early?'early':(bl?'blocked':st);          /* what the big icon shows */
    const nd=E('g',{class:`node s-${st}${bl?' blocked':''}${match(n)?'':' dim'}`,'data-id':n.id,transform:`translate(${n.x} ${n.y})`},gN);
    E('rect',{class:'box',width:W,height:H},nd);
    /* left status panel: big icon + caption (click = change status / comment) */
    E('rect',{class:'side',width:P,height:H},nd);
    const sb=E('g',{class:'statbtn'},nd);
    E('rect',{class:'hit',width:P,height:H},sb);
    iconG(shown,sb,P/2-16,H/2-26,32);
    E('text',{class:'cap',x:P/2,y:H/2+28},sb).textContent=CAP[shown];
    E('text',{class:'chg',x:P/2,y:H/2+28},sb).textContent='CHANGE';
    sb.onpointerdown=ev=>ev.stopPropagation();
    sb.onclick=ev=>{ev.stopPropagation();openPop(n,nd)};
    E('title',{},sb).textContent='Change status or add a comment';
    /* body */
    const x0=P+12;
    E('text',{class:'key',x:x0,y:19},nd).textContent=`${isRoot?'PHASE':'TASK'}_${String(i+1).padStart(2,'0')}`;
    wrap(n.title,20).forEach((l,k)=>{E('text',{class:'ttl',x:x0,y:41+k*17},nd).textContent=l});
    const last=n.log&&n.log.slice().reverse().find(e=>e.text);
    const sub=kids?`${leaves(n).filter(x=>x.status==='done').length}/${leaves(n).length} done`:
      (early?`! early: ${openPreds(g,n)[0].title}`:bl?`! waits: ${openPreds(g,n).map(p=>p.title).join(', ')}`:(last?`# ${last.text}`:(n.notes?`// ${n.notes}`:`$ ${LABEL[st].toLowerCase()}`)));
    E('text',{class:'sub',x:x0,y:H-(kids?20:11)},nd).textContent=sub.length>22?sub.slice(0,21)+'…':sub;
    if(kids){E('rect',{class:'bar-bg',x:x0,y:H-13,width:W-x0-12,height:6},nd);E('rect',{class:'bar',x:x0,y:H-13,width:Math.max(0,(W-x0-12)*progress(n)),height:6},nd)}
    /* edit + comment buttons */
    const ed=E('g',{class:'mini',transform:`translate(${W-27} 4)`},nd);
    E('rect',{class:'hit',width:22,height:22},ed);iconG('pencil',ed,3,3,16);
    ed.onpointerdown=ev=>ev.stopPropagation();ed.onclick=ev=>{ev.stopPropagation();editNode(n)};
    E('title',{},ed).textContent='Edit title and notes';
    const cm=E('g',{class:'mini',transform:`translate(${W-50} ${kids?H-42:H-27})`},nd);   /* sits above the progress bar on phases */
    E('rect',{class:'hit',width:44,height:22},cm);iconG('comment',cm,2,3,16);
    const cnt=(n.log||[]).filter(e=>e.text).length;
    if(cnt)E('text',{class:'cnt',x:22,y:15},cm).textContent=cnt;
    cm.onpointerdown=ev=>ev.stopPropagation();cm.onclick=ev=>{ev.stopPropagation();openPop(n,nd,true)};
    E('title',{},cm).textContent=cnt?`${cnt} comment${cnt>1?'s':''}`:'Add a comment';
    E('rect',{class:'port in',x:-5,y:H/2-5,width:10,height:10},nd);
    E('rect',{class:'port',x:W-5,y:H/2-5,width:10,height:10},nd).onpointerdown=ev=>startLink(ev,n);
    nd.onpointerdown=ev=>startDrag(ev,n);
    nd.onpointerenter=()=>{hoverId=n.id};
    nd.onpointerleave=()=>{if(hoverId===n.id)hoverId=null};
  });
  crumbs();chips();
}
function crumbs(){
  const c=$('#crumbs');c.innerHTML='';c.hidden=path.length===0;
  if(!path.length)return;
  const b0=document.createElement('button');b0.textContent='~';b0.title='Top level';b0.onclick=()=>goto(0);c.appendChild(b0);
  let g=proj.graph;
  path.forEach((id,i)=>{const n=g.nodes.find(x=>x.id===id);if(!n)return;
    const s=document.createElement('span');s.className='sep';s.textContent='/';c.appendChild(s);
    const b=document.createElement('button');b.textContent=n.title.toLowerCase().replace(/\s+/g,'_');if(i===path.length-1)b.className='cur';b.onclick=()=>goto(i+1);c.appendChild(b);
    g=n.graph});
}
function chips(){
  const g=level(),c=$('#chips');c.innerHTML='';
  const cnt={ready:0,blocked:0,done:0};
  g.nodes.forEach(n=>cnt[cat(g,n)]++);
  if(filter!=='all'&&!cnt[filter])filter='all';           /* never leave a dead filter on */
  const tip={ready:'Ready — not done, and nothing is blocking it',blocked:'Blocked — waiting for an earlier item to finish',done:'Done'};
  [['ready','READY'],['blocked','BLOCKED'],['done','DONE']].forEach(([f,label])=>{
    const b=document.createElement('button');b.className='chip'+(filter===f?' on':'')+(cnt[f]?'':' zero');b.dataset.f=f;
    b.title=tip[f]+(filter===f?' (click to show all)':' — click to focus');
    b.innerHTML=svgIcon(f)+`<span class="lb">${label}</span><b>${cnt[f]}</b>`;
    b.disabled=!cnt[f];
    b.onclick=()=>{filter=(filter===f?'all':f);render()};
    c.appendChild(b);
  });
  /* text-style progress meter: 20 cells, done / ready / blocked */
  const tot=g.nodes.length,N=20,m=$('#meter');
  const raw=[['d',cnt.done],['r',cnt.ready],['b',cnt.blocked]].map(([k,v])=>({k,v:tot?v/tot*N:0}));
  const cells=raw.map(x=>({k:x.k,n:Math.floor(x.v),f:x.v%1}));
  let left=tot?N-cells.reduce((a,x)=>a+x.n,0):0;
  cells.slice().sort((a,b)=>b.f-a.f).forEach(x=>{if(left>0&&x.f>0){x.n++;left--}});
  let html='';cells.forEach(x=>{html+=`<i class="${x.k}"></i>`.repeat(x.n)});
  html+='<i></i>'.repeat(Math.max(0,N-(html.match(/<i/g)||[]).length));
  m.innerHTML=html+`<em>${tot?Math.round(cnt.done/tot*100):0}%</em>`;
}

/* ---------- status + comment popover ---------- */
const pop=$('#pop');let popId=null,popRect=null,popConfirm=null,popDraft='';
function findNode(id){return level().nodes.find(n=>n.id===id)}
function openPop(n,anchor,focus){
  const r=anchor.getBoundingClientRect();
  popId=n.id;popRect={l:r.left,t:r.top,r:r.right,b:r.bottom};
  renderPop(focus);
}
function closePop(){popId=null;popConfirm=null;popDraft='';pop.hidden=true}
function renderPop(focus){
  const n=popId&&findNode(popId);if(!n){closePop();return}
  const g=level(),kids=hasKids(n),op=openPreds(g,n);
  pop.innerHTML='';pop.hidden=false;
  if(popConfirm){renderConfirm(n);return}
  const tb=document.createElement('div');tb.className='tb';
  tb.innerHTML='<span>STATUS</span>';
  const x=document.createElement('button');x.textContent='x';x.setAttribute('aria-label','Close');x.onclick=closePop;tb.appendChild(x);
  pop.appendChild(tb);
  const bd=document.createElement('div');bd.className='bd';pop.appendChild(bd);
  const nm=document.createElement('div');nm.className='nm';nm.textContent=n.title;bd.appendChild(nm);
  const note=(cls,msg)=>{const d=document.createElement('div');d.className='note '+cls;d.textContent=msg;bd.appendChild(d)};
  if(kids)note('info','status follows its sub-tasks. open the card to update those. you can still comment here.');
  else if(op.length)note('warn','waiting on '+op.map(p=>p.title).join(', ')+'. it can’t be started or finished until then.');
  else if(n.status==='done')note('info','done. pick in progress or to do to rework it — you will be asked to confirm.');
  const ta=document.createElement('textarea');ta.placeholder='add a comment (optional)…';
  const seg=document.createElement('div');seg.className='seg';
  STAT.forEach((s,i)=>{
    const b=document.createElement('button');b.dataset.s=s;
    b.innerHTML=svgIcon(s)+`<span>${LABEL[s]}</span>`;
    if(!kids&&n.status===s)b.classList.add('cur');
    b.disabled=kids||(s!=='todo'&&op.length>0);
    b.onclick=()=>{
      const text=ta.value.trim();
      if(n.status===s){closePop();if(text)addComment(n,text,true);return}
      if(n.status==='done'&&s!=='done'){popConfirm={s};popDraft=text;renderPop();return}   /* rework: ask first */
      closePop();setStatus(n,s,text);
    };
    seg.appendChild(b);
  });
  bd.appendChild(seg);bd.appendChild(ta);
  const row=document.createElement('div');row.className='row';
  const hint=document.createElement('small');hint.textContent='pick a status to apply it with your comment';
  const post=document.createElement('button');post.textContent='post comment';
  post.onclick=()=>{const v=ta.value.trim();if(!v)return ta.focus();addComment(n,v)};
  row.append(hint,post);bd.appendChild(row);
  ta.onkeydown=e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter')post.click()};
  const log=(n.log||[]).slice().reverse();
  if(log.length){
    const l=document.createElement('div');l.className='log';
    log.slice(0,8).forEach(e=>{
      const d=document.createElement('div');d.className='ev';
      d.innerHTML=svgIcon(e.status||'comment');
      const b=document.createElement('div');
      const tt=document.createElement('div');tt.className='t';tt.textContent=(e.status?'marked '+LABEL[e.status].toLowerCase():'comment')+' · '+ago(e.at);
      b.appendChild(tt);
      if(e.text){const xx=document.createElement('div');xx.className='x';xx.textContent=e.text;b.appendChild(xx)}
      d.appendChild(b);l.appendChild(d);
    });
    bd.appendChild(l);
  }
  placePop();
  if(focus)ta.focus();
}
/* place next to the card, kept on screen */
function placePop(){
  const pw=pop.offsetWidth,ph=pop.offsetHeight,vw=innerWidth,vh=innerHeight;
  let left=popRect.r+12;if(left+pw>vw-8)left=popRect.l-pw-12;
  if(left<8)left=Math.min(vw-pw-8,Math.max(8,popRect.l));
  let top=Math.min(popRect.t,vh-ph-8);
  pop.style.left=Math.max(8,left)+'px';pop.style.top=Math.max(8,top)+'px';
}
/* confirm moving a DONE item back (rework): says what it affects, asks for an optional reason */
function renderConfirm(n){
  const g=level(),s=popConfirm.s;
  const deps=g.edges.filter(e=>e.from===n.id).map(e=>g.nodes.find(x=>x.id===e.to)).filter(Boolean);
  const started=deps.filter(d=>eff(d)!=='todo'),waiting=deps.filter(d=>eff(d)==='todo');
  const parent=path.length?lvlOf(path.slice(0,-1)).nodes.find(x=>x.id===path[path.length-1]):null;
  const names=a=>a.map(d=>d.title).join(', ');
  const effects=[];
  if(started.length)effects.push(`already started — will show EARLY until this is done again: ${names(started)}`);
  if(waiting.length)effects.push(`will be blocked again: ${names(waiting)}`);
  if(parent&&eff(parent)==='done')effects.push(`parent “${parent.title}” will no longer be done`);
  const tb=document.createElement('div');tb.className='tb';tb.innerHTML='<span>REWORK?</span>';
  const x=document.createElement('button');x.textContent='x';x.setAttribute('aria-label','Close');x.onclick=closePop;tb.appendChild(x);
  pop.appendChild(tb);
  const bd=document.createElement('div');bd.className='bd';pop.appendChild(bd);
  const nm=document.createElement('div');nm.className='nm';nm.textContent=n.title;bd.appendChild(nm);
  const q=document.createElement('div');q.className='note warn';
  q.textContent=`Move from DONE back to ${LABEL[s].toUpperCase()}?`+(effects.length?'':' Nothing else depends on it.');
  bd.appendChild(q);
  if(effects.length){
    const ul=document.createElement('div');ul.className='fx';
    effects.forEach(t=>{const li=document.createElement('div');li.textContent='! '+t;ul.appendChild(li)});
    bd.appendChild(ul);
  }
  const lb=document.createElement('div');lb.className='lbl';lb.textContent='reason (optional) — saved as a comment';bd.appendChild(lb);
  const ta=document.createElement('textarea');ta.placeholder='e.g. bug found in review…';ta.value=popDraft;bd.appendChild(ta);
  const row=document.createElement('div');row.className='row';
  const back=document.createElement('button');back.textContent='cancel';back.onclick=()=>{popConfirm=null;popDraft=ta.value;renderPop()};
  const ok=document.createElement('button');ok.className='primary';ok.textContent='confirm rework';
  ok.onclick=()=>{const text=ta.value.trim();closePop();setStatus(n,s,text)};
  row.append(back,ok);bd.appendChild(row);
  ta.onkeydown=e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter')ok.click()};
  placePop();ok.focus();
}
addEventListener('pointerdown',e=>{if(!pop.hidden&&!pop.contains(e.target))closePop()},true);

/* ---------- celebration: a burst of terminal characters ---------- */
function burst(x,y,n=22){
  if(matchMedia('(prefers-reduced-motion:reduce)').matches)return;
  const chars=['0','1','*','+','✓','#','>','$','%'],cols=['#0a7a2f','#3dff7a','#0b1a10','#7a4f00','#0067d6'];
  for(let i=0;i<n;i++){
    const e=document.createElement('div');e.className='burst';
    e.textContent=chars[i%chars.length];e.style.left=x+'px';e.style.top=y+'px';e.style.color=cols[i%cols.length];
    document.body.appendChild(e);
    const a=Math.random()*Math.PI*2,v=60+Math.random()*(n>30?260:140);
    e.animate([{transform:'translate(0,0)',opacity:1},
      {transform:`translate(${Math.cos(a)*v}px,${Math.sin(a)*v-50}px)`,opacity:1,offset:.55},
      {transform:`translate(${Math.cos(a)*v*1.1}px,${Math.sin(a)*v+90}px)`,opacity:0}],
      {duration:800+Math.random()*500,easing:'cubic-bezier(.2,.7,.4,1)'}).onfinish=()=>e.remove();
  }
}
function celebrate(x,y){
  burst(x,y,22);
  const g=level();
  if(g.nodes.every(n=>eff(n)==='done')){
    const r=svg.getBoundingClientRect();
    setTimeout(()=>burst(r.left+r.width/2,r.top+r.height/3,60),180);
    toast(path.length?'level complete':'project complete');
  }
}

/* ---------- status / comments ---------- */
function setStatus(n,s,text=''){
  const g=level();
  if(s!=='todo'&&blocked(g,n)){toast('blocked: finish '+openPreds(g,n).map(p=>p.title).join(', ')+' first');return false}
  n.status=s;(n.log=n.log||[]).push({at:Date.now(),status:s,text});
  change();
  if(s==='done'){const el=gN.querySelector(`[data-id="${n.id}"]`);if(el){const r=el.getBoundingClientRect();celebrate(r.left+r.width/2,r.top+r.height/2)}}
  return true;
}
function addComment(n,text,quiet){
  if(!text)return;
  (n.log=n.log||[]).push({at:Date.now(),status:null,text});
  save();render();if(!quiet)renderPop(true);
}
function change(){save();render();if(popId)renderPop()}

/* ---------- interaction ---------- */
function toScreen(ev){const r=svg.getBoundingClientRect();return{x:(ev.clientX-r.left-view.x)/view.k,y:(ev.clientY-r.top-view.y)/view.k}}
function startDrag(ev,n){
  if(ev.button!==0)return;ev.stopPropagation();
  const s=toScreen(ev),ox=n.x,oy=n.y;let moved=false;
  const mv=e=>{const p=toScreen(e);if(Math.abs(p.x-s.x)+Math.abs(p.y-s.y)>4)moved=true;
    if(moved){n.x=ox+p.x-s.x;n.y=oy+p.y-s.y;render()}};
  const up=()=>{removeEventListener('pointermove',mv);removeEventListener('pointerup',up);
    if(moved)save();else open(n)};
  addEventListener('pointermove',mv);addEventListener('pointerup',up);
}
function startLink(ev,n){
  ev.stopPropagation();ev.preventDefault();
  const x1=n.x+W,y1=n.y+H/2,t=$('#tmp');
  const mv=e=>{const p=toScreen(e);t.setAttribute('d',`M${x1} ${y1}H${(x1+p.x)/2}V${p.y}H${p.x}`)};
  const up=e=>{removeEventListener('pointermove',mv);removeEventListener('pointerup',up);t.setAttribute('d','');
    const el=document.elementFromPoint(e.clientX,e.clientY),t2=el&&el.closest&&el.closest('.node');
    if(t2)addEdge(n.id,t2.dataset.id)};
  addEventListener('pointermove',mv);addEventListener('pointerup',up);
}
svg.addEventListener('pointerdown',ev=>{
  if(ev.target!==svg&&ev.target.id!=='world')return;
  selEdge=null;
  const sx=ev.clientX,sy=ev.clientY,vx=view.x,vy=view.y;svg.classList.add('panning');
  const mv=e=>{view.x=vx+e.clientX-sx;view.y=vy+e.clientY-sy;applyView()};
  const up=()=>{removeEventListener('pointermove',mv);removeEventListener('pointerup',up);svg.classList.remove('panning');render()};
  addEventListener('pointermove',mv);addEventListener('pointerup',up);
});
function zoomAt(f,mx,my){
  const k=Math.min(2.5,Math.max(.25,view.k*f)),r=k/view.k;
  view.x=mx-(mx-view.x)*r;view.y=my-(my-view.y)*r;view.k=k;applyView();
}
svg.addEventListener('wheel',ev=>{
  ev.preventDefault();closePop();
  const r=svg.getBoundingClientRect();zoomAt(ev.deltaY<0?1.1:.9,ev.clientX-r.left,ev.clientY-r.top);
},{passive:false});
const zoomCenter=f=>{const r=svg.getBoundingClientRect();zoomAt(f,r.width/2,r.height/2)};
$('#zIn').onclick=()=>zoomCenter(1.2);
$('#zOut').onclick=()=>zoomCenter(1/1.2);
addEventListener('keydown',ev=>{
  if(ev.key==='Escape'&&!mnu.hidden){menu.close();return}
  if(ev.key==='Escape'&&!pop.hidden){closePop();return}
  if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)||$('dialog[open]'))return;
  if((ev.key==='Delete'||ev.key==='Backspace')&&selEdge){
    const g=level();g.edges=g.edges.filter(e=>!(e.from===selEdge.from&&e.to===selEdge.to));selEdge=null;change();return;
  }
  /* keyboard: hover a card, then 1/2/3 = to do / doing / done, c = comment */
  const hn=hoverId&&findNode(hoverId);
  if(hn&&!ev.metaKey&&!ev.ctrlKey&&!ev.altKey){
    if('123'.includes(ev.key)&&ev.key.length===1){ev.preventDefault();
      const ns=STAT[+ev.key-1];
      if(hasKids(hn))toast('status follows its sub-tasks — open the card to change those');
      else if(hn.status===ns)toast('already '+LABEL[ns].toLowerCase());
      else if(hn.status==='done'){                       /* rework needs confirmation */
        const el=gN.querySelector(`[data-id="${hn.id}"]`);
        if(el){openPop(hn,el);popConfirm={s:ns};popDraft='';renderPop()}
      }else setStatus(hn,ns);
      return}
    if(ev.key==='c'){ev.preventDefault();const el=gN.querySelector(`[data-id="${hn.id}"]`);if(el)openPop(hn,el,true);return}
  }
  if(ev.key==='Escape'&&path.length)goto(path.length-1);
});
function open(n){closePop();path.push(n.id);selEdge=null;filter='all';fit();render()}
function goto(i){closePop();path=path.slice(0,i);selEdge=null;filter='all';fit();render()}
function fit(){
  const g=level();if(g.nodes.some(n=>n.x===undefined))autoLayout(g);
  const r=svg.getBoundingClientRect();
  if(!g.nodes.length){view={x:40,y:40,k:1};return}
  const x0=Math.min(...g.nodes.map(n=>n.x)),x1=Math.max(...g.nodes.map(n=>n.x+W));
  const y0=Math.min(...g.nodes.map(n=>n.y)),y1=Math.max(...g.nodes.map(n=>n.y+H));
  let k=Math.min(1.2,(r.width-100)/(x1-x0),(r.height-140)/(y1-y0));
  const narrow=r.width<700;
  if(narrow)k=Math.max(k,.6);                      /* keep text readable on phones; pan for the rest */
  view={k,x:narrow?24-x0*k:(r.width-(x1-x0)*k)/2-x0*k,y:(r.height-(y1-y0)*k)/2-y0*k};
}

/* ---------- edit dialog (title + notes) ---------- */
const dlg=$('#dlg');let editing=null,newPos=null;
function editNode(n,pos){
  closePop();editing=n;newPos=pos||null;$('#dTitle').textContent=n?'EDIT ITEM':'ADD ITEM';
  $('#fTitle').value=n?n.title:'';$('#fNotes').value=n?n.notes:'';
  $('#dDel').style.display=n?'':'none';dlg.showModal();$('#fTitle').focus();
}
$('#dform').onsubmit=()=>{
  const title=$('#fTitle').value.trim();if(!title)return;
  const g=level();
  if(editing){editing.title=title;editing.notes=$('#fNotes').value}
  else{
    const n=mkNode(title,'todo',$('#fNotes').value);
    const r=svg.getBoundingClientRect();
    n.x=newPos?newPos.x-W/2:(r.width/2-view.x)/view.k-W/2;n.y=newPos?newPos.y-H/2:(r.height/2-view.y)/view.k-H/2;
    g.nodes.push(n);
  }
  change();
};
$('#dCancel').onclick=()=>dlg.close();
$('#dDel').onclick=()=>{
  if(!confirm(`Delete "${editing.title}"${hasKids(editing)?' and everything inside it':''}?`))return;
  const g=level();g.nodes=g.nodes.filter(n=>n!==editing);g.edges=g.edges.filter(e=>e.from!==editing.id&&e.to!==editing.id);
  dlg.close();change();
};
$('#bAdd').onclick=()=>editNode(null);
svg.addEventListener('dblclick',ev=>{if(ev.target===svg||ev.target.id==='world')editNode(null,toScreen(ev))});
$('#bFit').onclick=()=>{fit();render()};
$('#projName').oninput=e=>{proj.name=e.target.value;save()};

/* ---------- menu ---------- */
const mnu=$('#mnu'),menu={close(){mnu.hidden=true}};
$('#bMenu').innerHTML=svgIcon('menu');$('#bAdd').innerHTML=svgIcon('plus');$('#bFit').innerHTML=svgIcon('fit');
$('#bMenu').onclick=e=>{e.stopPropagation();closePop();mnu.hidden=!mnu.hidden};
$('#mX').onclick=()=>menu.close();
addEventListener('pointerdown',e=>{if(!mnu.hidden&&!mnu.contains(e.target)&&!$('#bMenu').contains(e.target))menu.close()},true);
$('#bLayout').onclick=()=>{menu.close();autoLayout(level());fit();change()};
const reset=(p,noWrite)=>{proj=p;path=[];selEdge=null;filter='all';closePop();$('#projName').value=proj.name;menu.close();save(noWrite);fit();render()};
$('#mNew').onclick=()=>{if(confirm(sink?'Start a blank project? This detaches '+sink.name+' (the file itself is not changed).':'Start a blank project? Current one will be replaced (export it first to keep it).')){detach();reset({name:'',graph:{nodes:[],edges:[]}})}};
$('#mSample').onclick=()=>{if(confirm(sink?'Load the sample? This detaches '+sink.name+' (the file itself is not changed).':'Replace current project with the sample?')){detach();reset(sample())}};
function download(name,obj){
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}));
  a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
const slug=s=>(s||'project').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'project';
$('#mExport').onclick=()=>{download(slug(proj.name)+'.json',proj);menu.close()};
$('#mTemplate').onclick=()=>{
  const c=JSON.parse(JSON.stringify(proj));
  (function r(g){g.nodes.forEach(n=>{n.status='todo';n.log=[];r(n.graph)})})(c.graph);
  download(slug(proj.name)+'-template.json',c);menu.close();
};

/* Accepts the simple "phases" format (see PROMPT.md) or the app's older own export:
   {name, phases:[{id,title,status,notes,dependsOn:[ids],comments:[...],x,y,tasks:[...same shape...]}]} */
const cleanId=s=>String(s).trim().replace(/[^\w.-]+/g,'-').replace(/^-+|-+$/g,'')||'item';
function normalize(p){
  if(p&&p.graph&&Array.isArray(p.graph.nodes))return {p,warn:0};
  let warn=0;
  const top=p&&(p.phases||p.tasks||p.children||p.nodes);
  if(!Array.isArray(top))throw new Error('no phases');
  function build(items){
    const g={nodes:[],edges:[]},byKey={},used=new Set();
    items.forEach(it=>{
      if(!it||typeof it!=='object'){warn++;return}
      const n=mkNode(String(it.title||it.name||it.id||'Untitled'),STAT.includes(it.status)?it.status:'todo',String(it.notes||it.description||''));
      let id=cleanId(it.id!==undefined?it.id:n.title),base=id,k=2;
      while(used.has(id))id=base+'-'+k++;
      used.add(id);n.id=id;                                   /* keep the file's ids so write-back stays stable */
      const kids=it.tasks||it.children||it.phases||it.subtasks;
      if(Array.isArray(kids)&&kids.length)n.graph=build(kids);
      if(Array.isArray(it.comments))n.log=it.comments.filter(c=>c&&(c.text||c.status)).map(c=>({at:Date.parse(c.at)||Date.now(),status:STAT.includes(c.status)?c.status:null,text:String(c.text||'')}));
      if(Number.isFinite(it.x)&&Number.isFinite(it.y)){n.x=it.x;n.y=it.y}
      g.nodes.push(n);
      if(it.id!==undefined)byKey[String(it.id).toLowerCase()]=n;
      byKey[id.toLowerCase()]=byKey[id.toLowerCase()]||n;
      byKey[n.title.toLowerCase()]=byKey[n.title.toLowerCase()]||n;
      n._src=it;
    });
    g.nodes.forEach(n=>{
      const deps=n._src.dependsOn||n._src.depends_on||n._src.dependencies||[];
      (Array.isArray(deps)?deps:[deps]).forEach(d=>{
        const a=byKey[String(d).toLowerCase()];
        if(!a||a===n||reaches(g,n.id,a.id)||g.edges.some(e=>e.from===a.id&&e.to===n.id)){warn++;return}
        g.edges.push({from:a.id,to:n.id});
      });
    });
    g.nodes.forEach(n=>delete n._src);
    return g;
  }
  return {p:{name:String(p.name||''),graph:build(top)},warn};
}

/* ---------- file sync: every change is written back into the attached JSON ---------- */
function itemsOf(g){
  return g.nodes.map(n=>{
    const o={id:n.id,title:n.title};
    if(!hasKids(n))o.status=n.status;                         /* a phase's status is derived from its tasks */
    if(n.notes)o.notes=n.notes;
    const deps=g.edges.filter(e=>e.to===n.id).map(e=>e.from);
    if(deps.length)o.dependsOn=deps;
    const cm=(n.log||[]).map(e=>{const c={at:new Date(e.at).toISOString()};if(e.status)c.status=e.status;if(e.text)c.text=e.text;return c});
    if(cm.length)o.comments=cm;
    if(n.x!==undefined&&n.y!==undefined){o.x=Math.round(n.x);o.y=Math.round(n.y)}
    if(hasKids(n))o.tasks=itemsOf(n.graph);
    return o;
  });
}
const toFile=p=>({name:p.name||'',phases:itemsOf(p.graph)});
let sink=null,saveT=null,writing=false,lastText='',pollT=null;
function showSink(state){
  const el=$('#sink');
  if(!sink){el.hidden=true;return}
  el.hidden=false;el.textContent=`● ${sink.name} · ${state||'saved'}`;el.classList.toggle('err',state==='error');
}
function flush(){
  if(!sink)return;
  clearTimeout(saveT);showSink('saving…');
  saveT=setTimeout(async()=>{
    saveT=null;const s=sink;if(!s)return;
    const text=JSON.stringify(toFile(proj),null,2)+'\n';
    writing=true;lastText=text;
    try{await s.write(text);if(sink===s)showSink()}
    catch(e){showSink('error');toast('could not write '+s.name+': '+e.message)}
    finally{writing=false}
  },250);
}
function detach(){sink=null;clearTimeout(saveT);saveT=null;clearInterval(pollT);showSink()}
async function openHandle(h){                                  /* Chrome / Edge: pick a file, keep write access */
  try{
    if(h.requestPermission&&await h.requestPermission({mode:'readwrite'})!=='granted')toast('no write permission: changes will not be saved to the file');
    const r=normalize(JSON.parse(await (await h.getFile()).text()));
    detach();
    sink={name:h.name,read:async()=>(await h.getFile()).text(),
      write:async t=>{const w=await h.createWritable();await w.write(t);await w.close()}};
    reset(r.p,true);showSink();
    toast(`editing ${h.name} — changes are saved to the file`+(r.warn?` (${r.warn} link(s) skipped)`:''));
  }catch(e){if(e.name!=='AbortError')toast('could not open that file: '+e.message)}
}
async function probeServer(){                                  /* started with: serve.py --file …  (any browser) */
  if(location.protocol==='file:')return;
  try{
    const r=await fetch('api/phases',{cache:'no-store'});
    if(!r.ok)return;
    const text=await r.text(),name=r.headers.get('X-File-Name')||'phases.json';
    const res=normalize(JSON.parse(text));
    sink={name,
      read:async()=>{const g=await fetch('api/phases',{cache:'no-store'});if(!g.ok)throw new Error('HTTP '+g.status);return g.text()},
      write:async t=>{const w=await fetch('api/phases',{method:'PUT',headers:{'Content-Type':'application/json'},body:t});if(!w.ok)throw new Error('HTTP '+w.status)}};
    lastText=text;reset(res.p,true);showSink();
    pollT=setInterval(pollFile,3000);
  }catch(e){}
}
async function pollFile(){                                      /* pick up edits made to the file elsewhere (e.g. by an AI) */
  if(!sink||saveT||writing||document.hidden)return;
  try{
    const t=await sink.read();
    if(t===lastText||saveT||writing)return;
    lastText=t;applyExternal(normalize(JSON.parse(t)).p);toast(sink.name+' changed on disk — reloaded');
  }catch(e){}
}
function applyExternal(p){
  proj=p;let g=proj.graph;const ok=[];
  for(const id of path){const n=g.nodes.find(x=>x.id===id);if(!n)break;ok.push(id);g=n.graph}
  path=ok;save(true);closePop();$('#projName').value=proj.name;render();
}
$('#mReload').onclick=async()=>{
  menu.close();
  if(!sink)return toast('no file attached — open one first');
  try{const t=await sink.read();lastText=t;applyExternal(normalize(JSON.parse(t)).p);toast('reloaded '+sink.name)}
  catch(e){toast('could not reload: '+e.message)}
};
function importText(text){                                     /* browsers without file write access: read-only copy */
  try{const r=normalize(JSON.parse(text));detach();reset(r.p);
    toast((r.warn?`imported (${r.warn} link(s) skipped). `:'imported. ')+'This browser can’t save back to the file: use Chrome/Edge, or start with start-phases-graph.command <file>.')}
  catch(_){toast('could not read that file — expected JSON with a "phases" list')}
}
$('#bOpen').onclick=async()=>{
  menu.close();
  if(window.showOpenFilePicker){
    try{const [h]=await showOpenFilePicker({types:[{description:'Phases JSON',accept:{'application/json':['.json']}}]});await openHandle(h)}
    catch(e){if(e.name!=='AbortError')toast('could not open: '+e.message)}
  }else $('#file').click();
};
$('#file').onchange=async e=>{const f=e.target.files[0];if(f)importText(await f.text());e.target.value=''};
addEventListener('dragover',e=>e.preventDefault());
addEventListener('drop',async e=>{
  e.preventDefault();
  const it=e.dataTransfer.items&&e.dataTransfer.items[0];
  if(it&&it.getAsFileSystemHandle){const h=await it.getAsFileSystemHandle();if(h&&h.kind==='file'){await openHandle(h);return}}
  const f=e.dataTransfer.files[0];if(f)importText(await f.text());
});

let tt;function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('show'),2800)}
addEventListener('resize',()=>{closePop();render()});
$('#projName').value=proj.name;
fit();render();
probeServer();
