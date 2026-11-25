import OBR from "@owlbear-rodeo/sdk";
const NS="com.effect-tracker/data";
const INIT_NS="rodeo.owlbear.initiative-tracker/metadata";
const EFFECT_TYPES={bleed:{label:"Bleed",icon:"Bleed.svg",color:"blood"},poison:{label:"Poison",icon:"Poison.svg",color:"poison"},fire:{label:"Fire",icon:"Fire.svg",color:"fire"}};
let characters=[], activeId=null, selectedId=null, busy=false, queued=false, personalData={};
const $=id=>document.getElementById(id);
const isCharacter=item=>item?.layer==="CHARACTER"&&item?.type==="IMAGE";
function notify(message){const t=$("toast");if(!t)return;t.textContent=message;t.classList.add("show");window.setTimeout(()=>t.classList.remove("show"),2800);}
function effectsOf(item){
 const effects=item?.metadata?.[NS]?.effects||{};
 return Object.entries(EFFECT_TYPES).flatMap(([type,config])=>{
  const raw=effects[type];const list=Array.isArray(raw)?raw:(raw&&typeof raw==="object"?[raw]:[]);
  return list.filter(b=>Number(b.charges)>0).map(b=>({id:b.id||"legacy",power:Number(b.power)||Number(b.damage)||1,charges:Math.max(0,Number(b.charges)||0),type,...config}));
 });
}
function active(){return characters.find(x=>x.id===activeId)||null;}
function viewed(){return characters.find(x=>x.id===selectedId)||active();}
function render(){
 const item=viewed(), full=!!item&&item.id===activeId;
 const assignButton=$("assign-character"), initiativeButton=$("add-to-initiative"), candidate=characters.find(c=>c.id===selectedId);
 const displayedCharacter=candidate||active();
 $("character-name").textContent=displayedCharacter?.name||"Select a character";
 assignButton.hidden=!candidate||candidate.id===activeId;
 assignButton.disabled=!candidate||candidate.id===activeId;
 assignButton.textContent="Assign";
 const alreadyInInitiative=!!candidate&&candidate.metadata?.[INIT_NS]!==undefined;
 initiativeButton.hidden=!candidate||alreadyInInitiative;
 initiativeButton.disabled=!candidate||alreadyInInitiative;
 const current=$("current-effects");current.replaceChildren();
 const activeEffects=item?effectsOf(item):[];current.className=activeEffects.length?"current-list":"empty";
 if(!item)current.textContent="Assign a character to see its current effects.";
 else if(!activeEffects.length)current.textContent="No Effect";
 else {const tags=document.createElement("div");tags.className="current-effect-tags";for(const effect of activeEffects){const tag=document.createElement("span");tag.className=`effect-tag effect-${effect.type}`;tag.style.minHeight=`${26+(Math.max(1,Number(effect.charges)||1)-1)*12}px`;const amount=document.createElement("span");amount.textContent=`${effect.charges}×${effect.power}`;const icon=document.createElement("img");icon.className="current-effect-icon";icon.src=`./effects/${effect.icon}`;icon.alt="";tag.append(amount,icon);tags.append(tag);}current.append(tags);}
 $("bleed-controls").hidden=!full;

}
async function migratePersonalEffects(){
 const byCharacter=personalData?.effectsByCharacter||{};
 for(const [id,entry] of Object.entries(byCharacter)){
  const old=entry?.effects?.bleed;if(!old)continue;
  const incoming=(Array.isArray(old)?old:[old]).filter(b=>Number(b.charges)>0).map(b=>({...b,id:b.id||crypto.randomUUID()}));
  if(!incoming.length)continue;
  await OBR.scene.items.updateItems([id],items=>{for(const item of items){const data=JSON.parse(JSON.stringify(item.metadata?.[NS]||{}));data.effects??={};const existing=data.effects.bleed,list=Array.isArray(existing)?existing:(existing?[existing]:[]),seen=new Set(list.map(b=>b.id).filter(Boolean));for(const b of incoming)if(!seen.has(b.id))list.push(b);data.effects.bleed=list;item.metadata={...item.metadata,[NS]:data};}});
 }
 if(Object.keys(byCharacter).length){const clean={...personalData};delete clean.effectsByCharacter;await OBR.player.setMetadata({[NS]:clean});personalData=clean;}
}

async function refresh(){if(busy){queued=true;return;}busy=true;try{characters=await OBR.scene.items.getItems(isCharacter);const meta=await OBR.player.getMetadata();personalData=meta?.[NS]||{};await migratePersonalEffects();const preferred=personalData.activeCharacterId;activeId=characters.some(i=>i.id===preferred)?preferred:null;if(!selectedId||!characters.some(i=>i.id===selectedId))selectedId=((await OBR.player.getSelection())||[]).find(id=>characters.some(i=>i.id===id))||null;render();}catch(e){console.error(e);notify(`Could not load characters: ${e?.message||e}`);}finally{busy=false;if(queued){queued=false;void refresh();}}}
async function update(id,mutate){await OBR.scene.items.updateItems([id],items=>{for(const item of items){const d=JSON.parse(JSON.stringify(item.metadata?.[NS]||{}));d.effects??={};mutate(d);item.metadata={...item.metadata,[NS]:d};}});}
async function setActive(id){const meta=await OBR.player.getMetadata(),data=JSON.parse(JSON.stringify(meta?.[NS]||{}));data.activeCharacterId=id;delete data.effectsByCharacter;await OBR.player.setMetadata({[NS]:data});personalData=data;activeId=id;selectedId=id;render();}
async function addToInitiative(id){
 const item=characters.find(c=>c.id===id);if(!item){notify("Select a character token on the map first.");return;}
 try{await OBR.scene.items.updateItems([id],items=>{for(const sceneItem of items){if(sceneItem.metadata?.[INIT_NS]===undefined){sceneItem.metadata={...sceneItem.metadata,[INIT_NS]:{count:"0",active:false}};}}});notify(`${item.name||"Character"} added to Initiative.`);await refresh();}
 catch(e){console.error(e);notify(`Could not add to Initiative: ${e?.message||e}`);}
}
async function clearEffects(){const item=active();if(!item){notify("Assign a character first.");return;}try{let changed=false;await update(item.id,d=>{d.effects??={};for(const type of Object.keys(EFFECT_TYPES)){const raw=d.effects[type],list=Array.isArray(raw)?raw:(raw&&typeof raw==="object"?[raw]:[]);const remaining=list.map(b=>{const charges=Math.max(0,Number(b.charges)||0);if(charges>0)changed=true;return {...b,charges:Math.max(0,charges-1)};}).filter(b=>b.charges>0);if(remaining.length)d.effects[type]=remaining;else delete d.effects[type];}});if(!changed){notify("No active effect charges to clear.");return;}notify("Consumed one charge from each active effect. No damage was dealt.");await refresh();}catch(e){console.error(e);notify(`Could not clear effects: ${e?.message||e}`);}}
async function applyEffect(type,power){const item=active(),config=EFFECT_TYPES[type];if(!item||!config){notify("Assign a character first.");return;}try{await update(item.id,d=>{const v=d.effects[type],list=Array.isArray(v)?v:(v&&typeof v==="object"?[v]:[]);list.push({id:crypto.randomUUID(),power,charges:3,appliedAt:new Date().toISOString(),schemaVersion:2});d.effects[type]=list.filter(b=>b.charges>0);});notify(`Added a separate 3×${power} ${config.label} to ${item.name||"the character"}.`);await refresh();}catch(e){console.error(e);notify(`Could not apply ${config.label}: ${e?.message||e}`);}}
OBR.onReady(()=>{void(async()=>{try{
 document.querySelectorAll(".effect-column button[data-tier]").forEach(b=>b.addEventListener("click",()=>applyEffect(b.dataset.effect,Number(b.dataset.tier))));
$("assign-character").addEventListener("click",async()=>{const candidate=characters.find(c=>c.id===selectedId);if(!candidate){notify("Select a character token on the map first.");return;}try{await setActive(candidate.id);notify(`${candidate.name||"Character"} is now assigned to your Effect Tracker.`);}catch(e){console.error(e);notify(`Could not assign character: ${e?.message||e}`);}});
 $("add-to-initiative").addEventListener("click",()=>{const candidate=characters.find(c=>c.id===selectedId);if(candidate)void addToInitiative(candidate.id);});
 $("clear-effects").addEventListener("click",()=>void clearEffects());
 OBR.scene.items.onChange(()=>{void refresh();});
 OBR.player.onChange(player=>{const picked=(player?.selection||[]).find(id=>characters.some(c=>c.id===id));if(picked){selectedId=picked;render();}});
 OBR.scene.onReadyChange(ready=>{if(ready)void refresh();});await refresh();
 }catch(e){console.error(e);notify(`Startup error: ${e?.message||e}`);} })();});
window.addEventListener("error",e=>{console.error("Effect Tracker script error:",e.message);});
window.addEventListener("unhandledrejection",e=>{console.error("Effect Tracker connection error:",e.reason);});
