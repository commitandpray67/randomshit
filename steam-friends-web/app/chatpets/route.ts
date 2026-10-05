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
 *   set      which pets: walking ones (default), "round" for the round kitten
 *            badges, or "emoji" for emoji animals
 *   demo     1 to add made-up chatters, for placing it in the editor
 *   test     1 for the studio's sprite test: no chat, just the pet the studio
 *            sends in a message, walking about with two ordinary ones
 *
 * The walking pets, and who gets which, all come from the studio's database
 * (lib/petsprites.ts): fetched from /api/chatpets/sprites on load and every
 * minute after, so a new or changed one turns up without a rebuild or a
 * reload of the OBS source. Nothing about them is built in here.
 *
 * Chat comes straight from Twitch's IRC websocket as an anonymous "justinfan"
 * user, which needs no token and can read any public channel.
 */
export const dynamic = "force-static";

// Imported rather than put in public/, for the same Docker reason: an import
// lands in .next/static under a content-hashed name, which both hosts serve
// and browsers may cache for good.
import kitten1 from "./sprites/kitten-1.png";
import kitten2 from "./sprites/kitten-2.png";
import kitten3 from "./sprites/kitten-3.png";
import kitten4 from "./sprites/kitten-4.png";
import kitten5 from "./sprites/kitten-5.png";
import { CAT_H } from "@/lib/spritesheet";

const KITTENS = [kitten1, kitten2, kitten3, kitten4, kitten5].map((k) => k.src);

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
.b span,.b img{display:inline-block}
.b img{display:block;-webkit-user-drag:none}
.b .w{display:block;background-repeat:no-repeat;background-size:400% 100%}
#st{position:absolute;left:6px;top:6px;font:12px/1.3 system-ui,sans-serif;color:#fff;
background:rgba(0,0,0,.55);padding:3px 7px;border-radius:4px}
</style></head><body><div id="s"></div><script>
(function(){
var Q=new URLSearchParams(location.search);
function n(k,d,lo,hi){var v=+Q.get(k);return v>0?Math.min(hi,Math.max(lo,v)):d;}
var CH=(Q.get("channel")||"").toLowerCase().replace(/[^a-z0-9_]/g,"");
var SIZE=n("size",56,16,256),IDLE=n("idle",10,1,240)*60000,MAX=Math.round(n("max",30,1,200));
var COLORS=Q.get("colors")!=="0",DEMO=Q.get("demo")==="1",TEST=Q.get("test")==="1";
// Walking pets unless asked otherwise. "kittens" is what the editor used to
// call the default, so it means the default still.
var SET=Q.get("set"),SPRITES=SET==="round"?${JSON.stringify(KITTENS)}:null,WALK=SET!=="round"&&SET!=="emoji",K=SIZE/${CAT_H};
function own(o,k){return Object.prototype.hasOwnProperty.call(o,k);}
// What the studio has for this chat, once it arrives: the mix everyone is
// picked from, and chatters' own sprites. TESTS is the sprite test's pet,
// which wins over everything.
var MIX=[],UP=Object.create(null),TESTS=Object.create(null);
// Until the sprites have arrived, a pick from the mix is provisional: whoever
// chats in the first moment after a load would otherwise keep a pick made
// before the mix was known.
var LOADED=!WALK;
/** A chatter's own sprite (being tested, or given to them), or null. */
function personal(login){return own(TESTS,login)?TESTS[login]:own(UP,login)?UP[login]:null;}
// Keyed by login, so no inherited keys: a chatter called "constructor" is real.
var IGNORE=Object.create(null);
(Q.has("ignore")?Q.get("ignore"):"nightbot,streamelements,streamlabs,moobot,fossabot,wizebot,soundalerts,sery_bot")
.split(/[\s,]+/).forEach(function(l){if(l)IGNORE[l.toLowerCase().replace(/^@/,"")]=1;});

// Full-body animals, so they read as walking rather than as faces. Kept to
// emoji that Windows 10's font has, since that's what OBS draws them with.
var ANIMALS=["🐈","🐕","🐩","🐖","🐄","🐂","🐃","🐑","🐏","🐐","🐎","🦌","🐓","🦃","🐇","🐿️","🦔",
"🐢","🐊","🦎","🐍","🐌","🐛","🐜","🐞","🐝","🦗","🦆","🦢","🦩","🦚","🦜","🐧","🦦","🦥","🦨",
"🦡","🐁","🐀","🐅","🐆","🦓","🦒","🐘","🦏","🦛","🐪","🦘","🦙","🦕","🦖","🐉","🦮"];

// The same chatter always gets the same pet: FNV-1a over their login.
function pick(login,list){var h=2166136261;for(var i=0;i<login.length;i++){h^=login.charCodeAt(i);h=Math.imul(h,16777619);}
return list[(h>>>0)%list.length];}

var S=document.getElementById("s"),P=Object.create(null),count=0;
function rand(a,b){return a+Math.random()*(b-a);}

function chat(login,name,color){
login=login.toLowerCase();if(!login||IGNORE[login])return;
var now=performance.now(),p=P[login];
if(!p){
p=P[login]={login:login,el:document.createElement("div"),nm:document.createElement("div"),
bd:document.createElement("div"),sp:document.createElement(SPRITES?"img":WALK?"div":"span"),
x:0,dir:Math.random()<.5?-1:1,speed:rand(.35,.8)*SIZE,walking:false,until:now+rand(300,1500),half:SIZE/2};
p.el.className="pet";p.nm.className="n";p.bd.className="b";
p.el.style.opacity="0";p.nm.style.fontSize=Math.max(10,Math.round(SIZE*.24))+"px";
p.bd.style.fontSize=SIZE+"px";
if(WALK){p.sp.className="w";p.dist=0;skin(p);}
else if(SPRITES){p.sp.src=pick(login,SPRITES);p.sp.alt="";p.sp.width=p.sp.height=SIZE;}
else p.sp.textContent=pick(login,ANIMALS);
p.bd.appendChild(p.sp);p.el.appendChild(p.nm);p.el.appendChild(p.bd);S.appendChild(p.el);count++;
p.nm.textContent=name;p.half=Math.max(SIZE,p.el.offsetWidth)/2;
p.x=spot(p);
requestAnimationFrame(function(){p.el.style.opacity="1";});
if(count>MAX){var old=null;for(var k in P)if(P[k]!==p&&(!old||P[k].last<old.last))old=P[k];if(old)drop(old.login);}
}
if(p.nm.textContent!==name){p.nm.textContent=name;p.half=Math.max(SIZE,p.el.offsetWidth)/2;}
if(WALK)skin(p);
p.nm.style.color=COLORS&&/^#[0-9a-f]{6}$/i.test(color||"")?color:"#fff";
p.last=now;p.hop=now;}

// Dress a walking pet in whatever it should be wearing now. Run on every
// message and whenever the uploads change, so a sprite given to someone who's
// already on screen takes effect without them having to leave first.
//
// A pet from the mix keeps the one it has while it's on screen, though:
// adding to or taking from the mix changes what everyone's name picks, and
// a whole chat's worth of pets changing at once is no fun to watch. Only
// someone's own sprite changing, or theirs leaving the mix, swaps a pet.
function skin(p){var c=personal(p.login),mine=!!c;
if(!mine){if(p.cid&&!p.mine&&p.sure&&MIX.some(function(m){return m.id===p.cid;}))return;c=MIX.length?pick(p.login,MIX):null;}
p.mine=mine;p.sure=LOADED;var s=p.sp.style;
// Nothing to wear: unseen until the sprites arrive, and an emoji animal if
// they arrive and there are none (an empty database, say) rather than a name
// walking about with no body.
if(!c){if(!LOADED){s.visibility="hidden";return;}if(p.cid==="emoji")return;p.cid="emoji";
s.visibility="";s.backgroundImage="";s.width=s.height="";p.sp.textContent=pick(p.login,ANIMALS);return;}
if(p.cid===c.id)return;p.cid=c.id;p.frame=-1;s.visibility="";p.sp.textContent="";
s.width=(c.w*K).toFixed(1)+"px";s.height=(c.h*K).toFixed(1)+"px";s.backgroundImage="url("+c.src+")";
if(p.el.parentNode)p.half=Math.max(SIZE,p.el.offsetWidth)/2;}

// Somewhere with room: of a dozen random spots, the one furthest from every
// other pet, so a burst of chatters spreads out instead of piling up.
function spot(p){var lo=p.half,hi=Math.max(lo,innerWidth-p.half),best=rand(lo,hi),bd=-1;
for(var i=0;i<12;i++){var x=rand(lo,hi),d=1e9;for(var k in P)if(P[k]!==p)d=Math.min(d,Math.abs(P[k].x-x));
if(d>bd){bd=d;best=x;}}return best;}

function drop(login){var p=P[login];if(!p)return;delete P[login];count--;
p.el.style.opacity="0";setTimeout(function(){p.el.remove();},700);}

var prev=performance.now();
function tick(now){var dt=Math.min(.1,(now-prev)/1000),W=innerWidth;prev=now;
for(var k in P){var p=P[k];
if(now>p.until){p.walking=!p.walking;
if(p.walking){if(Math.random()<.6)p.dir=-p.dir;p.until=now+rand(2000,7000);}
// Under test, it's the walking that's being looked at, so less standing about.
else p.until=now+(p.test?rand(300,900):rand(800,4000));}
if(p.walking){p.x+=p.dir*p.speed*dt;p.dist+=p.speed*dt;
if(p.x<p.half){p.x=p.half;p.dir=1;}else if(p.x>W-p.half){p.x=W-p.half;p.dir=-1;}}
if(W<=p.half*2)p.x=W/2;
// The walking cats' frames are the gait already; the rest get a bob.
var y=p.walking&&!WALK?Math.abs(Math.sin(now*p.speed/SIZE/40))*SIZE*.08:0;
if(p.hop){var h=(now-p.hop)/600;if(h>=1)p.hop=0;else y+=4*h*(1-h)*SIZE*.6;}
p.el.style.transform="translate("+(p.x-p.half).toFixed(1)+"px,"+(-y).toFixed(1)+"px)";
// Walking cats: the strip's first pair faces right and the second left, and
// the frame steps with distance walked rather than time, so slow cats take
// slow steps instead of moonwalking. Standing still is the first frame.
if(WALK){var f=(p.dir>0?0:2)+(p.walking?Math.floor(p.dist/(SIZE*.3))%2:0);
if(f!==p.frame){p.frame=f;p.sp.style.backgroundPosition=(f*100/3).toFixed(3)+"% 0";}}
// Emoji animals mostly face left, so mirror the ones walking right. The round
// kittens face the camera, and mirroring their frames would look wrong, so
// they lean into the walk instead.
else p.sp.style.transform=SPRITES?(p.walking?"rotate("+(p.dir*6)+"deg)":"none"):(p.dir>0?"scaleX(-1)":"none");}
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

if(TEST){}else if(CH){status("#"+CH+" · connecting…");connect();}else status("No channel set");

// ---- uploads from the studio ------------------------------------------------
function uploads(){if(!WALK)return;var x=new XMLHttpRequest();
x.open("GET","/api/chatpets/sprites?channel="+CH,true);
x.onload=function(){try{var d=JSON.parse(x.responseText);if(!d.ok)return;
MIX=d.mix||[];UP=Object.create(null);LOADED=true;for(var k in d.chatters)if(own(d.chatters,k))UP[k]=d.chatters[k];
for(var l in P)skin(P[l]);}catch(_){}};x.send();}
uploads();setInterval(uploads,60000);

// ---- the studio's sprite test -------------------------------------------------
// The studio sends the sprite being tried — not saved yet, so as a data: URL —
// and this shows it on a chatter of that name next to two ordinary pets. Only
// ever listened for with test=1, which nothing but the studio's test asks for.
var testN=0;
if(TEST&&WALK){chat("pixelfrog","PixelFrog","#00ff7f");chat("mochi_fan","mochi_fan","#ffd700");
for(var t in P)P[t].demo=P[t].test=1;
addEventListener("message",function(ev){var m=ev.data;if(!m||m.type!=="chatpets-test"||!m.sprite)return;
var sp=m.sprite,src=String(sp.src||"");if(!/^(data:image\/png;base64,|\/api\/chatpets\/sprite\/[0-9a-f]{32}$)/.test(src))return;
var login=String(m.name||"test").toLowerCase().replace(/[^a-z0-9_]/g,"").slice(0,25)||"test";
for(var k in TESTS)if(k!==login)drop(k);TESTS=Object.create(null);
TESTS[login]={id:"test:"+(++testN),src:src,w:Math.min(800,+sp.w||1),h:Math.min(800,+sp.h||1)};
chat(login,String(m.name||login).slice(0,25),"#ff8fbe");P[login].demo=P[login].test=1;});
// A hop now and then, staggered, as if they were chatting.
setInterval(function(){for(var k in P)if(P[k].test)(function(p){setTimeout(function(){p.hop=performance.now();},rand(0,900));})(P[k]);},5000);}

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
