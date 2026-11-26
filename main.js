import OBR, { buildShape, buildImage, buildImageUpload } from "@owlbear-rodeo/sdk";
const NS="com.effect-tracker/data";
const INIT_NS="rodeo.owlbear.initiative-tracker/metadata";
const EFFECT_TYPES={bleed:{label:"Bleed",icon:"Bleed.svg",color:"blood"},poison:{label:"Poison",icon:"Poison.svg",color:"poison"},fire:{label:"Fire",icon:"Fire.svg",color:"fire"},regen:{label:"Regen",icon:"Regen.svg",color:"regen"},mark:{label:"Mark",icon:"Mark.svg",color:"mark"},horror:{label:"Horror",icon:"Horror.svg",color:"horror"},shield:{label:"Shield",icon:"Shield.svg",color:"shield"}};
const VALUE_EFFECTS={stunt:{label:"Stunt",icon:"Stunt.svg",color:"stunt"},root:{label:"Root",icon:"Root.svg",color:"root"},blind:{label:"Blind",icon:"Blind.svg",color:"blind"},silent:{label:"Silent",icon:"Silent.svg",color:"silent"},gel:{label:"Gel",icon:"Gel.svg",color:"gel"}};
let characters=[], activeId=null, selectedId=null, busy=false, queued=false, personalData={};
const $=id=>document.getElementById(id);
const isCharacter=item=>item?.layer==="CHARACTER"&&item?.type==="IMAGE";
function errorText(error){if(error?.message)return error.message;if(typeof error==="string")return error;try{return JSON.stringify(error);}catch{return String(error);}}
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

const EFFECT_HELP={
 bleed:{title:"Saignement",description:"Subit un dégât par Bleed au début de chaque tour.",color:"#e36b86"},
 poison:{title:"Empoisonné",description:"Subit un dégât par Poison au début de chaque tour.",color:"#78d58d"},
 fire:{title:"Enflammé",description:"Subit un dégât par Flamme au début de chaque tour.",color:"#ffad70"},
 regen:{title:"Renouvelé",description:"Subit un soin par Regen au début de chaque tour.",color:"#ffd484"},
 stunt:{title:"Assommé",description:"Empêche toute action tant que le Stunt est actif.",color:"#FFCC00"},
 root:{title:"Enchevêtré",description:"Empêche l'Esquive, -1 déplacement par Root actif.",color:"#d97745"},
 blind:{title:"Aveuglé",description:"-10 Toucher par Blind actif.",color:"#FFFFFF"},
 silent:{title:"Silencieux",description:"Empêche Sort, Techniques et Dialogues tant que le Silence est actif.",color:"#FF33FF"},
 gel:{title:"Gelé",description:"-5 Toucher et Critique par Gel actif, ainsi qu'un point de dégat par action.",color:"#33FFFF"},
 mark:{title:"Marqué",description:"Subit +1 dégât par Marque pour chaque dégât subit.",color:"#c45b91"},
 horror:{title:"Horreur",description:"Subit un mental par horreur au début de chaque tour.",color:"#9966cc"},
 shield:{title:"Protection",description:"Subit -1 dégât par Protection pour chaque dégât subit.",color:"#999999"}
};
function showEffectHelp(type,anchor){
 const data=EFFECT_HELP[type],tip=$("effect-help");
 if(!data||!tip)return;
 if(tip.dataset.effect===type&&tip.classList.contains("visible")){tip.classList.remove("visible");return;}
 $("effect-help-title").textContent=data.title;
 $("effect-help-title").style.color=data.color;
 $("effect-help-description").textContent=data.description;
 tip.dataset.effect=type;tip.classList.add("visible");
 const rect=anchor.getBoundingClientRect(),width=tip.offsetWidth||280;
 const left=Math.max(8,Math.min(window.innerWidth-width-8,rect.left+rect.width/2-width/2));
 tip.style.left=left+"px";
 tip.style.top=Math.min(window.innerHeight- tip.offsetHeight-8,rect.bottom+8)+"px";
}

const MAP_ICON_TYPES=["bleed","poison","fire","regen","stunt","root","blind","silent","gel","mark","horror","shield"];
async function selectBleedAttachment(){
 const button=$("select-map-icons");if(button)button.disabled=true;
 try{
  const downloads=await OBR.assets.downloadImages(true,"Bleed","ATTACHMENT");
  const meta=await OBR.player.getMetadata(),data=JSON.parse(JSON.stringify(meta?.[NS]||{}));
  const assets={...(data.mapIconAssets||{})};
  let imported=0;
  for(const download of downloads||[]){
   let normalized=String(download.name||"").trim().toLowerCase();
   normalized=normalized.replace(/^effect tracker\\s*-\\s*/,"").replace(/\\.png$/i,"").trim();
   if(MAP_ICON_TYPES.includes(normalized)&&download.image?.url){
    assets[normalized]=download.image;imported++;
   }
  }
  data.mapIconAssets=assets;
  await OBR.player.setMetadata({[NS]:data});personalData=data;
  const missing=MAP_ICON_TYPES.filter(type=>!assets[type]);
  await syncLocalEffectIcons(active());
  if(!imported&&missing.length===MAP_ICON_TYPES.length){
   notify("No matching PNG names were returned. In the picker, clear the search and select the Effect Tracker icons.");
  }else if(missing.length){
   notify(imported+" icon(s) saved. Still missing: "+missing.join(", ")+". You can select the remaining icons with this button.");
  }else{
   notify("All 12 effect icons saved to your player profile. They will be used automatically from now on.");
  }
 }catch(error){console.error(error);notify("Attachment selection failed: "+errorText(error));}
 finally{if(button)button.disabled=false;}
}
async function syncLocalEffectIcons(character=active()){
 const existing=await OBR.scene.local.getItems(item=>item.metadata?.[NS]?.effectTrackerAssetTest===true);
 const assets=personalData?.mapIconAssets||{};
 const activeTypes=new Set();
 if(character){
  for(const effect of effectsOf(character))if(effect.charges>0)activeTypes.add(effect.type);
  for(const effect of valueEffectsOf(character))if(effect.value>0)activeTypes.add(effect.type);
 }
 const bounds=character?await OBR.scene.items.getItemBounds([character.id]):null;
 const height=bounds?Math.max(10,bounds.height*0.14):0;
 const outerGap=bounds?bounds.height*0.10:0;
 const slotTop=bounds?bounds.min.y-outerGap-height*4:0;
 const left=bounds?bounds.min.x:0;
 const rowTypes=[["bleed","poison","fire","regen"],["stunt","root","blind","silent"],["gel","mark","horror","shield"]];
 const wanted=new Map();
 for(const type of activeTypes){
  const asset=assets[type];if(!asset?.url)continue;
  const row=rowTypes.findIndex(types=>types.includes(type));if(row<0)continue;
  const index=rowTypes[row].indexOf(type);
  const size=Math.max(0.001,Math.min(height*0.02,bounds.width/4*0.02));
  wanted.set(type,{asset,size,position:{x:left+bounds.width*(type==="bleed"?0.1875:(index+0.5)/4),y:slotTop+height*(row+0.7)}});
 }
 const existingByType=new Map();
 for(const item of existing){
  const meta=item.metadata?.[NS]?.effectTrackerAssetTest;
  if(meta?.characterId!==character?.id||!wanted.has(meta?.type)){
   await OBR.scene.local.deleteItems([item.id]);continue;
  }
  existingByType.set(meta.type,item);
 }
 const additions=[],updates=[];
 for(const [type,geometry] of wanted){
  const old=existingByType.get(type);
  if(old){
   const p=old.position||{},sc=old.scale||{};
   if(Math.abs((p.x??0)-geometry.position.x)>0.01||Math.abs((p.y??0)-geometry.position.y)>0.01||Math.abs((sc.x??0)-geometry.size)>0.01||Math.abs((sc.y??0)-geometry.size)>0.01){
    updates.push({id:old.id,position:geometry.position,size:geometry.size});
   }
   continue;
  }
  const icon=buildImage(geometry.asset,{offset:{x:0,y:0},dpi:256}).scale({x:geometry.size,y:geometry.size})
   .position(geometry.position).layer("ATTACHMENT").attachedTo(character.id).disableHit(true).locked(true)
   .metadata({[NS]:{effectTrackerAssetTest:{characterId:character.id,type}}}).build();
  additions.push(icon);
 }
 if(updates.length)await OBR.scene.local.updateItems(updates.map(x=>x.id),items=>items.map(item=>{
  const update=updates.find(x=>x.id===item.id);
  return update?{...item,position:update.position,scale:{x:update.size,y:update.size}}:item;
 }));
 if(additions.length)await OBR.scene.local.addItems(additions);
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
 const width=bounds.width,height=Math.max(10,bounds.height*0.14),gap=0,outerGap=bounds.height*0.10;
 const totalHeight=height*4+gap*3,left=bounds.center.x-width,centerY=bounds.min.y-outerGap-totalHeight/2;
 const colors=["#e36b86","#ffcc00","#33ffff","#999999"];
 const labels=["Bleed, Poison, Fire, Regen","Stunt, Root, Blind, Silent","Gel, Mark, Horror, Shield","Future effects"];
 const byIndex=new Map(existing.map(item=>[item.metadata[NS].effectTrackerSlot.index,item]));
 const positionFor=index=>({x:left+width/2,y:centerY-totalHeight/2+height/2+index*(height+gap)});
 const slotsNeedingUpdate=existing.filter(item=>{
  const index=item.metadata?.[NS]?.effectTrackerSlot?.index,p=positionFor(index);
  return Math.abs((item.width||0)-width)>0.01||Math.abs((item.height||0)-height)>0.01||
   Math.abs((item.position?.x??0)-p.x)>0.01||Math.abs((item.position?.y??0)-p.y)>0.01;
 });
 if(slotsNeedingUpdate.length)await OBR.scene.items.updateItems(slotsNeedingUpdate.map(item=>item.id),items=>items.map(item=>{
  const index=item.metadata?.[NS]?.effectTrackerSlot?.index;
  return {...item,width,height,position:positionFor(index)};
 }));
 const shapes=[];
 for(let index=0;index<4;index++){
  if(byIndex.has(index))continue;
  const shape=buildShape().name(`Effect Tracker Slot ${index+1}: ${labels[index]}`).shapeType("RECTANGLE").width(width).height(height).position(positionFor(index)).fillColor(colors[index]).fillOpacity(0.12).strokeColor(colors[index]).strokeOpacity(0.95).strokeWidth(2).attachedTo(character.id).layer("ATTACHMENT").disableHit(true).locked(true).metadata({[NS]:{effectTrackerSlot:{characterId:character.id,index}}}).build();
  shapes.push(shape);
 }
 if(shapes.length)await OBR.scene.items.addItems(shapes);

 const rowTypes=[
  ["bleed","poison","fire","regen"],
  ["stunt","root","blind","silent"],
  ["gel","mark","horror","shield"]
 ];
 const chargeTypes=new Set(effectsOf(character).map(effect=>effect.type));
 const values=valueEffectsOf(character);
 const activeTypes=new Set([...chargeTypes,...values.filter(effect=>effect.value>0).map(effect=>effect.type)]);
 const oldMarkers=await OBR.scene.items.getItems(item=>item.metadata?.[NS]?.effectTrackerIcon?.characterId===character.id);
 const oldSvgMarkers=await OBR.scene.items.getItems(item=>item.metadata?.[NS]?.effectTrackerSvg?.characterId===character.id);
 const existingMarkers=await OBR.scene.items.getItems(item=>item.metadata?.[NS]?.effectTrackerPng?.characterId===character.id);
 const existingByType=new Map(existingMarkers.map(item=>[item.metadata[NS].effectTrackerPng.type,item]));
 const staleIds=[...oldMarkers,...oldSvgMarkers,...existingMarkers.filter(item=>!activeTypes.has(item.metadata[NS].effectTrackerPng.type))].map(item=>item.id);
 if(staleIds.length)await OBR.scene.items.deleteItems(staleIds);
 const geometryFor=type=>{const row=rowTypes.findIndex(types=>types.includes(type));if(row<0)return null;const index=rowTypes[row].indexOf(type);const iconSize=Math.max(0.001,Math.min(height*0.02,width/4*0.02));return {row,index,iconSize,position:{x:left+width*(index+0.5)/4,y:positionFor(row).y}};};
 const icons=[],updates=[];
 for(const type of activeTypes){
  const geometry=geometryFor(type);if(!geometry)continue;
  const old=existingByType.get(type);
  if(old){const p=old.position||{},sc=old.scale||{};if(Math.abs((p.x??0)-geometry.position.x)>0.01||Math.abs((p.y??0)-geometry.position.y)>0.01||Math.abs((sc.x??0)-geometry.iconSize)>0.01||Math.abs((sc.y??0)-geometry.iconSize)>0.01)updates.push({id:old.id,geometry});continue;}
  const iconName=(EFFECT_TYPES[type]?.icon||VALUE_EFFECTS[type]?.icon)?.replace(/\.svg$/i,".png");if(!iconName)continue;
  const icon=buildImage({width:256,height:256,mime:"image/png",url:"https://raw.githubusercontent.com/Herbybow/Effect-Tracker/main/public/PNG/"+iconName},{offset:{x:0,y:0},dpi:256})
   .scale({x:geometry.iconSize,y:geometry.iconSize}).position(geometry.position).layer("ATTACHMENT").attachedTo(character.id).disableHit(true).locked(true)
   .metadata({[NS]:{effectTrackerPng:{characterId:character.id,type,row:geometry.row}}}).build();
  icons.push(icon);
 }
 if(updates.length)await OBR.scene.items.updateItems(updates.map(x=>x.id),items=>items.map(item=>{const u=updates.find(x=>x.id===item.id);return u?{...item,position:u.geometry.position,scale:{x:u.geometry.iconSize,y:u.geometry.iconSize}}:item;}));
 if(icons.length)await OBR.scene.items.addItems(icons);
}
async function refresh(){if(busy){queued=true;return;}busy=true;try{characters=await OBR.scene.items.getItems(isCharacter);const meta=await OBR.player.getMetadata();personalData=meta?.[NS]||{};await migratePersonalEffects();const preferred=personalData.activeCharacterId;activeId=characters.some(i=>i.id===preferred)?preferred:null;if(activeId){const assigned=characters.find(i=>i.id===activeId);if(assigned){await ensureEffectSlots(assigned);await syncLocalEffectIcons(assigned);}}else{await syncLocalEffectIcons(null);}if(!selectedId||!characters.some(i=>i.id===selectedId))selectedId=((await OBR.player.getSelection())||[]).find(id=>characters.some(i=>i.id===id))||null;render();}catch(e){console.error(e);notify(`Could not load characters: ${errorText(e)}`);}finally{busy=false;if(queued){queued=false;void refresh();}}}
async function update(id,mutate){await OBR.scene.items.updateItems([id],items=>{for(const item of items){const d=JSON.parse(JSON.stringify(item.metadata?.[NS]||{}));d.effects??={};mutate(d);item.metadata={...item.metadata,[NS]:d};}});}
async function setActive(id){const meta=await OBR.player.getMetadata(),data=JSON.parse(JSON.stringify(meta?.[NS]||{}));data.activeCharacterId=id;delete data.effectsByCharacter;await OBR.player.setMetadata({[NS]:data});personalData=data;activeId=id;selectedId=id;const assigned=characters.find(i=>i.id===id);if(assigned)await ensureEffectSlots(assigned);await syncLocalEffectIcons(assigned);render();}
async function addToInitiative(id){
 const item=characters.find(c=>c.id===id);if(!item){notify("Select a character token on the map first.");return;}
 try{await OBR.scene.items.updateItems([id],items=>{for(const sceneItem of items){if(sceneItem.metadata?.[INIT_NS]===undefined){sceneItem.metadata={...sceneItem.metadata,[INIT_NS]:{count:"0",active:false}};}}});notify(`${item.name||"Character"} added to Initiative.`);await refresh();}
 catch(e){console.error(e);notify(`Could not add to Initiative: ${errorText(e)}`);}
}
async function clearEffects(){const item=active();if(!item){notify("Assign a character first.");return;}try{let changed=false;await update(item.id,d=>{d.effects??={};for(const type of ["bleed","poison","fire","regen","horror"]){const raw=d.effects[type],list=Array.isArray(raw)?raw:(raw&&typeof raw==="object"?[raw]:[]);const remaining=list.map(b=>{const charges=Math.max(0,Number(b.charges)||0);if(charges>0)changed=true;return {...b,charges:Math.max(0,charges-1)};}).filter(b=>b.charges>0);if(remaining.length)d.effects[type]=remaining;else delete d.effects[type];}const gel=Math.max(0,Number(d.effects.gel)||0);if(gel>0){d.effects.gel=gel-1;changed=true;}});if(!changed){notify("No active effect charges to clear.");return;}notify("Consumed one charge from each active effect. No damage was dealt.");await refresh();}catch(e){console.error(e);notify(`Could not clear effects: ${errorText(e)}`);}}
async function setValueEffect(type,value){const item=active(),config=VALUE_EFFECTS[type];if(!item||!config)return;try{await update(item.id,d=>{d.effects[type]=value;});document.querySelectorAll(`.value-effect-column[data-effect="${type}"] button`).forEach(button=>button.classList.toggle("active",Number(button.dataset.value)===value&&value!==0));await refresh();}catch(e){console.error(e);notify(`Could not update ${config.label}: ${errorText(e)}`);}}
async function hitEffects(){const item=active();if(!item){notify("Assign a character first.");return;}try{let changed=false;await update(item.id,d=>{d.effects??={};for(const type of ["stunt","gel"]){const value=Math.max(0,Number(d.effects[type])||0);if(value>0){d.effects[type]=Math.max(0,value-1);changed=true;}}for(const type of ["mark","shield"]){const raw=d.effects[type],list=Array.isArray(raw)?raw:(raw&&typeof raw==="object"?[raw]:[]);const remaining=list.map(b=>{const charges=Math.max(0,Number(b.charges)||0);if(charges>0)changed=true;return {...b,charges:Math.max(0,charges-1)};}).filter(b=>b.charges>0);if(remaining.length)d.effects[type]=remaining;else delete d.effects[type];}});if(!changed){notify("No Stunt, Gel, Mark or Shield to reduce.");return;}notify("Hit applied: Stunt/Gel power and Mark/Shield charges reduced by 1.");await refresh();}catch(e){console.error(e);notify(`Could not apply Hit: ${errorText(e)}`);}}
async function applyEffect(type,power){const item=active(),config=EFFECT_TYPES[type];if(!item||!config){notify("Assign a character first.");return;}try{await update(item.id,d=>{const v=d.effects[type],list=Array.isArray(v)?v:(v&&typeof v==="object"?[v]:[]);list.push({id:crypto.randomUUID(),power,charges:3,appliedAt:new Date().toISOString(),schemaVersion:2});d.effects[type]=list.filter(b=>b.charges>0);});await refresh();}catch(e){console.error(e);notify(`Could not apply ${config.label}: ${errorText(e)}`);}}
OBR.onReady(()=>{void(async()=>{try{
 await OBR.action.setHeight(1300);await OBR.action.setWidth(325);
 document.querySelectorAll(".drop[alt]").forEach(icon=>icon.addEventListener("click",event=>{event.stopPropagation();const type=icon.alt.toLowerCase();showEffectHelp(type,icon);}));
 document.addEventListener("click",event=>{const tip=$("effect-help");if(tip&&!tip.contains(event.target)&&!event.target.closest(".drop"))tip.classList.remove("visible");});
 document.querySelectorAll(".effect-column button[data-tier]").forEach(b=>b.addEventListener("click",()=>applyEffect(b.dataset.effect,Number(b.dataset.tier))));
 document.querySelectorAll(".value-effect-column button[data-value]").forEach(b=>b.addEventListener("click",()=>setValueEffect(b.dataset.effect,Number(b.dataset.value))));
$("assign-character").addEventListener("click",async()=>{const candidate=characters.find(c=>c.id===selectedId);if(!candidate){notify("Select a character token on the map first.");return;}try{await setActive(candidate.id);notify(`${candidate.name||"Character"} is now assigned to your Effect Tracker.`);}catch(e){console.error(e);notify(`Could not assign character: ${errorText(e)}`);}});
 $("add-to-initiative").addEventListener("click",()=>{const candidate=characters.find(c=>c.id===selectedId);if(candidate)void addToInitiative(candidate.id);});
 $("select-map-icons").addEventListener("click",()=>void selectBleedAttachment());
 $("clear-effects").addEventListener("click",()=>void clearEffects());
 $("hit-effects").addEventListener("click",()=>void hitEffects());
 OBR.scene.items.onChange(()=>{void refresh();});
 OBR.player.onChange(player=>{const picked=(player?.selection||[]).find(id=>characters.some(c=>c.id===id));if(picked){selectedId=picked;render();}});
 OBR.scene.onReadyChange(ready=>{if(ready)void refresh();});await refresh();
 }catch(e){console.error(e);notify(`Startup error: ${errorText(e)}`);} })();});
window.addEventListener("error",e=>{console.error("Effect Tracker script error:",e.message);});
window.addEventListener("unhandledrejection",e=>{console.error("Effect Tracker connection error:",e.reason);});
