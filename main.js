import OBR, { buildImage } from "@owlbear-rodeo/sdk";
const NS="com.effect-tracker/data", MENU="com.effect-tracker";
let characters=[], activeId=null, selectedId=null, busy=false, queued=false, personalData={};
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
function viewed(){return characters.find(x=>x.id===selectedId)||active();}
function render(){
 const assigned=active(), item=viewed(), full=!!item&&item.id===activeId;
 $("character-name").textContent=item?.name||"No character assigned";
 $("selection-label").textContent=!item?"Right-click a character token and choose Assign Effect Tracker.":full?"Your assigned character · Full effect controls":"Viewing another character · Read-only effect summary";
 const current=$("current-effects");current.replaceChildren();
 if(!item){current.className="empty";current.textContent="Assign a character to see its current effects.";}
 else {const bs=bleedsOf(item);current.className=bs.length?"current-list":"empty";
  if(!bs.length)current.textContent="No active effects on this character.";
  else {const tags=document.createElement("div");tags.className="current-effect-tags";for(const b of bs){const tag=document.createElement("span");tag.className="effect-tag";tag.textContent=`3×${b.power} · ${b.charges}/3 charges`;tags.append(tag);}current.append(tags);}
 }
 document.querySelector(".bleed-panel").hidden=!full;
 const activePanel=$("effects").closest(".panel");activePanel.hidden=!full;
 const host=$("effects");host.replaceChildren();const bs=item?bleedsOf(item):[];
 if(!full){$("test-tick").disabled=true;return;}
 if(!bs.length){host.className="empty";host.textContent="No active Bleed on this character.";$("test-tick").disabled=true;return;}
 host.className="";for(const [i,b] of bs.entries()){const row=document.createElement("div");row.className="effect-row";const name=document.createElement("strong");name.textContent=`Bleed ${i+1}`;const detail=document.createElement("span");detail.textContent=`3×${b.power} · ${b.charges}/3 charges`;row.append(name,detail);host.append(row);}
 const total=bs.reduce((sum,b)=>sum+b.power,0);const p=document.createElement("p");p.className="hint";p.textContent=`Combined damage at the next turn: ${total} HP. One charge will be consumed from each Bleed.`;host.append(p);$("test-tick").disabled=false;
}
async function migratePersonalEffects(){
 const byCharacter=personalData?.effectsByCharacter||{};
 for(const [id,entry] of Object.entries(byCharacter)){
  const old=entry?.effects?.bleed;if(!old)continue;
  const incoming=(Array.isArray(old)?old:[old]).filter(b=>Number(b.charges)>0).map(b=>({...b,id:b.id||crypto.randomUUID()}));
  if(!incoming.length)continue;
  await OBR.scene.items.updateItems([id],items=>{for(const item of items){const data=JSON.parse(JSON.stringify(item.metadata?.[NS]||{}));data.effects??={};const existing=data.effects.bleed;const list=Array.isArray(existing)?existing:(existing?[existing]:[]);const seen=new Set(list.map(b=>b.id).filter(Boolean));for(const b of incoming)if(!seen.has(b.id))list.push(b);data.effects.bleed=list;item.metadata={...item.metadata,[NS]:data};}});
 }
 if(Object.keys(byCharacter).length){const clean={...personalData};delete clean.effectsByCharacter;await OBR.player.setMetadata({[NS]:clean});personalData=clean;}
}

async function syncBleedMarkers(){
 const items=await OBR.scene.items.getItems(isCharacter);
 for(const item of items){
  const data=item.metadata?.[NS]||{};
  const markerId=data.bleedMarkerId;
  const markerVersion=data.bleedMarkerVersion||0;
  const hasBleed=bleedsOf(item).length>0;
  if(hasBleed&&(!markerId||markerVersion!==4)){
   if(markerId)await OBR.scene.items.deleteItems([markerId]);
   const dpi=item.grid?.dpi||1;
   const tokenWidth=(item.image?.width||100)/dpi*(item.scale?.x||2);
   const tokenHeight=(item.image?.height||100)/dpi*(item.scale?.y||1);
   const marker=buildImage(
    {width:2,height:2,url:"https://herbybow.github.io/Effect-Tracker/effects/Bleed.svg",mime:"image/svg+xml"},
    {dpi:1,offset:{x:0,y:0}}
   ).name("Bleed marker").description("Indicates that this character has an active Bleed effect.")
    .position({x:item.position.x-tokenWidth/1,y:item.position.y-tokenHeight/1-3})
    .layer("ATTACHMENT").attachedTo(item.id).locked(true).disableHit(true).build();
   await OBR.scene.items.updateItems([item.id],draft=>{for(const token of draft){token.metadata={...token.metadata,[NS]:{...(token.metadata?.[NS]||{}),bleedMarkerId:marker.id,bleedMarkerVersion:4}};}});
   await OBR.scene.items.addItems([marker]);
  }else if(!hasBleed&&markerId){
   await OBR.scene.items.deleteItems([markerId]);
   await OBR.scene.items.updateItems([item.id],draft=>{for(const token of draft){const next={...(token.metadata?.[NS]||{})};delete next.bleedMarkerId;delete next.bleedMarkerVersion;token.metadata={...token.metadata,[NS]:next};}});
  }
 }
}

async function refresh(){if(busy){queued=true;return;}busy=true;try{characters=await OBR.scene.items.getItems(isCharacter);const meta=await OBR.player.getMetadata();personalData=meta?.[NS]||{};await migratePersonalEffects();await syncBleedMarkers();const preferred=personalData.activeCharacterId;activeId=characters.some(i=>i.id===preferred)?preferred:null;if(!selectedId||!characters.some(i=>i.id===selectedId))selectedId=(await OBR.player.getSelection()).find(id=>characters.some(i=>i.id===id))||null;render();}catch(e){console.error(e);$("selection-label").textContent=`Could not load characters: ${e?.message||e}`;}finally{busy=false;if(queued){queued=false;void refresh();}}}
async function update(id,mutate){await OBR.scene.items.updateItems([id],items=>{for(const item of items){const d=JSON.parse(JSON.stringify(item.metadata?.[NS]||{}));d.effects??={};mutate(d);item.metadata={...item.metadata,[NS]:d};}});}
async function setActive(id){const meta=await OBR.player.getMetadata();const data=JSON.parse(JSON.stringify(meta?.[NS]||{}));data.activeCharacterId=id;delete data.effectsByCharacter;await OBR.player.setMetadata({[NS]:data});personalData=data;activeId=id;selectedId=id;render();}
async function applyBleed(power){const item=active();if(!item){notify("Assign a character first.");return;}try{await update(item.id,d=>{const v=d.effects.bleed;const list=Array.isArray(v)?v:(v&&typeof v==="object"?[{id:v.id||"legacy",power:Number(v.power)||Number(v.damage)||1,charges:Math.max(0,Number(v.charges)||0),appliedAt:v.appliedAt||new Date().toISOString()}]:[]);list.push({id:crypto.randomUUID(),power,charges:3,appliedAt:new Date().toISOString(),schemaVersion:2});d.effects.bleed=list.filter(b=>b.charges>0);});notify(`Added a separate 3×${power} Bleed to ${item.name||"the character"}.`);await refresh();}catch(e){console.error(e);notify(`Could not apply Bleed: ${e?.message||e}`);}}
async function testTick(){const item=active(),bs=item?bleedsOf(item):[];if(!bs.length)return;const total=bs.reduce((sum,b)=>sum+b.power,0);try{await update(item.id,d=>{const v=Array.isArray(d.effects.bleed)?d.effects.bleed:[];d.effects.bleed=v.map(b=>({...b,charges:Math.max(0,Number(b.charges)-1)})).filter(b=>b.charges>0);if(!d.effects.bleed.length)delete d.effects.bleed;});notify(`Test tick: ${item.name||"Character"} would lose ${total} HP. One charge consumed from each Bleed; HP is not modified yet.`);await refresh();}catch(e){console.error(e);notify(`Could not consume charges: ${e?.message||e}`);}}
OBR.onReady(()=>{void(async()=>{try{
 document.querySelectorAll("#tiers button[data-tier]").forEach(b=>b.addEventListener("click",()=>applyBleed(Number(b.dataset.tier))));
 $("test-tick").addEventListener("click",testTick);$("refresh").addEventListener("click",refresh);$("reload-effects").addEventListener("click",refresh);
 await OBR.contextMenu.create({id:`${MENU}/assign`,icons:[{icon:"https://herbybow.github.io/Effect-Tracker/assign.svg",label:"Assign to My Effect Tracker",filter:{max:1,every:[{key:"layer",value:"CHARACTER"}]}}],async onClick(c){const i=c.items[0];if(!i)return;await setActive(i.id);notify(`${i.name||"Character"} is now your assigned tracker.`);}});
 await OBR.contextMenu.create({id:`${MENU}/remove`,icons:[{icon:"https://herbybow.github.io/Effect-Tracker/unassign.svg",label:"Clear My Active Tracker",filter:{max:1,every:[{key:"layer",value:"CHARACTER"}]}}],async onClick(){const meta=await OBR.player.getMetadata();const data={...(meta?.[NS]||{}),activeCharacterId:null};await OBR.player.setMetadata({[NS]:data});personalData=data;activeId=null;selectedId=null;render();notify("Your active tracker was cleared.");}});
 OBR.scene.items.onChange(()=>{void refresh();});
 OBR.player.onChange(player=>{const picked=(player?.selection||[]).find(id=>characters.some(c=>c.id===id));if(picked){selectedId=picked;render();}});
 OBR.scene.onReadyChange(ready=>{if(ready)void refresh();});await refresh();
 }catch(e){console.error(e);$("selection-label").textContent=`Startup error: ${e?.message||e}`;} })();});
window.addEventListener("error",e=>{$("selection-label").textContent=`Script error: ${e.message||"unknown error"}`;});
window.addEventListener("unhandledrejection",e=>{$("selection-label").textContent=`Connection error: ${e.reason?.message||e.reason||"unknown error"}`;});
