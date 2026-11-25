import OBR, { buildShape } from "@owlbear-rodeo/sdk";
const NS="com.effect-tracker/data";
const INIT_NS="rodeo.owlbear.initiative-tracker/metadata";
const EFFECT_TYPES={bleed:{label:"Bleed",icon:"Bleed.svg",color:"blood"},poison:{label:"Poison",icon:"Poison.svg",color:"poison"},fire:{label:"Fire",icon:"Fire.svg",color:"fire"},regen:{label:"Regen",icon:"Regen.svg",color:"regen"},mark:{label:"Mark",icon:"Mark.svg",color:"mark"},horror:{label:"Horror",icon:"Horror.svg",color:"horror"},shield:{label:"Shield",icon:"Shield.svg",color:"shield"}};
const VALUE_EFFECTS={stunt:{label:"Stunt",icon:"Stunt.svg",color:"stunt"},root:{label:"Root",icon:"Root.svg",color:"root"},blind:{label:"Blind",icon:"Blind.svg",color:"blind"},silent:{label:"Silent",icon:"Silent.svg",color:"silent"},gel:{label:"Gel",icon:"Gel.svg",color:"gel"}};
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
function valueEffectsOf(item){const data=item?.metadata?.[NS]?.effects||{};return Object.entries(VALUE_EFFECTS).map(([type,config])=>({type,...config,value:Math.max(0,Math.min(9,Number(data[type])||0))}));}
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
 const activeEffects=item?effectsOf(item):[];
 const values=item?valueEffectsOf(item).filter(e=>e.value>0):[];
 const firstEffects=activeEffects.filter(e=>["bleed","poison","fire","regen"].includes(e.type));
 const thirdEffects=activeEffects.filter(e=>["mark","horror","shield"].includes(e.type));
 const secondValues=values.filter(e=>["stunt","root","blind","silent"].includes(e.type));
 const thirdValues=values.filter(e=>e.type==="gel");
 const hasCurrent=firstEffects.length||secondValues.length||thirdEffects.length||thirdValues.length;
 current.className=hasCurrent?"current-list":"empty";
 if(!item)current.textContent="Assign a character to see its current effects.";
 else if(!hasCurrent)current.textContent="No Effect";
 else {
  const chargeTag=effect=>{const tag=document.createElement("span");tag.className=`effect-tag effect-${effect.type}`;tag.style.minHeight=`${26+(Math.max(1,Number(effect.charges)||1)-1)*12}px`;const amount=document.createElement("span");amount.textContent=`${effect.charges}×${effect.power}`;const icon=document.createElement("img");icon.className="current-effect-icon";icon.src=`./effects/${effect.icon}`;icon.alt="";tag.append(amount,icon);return tag;};
  const valueTag=effect=>{const tag=document.createElement("span");tag.className=`value-effect-tag value-${effect.type}`;const icon=document.createElement("img");icon.src=`./effects/${effect.icon}`;icon.alt=effect.label;const value=document.createElement("strong");value.textContent=String(effect.value);tag.append(icon,value);return tag;};
  const appendRow=(entries,className)=>{if(!entries.length)return;const row=document.createElement("div");row.className=`current-effect-row ${className}`;for(const entry of entries)row.append(entry.kind==="value"?valueTag(entry.effect):chargeTag(entry.effect));current.append(row);};
  appendRow(firstEffects.map(effect=>({kind:"charge",effect})),"current-row-one");
  appendRow(secondValues.map(effect=>({kind:"value",effect})),"current-row-two");
  appendRow([...thirdValues.map(effect=>({kind:"value",effect})),...thirdEffects.map(effect=>({kind:"charge",effect}))],"current-row-three");
 }
 $("bleed-controls").hidden=!full;
 $("third-effect-controls").hidden=!full;
 if(item){const values=valueEffectsOf(item);document.querySelectorAll(".value-effect-column").forEach(column=>{const effect=values.find(e=>e.type===column.dataset.effect);column.querySelectorAll("button[data-value]").forEach(button=>button.classList.toggle("active",!!effect&&effect.value>0&&Number(button.dataset.value)===effect.value));});}

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

async function ensureEffectSlots(character){
 if(!character)return;
 const bounds=await OBR.scene.items.getItemBounds([character.id]);
 const existing=await OBR.scene.items.getItems(item=>item.metadata?.[NS]?.effectTrackerSlot?.characterId===character.id);
 const present=new Set(existing.map(item=>item.metadata?.[NS]?.effectTrackerSlot?.index));
 const width=Math.max(20,bounds.width*0.23),height=Math.max(10,bounds.height*0.16),gap=Math.max(3,bounds.width*0.02),outerGap=Math.max(4,bounds.height*0.04);
 const total=width*4+gap*3,left=bounds.center.x-total/2,centerY=bounds.min.y-outerGap-height/2;
 const colors=["#e36b86","#ffcc00","#33ffff","#999999"];
 const labels=["Bleed, Poison, Fire, Regen","Stunt, Root, Blind, Silent","Gel, Mark, Horror, Shield","Future effects"];
 const shapes=[];
 for(let index=0;index<4;index++){
  if(present.has(index))continue;
  const shape=buildShape().name(`Effect Tracker Slot ${index+1}: ${labels[index]}`).shapeType("RECTANGLE").width(width).height(height).position({x:left+width/2+index*(width+gap),y:centerY}).fillColor(colors[index]).fillOpacity(0.12).strokeColor(colors[index]).strokeOpacity(0.95).strokeWidth(2).attachedTo(character.id).layer("ATTACHMENT").disableHit(true).locked(true).metadata({[NS]:{effectTrackerSlot:{characterId:character.id,index}}}).build();
  shapes.push(shape);
 }
 if(shapes.length)await OBR.scene.items.addItems(shapes);
}
async function refresh(){if(busy){queued=true;return;}busy=true;try{characters=await OBR.scene.items.getItems(isCharacter);const meta=await OBR.player.getMetadata();personalData=meta?.[NS]||{};await migratePersonalEffects();const preferred=personalData.activeCharacterId;activeId=characters.some(i=>i.id===preferred)?preferred:null;if(activeId){const assigned=characters.find(i=>i.id===activeId);if(assigned)await ensureEffectSlots(assigned);}if(!selectedId||!characters.some(i=>i.id===selectedId))selectedId=((await OBR.player.getSelection())||[]).find(id=>characters.some(i=>i.id===id))||null;render();}catch(e){console.error(e);notify(`Could not load characters: ${e?.message||e}`);}finally{busy=false;if(queued){queued=false;void refresh();}}}
async function update(id,mutate){await OBR.scene.items.updateItems([id],items=>{for(const item of items){const d=JSON.parse(JSON.stringify(item.metadata?.[NS]||{}));d.effects??={};mutate(d);item.metadata={...item.metadata,[NS]:d};}});}
async function setActive(id){const meta=await OBR.player.getMetadata(),data=JSON.parse(JSON.stringify(meta?.[NS]||{}));data.activeCharacterId=id;delete data.effectsByCharacter;await OBR.player.setMetadata({[NS]:data});personalData=data;activeId=id;selectedId=id;const assigned=characters.find(i=>i.id===id);if(assigned)await ensureEffectSlots(assigned);render();}
async function addToInitiative(id){
 const item=characters.find(c=>c.id===id);if(!item){notify("Select a character token on the map first.");return;}
 try{await OBR.scene.items.updateItems([id],items=>{for(const sceneItem of items){if(sceneItem.metadata?.[INIT_NS]===undefined){sceneItem.metadata={...sceneItem.metadata,[INIT_NS]:{count:"0",active:false}};}}});notify(`${item.name||"Character"} added to Initiative.`);await refresh();}
 catch(e){console.error(e);notify(`Could not add to Initiative: ${e?.message||e}`);}
}
async function clearEffects(){const item=active();if(!item){notify("Assign a character first.");return;}try{let changed=false;await update(item.id,d=>{d.effects??={};for(const type of ["bleed","poison","fire","regen","horror"]){const raw=d.effects[type],list=Array.isArray(raw)?raw:(raw&&typeof raw==="object"?[raw]:[]);const remaining=list.map(b=>{const charges=Math.max(0,Number(b.charges)||0);if(charges>0)changed=true;return {...b,charges:Math.max(0,charges-1)};}).filter(b=>b.charges>0);if(remaining.length)d.effects[type]=remaining;else delete d.effects[type];}});if(!changed){notify("No active effect charges to clear.");return;}notify("Consumed one charge from each active effect. No damage was dealt.");await refresh();}catch(e){console.error(e);notify(`Could not clear effects: ${e?.message||e}`);}}
async function setValueEffect(type,value){const item=active(),config=VALUE_EFFECTS[type];if(!item||!config)return;try{await update(item.id,d=>{d.effects[type]=value;});notify(value===0?`${config.label} cleared.`:`${config.label} set to ${value}.`);document.querySelectorAll(`.value-effect-column[data-effect="${type}"] button`).forEach(button=>button.classList.toggle("active",Number(button.dataset.value)===value&&value!==0));await refresh();}catch(e){console.error(e);notify(`Could not update ${config.label}: ${e?.message||e}`);}}
async function hitEffects(){const item=active();if(!item){notify("Assign a character first.");return;}try{let changed=false;await update(item.id,d=>{d.effects??={};for(const type of ["stunt","gel"]){const value=Math.max(0,Number(d.effects[type])||0);if(value>0){d.effects[type]=Math.max(0,value-1);changed=true;}}for(const type of ["mark","shield"]){const raw=d.effects[type],list=Array.isArray(raw)?raw:(raw&&typeof raw==="object"?[raw]:[]);const remaining=list.map(b=>{const charges=Math.max(0,Number(b.charges)||0);if(charges>0)changed=true;return {...b,charges:Math.max(0,charges-1)};}).filter(b=>b.charges>0);if(remaining.length)d.effects[type]=remaining;else delete d.effects[type];}});if(!changed){notify("No Stunt, Gel, Mark or Shield to reduce.");return;}notify("Hit applied: Stunt/Gel power and Mark/Shield charges reduced by 1.");await refresh();}catch(e){console.error(e);notify(`Could not apply Hit: ${e?.message||e}`);}}
async function applyEffect(type,power){const item=active(),config=EFFECT_TYPES[type];if(!item||!config){notify("Assign a character first.");return;}try{await update(item.id,d=>{const v=d.effects[type],list=Array.isArray(v)?v:(v&&typeof v==="object"?[v]:[]);list.push({id:crypto.randomUUID(),power,charges:3,appliedAt:new Date().toISOString(),schemaVersion:2});d.effects[type]=list.filter(b=>b.charges>0);});notify(`Added a separate 3×${power} ${config.label} to ${item.name||"the character"}.`);await refresh();}catch(e){console.error(e);notify(`Could not apply ${config.label}: ${e?.message||e}`);}}
OBR.onReady(()=>{void(async()=>{try{
 await OBR.action.setHeight(1300);await OBR.action.setWidth(325);
 document.querySelectorAll(".effect-column button[data-tier]").forEach(b=>b.addEventListener("click",()=>applyEffect(b.dataset.effect,Number(b.dataset.tier))));
 document.querySelectorAll(".value-effect-column button[data-value]").forEach(b=>b.addEventListener("click",()=>setValueEffect(b.dataset.effect,Number(b.dataset.value))));
$("assign-character").addEventListener("click",async()=>{const candidate=characters.find(c=>c.id===selectedId);if(!candidate){notify("Select a character token on the map first.");return;}try{await setActive(candidate.id);notify(`${candidate.name||"Character"} is now assigned to your Effect Tracker.`);}catch(e){console.error(e);notify(`Could not assign character: ${e?.message||e}`);}});
 $("add-to-initiative").addEventListener("click",()=>{const candidate=characters.find(c=>c.id===selectedId);if(candidate)void addToInitiative(candidate.id);});
 $("clear-effects").addEventListener("click",()=>void clearEffects());
 $("hit-effects").addEventListener("click",()=>void hitEffects());
 OBR.scene.items.onChange(()=>{void refresh();});
 OBR.player.onChange(player=>{const picked=(player?.selection||[]).find(id=>characters.some(c=>c.id===id));if(picked){selectedId=picked;render();}});
 OBR.scene.onReadyChange(ready=>{if(ready)void refresh();});await refresh();
 }catch(e){console.error(e);notify(`Startup error: ${e?.message||e}`);} })();});
window.addEventListener("error",e=>{console.error("Effect Tracker script error:",e.message);});
window.addEventListener("unhandledrejection",e=>{console.error("Effect Tracker connection error:",e.reason);});
