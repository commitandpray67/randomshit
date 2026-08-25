import { NextResponse } from "next/server";
import { getSceneByKey, getElements } from "@/lib/scene";
import { resolveForLite } from "@/lib/litescene";

/**
 * Framework-free OBS browser source.
 *
 * The normal /scene/<key> page needs ~383KB across 8 requests, most of it React
 * chunks. On a connection that truncates responses around 16KB — which is what
 * Russian ISPs have been doing to foreign-hosted content — it can never finish
 * loading. This renders the same scene as one self-contained request of a few
 * KB: hand-written HTML, inline vanilla JS, no bundle, no CSS file.
 *
 * The scene is inlined into the HTML so the overlay is on screen from the first
 * paint, then kept current by polling. Polling rather than SSE on purpose: a
 * long-lived stream is exactly what a throttling middlebox resets, whereas a
 * small periodic request either arrives or is retried a second later. The
 * version check costs about 60 bytes when nothing has changed.
 *
 * URLs are resolved *here*, not in the browser: a YouTube link needs to become
 * a player iframe and an Imgur page link needs to become the image file, and
 * doing that server-side means the same lib/embed and lib/imagesrc the React
 * renderer uses, rather than a second copy of those rules that can drift — as
 * it already had, which is why YouTube showed nothing on this page.
 *
 * /scene/<key> stays as-is for connections that can load it.
 */
export const dynamic = "force-dynamic";

/**
 * Safe to embed in an HTML <script> block: a literal `<` would let scene text
 * close the script tag, and U+2028/9 are line terminators in JS source even
 * though JSON leaves them raw.
 */
function embed(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const scene = await getSceneByKey(key);
  if (!scene) return new NextResponse("unknown scene", { status: 404 });

  const elements = resolveForLite((await getElements(scene.id)).filter((e) => !e.hidden));

  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="robots" content="noindex"><title>overlay</title><style>
html,body{margin:0;padding:0;background:transparent;overflow:hidden;width:100%;height:100%}
#w{position:fixed;inset:0;display:flex;align-items:center;justify-content:center}
#c{position:relative;flex:none;transform-origin:center center;overflow:hidden}
.e{position:absolute;left:0;top:0;transform-origin:center center;will-change:transform;
transition:transform 1s linear,width 1s linear,height 1s linear,opacity 1s linear}
.e>*{width:100%;height:100%;display:block;border:0;background:transparent}
.t{display:flex;align-items:center;overflow:hidden;white-space:pre-wrap;word-break:break-word;line-height:1.15}
</style></head><body><div id="w"><div id="c"></div></div><script>
var K=${embed(key)},V=${scene.version},CV=${embed({ w: scene.canvasW, h: scene.canvasH })},
EL=${embed(elements)},C=document.getElementById("c"),N={},PL={};

function fit(){var s=Math.min(innerWidth/CV.w,innerHeight/CV.h)||1;
C.style.width=CV.w+"px";C.style.height=CV.h+"px";C.style.transform="scale("+s+")";}

// What forces the inner node to be rebuilt. Deliberately excludes the player's
// options: rebuilding an iframe restarts the video, so mute and volume are sent
// to the running player as commands instead.
function sig(e){var p=e.props||{};return e.kind+"|"+(p._e||p.url||"")+"|"+(p.html||"")+"|"
+(p.mode||"")+"|"+(p.text||"")+"|"+(p.color||"")+"|"+(p.fontSize||"")+"|"+(p.weight||"")
+"|"+(p.align||"")+"|"+(p.fontFamily||"")+"|"+(p.shadow?1:0)+"|"+(p.fit||"");}

// ---- player commands -------------------------------------------------------
var YT="https://www.youtube-nocookie.com",VM="https://player.vimeo.com";
function cmd(f,prov,func,args,vmMethod,vmValue){try{
if(prov==="youtube")f.contentWindow.postMessage(JSON.stringify({event:"command",func:func,args:args||[]}),YT);
else f.contentWindow.postMessage(JSON.stringify({method:vmMethod,value:vmValue}),VM);}catch(_){}}

/** Bring one player to the audio state its element asks for. */
function audio(id){var r=PL[id];if(!r||!r.a)return;var f=r.f,pr=r.p,a=r.a;
if(a.muted){cmd(f,pr,"mute",[],"setVolume",0);}
else{cmd(f,pr,"unMute",[],"setVolume",a.volume/100);cmd(f,pr,"setVolume",[a.volume]);}
if(a.paused)cmd(f,pr,"pauseVideo",[],"pause");else cmd(f,pr,"playVideo",[],"play");}

// A player only accepts commands once it is running, and unmuting one that has
// not started turns the request into "autoplay with sound", which is the thing
// browsers refuse. So wait to be told it is playing, then apply.
addEventListener("message",function(ev){var d;
try{d=typeof ev.data==="string"?JSON.parse(ev.data):ev.data;}catch(_){return;}
if(!d)return;
var playing=false;
if(d.event==="onStateChange"||d.event==="infoDelivery"){
var st=(d.info&&typeof d.info==="object")?d.info.playerState:d.info;if(st===1)playing=true;}
if(d.event==="play"||d.event==="playProgress")playing=true;
if(!playing)return;
for(var id in PL)if(PL[id].f&&PL[id].f.contentWindow===ev.source)audio(id);});

function build(e){var p=e.props||{},k=e.kind,n;
if(k==="text"){n=document.createElement("div");n.className="t";n.textContent=p.text||"";
var s=n.style;s.color=p.color||"#fff";s.fontSize=(p.fontSize||64)+"px";
s.fontFamily=p.fontFamily||"system-ui,sans-serif";s.fontWeight=p.weight||700;
s.textAlign=p.align||"left";
s.justifyContent=p.align==="center"?"center":p.align==="right"?"flex-end":"flex-start";
if(p.shadow!==false)s.textShadow="0 2px 6px rgba(0,0,0,.75)";}
else if(k==="image"){n=document.createElement("img");n.style.objectFit=p.fit||"contain";
// Imgur and friends need the extension guessed; a wrong guess costs one request.
var cs=p._c||(p.url?[p.url]:[]),i=0;
n.onerror=function(){if(++i<cs.length)n.src=cs[i];};
if(cs.length)n.src=cs[0];}
else if(k==="video"&&p._e){n=document.createElement("iframe");
n.allow="autoplay; encrypted-media; picture-in-picture";
n.setAttribute("sandbox","allow-scripts allow-same-origin allow-popups allow-presentation");
n.referrerPolicy="strict-origin-when-cross-origin";n.src=p._e;
PL[e.id]={f:n,p:p._p,a:p._a};
n.onload=function(){ // ask YouTube to start reporting state
if(p._p==="youtube"){try{n.contentWindow.postMessage(JSON.stringify({event:"listening"}),YT);}catch(_){}}
setTimeout(function(){audio(e.id);},600);};}
else if(k==="video"){n=document.createElement("video");if(p.url)n.src=p.url;
n.autoplay=p.autoplay!==false;n.loop=p.loop!==false;n.muted=p.muted!==false;n.playsInline=true;
if(typeof p.volume==="number")n.volume=Math.min(1,Math.max(0,p.volume));
n.style.objectFit=p.fit||"contain";}
else{n=document.createElement("iframe");n.allow="autoplay; encrypted-media";
if((p.mode||"html")==="url"){n.setAttribute("sandbox","allow-scripts allow-same-origin allow-popups allow-forms");if(p.url)n.src=p.url;}
// No allow-same-origin for pasted HTML: it runs on our origin otherwise.
else{n.setAttribute("sandbox","allow-scripts");n.srcdoc=p.html||"";}}
return n;}

function place(h,e){var s=h.style;s.width=e.w+"px";s.height=e.h+"px";
s.transform="translate3d("+e.x+"px,"+e.y+"px,0) rotate("+(e.rotation||0)+"deg)";
s.zIndex=e.zIndex||0;s.opacity=e.opacity==null?1:e.opacity;
s.clipPath=e.clip||"";}

function render(list){var seen={};
for(var i=0;i<list.length;i++){var e=list[i],id=e.id,g=sig(e),rec=N[id];seen[id]=1;
if(!rec){var h=document.createElement("div");h.className="e";h.appendChild(build(e));
C.appendChild(h);rec=N[id]={h:h,sig:g};}
else if(rec.sig!==g){delete PL[id];rec.h.innerHTML="";rec.h.appendChild(build(e));rec.sig=g;}
else if(PL[id]&&e.props&&e.props._a){ // same player, possibly new audio settings
PL[id].a=e.props._a;audio(id);}
place(rec.h,e);}
for(var k in N)if(!seen[k]){C.removeChild(N[k].h);delete N[k];delete PL[k];}}

var fails=0;
function poll(){var x=new XMLHttpRequest();
x.open("GET","/api/scene/"+K+"?v="+V+"&lite=1&_="+Date.now(),true);
x.onload=function(){fails=0;try{var d=JSON.parse(x.responseText);
if(d.ok&&!d.unchanged){V=d.version;if(d.canvas){CV=d.canvas;fit();}
if(d.elements)render(d.elements);}}catch(_){}
setTimeout(poll,1000);};
x.onerror=function(){fails++;setTimeout(poll,1000+Math.min(fails,5)*2000);};
x.send();}

fit();render(EL);addEventListener("resize",fit);setTimeout(poll,1000);
</script></body></html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Robots-Tag": "noindex",
    },
  });
}
