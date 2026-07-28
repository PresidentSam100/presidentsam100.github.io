
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const FILLED = { k:"♚",q:"♛",r:"♜",b:"♝",n:"♞",p:"♟" };
  const OUTLINE = { k:"♔",q:"♕",r:"♖",b:"♗",n:"♘",p:"♙" };
  const VAL = { p:1,n:3,b:3,r:5,q:9,k:0 };
  const idx = (G,r,c) => r*G.dim+c;
  const rc  = (G,i) => [ (i/G.dim)|0, i%G.dim ];

  // ============================================================ sound
  let actx=null;
  function ac(){ if(!actx){ try{ actx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } if(actx&&actx.state==="suspended")actx.resume(); return actx; }
  function blip(f,dur,type,vol){ const a=ac(); if(!a)return; const t=a.currentTime,o=a.createOscillator(),g=a.createGain();
    o.type=type||"sine"; o.frequency.value=f; g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(vol||.18,t+.008);
    g.gain.exponentialRampToValueAtTime(.0001,t+dur); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t+dur+.03); }
  function noise(dur,vol){ const a=ac(); if(!a)return; const n=Math.max(1,(a.sampleRate*dur)|0),buf=a.createBuffer(1,n,a.sampleRate),d=buf.getChannelData(0);
    for(let i=0;i<n;i++) d[i]=(Math.random()*2-1)*(1-i/n); const s=a.createBufferSource(); s.buffer=buf;
    const bp=a.createBiquadFilter(); bp.type="lowpass"; bp.frequency.value=900; const g=a.createGain(); g.gain.value=vol||.25;
    s.connect(bp).connect(g).connect(a.destination); s.start(); }
  const SFX={ move:()=>blip(300,.06,"sine",.16), capture:()=>{noise(.12,.3);blip(180,.09,"square",.12);},
    castle:()=>{blip(320,.07,"sine",.14);setTimeout(()=>blip(420,.07,"sine",.14),70);},
    check:()=>{blip(660,.12,"triangle",.2);setTimeout(()=>blip(880,.12,"triangle",.18),90);},
    promote:()=>[523,659,784,1047].forEach((f,i)=>setTimeout(()=>blip(f,.14,"triangle",.18),i*80)),
    out:()=>[392,294,233].forEach((f,i)=>setTimeout(()=>blip(f,.18,"sawtooth",.18),i*120)),
    win:()=>[523,659,784,1047].forEach((f,i)=>setTimeout(()=>blip(f,.18,"triangle",.2),i*120)),
    draw:()=>{blip(440,.2,"sine",.16);setTimeout(()=>blip(440,.3,"sine",.14),180);} };

  // ============================================================ engine (pure)
  function pawnCaps(G,r,c,o){ const [dr,dc]=G.pawnDir[o]; return [[r+dr+dc,c+dc-dr],[r+dr-dc,c+dc+dr]]; }

  function genPseudo(G,b,i){
    const p=b[i]; if(!p||p.dead) return [];
    const col=p.o,type=p.t,[r,c]=rc(G,i),out=[];
    const push=(r2,c2,extra)=>{ if(!G.valid(r2,c2)) return false; const t=idx(G,r2,c2),tp=b[t];
      if(tp){ if(tp.o!==col && tp.t!=="k") out.push(Object.assign({from:i,to:t,cap:true},extra)); return false; } // kings are never capturable
      out.push(Object.assign({from:i,to:t},extra)); return true; };
    const slide=(dirs)=>{ for(const [dr,dc] of dirs){ let nr=r+dr,nc=c+dc; while(push(nr,nc)){ nr+=dr; nc+=dc; } } };
    const DIAG=[[-1,-1],[-1,1],[1,-1],[1,1]], ORTH=[[-1,0],[1,0],[0,-1],[0,1]];
    if(type==="p"){
      const [dr,dc]=G.pawnDir[col], fr=r+dr, fc=c+dc;
      if(G.valid(fr,fc) && !b[idx(G,fr,fc)]){
        addPawn(out,i,idx(G,fr,fc), G.pawnPromo(col,fr,fc));
        const sr=r+2*dr, sc=c+2*dc;
        if(G.pawnStart(col,r,c) && G.valid(sr,sc) && !b[idx(G,sr,sc)]) out.push({from:i,to:idx(G,sr,sc),dbl:true});
      }
      for(const [nr,nc] of pawnCaps(G,r,c,col)){
        if(!G.valid(nr,nc)) continue; const t=idx(G,nr,nc), tp=b[t];
        if(tp && tp.o!==col && tp.t!=="k") addPawn(out,i,t, G.pawnPromo(col,nr,nc), true);
        else if(G.ep && t===G.ep.sq && b[G.ep.victim] && b[G.ep.victim].o!==col) out.push({from:i,to:t,ep:true,cap:true});
      }
    } else if(type==="n"){ for(const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) push(r+dr,c+dc); }
    else if(type==="b"){ slide(DIAG); }
    else if(type==="r"){ slide(ORTH); }
    else if(type==="q"){ slide(DIAG); slide(ORTH); }
    else if(type==="k"){
      for(const [dr,dc] of DIAG.concat(ORTH)) push(r+dr,c+dc);
      if(G.hasCastle && G.castle){
        const home = col==="w"?7:0;
        if(r===home && c===4 && !attacked(G,b,i,col)){
          if(G.castle[col+"k"] && !b[idx(G,home,5)] && !b[idx(G,home,6)] && cell(G,b,home,7,col,"r")
             && !attacked(G,b,idx(G,home,5),col) && !attacked(G,b,idx(G,home,6),col)) out.push({from:i,to:idx(G,home,6),castle:"k"});
          if(G.castle[col+"q"] && !b[idx(G,home,3)] && !b[idx(G,home,2)] && !b[idx(G,home,1)] && cell(G,b,home,0,col,"r")
             && !attacked(G,b,idx(G,home,3),col) && !attacked(G,b,idx(G,home,2),col)) out.push({from:i,to:idx(G,home,2),castle:"q"});
        }
      }
    }
    return out;
  }
  function cell(G,b,r,c,o,t){ const p=b[idx(G,r,c)]; return p && p.o===o && p.t===t && !p.dead; }
  function addPawn(out,from,to,promo,cap){ if(promo) out.push({from,to,promo:true,cap:!!cap}); else out.push({from,to,cap:!!cap}); }

  // is square t attacked by any live enemy of defCol?  (att optional: only that owner)
  function attacked(G,b,t,defCol,att){
    const [r,c]=rc(G,t);
    const foe=(p,types)=>p&&!p.dead&&p.o!==defCol&&(!att||p.o===att)&&types.indexOf(p.t)>=0;
    // pawns: check the 4 diagonal neighbours; an enemy pawn there attacks t if t is one of its capture squares
    for(const [dr,dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]){
      if(!G.valid(r+dr,c+dc)) continue; const p=b[idx(G,r+dr,c+dc)];
      if(p&&!p.dead&&p.t==="p"&&p.o!==defCol&&(!att||p.o===att)){
        for(const [ar,acc] of pawnCaps(G,r+dr,c+dc,p.o)) if(ar===r&&acc===c) return true;
      }
    }
    for(const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])
      if(G.valid(r+dr,c+dc) && foe(b[idx(G,r+dr,c+dc)],["n"])) return true;
    for(const [dr,dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]])
      if(G.valid(r+dr,c+dc) && foe(b[idx(G,r+dr,c+dc)],["k"])) return true;
    const ray=(dirs,types)=>{ for(const [dr,dc] of dirs){ let nr=r+dr,nc=c+dc;
      while(G.valid(nr,nc)){ const p=b[idx(G,nr,nc)]; if(p){ if(foe(p,types)) return true; break; } nr+=dr; nc+=dc; } } return false; };
    if(ray([[-1,0],[1,0],[0,-1],[0,1]],["r","q"])) return true;
    if(ray([[-1,-1],[-1,1],[1,-1],[1,1]],["b","q"])) return true;
    return false;
  }
  function kingSq(G,b,col){ for(let i=0;i<b.length;i++){ const p=b[i]; if(p&&p.o===col&&p.t==="k"&&!p.dead) return i; } return -1; }
  function inCheck(G,b,col){ const k=kingSq(G,b,col); return k>=0 && attacked(G,b,k,col); }

  function applyTo(G,b,m,promoType){
    const nb=b.slice(); const p=nb[m.from], col=p.o;
    nb[m.to]= m.promo ? {o:col,t:(promoType||"q"),dead:false} : p;
    nb[m.from]=null;
    if(m.ep) nb[G.ep.victim]=null;
    if(m.castle){ const [hr]=rc(G,m.from); if(m.castle==="k"){ nb[idx(G,hr,5)]=nb[idx(G,hr,7)]; nb[idx(G,hr,7)]=null; }
                  else { nb[idx(G,hr,3)]=nb[idx(G,hr,0)]; nb[idx(G,hr,0)]=null; } }
    return nb;
  }
  function legalFor(G,i){ const p=G.board[i]; if(!p||p.dead||p.o!==G.turn) return [];
    return genPseudo(G,G.board,i).filter(m => !inCheck(G, applyTo(G,G.board,m,"q"), p.o)); }
  function anyLegal(G,col){ for(let i=0;i<G.board.length;i++){ const p=G.board[i];
      if(p&&!p.dead&&p.o===col){ const ms=genPseudo(G,G.board,i); for(const m of ms) if(!inCheck(G,applyTo(G,G.board,m,"q"),col)) return true; } } return false; }
  function aliveOwners(G){ return G.order.filter(o=>G.players[o].alive); }

  // ============================================================ setup
  function make2P(){
    const dim=8, board=new Array(64).fill(null), back=["r","n","b","q","k","b","n","r"];
    for(let c=0;c<8;c++){ board[c]={o:"b",t:back[c],dead:false}; board[8+c]={o:"b",t:"p",dead:false};
      board[48+c]={o:"w",t:"p",dead:false}; board[56+c]={o:"w",t:back[c],dead:false}; }
    return { mode:2, dim, valid:(r,c)=>r>=0&&r<8&&c>=0&&c<8, board,
      players:{ w:{name:"White",color:"#fbf2e2",alive:true}, b:{name:"Black",color:"#2a211a",alive:true} },
      order:["w","b"], turn:"w", pawnDir:{ w:[-1,0], b:[1,0] },
      pawnStart:(o,r)=> o==="w"?r===6:r===1, pawnPromo:(o,r)=> o==="w"?r===0:r===7,
      hasCastle:true, castle:{wk:true,wq:true,bk:true,bq:true}, ep:null, last:null, over:false, winner:null,
      ending:1, sel:-1, legal:[], history:[], capList:[] };
  }
  function make4P(ending){
    const dim=14, board=new Array(dim*dim).fill(null), back=["r","n","b","q","k","b","n","r"];
    const valid=(r,c)=> r>=0&&r<dim&&c>=0&&c<dim && !((r<3||r>10)&&(c<3||c>10));
    const set=(r,c,o,t)=> board[r*dim+c]={o,t,dead:false};
    for(let k=0;k<8;k++){ set(13,3+k,"r",back[k]); set(12,3+k,"r","p");      // Red bottom
                          set(0,3+k,"y",back[k]); set(1,3+k,"y","p");        // Yellow top
                          set(3+k,0,"b",back[k]); set(3+k,1,"b","p");        // Blue left
                          set(3+k,13,"g",back[k]); set(3+k,12,"g","p"); }    // Green right
    return { mode:4, dim, valid, board,
      players:{ r:{name:"Red",color:"#e2574e",alive:true}, b:{name:"Blue",color:"#5a82e6",alive:true},
                y:{name:"Yellow",color:"#e6c63f",alive:true}, g:{name:"Green",color:"#54b96a",alive:true} },
      order:["r","b","y","g"], turn:"r",
      pawnDir:{ r:[-1,0], y:[1,0], b:[0,1], g:[0,-1] },
      pawnStart:(o,r,c)=> o==="r"?r===12 : o==="y"?r===1 : o==="b"?c===1 : c===12,
      pawnPromo:(o,r,c)=> o==="r"?r===0 : o==="y"?r===13 : o==="b"?c===13 : c===0,
      hasCastle:false, castle:null, ep:null, last:null, over:false, winner:null,
      ending:ending, sel:-1, legal:[], history:[], capList:[] };
  }

  // ============================================================ controller
  let G=null, flipped=false, pendingPromo=null;
  let setup2 = { opponent:"local", difficulty:"medium", side:"w", base:0, inc:0 }; // last-used 2P setup
  let cpuThinking=false, cpuRequestId=0, worker=null, workerFailed=false;
  const boardEl=$("board"), statusEl=$("status");

  function cap(s){ return s ? s.charAt(0).toUpperCase()+s.slice(1) : s; }
  function modeLabel2P(){
    let s = "2 Players · ";
    s += G.vsCPU ? ("vs CPU ("+cap(G.difficulty)+") · you play "+(G.cpuColor==="w"?"Black":"White")) : "local";
    if(G.clock && G.clock.enabled) s += " · " + Math.round(G.clock.w/60000) + "+" + Math.round(G.clock.inc/1000);
    return s;
  }

  function start(mode, ending, setup){
    cancelCpuThink();
    G = mode===4 ? make4P(ending) : make2P();
    if(mode===2){
      const s = setup || setup2; setup2 = s;
      G.vsCPU = s.opponent==="cpu";
      G.difficulty = s.difficulty;
      // s.side is the HUMAN's chosen color — the CPU plays the opposite side.
      const humanSide = s.side==="random" ? (Math.random()<0.5?"w":"b") : s.side;
      G.cpuColor = G.vsCPU ? (humanSide==="w"?"b":"w") : null;
      const baseMs = (s.base|0)*60000;
      G.clock = baseMs>0
        ? { enabled:true, w:baseMs, b:baseMs, inc:(s.inc|0)*1000, running:null, lastTick:Date.now() }
        : { enabled:false, w:0, b:0, inc:0, running:null, lastTick:Date.now() };
      flipped = G.vsCPU && G.cpuColor==="w";
    } else {
      G.vsCPU=false; G.cpuColor=null; G.difficulty=null; G.clock=null;
      flipped=false;
    }
    boardEl.style.setProperty("--sq", mode===4 ? "min(6.2vw,40px)" : "min(11vw,62px)");
    boardEl.style.gridTemplateColumns = "repeat("+G.dim+", var(--sq))";
    boardEl.style.gridTemplateRows = "repeat("+G.dim+", var(--sq))";
    $("side2").style.display = mode===4 ? "none" : "block";
    $("side4").style.display = mode===4 ? "flex" : "none";
    $("flipBtn").style.display = mode===4 ? "none" : "block";
    $("modeLabel").textContent = mode===4
      ? ("4 Players · " + ({1:"first checkmate wins",2:"takeover",3:"frozen pieces"}[ending]))
      : modeLabel2P();
    render(); setStatus();
    if(mode===2 && G.clock.enabled) setClockRunning("w");
    if(mode===2 && G.vsCPU && G.turn===G.cpuColor) requestCpuMove();
  }

  // Always use the solid (filled) glyphs and tint them; an outline class added in
  // render() keeps every piece readable on both light and dark squares.
  function glyphOf(p){ return FILLED[p.t]; }
  function lum(hex){ const h=hex.replace("#",""); const s=h.length===3?h.split("").map(x=>x+x).join(""):h;
    const r=parseInt(s.slice(0,2),16), g=parseInt(s.slice(2,4),16), b=parseInt(s.slice(4,6),16);
    return (0.2126*r + 0.7152*g + 0.0722*b) / 255; }

  function render(){
    boardEl.innerHTML="";
    const inCk = !G.over && inCheck(G,G.board,G.turn) ? kingSq(G,G.board,G.turn) : -1;
    const cells=[]; for(let i=0;i<G.board.length;i++) cells.push(i);
    const seq = flipped ? cells.slice().reverse() : cells;
    for(const i of seq){
      const [r,c]=rc(G,i); const sq=document.createElement("div");
      if(!G.valid(r,c)){ sq.className="sq off"; boardEl.appendChild(sq); continue; }
      sq.className="sq "+((r+c)%2===0?"l":"d"); sq.dataset.i=i;
      const p=G.board[i]; if(!p) sq.classList.add("empty");
      if(i===G.sel) sq.classList.add("sel");
      if(G.last&&(i===G.last.from||i===G.last.to)) sq.classList.add("last");
      if(i===inCk) sq.classList.add("check");
      const mv=G.legal.find(m=>m.to===i);
      if(mv){ const d=document.createElement("div"); d.className="dot"; sq.appendChild(d); if(mv.cap) sq.classList.add("cap"); }
      if(p){ const g=document.createElement("span"); const col=G.players[p.o].color;
        g.className="pc "+(lum(col)>0.55?"lt":"dk")+(p.dead?" dead":"");
        g.textContent=glyphOf(p); g.style.color=col; sq.appendChild(g); }
      sq.addEventListener("click",()=>onSquare(i));
      boardEl.appendChild(sq);
    }
    if(G.mode===2){
      $("capW").innerHTML = G.capList.filter(x=>x.by==="w").map(x=>OUTLINE[x.t]||FILLED[x.t]).join("")||"&nbsp;";
      $("capB").innerHTML = G.capList.filter(x=>x.by==="b").map(x=>FILLED[x.t]).join("")||"&nbsp;";
      // colour captured glyphs
      [["capW","b"],["capB","w"]].forEach(([id])=>{});
    } else renderPlayers();
    renderClocks();
  }

  // ============================================================ clock
  function hasSufficientMaterial(b,col){
    let minors=0;
    for(const p of b){ if(!p||p.dead||p.o!==col) continue;
      if(p.t==="p"||p.t==="r"||p.t==="q") return true;
      if(p.t==="n"||p.t==="b") minors++; }
    return minors>=2;
  }
  function flushElapsed(){
    if(G.clock && G.clock.running){ const now=Date.now();
      G.clock[G.clock.running] = Math.max(0, G.clock[G.clock.running]-(now-G.clock.lastTick));
      G.clock.lastTick=now; }
  }
  function setClockRunning(color){ if(!G.clock) return; flushElapsed(); G.clock.running=color; G.clock.lastTick=Date.now(); }
  function fmtClock(ms){ ms=Math.max(0,ms); const s=Math.ceil(ms/1000), m=Math.floor(s/60), r=s%60; return m+":"+(r<10?"0":"")+r; }
  function renderClocks(){
    const has = !!(G.clock && G.clock.enabled);
    $("clkW").style.display = has ? "flex" : "none";
    $("clkB").style.display = has ? "flex" : "none";
    if(!has) return;
    $("clkWVal").textContent = fmtClock(G.clock.w);
    $("clkBVal").textContent = fmtClock(G.clock.b);
    $("clkW").classList.toggle("turn", G.clock.running==="w" && !G.over);
    $("clkB").classList.toggle("turn", G.clock.running==="b" && !G.over);
    $("clkW").classList.toggle("warn", G.clock.w<=20000 && G.clock.w>0);
    $("clkB").classList.toggle("warn", G.clock.b<=20000 && G.clock.b>0);
  }
  function flagLoss(color){
    if(G.over) return;
    const winner = color==="w" ? "b" : "w";
    if(!hasSufficientMaterial(G.board,winner)){
      endGame("Draw", G.players[color].name+" ran out of time, but "+G.players[winner].name+" doesn't have enough material to checkmate.");
    } else {
      G.winner=winner; SFX.win();
      gameOver(G.players[winner].name+" wins!", G.players[color].name+" ran out of time.");
    }
  }
  function tick(){
    if(!G || !G.clock || !G.clock.enabled || !G.clock.running || G.over) return;
    flushElapsed();
    if(G.clock[G.clock.running] <= 0){ flagLoss(G.clock.running); return; }
    renderClocks();
  }
  setInterval(tick, 100);
  function renderPlayers(){
    const wrap=$("side4"); wrap.innerHTML="";
    for(const o of G.order){
      const pl=G.players[o]; const chip=document.createElement("div");
      chip.className="pchip"+(o===G.turn&&!G.over?" turn":"")+(pl.alive?"":" dead");
      const score=G.capList.filter(x=>x.by===o).reduce((s,x)=>s+VAL[x.t],0);
      chip.innerHTML='<span class="dot2" style="background:'+pl.color+'"></span>'
        +'<span class="nm">'+pl.name+'</span>'
        +'<span class="meta">'+(pl.alive?(o===G.turn&&!G.over?"to move":(score?"+"+score:"")):"out")+'</span>';
      wrap.appendChild(chip);
    }
  }

  function setStatus(check){
    if(G.over) return;
    const pl=G.players[G.turn];
    let extra = check?' — <b style="color:var(--check)">Check!</b>':'';
    if(G.vsCPU && G.turn===G.cpuColor) extra += ' <span style="color:var(--muted)">— thinking…</span>';
    statusEl.innerHTML='<span style="color:'+pl.color+'">'+pl.name+'</span> to move' + extra;
  }

  function onSquare(i){
    if(G.over || cpuThinking) return; const p=G.board[i];
    if(p && !p.dead && p.o===G.turn){ G.sel=i; G.legal=legalFor(G,i); render(); return; }
    if(G.sel>=0){ const m=G.legal.find(mm=>mm.to===i);
      if(m){ if(m.promo){ askPromo(m); return; } doMove(m); return; } }
    G.sel=-1; G.legal=[]; render();
  }

  function askPromo(m){
    pendingPromo=m; const col=G.board[m.from].o, box=$("promoChoices"); box.innerHTML="";
    for(const t of ["q","r","b","n"]){ const btn=document.createElement("button");
      btn.textContent=FILLED[t]; btn.style.color=G.players[col].color;
      btn.addEventListener("click",()=>{ $("promoOverlay").classList.remove("show"); doMove(pendingPromo,t); pendingPromo=null; });
      box.appendChild(btn); }
    $("promoOverlay").classList.add("show");
  }

  function snapshot(){
    return { board:G.board.map(p=>p), turn:G.turn, ep:G.ep, last:G.last,
      castle:G.castle?Object.assign({},G.castle):null,
      players:JSON.parse(JSON.stringify(G.players)), capList:G.capList.slice(), over:G.over, winner:G.winner,
      clock: G.clock ? { enabled:G.clock.enabled, w:G.clock.w, b:G.clock.b, inc:G.clock.inc, running:G.clock.running } : null };
  }

  function doMove(m, promoType){
    const b=G.board, p=b[m.from], col=p.o;
    const captured = m.ep ? b[G.ep.victim] : b[m.to];
    G.history.push(snapshot());
    if(G.clock && G.clock.enabled) G.clock[col] += G.clock.inc;

    G.board = applyTo(G,b,m,promoType);
    if(captured) G.capList.push({by:col, t:captured.t});

    if(G.hasCastle && G.castle){
      if(p.t==="k"){ G.castle[col+"k"]=false; G.castle[col+"q"]=false; }
      if(m.from===56||m.to===56) G.castle.wq=false; if(m.from===63||m.to===63) G.castle.wk=false;
      if(m.from===0 ||m.to===0)  G.castle.bq=false; if(m.from===7 ||m.to===7)  G.castle.bk=false;
    }
    if(m.dbl){ const [fr,fc]=rc(G,m.from), [dr,dc]=G.pawnDir[col]; G.ep={ sq:idx(G,fr+dr,fc+dc), victim:m.to }; }
    else G.ep=null;

    G.last={from:m.from,to:m.to}; G.sel=-1; G.legal=[];
    if(m.castle) SFX.castle(); else if(m.promo) SFX.promote(); else if(captured) SFX.capture(); else SFX.move();

    render();
    advance(col);
  }

  // find the next player to move after `mover`, handling check/stalemate/elimination
  function advance(mover){
    let guard=0;
    let cur=mover;
    while(true){
      if(aliveOwners(G).length<=1){ return finishLastStanding(); }
      const nxt=nextAlive(cur);
      if(nxt===null){ return endGame("Draw","No players remain able to move."); }
      if(anyLegal(G,nxt)){
        G.turn=nxt; setClockRunning(nxt); const ck=inCheck(G,G.board,nxt);
        if(ck) SFX.check(); render(); setStatus(ck);
        if(G.vsCPU && nxt===G.cpuColor) requestCpuMove();
        return;
      }
      // no legal moves for nxt
      if(inCheck(G,G.board,nxt)){
        const credit = creditFor(nxt, mover);
        eliminate(nxt, credit);
        if(G.over) return;                 // ending option 1 ended the game
        if(aliveOwners(G).length<=1) return finishLastStanding();
        guard=0; cur=nxt; continue;        // board changed; keep scanning
      } else {
        // stalemate -> skip this player this rotation
        cur=nxt; if(++guard>G.order.length) return endGame("Draw","Everyone is stalemated.");
        continue;
      }
    }
  }
  function nextAlive(from){ const n=G.order.length, s=G.order.indexOf(from);
    for(let k=1;k<=n;k++){ const o=G.order[(s+k)%n]; if(G.players[o].alive) return o; } return null; }
  // which owner gets credit for the mate on `col`'s king (prefer the mover if they're a checker)
  function creditFor(col, mover){
    const k=kingSq(G,G.board,col); if(k<0) return mover;
    if(attacked(G,G.board,k,col,mover)) return mover;
    for(const o of aliveOwners(G)) if(o!==col && attacked(G,G.board,k,col,o)) return o;
    return mover;
  }

  function eliminate(col, by){
    G.players[col].alive=false; SFX.out();
    if(G.ending===1){ G.over=true; G.winner=by; render();
      gameOver(G.players[by].name+" wins!", "Checkmate — "+G.players[by].name+" checkmated "+G.players[col].name+"."); return; }
    if(G.ending===2){ // takeover: remove dead king, hand the rest to `by`
      G.board=G.board.map(p=> p&&p.o===col ? (p.t==="k"?null:{o:by,t:p.t,dead:false}) : p);
    } else { // ending 3: freeze the dead army as obstacles
      G.board=G.board.map(p=> p&&p.o===col ? {o:col,t:p.t,dead:true} : p);
    }
    render();
  }

  function finishLastStanding(){
    const last=aliveOwners(G)[0];
    G.over=true; G.winner=last; SFX.win(); render();
    gameOver(G.players[last].name+" wins!", G.players[last].name+" is the last player standing.");
    return;
  }
  const CHESS_REC = window.GameShell ? GameShell.record("chess_record") : null;
  function gameOver(title,msg){ setClockRunning(null); G.over=true;
    // Record only 2-player games against the CPU — local games and the 3/4-player
    // variants have no single "you" to credit. Every end path funnels through
    // here, and a win is always announced as "<player name> wins!".
    if(CHESS_REC && G.mode===2 && G.vsCPU){
      const human = G.cpuColor==="w" ? "b" : "w";
      if(title.indexOf("Draw")===0) CHESS_REC.add("d");
      else if(G.players[human] && title.indexOf(G.players[human].name+" wins")===0) CHESS_REC.add("w");
      else CHESS_REC.add("l");
      msg += "\n\nRecord vs CPU — " + CHESS_REC.text();
    }
    statusEl.innerHTML='<b>'+title+'</b>';
    if(G.mode===4) renderPlayers();
    if(title.indexOf("Draw")<0 && G.ending!==1) SFX.win();
    setTimeout(()=>{ $("overTitle").textContent=title; $("overMsg").textContent=msg; $("overOverlay").classList.add("show"); },350);
  }
  function endGame(title,msg){ G.over=true; SFX.draw(); render(); gameOver(title,msg); }

  function popOnce(){
    const h=G.history.pop();
    G.board=h.board.map(p=>p); G.turn=h.turn; G.ep=h.ep; G.last=h.last; G.castle=h.castle;
    G.players=h.players; G.capList=h.capList; G.over=h.over; G.winner=h.winner; G.sel=-1; G.legal=[];
    if(h.clock) G.clock = { enabled:h.clock.enabled, w:h.clock.w, b:h.clock.b, inc:h.clock.inc, running:h.clock.running, lastTick:Date.now() };
  }
  // Vs CPU, undo always hands control back to the human: a completed CPU
  // reply pops twice (its move + the human move before it); a cancelled
  // mid-think undo pops just the human's move, since the CPU never moved.
  function undo(){
    if(!G.history.length) return;
    if(cpuThinking) cancelCpuThink();
    popOnce();
    while(G.vsCPU && !G.over && G.turn===G.cpuColor && G.history.length) popOnce();
    if(G.clock) G.clock.lastTick=Date.now();
    $("overOverlay").classList.remove("show"); render(); setStatus(inCheck(G,G.board,G.turn));
  }

  // ============================================================ CPU (worker)
  // Small material-only 1-ply fallback used only if the Worker can't run at
  // all (construction throws, or a runtime error) — keeps the game playable,
  // just noticeably weaker than the real search, until the page is reloaded.
  function legalMovesOnBoard(b,col){
    const out=[];
    for(let i=0;i<b.length;i++){ const p=b[i]; if(p&&!p.dead&&p.o===col){
      for(const m of genPseudo(G,b,i)) if(!inCheck(G,applyTo(G,b,m,"q"),col)) out.push(m);
    }}
    return out;
  }
  function fallbackCpuMove(){
    const col=G.turn, moves=legalMovesOnBoard(G.board,col);
    if(!moves.length) return null;
    let best=moves[0], bestScore=-Infinity;
    for(const m of moves){
      const nb=applyTo(G,G.board,m,"q");
      let s=0; for(const p of nb) if(p&&!p.dead) s += (p.o===col?1:-1)*VAL[p.t];
      if(s>bestScore){ bestScore=s; best=m; }
    }
    return best;
  }
  function ensureWorker(){
    if(worker||workerFailed) return;
    try{
      worker=new Worker("cpu-worker.js");
      worker.onmessage=onCpuMessage;
      worker.onerror=onCpuError;
    }catch(e){ workerFailed=true; worker=null; }
  }
  function onCpuMessage(ev){
    const msg=ev.data;
    if(!msg||msg.requestId!==cpuRequestId) return;      // stale response — discard
    cpuThinking=false;
    if(G.over||!G.vsCPU||G.turn!==G.cpuColor) return;    // state moved on (undo/new game) — discard
    const mv = (msg.type==="move" && msg.move) ? msg.move : fallbackCpuMove();
    if(mv) doMove(mv,"q");
  }
  function onCpuError(){
    workerFailed=true; try{ worker.terminate(); }catch(e){} worker=null;
    if(cpuThinking && !G.over && G.vsCPU && G.turn===G.cpuColor){
      cpuThinking=false;
      const mv=fallbackCpuMove(); if(mv) doMove(mv,"q");
    }
  }
  function cancelCpuThink(){
    cpuRequestId++; cpuThinking=false;
    if(worker){ try{ worker.terminate(); }catch(e){} worker=null; }
  }
  function requestCpuMove(){
    if(!G||G.over||!G.vsCPU||G.turn!==G.cpuColor) return;
    cpuThinking=true;
    const myId=++cpuRequestId;
    const tier=G.difficulty||"medium";
    const BUDGET={ easy:60, medium:400, hard:1000, master:1800 };
    const DEPTH ={ easy:2, medium:4, hard:6, master:8 };
    let budgetMs=BUDGET[tier]||400;
    if(G.clock && G.clock.enabled) budgetMs=Math.min(budgetMs, Math.max(40, G.clock[G.cpuColor]*0.04));
    ensureWorker();
    if(!worker){ cpuThinking=false; const mv=fallbackCpuMove(); if(mv) doMove(mv,"q"); return; }
    try{
      worker.postMessage({ type:"think", requestId:myId,
        board:G.board.map(p=>p?{o:p.o,t:p.t,dead:!!p.dead}:null),
        turn:G.turn, castle:G.castle?Object.assign({},G.castle):null,
        ep:G.ep?{sq:G.ep.sq,victim:G.ep.victim}:null,
        difficulty:tier, budgetMs, maxDepth:DEPTH[tier]||4 });
    }catch(e){ cpuThinking=false; const mv=fallbackCpuMove(); if(mv) doMove(mv,"q"); }
  }

  // ============================================================ wiring
  $("newBtn").addEventListener("click",()=> start(G.mode, G.ending));
  $("overAgain").addEventListener("click",()=>{ $("overOverlay").classList.remove("show"); start(G.mode, G.ending); });
  $("undoBtn").addEventListener("click", undo);
  $("flipBtn").addEventListener("click",()=>{ flipped=!flipped; render(); });
  $("modeBtn").addEventListener("click",()=> $("menu").classList.add("show"));
  document.querySelectorAll("#menu .modebtn").forEach(b=> b.addEventListener("click",()=>{
    const mode=b.dataset.mode; if(b.disabled) return;
    if(mode==="3"){ window.location.href="./three.html"; return; }
    $("menu").classList.remove("show");
    if(mode==="4") $("endMenu").classList.add("show");
    else $("setup2Menu").classList.add("show");
  }));
  document.querySelectorAll("#endMenu .modebtn").forEach(b=> b.addEventListener("click",()=>{
    $("endMenu").classList.remove("show"); start(4, parseInt(b.dataset.end,10));
  }));

  // ---- 2P setup menu (opponent / difficulty / side / time control) ----
  $("opponentPick").addEventListener("click",(e)=>{
    const b=e.target.closest(".modebtn"); if(!b) return;
    setup2.opponent=b.dataset.opp;
    [...$("opponentPick").children].forEach(x=>x.classList.toggle("sel", x===b));
    $("cpuOpts").style.display = setup2.opponent==="cpu" ? "block" : "none";
  });
  $("diffPick").addEventListener("click",(e)=>{
    const b=e.target.closest(".chip"); if(!b) return;
    setup2.difficulty=b.dataset.diff;
    [...$("diffPick").children].forEach(x=>x.classList.toggle("sel", x===b));
  });
  $("sidePick").addEventListener("click",(e)=>{
    const b=e.target.closest(".chip"); if(!b) return;
    setup2.side=b.dataset.side;
    [...$("sidePick").children].forEach(x=>x.classList.toggle("sel", x===b));
  });
  $("basePick").addEventListener("click",(e)=>{
    const b=e.target.closest(".chip"); if(!b) return;
    setup2.base=parseInt(b.dataset.base,10);
    [...$("basePick").children].forEach(x=>x.classList.toggle("sel", x===b));
    $("incPick").style.display = setup2.base>0 ? "flex" : "none";
  });
  $("incPick").addEventListener("click",(e)=>{
    const b=e.target.closest(".chip"); if(!b) return;
    setup2.inc=parseInt(b.dataset.inc,10);
    [...$("incPick").children].forEach(x=>x.classList.toggle("sel", x===b));
  });
  $("setup2Start").addEventListener("click",()=>{
    $("setup2Menu").classList.remove("show");
    start(2, null, Object.assign({}, setup2));
  });

  start(2);  // build a board behind the menu
})();
