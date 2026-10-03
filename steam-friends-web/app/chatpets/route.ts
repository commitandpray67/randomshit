/**
 * Chat pets — the page a studio widget frames (see lib/chatpets.ts).
 *
 * A route handler with hand-written HTML rather than a page, for the same
 * reasons as /diag and /lite: it runs inside OBS for hours, so it should be a
 * few KB of plain JS with no React runtime. And not a file in public/, because
 * the studio host's Docker image doesn't ship public/.
 *
 * Everything is read from the query string, so the response is the same for
 * everyone and can be cached:
 *
 *   channel  Twitch channel whose chat to read
 *   size     animal size in px (default 56)
 *   idle     minutes without chatting before a pet leaves (default 10)
 *   max      most pets on screen at once; the quietest leaves first (default 30)
 *   colors   0 to draw every name in white instead of the chatter's colour
 *   ignore   comma-separated logins that never get a pet (default: common bots)
 *   demo     1 to add made-up chatters, for placing it in the editor
 *
 * Chat comes straight from Twitch's IRC websocket as an anonymous "justinfan"
 * user, which needs no token and can read any public channel.
 */
export const dynamic = "force-static";

const HTML = String.raw`<!doctype html>
<html><head><meta charset="utf-8">
<meta name="robots" content="noindex">
<title>Chat pets</title>
<style>
html,body{margin:0;height:100%;overflow:hidden;background:transparent;color-scheme:normal}
#s{position:absolute;inset:0}
.pet{position:absolute;left:0;bottom:0;display:flex;flex-direction:column;align-items:center;
will-change:transform;transition:opacity .6s;pointer-events:none}
.n{font-weight:800;line-height:1.1;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap;
font-family:ui-monospace,"Cascadia Mono",Consolas,"Courier New",monospace;margin-bottom:.15em;
text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000,0 2px 3px rgba(0,0,0,.6)}
.b{line-height:1;font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif}
.b span{display:inline-block}
#st{position:absolute;left:6px;top:6px;font:12px/1.3 system-ui,sans-serif;color:#fff;
background:rgba(0,0,0,.55);padding:3px 7px;border-radius:4px}
</style></head><body><div id="s"></div><script>
(function(){
var Q=new URLSearchParams(location.search);
function n(k,d,lo,hi){var v=+Q.get(k);return v>0?Math.min(hi,Math.max(lo,v)):d;}
var CH=(Q.get("channel")||"").toLowerCase().replace(/[^a-z0-9_]/g,"");
var SIZE=n("size",56,16,256),IDLE=n("idle",10,1,240)*60000,MAX=Math.round(n("max",30,1,200));
var COLORS=Q.get("colors")!=="0",DEMO=Q.get("demo")==="1";
var IGNORE={};
(Q.has("ignore")?Q.get("ignore"):"nightbot,streamelements,streamlabs,moobot,fossabot,wizebot,soundalerts,sery_bot")
.split(/[\s,]+/).forEach(function(l){if(l)IGNORE[l.toLowerCase().replace(/^@/,"")]=1;});

// Full-body animals, so they read as walking rather than as faces. Kept to
// emoji that Windows 10's font has, since that's what OBS draws them with.
var ANIMALS=["🐈","🐕","🐩","🐖","🐄","🐂","🐃","🐑","🐏","🐐","🐎","🦌","🐓","🦃","🐇","🐿️","🦔",
"🐢","🐊","🦎","🐍","🐌","🐛","🐜","🐞","🐝","🦗","🦆","🦢","🦩","🦚","🦜","🐧","🦦","🦥","🦨",
"🦡","🐁","🐀","🐅","🐆","🦓","🦒","🐘","🦏","🦛","🐪","🦘","🦙","🦕","🦖","🐉","🦮"];

// The same chatter always gets the same animal: FNV-1a over their login.
function pick(login){var h=2166136261;for(var i=0;i<login.length;i++){h^=login.charCodeAt(i);h=Math.imul(h,16777619);}
return ANIMALS[(h>>>0)%ANIMALS.length];}

var S=document.getElementById("s"),P={},count=0;
function rand(a,b){return a+Math.random()*(b-a);}

function chat(login,name,color){
login=login.toLowerCase();if(!login||IGNORE[login])return;
var now=performance.now(),p=P[login];
if(!p){
p=P[login]={login:login,el:document.createElement("div"),nm:document.createElement("div"),
bd:document.createElement("div"),sp:document.createElement("span"),
x:0,dir:Math.random()<.5?-1:1,speed:rand(.35,.8)*SIZE,walking:false,until:now+rand(300,1500),half:SIZE/2};
p.el.className="pet";p.nm.className="n";p.bd.className="b";
p.el.style.opacity="0";p.nm.style.fontSize=Math.max(10,Math.round(SIZE*.24))+"px";
p.bd.style.fontSize=SIZE+"px";p.sp.textContent=pick(login);
p.bd.appendChild(p.sp);p.el.appendChild(p.nm);p.el.appendChild(p.bd);S.appendChild(p.el);count++;
p.nm.textContent=name;p.half=Math.max(SIZE,p.el.offsetWidth)/2;
p.x=rand(p.half,Math.max(p.half,innerWidth-p.half));
requestAnimationFrame(function(){p.el.style.opacity="1";});
if(count>MAX){var old=null;for(var k in P)if(P[k]!==p&&(!old||P[k].last<old.last))old=P[k];if(old)drop(old.login);}
}
if(p.nm.textContent!==name){p.nm.textContent=name;p.half=Math.max(SIZE,p.el.offsetWidth)/2;}
p.nm.style.color=COLORS&&/^#[0-9a-f]{6}$/i.test(color||"")?color:"#fff";
p.last=now;p.hop=now;}

function drop(login){var p=P[login];if(!p)return;delete P[login];count--;
p.el.style.opacity="0";setTimeout(function(){p.el.remove();},700);}

var prev=performance.now();
function tick(now){var dt=Math.min(.1,(now-prev)/1000),W=innerWidth;prev=now;
for(var k in P){var p=P[k];
if(now>p.until){p.walking=!p.walking;
if(p.walking){if(Math.random()<.6)p.dir=-p.dir;p.until=now+rand(2000,7000);}else p.until=now+rand(800,4000);}
if(p.walking){p.x+=p.dir*p.speed*dt;
if(p.x<p.half){p.x=p.half;p.dir=1;}else if(p.x>W-p.half){p.x=W-p.half;p.dir=-1;}}
if(W<=p.half*2)p.x=W/2;
var y=p.walking?Math.abs(Math.sin(now*p.speed/SIZE/40))*SIZE*.08:0;
if(p.hop){var h=(now-p.hop)/600;if(h>=1)p.hop=0;else y+=4*h*(1-h)*SIZE*.6;}
p.el.style.transform="translate("+(p.x-p.half).toFixed(1)+"px,"+(-y).toFixed(1)+"px)";
// Emoji animals mostly face left, so mirror the ones walking right.
p.sp.style.transform=p.dir>0?"scaleX(-1)":"none";}
requestAnimationFrame(tick);}
requestAnimationFrame(tick);

setInterval(function(){var cut=performance.now()-IDLE;for(var k in P)if(P[k].last<cut&&!P[k].demo)drop(k);},5000);

// ---- status, editor only ---------------------------------------------------
var st=null;
function status(t){if(!DEMO)return;if(!st){st=document.createElement("div");st.id="st";document.body.appendChild(st);}
st.textContent=t;}

// ---- Twitch chat -----------------------------------------------------------
function tag(v){return (v||"").replace(/\\s/g," ").replace(/\\:/g,";").replace(/\\\\/g,"\\");}
var ws=null,wait=1000;
function connect(){
ws=new WebSocket("wss://irc-ws.chat.twitch.tv:443");
ws.onopen=function(){ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");ws.send("PASS SCHMOOPIIE");
ws.send("NICK justinfan"+Math.floor(rand(10000,99999)));ws.send("JOIN #"+CH);};
ws.onmessage=function(ev){String(ev.data).split("\r\n").forEach(line);};
ws.onclose=function(){status("#"+CH+" · reconnecting…");setTimeout(connect,wait);wait=Math.min(wait*2,30000);};}

function line(l){if(!l)return;
if(l.indexOf("PING")===0){ws.send("PONG"+l.slice(4));return;}
var tags={},i;
if(l[0]==="@"){i=l.indexOf(" ");l.slice(1,i).split(";").forEach(function(kv){var j=kv.indexOf("=");tags[kv.slice(0,j)]=kv.slice(j+1);});l=l.slice(i+1);}
var from="";if(l[0]===":"){i=l.indexOf(" ");from=l.slice(1,i);l=l.slice(i+1);}
var cmd=l.split(" ",1)[0];
if(cmd==="PRIVMSG"){var login=from.split("!")[0];chat(login,tag(tags["display-name"])||login,tags.color);}
// A ban or timeout takes the pet with it. Without a name it's the whole chat
// being cleared, which isn't about anyone in particular.
else if(cmd==="CLEARCHAT"){i=l.indexOf(" :");if(i>0)drop(l.slice(i+2).trim().toLowerCase());}
else if(cmd==="366"){wait=1000;status("#"+CH+" · connected");}
else if(cmd==="RECONNECT"){ws.close();}}

if(CH){status("#"+CH+" · connecting…");connect();}else status("No channel set");

// ---- demo chatters, editor only --------------------------------------------
if(DEMO){
var FAKE=[["PixelFrog","#00ff7f"],["sleepy_otter","#ff69b4"],["Lurker9000","#1e90ff"],["mochi_fan","#ffd700"],
["NoodleCat","#ff4500"],["bean__","#9acd32"]],shown=0;
var add=setInterval(function(){var f=FAKE[shown++];chat(f[0],f[0],f[1]);P[f[0].toLowerCase()].demo=1;
if(shown>=FAKE.length)clearInterval(add);},700);
setInterval(function(){var f=FAKE[Math.floor(Math.random()*Math.min(shown,FAKE.length))];if(f)chat(f[0],f[0],f[1]);},2200);}
})();
</script></body></html>`;

export function GET() {
  return new Response(HTML, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
