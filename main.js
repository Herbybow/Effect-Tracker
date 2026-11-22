import OBR from "@owlbear-rodeo/sdk";
const NS="com.effect-tracker/data", MENU="com.effect-tracker";
let characters=[], activeId=null, busy=false, queued=false;
const $=id=>document.getElementById(id);
const isCharacter=item=>item?.layer==="CHARACTER"&&item?.type==="IMAGE";
function notify(message){const t=$("toast");if(!t)return;t.textContent=message;t.classList.add("show");window.setTimeout(()=>t.classList.remove("show"),2800);}
function bleedsOf(item){
 const v=item?.metadata?.[NS]?.effects?.bleed;
 if(Array.isArray(v))return v.filter(b=>Number(b.charges)>0);
 if(v&&typeof v==="object")return [{id:v.id||"legacy",power:Number(v.power)||Number(v.damage)||1,charges:Math.max(0,Number(v.charges)||0),appliedAt:v.appliedAt||new Date().toISOString()}].filter(b=>b.charges>0);
 return [];
}
function active(){return characters.find(x=>x.id===activeId)||null;}
function render(){
 const item=active();$("character-name").textContent=item?.name||"No character assigned";
 $("selection-label").textContent=item?"Individual effect tracker":"Right-click a character token and choose Assign Effect Tracker.";
 const current=$("current-effects");current.replaceChildren();
 if(!item){current.className="empty";current.textContent="Assign a character to see its current effects.";}
 else {const bs=bleedsOf(item);current.className=bs.length?"current-list":"empty";
  if(!bs.length)current.textContent="No active effects on this character.";
  else {const tags=document.createElement("div");tags.className="current-effect-tags";for(const b of bs){const tag=document.createElement("span");tag.className="effect-tag";tag.textContent=`3×${b.power} · ${b.charges}/3 charges`;tags.append(tag);}current.append(tags);}
 }
 const host=$("effects");host.replaceChildren();const bs=item?bleedsOf(item):[];
 if(!bs.length){host.className="empty";host.textContent=item?"No active Bleed on this character.":"Assign a character first.";$("test-tick").disabled=true;return;}
 host.className="";for(const [i,b] of bs.entries()){const row=document.createElement("div");row.className="effect-row";const name=document.createElement("strong");name.textContent=`Bleed ${i+1}`;const detail=document.createElement("span");detail.textContent=`3×${b.power} · ${b.charges}/3 charges`;row.append(name,detail);host.append(row);}
 const total=bs.reduce((sum,b)=>sum+b.power,0);const p=document.createElement("p");p.className="hint";p.textContent=`Combined damage at the next turn: ${total} HP. One charge will be consumed from each Bleed.`;host.append(p);$("test-tick").disabled=false;
}
async function refresh(){if(busy){queued=true;return;}busy=true;try{const items=await OBR.scene.items.getItems(isCharacter);characters=items.filter(i=>i.metadata?.[NS]?.tracked===true);const preferred=characters.find(i=>i.metadata?.[NS]?.active===true);if(preferred)activeId=preferred.id;else if(!characters.some(i=>i.id===activeId))activeId=characters[0]?.id||null;render();}catch(e){console.error(e);$("selection-label").textContent=`Could not load characters: ${e?.message||e}`;}finally{busy=false;if(queued){queued=false;void refresh();}}}
async function update(id,mutate){await OBR.scene.items.updateItems([id],items=>{for(const item of items){const d=JSON.parse(JSON.stringify(item.metadata?.[NS]||{effects:{}}));d.effects??={};mutate(d);item.metadata={...item.metadata,[NS]:d};}});}
async function setActive(id,assign=false){await OBR.scene.items.updateItems(isCharacter,items=>{for(const item of items){const old=item.metadata?.[NS];if(!old?.tracked&&item.id!==id)continue;const d=JSON.parse(JSON.stringify(old||{effects:{}}));if(item.id===id&&assign)d.tracked=true;if(item.id===id)d.active=true;else if(d.tracked)d.active=false;item.metadata={...item.metadata,[NS]:d};}});activeId=id;await refresh();}
async function applyBleed(power){const item=active();if(!item){notify("Assign a character first.");return;}try{await update(item.id,d=>{const v=d.effects.bleed;const list=Array.isArray(v)?v:(v&&typeof v==="object"?[{id:v.id||"legacy",power:Number(v.power)||Number(v.damage)||1,charges:Math.max(0,Number(v.charges)||0),appliedAt:v.appliedAt||new Date().toISOString()}]:[]);list.push({id:crypto.randomUUID(),power,charges:3,appliedAt:new Date().toISOString(),schemaVersion:2});d.effects.bleed=list.filter(b=>b.charges>0);});notify(`Added a separate 3×${power} Bleed to ${item.name||"the character"}.`);await refresh();}catch(e){console.error(e);notify(`Could not apply Bleed: ${e?.message||e}`);}}
async function testTick(){const item=active(),bs=item?bleedsOf(item):[];if(!bs.length)return;const total=bs.reduce((sum,b)=>sum+b.power,0);try{await update(item.id,d=>{const v=Array.isArray(d.effects.bleed)?d.effects.bleed:bleedsOf(item);d.effects.bleed=v.map(b=>({...b,charges:Math.max(0,Number(b.charges)-1)})).filter(b=>b.charges>0);if(!d.effects.bleed.length)delete d.effects.bleed;});notify(`Test tick: ${item.name||"Character"} would lose ${total} HP. One charge consumed from each Bleed; HP is not modified yet.`);await refresh();}catch(e){console.error(e);notify(`Could not consume charges: ${e?.message||e}`);}}
OBR.onReady(()=>{void(async()=>{try{
 document.querySelectorAll("#tiers button[data-tier]").forEach(b=>b.addEventListener("click",()=>applyBleed(Number(b.dataset.tier))));
 $("test-tick").addEventListener("click",testTick);$("refresh").addEventListener("click",refresh);$("reload-effects").addEventListener("click",refresh);
 await OBR.contextMenu.create({id:`${MENU}/assign`,icons:[{icon:"https://herbybow.github.io/Effect-Tracker/assign.svg",label:"Assign Effect Tracker",filter:{max:1,every:[{key:"layer",value:"CHARACTER"},{key:["metadata",NS,"tracked"],value:undefined}]}}],async onClick(c){const i=c.items[0];if(!i)return;await setActive(i.id,true);notify(`${i.name||"Character"} assigned.`);}});
 await OBR.contextMenu.create({id:`${MENU}/select`,icons:[{icon:"https://herbybow.github.io/Effect-Tracker/assign.svg",label:"Select as Active Effect Tracker",filter:{max:1,every:[{key:"layer",value:"CHARACTER"},{key:["metadata",NS,"tracked"],value:true},{key:["metadata",NS,"active"],value:true,operator:"!="}]}}],async onClick(c){const i=c.items[0];if(i){await setActive(i.id);notify(`${i.name||"Character"} selected.`);}}});
 await OBR.contextMenu.create({id:`${MENU}/remove`,icons:[{icon:"https://herbybow.github.io/Effect-Tracker/unassign.svg",label:"Remove from Effect Tracker",filter:{max:1,every:[{key:"layer",value:"CHARACTER"},{key:["metadata",NS,"tracked"],value:true}]}}],async onClick(c){const i=c.items[0];if(!i)return;await update(i.id,d=>{delete d.tracked;delete d.active;});await refresh();notify(`${i.name||"Character"} removed.`);}});
 OBR.scene.items.onChange(items=>{characters=items.filter(i=>isCharacter(i)&&i.metadata?.[NS]?.tracked===true);const preferred=characters.find(i=>i.metadata?.[NS]?.active===true);if(preferred)activeId=preferred.id;else if(!characters.some(i=>i.id===activeId))activeId=characters[0]?.id||null;render();});
 OBR.scene.onReadyChange(ready=>{if(ready)void refresh();});await refresh();
 }catch(e){console.error(e);$("selection-label").textContent=`Startup error: ${e?.message||e}`;}})();});
window.addEventListener("error",e=>{$("selection-label").textContent=`Script error: ${e.message||"unknown error"}`;});
window.addEventListener("unhandledrejection",e=>{$("selection-label").textContent=`Connection error: ${e.reason?.message||e.reason||"unknown error"}`;});
