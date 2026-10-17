// econhub - game-tree.js - Arboles de sucesos para teoria de juegos (economia)
import { $, store, toast, bus } from './app.js';
import { PALETTE } from './data.js';

const STORE_KEY = 'econhub:gametree';
const PLAYER_COLORS = [PALETTE.teal, PALETTE.info, PALETTE.violet, PALETTE.highlight, PALETTE.success, '#e53935', '#fb8c00', '#6d4c41'];

const TEMPLATES = [
  {
    id: 'prisoner',
    name: 'Dilema del prisionero',
    desc: 'Simultaneo como secuencial con info imperfecta',
    build: () => ({
      players: ['Jugador 1', 'Jugador 2'],
      nodes: [
        {id:'n0', player:0, label:'', type:'decision', payoffs:null},
        {id:'n0_C', player:1, label:'Cooperar', type:'decision', payoffs:null},
        {id:'n0_D', player:1, label:'Desertar', type:'decision', payoffs:null},
        {id:'n0_C_C', player:-2, label:'', type:'terminal', payoffs:[3,3]},
        {id:'n0_C_D', player:-2, label:'', type:'terminal', payoffs:[0,5]},
        {id:'n0_D_C', player:-2, label:'', type:'terminal', payoffs:[5,0]},
        {id:'n0_D_D', player:-2, label:'', type:'terminal', payoffs:[1,1]},
      ],
      edges: [
        {id:'e0', from:'n0', to:'n0_C', label:'Cooperar'},
        {id:'e1', from:'n0', to:'n0_D', label:'Desertar'},
        {id:'e2', from:'n0_C', to:'n0_C_C', label:'Cooperar'},
        {id:'e3', from:'n0_C', to:'n0_C_D', label:'Desertar'},
        {id:'e4', from:'n0_D', to:'n0_D_C', label:'Cooperar'},
        {id:'e5', from:'n0_D', to:'n0_D_D', label:'Desertar'},
      ],
      infosets: [{id:'is1', player:1, nodes:['n0_C','n0_D'], label:'J2 no observa'}],
    }),
  },
  {
    id: 'entry',
    name: 'Juego de entrada',
    desc: 'Entrante decide entrar, incumbente acomoda o pelea',
    build: () => ({
      players: ['Entrante', 'Incumbente'],
      nodes: [
        {id:'n0', player:0, label:'Entrar?', type:'decision'},
        {id:'n1', player:1, label:'', type:'decision'},
        {id:'n0_No', player:-2, label:'', type:'terminal', payoffs:[0,2]},
        {id:'n1_A', player:-2, label:'', type:'terminal', payoffs:[2,2]},
        {id:'n1_P', player:-2, label:'', type:'terminal', payoffs:[-1,1]},
      ],
      edges: [
        {id:'e0', from:'n0', to:'n1', label:'Entrar'},
        {id:'e1', from:'n0', to:'n0_No', label:'No entrar'},
        {id:'e2', from:'n1', to:'n1_A', label:'Acomodar'},
        {id:'e3', from:'n1', to:'n1_P', label:'Pelear'},
      ],
      infosets: [],
    }),
  },
  {
    id: 'stackelberg',
    name: 'Stackelberg',
    desc: 'Lider elige cantidad, seguidor responde',
    build: () => ({
      players: ['Lider', 'Seguidor'],
      nodes: [
        {id:'n0', player:0, label:'Cantidad lider', type:'decision'},
        {id:'n0_A', player:1, label:'', type:'decision'},
        {id:'n0_B', player:1, label:'', type:'decision'},
        {id:'n0_A_a', player:-2, label:'', type:'terminal', payoffs:[30,15]},
        {id:'n0_A_b', player:-2, label:'', type:'terminal', payoffs:[20,20]},
        {id:'n0_B_a', player:-2, label:'', type:'terminal', payoffs:[20,20]},
        {id:'n0_B_b', player:-2, label:'', type:'terminal', payoffs:[15,30]},
      ],
      edges: [
        {id:'e0', from:'n0', to:'n0_A', label:'Alta (q=15)'},
        {id:'e1', from:'n0', to:'n0_B', label:'Baja (q=10)'},
        {id:'e2', from:'n0_A', to:'n0_A_a', label:'Alta'},
        {id:'e3', from:'n0_A', to:'n0_A_b', label:'Baja'},
        {id:'e4', from:'n0_B', to:'n0_B_a', label:'Alta'},
        {id:'e5', from:'n0_B', to:'n0_B_b', label:'Baja'},
      ],
      infosets: [],
    }),
  },
];

let state = null;
let selectedId = null;
let selectedEdgeId = null;
let pan = {x:0, y:0, zoom:1};

function uid(){ return Math.random().toString(36).slice(2,9); }

function defaultState(){
  return {
    meta:{title:'Juego nuevo', players:['Jugador 1','Jugador 2']},
    nodes:[
      {id:'n0', player:0, label:'', type:'decision', payoffs:null, x:0, y:0},
      {id:'n0_A', player:1, label:'A', type:'decision', payoffs:null},
      {id:'n0_B', player:1, label:'B', type:'decision', payoffs:null},
      {id:'n0_A_a', player:-2, label:'', type:'terminal', payoffs:[2,2]},
      {id:'n0_A_b', player:-2, label:'', type:'terminal', payoffs:[0,3]},
      {id:'n0_B_a', player:-2, label:'', type:'terminal', payoffs:[3,0]},
      {id:'n0_B_b', player:-2, label:'', type:'terminal', payoffs:[1,1]},
    ],
    edges:[
      {id:'e0', from:'n0', to:'n0_A', label:'A'},
      {id:'e1', from:'n0', to:'n0_B', label:'B'},
      {id:'e2', from:'n0_A', to:'n0_A_a', label:'a'},
      {id:'e3', from:'n0_A', to:'n0_A_b', label:'b'},
      {id:'e4', from:'n0_B', to:'n0_B_a', label:'a'},
      {id:'e5', from:'n0_B', to:'n0_B_b', label:'b'},
    ],
    infosets:[],
  };
}

function loadState(){
  try{
    const saved = store.get(STORE_KEY, null);
    if(saved && saved.nodes && saved.edges) return saved;
  }catch{}
  return defaultState();
}
function saveState(){
  try{ store.set(STORE_KEY, state); }catch{}
}
function getPlayerColor(i){
  if(i===-1) return '#78909c';
  if(i===-2) return '#37474f';
  return PLAYER_COLORS[i % PLAYER_COLORS.length];
}
function getPlayerName(i){
  if(i===-1) return 'Azar';
  if(i===-2) return 'Terminal';
  return state.meta.players[i] || ('J'+(i+1));
}
function layoutTree(){
  const nodesById = Object.fromEntries(state.nodes.map(n=>[n.id,n]));
  const childrenMap = {};
  state.nodes.forEach(n=>childrenMap[n.id]=[]);
  state.edges.forEach(e=>{ if(childrenMap[e.from]) childrenMap[e.from].push(e.to); });
  const depth = {};
  const visited = new Set();
  function setDepth(id, d){
    if(visited.has(id)) return;
    visited.add(id);
    depth[id]=d;
    (childrenMap[id]||[]).forEach(cid=>setDepth(cid,d+1));
  }
  const root = state.nodes[0] ? state.nodes[0].id : null;
  if(root) setDepth(root,0);
  let xCounter=0;
  const pos={};
  function dfs(id){
    const childs=childrenMap[id]||[];
    if(childs.length===0){
      pos[id]={x:xCounter++, y:depth[id]};
      return pos[id];
    }
    childs.forEach(dfs);
    const xs=childs.map(c=>pos[c].x);
    const avg=xs.reduce((a,b)=>a+b,0)/xs.length;
    pos[id]={x:avg, y:depth[id]};
    return pos[id];
  }
  if(root) dfs(root);
  state.nodes.forEach(n=>{ if(!pos[n.id]) pos[n.id]={x:xCounter++, y:0}; });
  const xs=Object.values(pos).map(p=>p.x);
  const minX=Math.min(...xs), maxX=Math.max(...xs);
  const offset = (minX+maxX)/2;
  state.nodes.forEach(n=>{
    const p=pos[n.id];
    n._x = (p.x - offset)* 150;
    n._y = p.y * 110;
  });
}
function exportISTGame(){
  let out='';
  out+='% Arbol econhub - istgame\n';
  out+='\\begin{istgame}\n';
  out+='\\xtShowEndPoints\n';
  out+='\\xtDistance{12mm}{32mm}\n';
  const nodesById=Object.fromEntries(state.nodes.map(n=>[n.id,n]));
  const childrenMap={}; state.nodes.forEach(n=>childrenMap[n.id]=[]);
  state.edges.forEach(e=>childrenMap[e.from].push(e));
  const visited=new Set();
  function emit(id, indent){
    if(visited.has(id)) return '';
    visited.add(id);
    const node=nodesById[id];
    const childs=childrenMap[id]||[];
    let s='';
    const playerLabel = node.player>=0 ? state.meta.players[node.player] : (node.player===-1?'Nature':'');
    if(node.type==='terminal'){
      const pay = node.payoffs ? '{'+node.payoffs.join(',')+'}' : '';
      s+= ' '.repeat(indent) + '% terminal '+id+' '+pay+'\n';
      return s;
    }
    s+= ' '.repeat(indent) + '\\istroot('+id+')'+(playerLabel?'['+playerLabel+']':'{'+(node.label||id)+'}')+'\n';
    const branches=childs.map(cid=>{
      const edge=state.edges.find(e=>e.from===id && e.to===cid);
      const n=nodesById[cid];
      const lab=edge ? edge.label : '';
      const pay2=n.type==='terminal' && n.payoffs?'{'+n.payoffs.join(',')+'}':'';
      if(n.type==='terminal'){
        return ' '.repeat(indent+2) + '\\istb{'+lab+'}'+pay2;
      } else {
        return ' '.repeat(indent+2) + '\\istb{'+lab+'}[al]';
      }
    }).join('\n');
    if(branches) s+= branches + '\n';
    childs.forEach(cid=>{
      const n=nodesById[cid];
      if(n.type!=='terminal'){
        s+= ' '.repeat(indent) + '% subtree '+cid+'\n';
        s+= emit(cid, indent+2);
      }
    });
    return s;
  }
  const root=state.nodes[0] ? state.nodes[0].id : null;
  if(root) out+=emit(root,0);
  out+='\\end{istgame}\n';
  return out;
}
function exportDOT(){
  let out='digraph G {\n';
  out+='  rankdir=TB; node [shape=circle, style=filled, fillcolor=white];\n';
  state.nodes.forEach(n=>{
    const color=getPlayerColor(n.player);
    const label=n.payoffs? n.payoffs.join(',') : (n.label||n.id);
    const shape=n.type==='terminal' ? 'box' : (n.player===-1?'diamond':'circle');
    out+='  "'+n.id+'" [label="'+label+'", shape='+shape+', color="'+color+'"];\n';
  });
  state.edges.forEach(e=>{
    out+='  "'+e.from+'" -> "'+e.to+'" [label="'+(e.label||'')+'"];\n';
  });
  out+='}\n';
  return out;
}
function solveSPNE(){
  const nodesById=Object.fromEntries(state.nodes.map(n=>[n.id,n]));
  const childrenMap={}; state.nodes.forEach(n=>childrenMap[n.id]=[]);
  state.edges.forEach(e=>childrenMap[e.from].push(e.to));
  const bestMove={};
  const values={};
  function dfs(id){
    const node=nodesById[id];
    const childs=childrenMap[id]||[];
    if(node.type==='terminal'){
      values[id]=node.payoffs||state.meta.players.map(()=>0);
      return values[id];
    }
    if(childs.length===0){
      values[id]=[0,0];
      return values[id];
    }
    if(node.player===-1){
      const probs=node.probs||childs.map(()=>1/childs.length);
      let exp=state.meta.players.map(()=>0);
      childs.forEach((cid,i)=>{
        const v=dfs(cid);
        const p=probs[i]||0;
        exp=exp.map((e,j)=>e + v[j]*p);
      });
      values[id]=exp;
      return exp;
    }
    let best=null, bestVal=null;
    childs.forEach(cid=>{
      const v=dfs(cid);
      const playerPay=v[node.player];
      if(bestVal===null || playerPay>bestVal){
        bestVal=playerPay;
        best=cid;
        bestMove[id]=cid;
      }
    });
    values[id]=values[best];
    return values[id];
  }
  const root=state.nodes[0] ? state.nodes[0].id : null;
  if(root) dfs(root);
  return {bestMove, values};
}
export function initGameTree(){
  let built=false;
  const maybe=()=>{
    if(!built && (location.hash||'').includes('juegos')){
      built=true;
      try{
        state=loadState();
        layoutTree();
        buildUI();
      }catch(e){
        console.error('[gametree]', e);
        state=defaultState();
        layoutTree();
        buildUI();
      }
    }
  };
  maybe();
  bus.addEventListener('route:changed', maybe);
}
function buildUI(){
  const box=$('#gametreeBody');
  if(!box) return;
  box.innerHTML=`
  <div class="gt-layout">
    <aside class="gt-sidebar">
      <div class="gt-card">
        <div class="gt-card-head"><h4><i class="ri-quill-pen-line"></i> Nuevo juego</h4></div>
        <div class="gt-row">
          <input id="gtTitle" class="gt-input" value="${state.meta.title}" placeholder="Titulo del juego">
          <button class="btn btn-primary btn-sm" id="gtNewBtn"><i class="ri-add-line"></i> Nuevo</button>
        </div>
        <div class="gt-players" id="gtPlayers"></div>
        <button class="btn btn-ghost btn-sm" id="gtAddPlayer"><i class="ri-user-add-line"></i> Anadir jugador</button>
      </div>
      <div class="gt-card">
        <div class="gt-card-head"><h4><i class="ri-git-branch-line"></i> Nodos</h4><span class="badge" id="gtNodeCount">${state.nodes.length}</span></div>
        <div class="gt-actions">
          <button class="btn btn-ghost btn-sm" id="gtAddChild"><i class="ri-node-tree"></i> Anadir rama</button>
          <button class="btn btn-ghost btn-sm" id="gtAddTerminal"><i class="ri-flag-line"></i> Terminal</button>
          <button class="btn btn-ghost btn-sm" id="gtDeleteNode"><i class="ri-delete-bin-line"></i> Borrar</button>
        </div>
        <div class="gt-hint muted">Selecciona un nodo y anade ramas. Doble clic edita.</div>
      </div>
      <div class="gt-card" id="gtInspectorCard">
        <div class="gt-card-head"><h4><i class="ri-equalizer-line"></i> Inspector</h4><span class="badge" id="gtSelBadge">-</span></div>
        <div id="gtInspector">Selecciona un nodo o arista.</div>
      </div>
      <div class="gt-card">
        <div class="gt-card-head"><h4><i class="ri-team-line"></i> Conjuntos de informacion</h4><button class="btn btn-ghost btn-sm" id="gtAddInfoset"><i class="ri-links-line"></i> Agrupar</button></div>
        <div id="gtInfosets" class="gt-infosets"></div>
        <div class="gt-hint muted">Selecciona 2 nodos del mismo jugador (Ctrl+clic) y agrupa.</div>
      </div>
      <div class="gt-card">
        <div class="gt-card-head"><h4><i class="ri-sparkling-line"></i> Plantillas</h4></div>
        <div class="gt-templates" id="gtTemplates"></div>
      </div>
      <div class="gt-card">
        <div class="gt-card-head"><h4><i class="ri-download-line"></i> Exportar</h4></div>
        <div class="gt-exports">
          <button class="btn btn-ghost btn-sm" data-export="istgame">LaTeX</button>
          <button class="btn btn-ghost btn-sm" data-export="dot">DOT</button>
          <button class="btn btn-ghost btn-sm" data-export="svg">SVG</button>
          <button class="btn btn-ghost btn-sm" data-export="png">PNG</button>
        </div>
        <pre id="gtExportOut" class="gt-export-out hidden"></pre>
      </div>
      <div class="gt-card">
        <div class="gt-card-head"><h4><i class="ri-lightbulb-line"></i> Analisis</h4><button class="btn btn-primary btn-sm" id="gtSolveBtn"><i class="ri-play-line"></i> Resolver SPNE</button></div>
        <div id="gtSolveOut" class="gt-solve-out muted">Pulsa Resolver para induccion hacia atras.</div>
      </div>
    </aside>
    <main class="gt-main">
      <div class="gt-toolbar">
        <div class="gt-toolbar-left">
          <button class="icon-btn" id="gtZoomIn" title="Zoom +"><i class="ri-zoom-in-line"></i></button>
          <button class="icon-btn" id="gtZoomOut" title="Zoom -"><i class="ri-zoom-out-line"></i></button>
          <button class="icon-btn" id="gtFit" title="Ajustar"><i class="ri-focus-3-line"></i></button>
          <button class="icon-btn" id="gtCenter" title="Centrar"><i class="ri-crosshair-line"></i></button>
        </div>
        <div class="gt-toolbar-center"><span class="badge" id="gtModeBadge">Extensiva</span> <span class="mono muted" id="gtCoords">-</span></div>
        <div class="gt-toolbar-right">
          <button class="btn btn-ghost btn-sm" id="gtClear"><i class="ri-delete-bin-2-line"></i> Limpiar</button>
        </div>
      </div>
      <div class="gt-canvas-wrap" id="gtCanvasWrap">
        <svg id="gtSvg" class="gt-svg"></svg>
      </div>
      <div class="gt-legend" id="gtLegend"></div>
    </main>
  </div>
  `;
  const svg=$('#gtSvg');
  const wrap=$('#gtCanvasWrap');
  pan={x:0,y:0,zoom:1};
  function renderPlayers(){
    const el=$('#gtPlayers');
    el.innerHTML=state.meta.players.map((p,i)=>`
      <div class="gt-player">
        <span class="gt-dot" style="background:${getPlayerColor(i)}"></span>
        <input class="gt-pinput" data-pidx="${i}" value="${p}" />
        <button class="icon-btn tiny" data-pdel="${i}" title="Quitar"><i class="ri-close-line"></i></button>
      </div>
    `).join('');
    el.querySelectorAll('[data-pidx]').forEach(inp=> inp.addEventListener('change', e=>{
      const idx=+e.target.dataset.pidx;
      state.meta.players[idx]=e.target.value||('Jugador '+(idx+1));
      saveState(); render(); renderLegend();
    }));
    el.querySelectorAll('[data-pdel]').forEach(btn=> btn.addEventListener('click', e=>{
      const idx=+e.target.closest('[data-pdel]').dataset.pdel;
      if(state.meta.players.length<=2) return toast('Minimo 2 jugadores','err');
      state.meta.players.splice(idx,1);
      state.nodes.forEach(n=>{ if(n.player===idx) n.player=0; else if(n.player>idx) n.player--; });
      saveState(); renderPlayers(); render();
    }));
  }
  function renderLegend(){
    const el=$('#gtLegend');
    el.innerHTML=state.meta.players.map((p,i)=>'<span class="gt-legend-item"><i style="background:'+getPlayerColor(i)+'"></i>'+p+'</span>').join('') + '<span class="gt-legend-item"><i style="background:#78909c"></i>Azar</span>';
  }
  function render(){
    layoutTree();
    const W=900, H=520;
    svg.setAttribute('viewBox', '0 0 '+W+' '+H);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.innerHTML='';
    const defs=document.createElementNS('http://www.w3.org/2000/svg','defs');
    defs.innerHTML='<marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="var(--muted)" /></marker>';
    svg.appendChild(defs);
    state.edges.forEach(edge=>{
      const from=state.nodes.find(n=>n.id===edge.from);
      const to=state.nodes.find(n=>n.id===edge.to);
      if(!from||!to) return;
      const x1=from._x + W/2, y1=from._y + 60;
      const x2=to._x + W/2, y2=to._y + 60;
      const g=document.createElementNS('http://www.w3.org/2000/svg','g');
      g.setAttribute('data-edge', edge.id);
      g.setAttribute('class', 'gt-edge');
      if(selectedEdgeId===edge.id) g.classList.add('selected');
      const line=document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1',x1); line.setAttribute('y1',y1); line.setAttribute('x2',x2); line.setAttribute('y2',y2);
      line.setAttribute('stroke', from.player===-1?'#78909c':'var(--muted)');
      line.setAttribute('stroke-width','2');
      line.setAttribute('marker-end','url(#arrow)');
      g.appendChild(line);
      const mx=(x1+x2)/2, my=(y1+y2)/2 - 8;
      const text=document.createElementNS('http://www.w3.org/2000/svg','text');
      text.setAttribute('x',mx); text.setAttribute('y',my);
      text.setAttribute('text-anchor','middle');
      text.setAttribute('font-size','11');
      text.setAttribute('fill','var(--muted)');
      text.textContent=edge.label||'';
      g.appendChild(text);
      g.addEventListener('click', (e)=>{ e.stopPropagation(); selectedEdgeId=edge.id; selectedId=null; render(); renderInspector(); });
      svg.appendChild(g);
    });
    state.infosets.forEach(is=>{
      const nodes=is.nodes.map(id=>state.nodes.find(n=>n.id===id)).filter(Boolean);
      if(nodes.length<2) return;
      const xs=nodes.map(n=>n._x+W/2), ys=nodes.map(n=>n._y+60);
      const minX=Math.min(...xs), maxX=Math.max(...xs), y=ys[0];
      const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');
      rect.setAttribute('x', minX-30); rect.setAttribute('y', y-22);
      rect.setAttribute('width', maxX-minX+60); rect.setAttribute('height', 44);
      rect.setAttribute('rx',22); rect.setAttribute('fill','none');
      rect.setAttribute('stroke', getPlayerColor(is.player));
      rect.setAttribute('stroke-width','2'); rect.setAttribute('stroke-dasharray','8 6');
      svg.appendChild(rect);
    });
    state.nodes.forEach(node=>{
      const x=node._x+W/2, y=node._y+60;
      const g=document.createElementNS('http://www.w3.org/2000/svg','g');
      g.setAttribute('data-node', node.id);
      g.setAttribute('class','gt-node');
      if(selectedId===node.id) g.classList.add('selected');
      const color=getPlayerColor(node.player);
      let shape;
      if(node.type==='terminal'){
        shape=document.createElementNS('http://www.w3.org/2000/svg','rect');
        shape.setAttribute('x', x-36); shape.setAttribute('y', y-18);
        shape.setAttribute('width', 72); shape.setAttribute('height', 36);
        shape.setAttribute('rx',8); shape.setAttribute('fill','#eceff1'); shape.setAttribute('stroke','#90a4ae');
      } else if(node.player===-1){
        shape=document.createElementNS('http://www.w3.org/2000/svg','polygon');
        const r=18;
        shape.setAttribute('points', x+','+(y-r)+' '+(x+r)+','+y+' '+x+','+(y+r)+' '+(x-r)+','+y);
        shape.setAttribute('fill', color); shape.setAttribute('stroke','white');
      } else {
        shape=document.createElementNS('http://www.w3.org/2000/svg','circle');
        shape.setAttribute('cx',x); shape.setAttribute('cy',y); shape.setAttribute('r',18);
        shape.setAttribute('fill', color); shape.setAttribute('stroke','white');
      }
      shape.setAttribute('stroke-width','2');
      g.appendChild(shape);
      if(node.type!=='terminal'){
        const t=document.createElementNS('http://www.w3.org/2000/svg','text');
        t.setAttribute('x',x); t.setAttribute('y', y+4);
        t.setAttribute('text-anchor','middle'); t.setAttribute('font-size','10'); t.setAttribute('fill','white');
        t.textContent=node.label|| ('P'+(node.player+1));
        g.appendChild(t);
      } else {
        const pay=document.createElementNS('http://www.w3.org/2000/svg','text');
        pay.setAttribute('x',x); pay.setAttribute('y', y+5);
        pay.setAttribute('text-anchor','middle'); pay.setAttribute('font-size','10'); pay.setAttribute('fill','#37474f');
        pay.textContent=node.payoffs? node.payoffs.join(', ') : '-';
        g.appendChild(pay);
      }
      g.addEventListener('click', (e)=>{
        e.stopPropagation();
        if(e.ctrlKey || e.metaKey){
          node._selected=!node._selected;
          render();
          return;
        }
        selectedId=node.id; selectedEdgeId=null;
        render(); renderInspector();
      });
      g.addEventListener('dblclick', (e)=>{
        e.stopPropagation();
        const nl=prompt('Etiqueta nodo:', node.label||'');
        if(nl!==null){ node.label=nl; saveState(); render(); renderInspector(); }
      });
      svg.appendChild(g);
    });
    const cntEl=document.getElementById('gtNodeCount');
    if(cntEl) cntEl.textContent=state.nodes.length;
    renderInfosets();
    renderInspector();
  }
  function renderInfosets(){
    const el=$('#gtInfosets');
    if(!state.infosets.length){ el.innerHTML='<span class="muted">Sin conjuntos</span>'; return; }
    el.innerHTML=state.infosets.map(is=>`
      <div class="gt-infoset">
        <span class="gt-dot" style="background:${getPlayerColor(is.player)}"></span>
        <span>${getPlayerName(is.player)}: ${is.nodes.join(', ')}</span>
        <button class="icon-btn tiny" data-isdel="${is.id}" title="Quitar"><i class="ri-close-line"></i></button>
      </div>
    `).join('');
    el.querySelectorAll('[data-isdel]').forEach(b=> b.addEventListener('click', e=>{
      const id=e.target.closest('[data-isdel]').dataset.isdel;
      state.infosets=state.infosets.filter(is=>is.id!==id);
      saveState(); render();
    }));
  }
  function renderInspector(){
    const card=$('#gtInspector');
    const badge=$('#gtSelBadge');
    if(!selectedId && !selectedEdgeId){
      badge.textContent='-';
      card.innerHTML='<span class="muted">Selecciona un nodo o arista.</span>';
      return;
    }
    if(selectedEdgeId){
      const edge=state.edges.find(e=>e.id===selectedEdgeId);
      if(!edge){ card.innerHTML='Arista no encontrada'; return; }
      badge.textContent='Arista';
      card.innerHTML='<label>Etiqueta de rama <input id="inspELabel" class="gt-input" value="'+(edge.label||'')+'"></label><div class="gt-row"><button class="btn btn-ghost btn-sm" id="inspEDel">Borrar arista</button></div>';
      document.getElementById('inspELabel').addEventListener('change', e=>{ edge.label=e.target.value; saveState(); render(); });
      document.getElementById('inspEDel').addEventListener('click', ()=>{
        const to=edge.to;
        state.edges=state.edges.filter(e=>e.id!==selectedEdgeId);
        const hasParent=state.edges.some(e=>e.to===to);
        if(!hasParent){
          const toDelete=new Set([to]);
          const stack=[to];
          while(stack.length){
            const cur=stack.pop();
            state.edges.filter(e=>e.from===cur).forEach(e=>{ if(!toDelete.has(e.to)){ toDelete.add(e.to); stack.push(e.to); } });
          }
          state.nodes=state.nodes.filter(n=>!toDelete.has(n.id));
        }
        selectedEdgeId=null; saveState(); render();
      });
      return;
    }
    const node=state.nodes.find(n=>n.id===selectedId);
    if(!node) return;
    badge.textContent=node.type==='terminal'?'Terminal': getPlayerName(node.player);
    const isTerminal=node.type==='terminal';
    card.innerHTML='<label>Jugador <select id="inspPlayer" class="gt-input">'+state.meta.players.map((p,i)=>'<option value="'+i+'" '+(node.player===i?'selected':'')+'>'+p+'</option>').join('')+'<option value="-1" '+(node.player===-1?'selected':'')+'>Azar</option><option value="-2" '+(node.player===-2?'selected':'')+'>Terminal</option></select></label><label>Etiqueta <input id="inspLabel" class="gt-input" value="'+(node.label||'')+'"></label>'+(isTerminal?'<label>Pagos <input id="inspPay" class="gt-input" value="'+(node.payoffs||[]).join(',')+'"></label>':'')+'<div class="gt-row"><button class="btn btn-ghost btn-sm" id="inspDelNode" style="color:#ef5350">Borrar nodo</button></div>';
    document.getElementById('inspPlayer').addEventListener('change', e=>{
      const v=parseInt(e.target.value,10);
      node.player=v;
      node.type = v===-2 ? 'terminal' : (v===-1 ? 'chance' : 'decision');
      if(node.type==='terminal' && !node.payoffs) node.payoffs=state.meta.players.map(()=>0);
      if(node.type!=='terminal' && node.payoffs) node.payoffs=null;
      saveState(); render();
    });
    document.getElementById('inspLabel').addEventListener('change', e=>{ node.label=e.target.value; saveState(); render(); });
    const payInp=document.getElementById('inspPay');
    if(payInp) payInp.addEventListener('change', e=>{
      const vals=e.target.value.split(',').map(s=>parseFloat(s.trim())).filter(v=>isFinite(v));
      node.payoffs=vals.length? vals : state.meta.players.map(()=>0);
      saveState(); render();
    });
    document.getElementById('inspDelNode').addEventListener('click', ()=>{
      if(state.nodes.length<=1) return toast('No se puede borrar','err');
      const toDelete=new Set([node.id]);
      const stack=[node.id];
      while(stack.length){
        const cur=stack.pop();
        state.edges.filter(e=>e.from===cur).forEach(e=>{ if(!toDelete.has(e.to)){ toDelete.add(e.to); stack.push(e.to); } });
      }
      state.nodes=state.nodes.filter(n=>!toDelete.has(n.id));
      state.edges=state.edges.filter(e=>!toDelete.has(e.from) && !toDelete.has(e.to));
      if(toDelete.has(selectedId)) selectedId=null;
      layoutTree(); saveState(); render();
    });
  }
  // Templates
  const tplEl=$('#gtTemplates');
  if(tplEl){
    tplEl.innerHTML=TEMPLATES.map(t=>'<button class="gt-tpl" data-tpl="'+t.id+'"><b>'+t.name+'</b><small>'+t.desc+'</small></button>').join('');
    tplEl.addEventListener('click', e=>{
      const b=e.target.closest('[data-tpl]');
      if(!b) return;
      const t=TEMPLATES.find(x=>x.id===b.dataset.tpl);
      if(t){
        state=t.build();
        selectedId=null;
        layoutTree(); saveState(); render(); renderPlayers(); toast('Plantilla '+t.name+' cargada','ok');
      }
    });
  }
  // Buttons
  document.getElementById('gtAddChild')?.addEventListener('click', ()=>{
    if(!selectedId) return toast('Selecciona un nodo padre','err');
    const parent=state.nodes.find(n=>n.id===selectedId);
    if(parent.type==='terminal') return toast('Terminal no puede tener hijos','err');
    const nid=uid();
    const newNode={id:nid, player: parent.player===-1 ? 0 : (parent.player+1)%state.meta.players.length, label:'', type:'decision', payoffs:null};
    state.nodes.push(newNode);
    state.edges.push({id:uid(), from:parent.id, to:nid, label:'Accion'});
    layoutTree(); saveState(); render(); selectedId=nid; renderInspector();
  });
  document.getElementById('gtAddTerminal')?.addEventListener('click', ()=>{
    if(!selectedId) return toast('Selecciona un padre','err');
    const parent=state.nodes.find(n=>n.id===selectedId);
    if(parent.type==='terminal') return toast('Terminal no puede tener hijos','err');
    const nid=uid();
    const payoffs=state.meta.players.map(()=> Math.round(Math.random()*5));
    state.nodes.push({id:nid, player:-2, label:'', type:'terminal', payoffs});
    state.edges.push({id:uid(), from:parent.id, to:nid, label:'*'});
    layoutTree(); saveState(); render();
  });
  document.getElementById('gtDeleteNode')?.addEventListener('click', ()=>{
    if(selectedId){
      const toDelete=new Set([selectedId]);
      const stack=[selectedId];
      while(stack.length){
        const cur=stack.pop();
        state.edges.filter(e=>e.from===cur).forEach(e=>{ if(!toDelete.has(e.to)){ toDelete.add(e.to); stack.push(e.to); } });
      }
      state.nodes=state.nodes.filter(n=>!toDelete.has(n.id));
      state.edges=state.edges.filter(e=>!toDelete.has(e.from) && !toDelete.has(e.to));
      if(toDelete.has(selectedId)) selectedId=null;
      layoutTree(); saveState(); render();
    }
  });
  document.getElementById('gtAddInfoset')?.addEventListener('click', ()=>{
    const selectedNodes = state.nodes.filter(n=>n._selected);
    let ids = selectedNodes.map(n=>n.id);
    if(ids.length<2){
      if(selectedId){
        const cur=state.nodes.find(n=>n.id===selectedId);
        const same=state.nodes.filter(n=>n.player===cur.player && n.id!==cur.id).slice(0,1).map(n=>n.id);
        ids=[cur.id, ...same];
      }
      if(ids.length<2) return toast('Selecciona 2+ nodos (Ctrl+clic)','err');
    }
    const player=state.nodes.find(n=>n.id===ids[0])?.player;
    if(!ids.every(id=> state.nodes.find(n=>n.id===id)?.player===player)){
      return toast('Mismo jugador','err');
    }
    state.infosets.push({id:uid(), player, nodes:ids, label:''});
    state.nodes.forEach(n=> n._selected=false);
    saveState(); render(); toast('Conjunto creado','ok');
  });
  document.getElementById('gtNewBtn')?.addEventListener('click', ()=>{
    if(!confirm('Nuevo juego?')) return;
    state=defaultState();
    state.meta.title=document.getElementById('gtTitle').value||'Juego nuevo';
    selectedId=null; layoutTree(); saveState(); render(); renderPlayers();
  });
  document.getElementById('gtClear')?.addEventListener('click', ()=>{
    if(!confirm('Limpiar lienzo?')) return;
    state.nodes=[]; state.edges=[]; state.infosets=[];
    selectedId=null; layoutTree(); saveState(); render();
  });
  document.getElementById('gtAddPlayer')?.addEventListener('click', ()=>{
    state.meta.players.push('Jugador '+(state.meta.players.length+1));
    renderPlayers(); saveState(); renderLegend();
  });
  document.getElementById('gtTitle')?.addEventListener('change', e=>{ state.meta.title=e.target.value; saveState(); });
  // Export
  document.querySelectorAll('[data-export]').forEach(b=> b.addEventListener('click', ()=>{
    const type=b.dataset.export;
    let out='';
    if(type==='istgame') out=exportISTGame();
    else if(type==='dot') out=exportDOT();
    else if(type==='svg'){
      const svgEl=document.getElementById('gtSvg');
      out=new XMLSerializer().serializeToString(svgEl);
    } else if(type==='png'){
      const svgEl=document.getElementById('gtSvg');
      const s=new XMLSerializer().serializeToString(svgEl);
      const blob=new Blob([s],{type:'image/svg+xml'});
      const url=URL.createObjectURL(blob);
      const img=new Image();
      img.onload=()=>{
        const canvas=document.createElement('canvas');
        canvas.width=900; canvas.height=520;
        const ctx=canvas.getContext('2d');
        ctx.fillStyle='#0d1210'; ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(img,0,0);
        const a=document.createElement('a');
        a.href=canvas.toDataURL('image/png');
        a.download=(state.meta.title||'arbol')+'.png';
        a.click();
        URL.revokeObjectURL(url);
      };
      img.src=url;
      toast('PNG exportado','ok');
      return;
    }
    const pre=document.getElementById('gtExportOut');
    pre.textContent=out;
    pre.classList.remove('hidden');
    navigator.clipboard.writeText(out).then(()=>toast(type+' copiado','ok'));
  }));
  document.getElementById('gtSolveBtn')?.addEventListener('click', ()=>{
    const res=solveSPNE();
    const out=document.getElementById('gtSolveOut');
    if(!res.bestMove || !Object.keys(res.bestMove).length){
      out.innerHTML='<span class="muted">No hay SPNE unico.</span>';
      return;
    }
    let html='<b>SPNE:</b><br>';
    Object.entries(res.bestMove).forEach(([nodeId, bestChild])=>{
      const node=state.nodes.find(n=>n.id===nodeId);
      const edge=state.edges.find(e=>e.from===nodeId && e.to===bestChild);
      html+='<div><code>'+nodeId+' -> '+ (edge ? edge.label : bestChild)+'</code> valores: '+(res.values[nodeId]||[]).join(',')+'</div>';
    });
    html+='<div class="muted">Pagos: '+(res.values[state.nodes[0].id]||[]).join(', ')+'</div>';
    out.innerHTML=html;
    document.querySelectorAll('.gt-edge').forEach(el=> el.classList.remove('spne'));
    Object.entries(res.bestMove).forEach(([from,to])=>{
      const edgeId=state.edges.find(e=>e.from===from && e.to===to)?.id;
      const el=document.querySelector('[data-edge="'+edgeId+'"]');
      if(el) el.classList.add('spne');
    });
    toast('SPNE calculado','ok');
  });
  // Pan/zoom
  const wrapEl=document.getElementById('gtCanvasWrap');
  wrapEl.addEventListener('wheel', e=>{
    e.preventDefault();
    const factor=e.deltaY>0?0.9:1.1;
    pan.zoom=Math.min(2.5, Math.max(0.4, pan.zoom*factor));
    svg.style.transform='translate('+pan.x+'px, '+pan.y+'px) scale('+pan.zoom+')';
  }, {passive:false});
  let isPanning=false, lastPan={x:0,y:0};
  wrapEl.addEventListener('pointerdown', e=>{
    if(e.target.closest('.gt-node')) return;
    isPanning=true; lastPan={x:e.clientX - pan.x, y:e.clientY - pan.y};
  });
  wrapEl.addEventListener('pointermove', e=>{
    if(isPanning){
      pan.x=e.clientX - lastPan.x;
      pan.y=e.clientY - lastPan.y;
      svg.style.transform='translate('+pan.x+'px, '+pan.y+'px) scale('+pan.zoom+')';
    }
  });
  wrapEl.addEventListener('pointerup', ()=> isPanning=false);
  document.getElementById('gtZoomIn')?.addEventListener('click', ()=>{ pan.zoom=Math.min(2.5, pan.zoom*1.2); svg.style.transform='translate('+pan.x+'px, '+pan.y+'px) scale('+pan.zoom+')'; });
  document.getElementById('gtZoomOut')?.addEventListener('click', ()=>{ pan.zoom=Math.max(0.4, pan.zoom/1.2); svg.style.transform='translate('+pan.x+'px, '+pan.y+'px) scale('+pan.zoom+')'; });
  document.getElementById('gtFit')?.addEventListener('click', ()=>{ pan={x:0,y:0,zoom:1}; svg.style.transform='translate(0px, 0px) scale(1)'; });
  document.getElementById('gtCenter')?.addEventListener('click', ()=>{ pan={x:0,y:0,zoom:1}; svg.style.transform='translate(0px, 0px) scale(1)'; });
  // Listener de clic en fondo del SVG - UNA sola vez, fuera de render()
  svg.addEventListener('click', ()=>{ selectedId=null; selectedEdgeId=null; render(); renderInspector(); });
  renderPlayers();
  renderLegend();
  render();
}
