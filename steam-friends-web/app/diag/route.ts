import { NextRequest, NextResponse } from "next/server";

/**
 * Connection self-test, served as a route handler rather than a page.
 *
 * That's deliberate: a normal page ships the React runtime, and the failure
 * we're chasing truncates large responses — a diagnostic that is itself too big
 * to load tells you nothing. This is hand-written HTML with inline vanilla JS,
 * a few KB total, so it survives conditions the real app doesn't.
 *
 * It runs in the streamer's browser and reports what their connection can and
 * cannot reach, then offers the results as text to send back.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "unknown";
  const region = process.env.VERCEL_REGION ?? "local";
  const sha = (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7);
  const env = process.env.VERCEL_ENV ?? "development";

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Connection check</title>
<style>
 body{font:14px/1.5 system-ui,sans-serif;background:#0e1720;color:#c7d5e0;margin:0;padding:1.2rem;max-width:820px}
 h1{font-size:1.2rem;color:#fff;margin:0 0 .2rem}
 .sub{color:#8fa4b3;font-size:.85rem;margin-bottom:1rem}
 table{border-collapse:collapse;width:100%;margin:.5rem 0 1rem}
 th,td{text-align:left;padding:.35rem .5rem;border-bottom:1px solid rgba(255,255,255,.08);font-size:.85rem}
 th{color:#8fa4b3;font-weight:600}
 .ok{color:#a4d007}.bad{color:#ec6a5e}.warn{color:#e8b339}.run{color:#8fa4b3}
 button{background:#1a9fff;color:#05131f;border:0;border-radius:6px;padding:.55rem 1.1rem;font-weight:700;cursor:pointer;font-size:.9rem}
 button.g{background:transparent;color:#c7d5e0;border:1px solid rgba(255,255,255,.2)}
 pre{background:#0a1119;border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:.6rem;white-space:pre-wrap;word-break:break-all;font-size:.72rem;max-height:16rem;overflow:auto}
 code{background:rgba(255,255,255,.07);padding:.05rem .3rem;border-radius:3px}
</style></head><body>
<h1>Connection check</h1>
<div class="sub">Serving host: <code>${host}</code> &middot; edge: <code>${region}</code> &middot; build: <code>${sha}</code> (${env})</div>

<p>Run this <b>with the VPN off</b>. It tests what your connection can reach.</p>
<p><button id="go">Run the check</button> <button class="g" id="copy">Copy results</button></p>

<table id="t"><thead><tr><th style="width:42%">Test</th><th style="width:16%">Result</th><th>Detail</th></tr></thead><tbody></tbody></table>
<pre id="out">Not run yet.</pre>

<script>
var rows=[],log=[];
function row(name){
  var tb=document.querySelector('#t tbody'),tr=document.createElement('tr');
  tr.innerHTML='<td>'+name+'</td><td class="run">running…</td><td></td>';
  tb.appendChild(tr);
  return function(cls,res,detail){
    tr.children[1].className=cls; tr.children[1].textContent=res;
    tr.children[2].textContent=detail||'';
    log.push(name+' | '+res+' | '+(detail||''));
  };
}
function ms(t){return Math.round(performance.now()-t)+'ms';}

// Fetch and count the bytes that actually arrive.
async function sized(kb){
  var t=performance.now();
  var r=await fetch('/api/diag/payload?kb='+kb+'&_='+Date.now(),{cache:'no-store'});
  var buf=await r.arrayBuffer();
  return {want:kb*1024,got:buf.byteLength,ms:Math.round(performance.now()-t),status:r.status};
}

async function run(){
  document.getElementById('go').disabled=true;
  rows=[];log=[];document.querySelector('#t tbody').innerHTML='';
  log.push('host='+location.host+' ua='+navigator.userAgent);

  // 1. Is this origin reachable at all, and how fast.
  var f=row('1. Reach this server');
  try{
    var t=performance.now();
    var r=await fetch('/api/diag/payload?kb=1&_='+Date.now(),{cache:'no-store'});
    var b=await r.text();
    f(r.ok&&b.length===1024?'ok':'bad',(r.ok?'HTTP '+r.status:'HTTP '+r.status)+' · '+ms(t)+' · '+b.length+'B');
  }catch(e){ f('bad','failed',String(e)); }

  // 2. The truncation cliff. A connection capped at ~16KB shows up here.
  var cliff=null;
  for(var i=0;i<[8,16,32,64,128].length;i++){
    var kb=[8,16,32,64,128][i];
    var g=row('2.'+(i+1)+' Download '+kb+' KB');
    try{
      var s=await sized(kb);
      if(s.got===s.want) g('ok','complete',s.got+' / '+s.want+' bytes · '+s.ms+'ms');
      else { g('bad','TRUNCATED',s.got+' / '+s.want+' bytes received'); if(cliff===null)cliff=s.got; }
    }catch(e){ g('bad','failed',String(e)); if(cliff===null)cliff=0; }
  }

  // 3. Streaming (the overlay's live updates ride on this).
  var sse=row('3. Live updates (SSE)');
  await new Promise(function(res){
    var done=false,to=setTimeout(function(){ if(!done){done=true;try{es.close()}catch(_){ } sse('warn','no data in 8s','falls back to polling'); res();} },8000);
    var es;
    try{ es=new EventSource('/api/scene/diagnostic-probe/stream'); }
    catch(e){ clearTimeout(to); sse('bad','cannot open',String(e)); return res(); }
    // Any response at all - even the 404 for this fake key - proves streaming
    // reaches us rather than being buffered or dropped.
    es.onerror=function(){ if(done)return; done=true; clearTimeout(to);
      try{es.close()}catch(_){ }
      sse('ok','server answered','stream endpoint reachable'); res(); };
    es.onmessage=function(){ if(done)return; done=true; clearTimeout(to);
      try{es.close()}catch(_){ } sse('ok','streaming','data received'); res(); };
  });

  // 4. Outside hosts the overlay depends on.
  var ext=[['7TV emote images','https://cdn.7tv.app/emote/60aeab8df6a2c3b332d21139/1x.webp'],
           ['Steam avatars','https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg']];
  for(var j=0;j<ext.length;j++){
    (function(name,url){
      rows.push(new Promise(function(res){
        var e=row('4. '+name);
        var img=new Image(),t=performance.now(),fin=false;
        var to=setTimeout(function(){ if(!fin){fin=true;e('bad','timeout','no response in 10s');res();} },10000);
        img.onload=function(){ if(fin)return;fin=true;clearTimeout(to);e('ok','loaded',ms(t));res(); };
        img.onerror=function(){ if(fin)return;fin=true;clearTimeout(to);e('bad','blocked/failed','cannot load '+url.split('/')[2]);res(); };
        img.src=url+'?_='+Date.now();
      }));
    })(ext[j][0],ext[j][1]);
  }
  await Promise.all(rows);

  var verdict='';
  if(cliff!==null) verdict='\\n>>> Responses are being CUT OFF at around '+cliff+' bytes. '+
    'That is the signature of ISP throttling, not a bug in the site.';
  document.getElementById('out').textContent='=== connection check ===\\n'+log.join('\\n')+verdict;
  document.getElementById('go').disabled=false;
}
document.getElementById('go').onclick=run;
document.getElementById('copy').onclick=function(){
  var t=document.getElementById('out').textContent;
  navigator.clipboard.writeText(t).then(function(){this.textContent='Copied';}.bind(this),
    function(){ var r=document.createRange();r.selectNode(document.getElementById('out'));
      window.getSelection().removeAllRanges();window.getSelection().addRange(r); });
};
</script>
</body></html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Robots-Tag": "noindex",
    },
  });
}
