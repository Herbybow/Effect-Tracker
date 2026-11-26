import { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Input from "@mui/material/Input";
import IconButton from "@mui/material/IconButton";
import CardHeader from "@mui/material/CardHeader";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";
import SkipNextRounded from "@mui/icons-material/SkipNextRounded";
import VisibilityOffRounded from "@mui/icons-material/VisibilityOffRounded";
import OBR, { isImage, Item, Player } from "@owlbear-rodeo/sdk";
import "./style.css";

const INIT="rodeo.owlbear.initiative-tracker/metadata";
const EFFECTS_NS="com.effect-tracker/data";
type EffectType="bleed"|"poison"|"fire"|"regen"|"mark"|"horror"|"shield";
type ValueEffectType="stunt"|"root"|"blind"|"silent"|"gel";
const VALUE_EFFECT_DEFS:{type:ValueEffectType;icon:string;label:string}[]=[{type:"stunt",icon:"Stunt.svg",label:"Stunt"},{type:"root",icon:"Root.svg",label:"Root"},{type:"blind",icon:"Blind.svg",label:"Blind"},{type:"silent",icon:"Silent.svg",label:"Silent"},{type:"gel",icon:"Gel.svg",label:"Gel"}];
const EFFECT_DEFS:{type:EffectType;icon:string;label:string}[]=[{type:"bleed",icon:"Bleed.svg",label:"Bleed"},{type:"poison",icon:"Poison.svg",label:"Poison"},{type:"fire",icon:"Fire.svg",label:"Fire"},{type:"regen",icon:"Regen.svg",label:"Regen"},{type:"mark",icon:"Mark.svg",label:"Mark"},{type:"horror",icon:"Horror.svg",label:"Horror"},{type:"shield",icon:"Shield.svg",label:"Shield"}];
type Entry={id:string;count:string;name:string;active:boolean;visible:boolean;activeEffects:EffectType[];chargeCounts:Partial<Record<EffectType,number>>;valueEffects:Partial<Record<ValueEffectType,number>>;turnDamageByEffect?:Partial<Record<EffectType,number>>;turnDamage?:number};
const valid=(v:any)=>v&&typeof v==="object"&&typeof v.count==="string"&&typeof v.active==="boolean";

function Tracker(){
 const [items,setItems]=useState<Entry[]>([]);
 const [role,setRole]=useState<"GM"|"PLAYER">("PLAYER");
 useEffect(()=>{OBR.player.getRole().then(setRole);return OBR.player.onChange((p:Player)=>setRole(p.role));},[]);
 useEffect(()=>{
  const refresh=(sceneItems:Item[])=>setItems(sceneItems.filter(isImage).flatMap(item=>{
   const m=item.metadata[INIT]; if(!valid(m))return [];
   const effectData=item.metadata[EFFECTS_NS]?.effects||{};
   const chargeCounts:Partial<Record<EffectType,number>>={};const activeEffects=EFFECT_DEFS.filter(e=>{const raw=effectData[e.type],list=Array.isArray(raw)?raw:(raw&&typeof raw==="object"?[raw]:[]);const charges=list.reduce((sum:number,b:any)=>sum+Math.max(0,Number(b.charges)||0),0);if(charges>0)chargeCounts[e.type]=charges;return charges>0;}).map(e=>e.type);
   const saved= m.turnDamageByEffect&&typeof m.turnDamageByEffect==="object"?m.turnDamageByEffect:undefined;
   const valueEffects:Partial<Record<ValueEffectType,number>>={};
   for(const e of VALUE_EFFECT_DEFS){const value=Math.max(0,Math.min(9,Number(effectData[e.type])||0));if(value>0)valueEffects[e.type]=value;}
   return [{id:item.id,count:m.count,name:item.text.plainText||item.name,active:m.active,visible:item.visible,activeEffects,chargeCounts,valueEffects,turnDamageByEffect:saved,turnDamage:typeof m.turnDamage==="number"?m.turnDamage:undefined}];
  }));
  OBR.scene.items.getItems().then(refresh); return OBR.scene.items.onChange(refresh);
 },[]);
 useEffect(()=>{
  OBR.contextMenu.create({id:"rodeo.owlbear.initiative-tracker/menu/toggle",icons:[
   {icon:"https://herbybow.github.io/Effect-Tracker/initiative/icon.svg",label:"Add to Initiative",filter:{every:[{key:"layer",value:"CHARACTER",coordinator:"||"},{key:"layer",value:"MOUNT"},{key:"type",value:"IMAGE"},{key:["metadata",INIT],value:undefined}],permissions:["UPDATE"]}},
   {icon:"https://herbybow.github.io/Effect-Tracker/initiative/icon.svg",label:"Remove from Initiative",filter:{every:[{key:"layer",value:"CHARACTER",coordinator:"||"},{key:"layer",value:"MOUNT"},{key:"type",value:"IMAGE"}],permissions:["UPDATE"]}}
  ],onClick(c){OBR.scene.items.updateItems(c.items,sceneItems=>{const add=sceneItems.every(i=>i.metadata[INIT]===undefined);sceneItems.forEach((item,index)=>{if(add)item.metadata[INIT]={count:String(index),active:false};else delete item.metadata[INIT];});});}});
 },[]);
 async function nextTurn(){
  const sorted=[...items].sort((a,b)=>parseFloat(b.count)-parseFloat(a.count)); if(!sorted.length)return;
  const previous=sorted.find(i=>i.active), index=sorted.findIndex(i=>i.active), next=sorted[index<0?0:(index+1)%sorted.length];
  await OBR.scene.items.updateItems(sorted.map(i=>i.id),sceneItems=>{
   for(const item of sceneItems){
    const initiative=item.metadata[INIT]; if(!valid(initiative))continue;
    initiative.active=item.id===next.id;
    if(item.id===previous?.id&&item.id!==next.id){delete initiative.turnDamage;delete initiative.turnDamageByEffect;}
    if(item.id!==next.id)continue;
    const data=item.metadata[EFFECTS_NS], effects={...(data?.effects||{})};
    const damageByEffect:Partial<Record<EffectType,number>>={};
    const healingByEffect:Partial<Record<EffectType,number>>={};
    for(const effect of EFFECT_DEFS){
     const raw=effects[effect.type],list=Array.isArray(raw)?raw:(raw&&typeof raw==="object"?[raw]:[]);
     let damage=0;
     const remaining=list.map((b:any)=>{const charges=Math.max(0,Number(b.charges)||0),power=Math.max(0,Number(b.power)||Number(b.damage)||0);if(charges>0)damage+=power;return {...b,charges:Math.max(0,charges-1)};}).filter((b:any)=>b.charges>0);
     if(remaining.length)effects[effect.type]=remaining;else delete effects[effect.type];
     if(damage>0){if(effect.type==="regen")healingByEffect[effect.type]=damage;else damageByEffect[effect.type]=damage;}
    }
    const gelPower=Math.max(0,Number(effects.gel)||0);if(gelPower>0){const remainingGel=Math.max(0,gelPower-1);if(remainingGel>0)effects.gel=remainingGel;else delete effects.gel;}
    if(data?.effects)item.metadata[EFFECTS_NS]={...data,effects};
    const turnEffects={...damageByEffect,...healingByEffect};
    if(Object.keys(turnEffects).length){initiative.turnDamageByEffect=turnEffects;initiative.turnDamage=["bleed","poison","fire"].reduce((sum,type)=>sum-(damageByEffect[type as EffectType]||0),0)+(healingByEffect.regen||0);}else{delete initiative.turnDamageByEffect;delete initiative.turnDamage;}
   }
  });
 }
 function changeCount(id:string,value:string){setItems(old=>old.map(i=>i.id===id?{...i,count:value}:i));OBR.scene.items.updateItems([id],sceneItems=>sceneItems.forEach(item=>{const m=item.metadata[INIT];if(valid(m))m.count=value;}));}
 return <Stack height="100vh">
  <CardHeader title="Initiative" action={<IconButton aria-label="Next turn" onClick={nextTurn} disabled={!items.length}><SkipNextRounded/></IconButton>} titleTypographyProps={{sx:{fontSize:"1.125rem",fontWeight:"bold",lineHeight:"32px",color:"text.primary"}}}/>
  <Divider variant="middle"/>
  {!items.length&&<Typography variant="caption" sx={{px:2,py:1,color:"text.secondary"}}>Select a character to start initiative</Typography>}
  <Box sx={{overflowY:"auto"}}><List>{items.sort((a,b)=>parseFloat(b.count)-parseFloat(a.count)).map(item=>item.visible||role==="GM"?<ListItem key={item.id} divider selected={item.active} sx={{pr:2}} onDoubleClick={async()=>{await OBR.player.select([item.id]);const bounds=await OBR.scene.items.getItemBounds([item.id]);const center=await OBR.viewport.transformPoint(bounds.center);const w=await OBR.viewport.getWidth(),h=await OBR.viewport.getHeight();const rel=await OBR.viewport.inverseTransformPoint({x:center.x-w/2,y:center.y-h/2});const scale=await OBR.viewport.getScale();await OBR.viewport.animateTo({scale,position:{x:-rel.x*scale,y:-rel.y*scale}});}}>
   {!item.visible&&role==="GM"&&<VisibilityOffRounded fontSize="small" sx={{mr:1,opacity:.5}}/>}
   <ListItemText disableTypography sx={{width:"100%",minWidth:0,my:0}} primary={<Box sx={{display:"flex",flexDirection:"column",alignItems:"stretch",width:"100%",minWidth:0,gap:"3px"}}><Box sx={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",minWidth:0,gap:1}}><Typography component="span" sx={{fontWeight:600,lineHeight:1.25,whiteSpace:"normal",overflowWrap:"anywhere",minWidth:0,flex:1}}>{item.name}</Typography><Input disableUnderline sx={{width:42,flex:"0 0 42px"}} inputProps={{sx:{textAlign:"right",padding:"2px 0"}}} value={item.count} onChange={e=>changeCount(item.id,e.target.value)}/></Box><Box sx={{display:"flex",alignItems:"center",flexWrap:"nowrap",columnGap:"3px",minWidth:0,whiteSpace:"nowrap",overflow:"hidden"}}>{EFFECT_DEFS.filter(e=>!["mark","horror","shield"].includes(e.type)&&(item.activeEffects.includes(e.type)||!!item.turnDamageByEffect?.[e.type])).map(e=><Box key={e.type} sx={{display:"inline-flex",alignItems:"center",gap:"1px",flexShrink:0}}><img className={`initiative-effect-icon initiative-${e.type}`} src={`https://herbybow.github.io/Effect-Tracker/effects/${e.icon}`} alt={e.label}/>{!!item.turnDamageByEffect?.[e.type]&&<Typography component="span" className={`initiative-damage initiative-${e.type}`}>{e.type==="regen"?"+":e.type==="mark"||e.type==="shield"?"":"−"}{item.turnDamageByEffect[e.type]}</Typography>}</Box>)}</Box>{item.active&&item.turnDamageByEffect&&<Typography component="span" sx={{color:(item.turnDamage||0)<0?"#ff3030":"#39d66f",fontWeight:800,ml:0.75,whiteSpace:"nowrap"}}>{(item.turnDamage||0)>0?"+":""}{item.turnDamage||0}</Typography>}<Box sx={{display:"flex",alignItems:"center",flexWrap:"nowrap",columnGap:"5px",minWidth:0,whiteSpace:"nowrap",overflow:"hidden"}}>{VALUE_EFFECT_DEFS.filter(e=>e.type!=="gel"&&!!item.valueEffects[e.type]).map(e=><Box key={e.type} sx={{display:"inline-flex",alignItems:"center",gap:"2px",flexShrink:0}}><img className={`initiative-effect-icon initiative-${e.type}`} src={`https://herbybow.github.io/Effect-Tracker/effects/${e.icon}`} alt={e.label}/><Typography component="span" className={`initiative-value initiative-${e.type}`}>{item.active?item.valueEffects[e.type]:""}</Typography></Box>)}</Box><Box sx={{display:"flex",alignItems:"center",flexWrap:"nowrap",columnGap:"3px",minWidth:0,whiteSpace:"nowrap",overflow:"hidden"}}>{VALUE_EFFECT_DEFS.filter(e=>e.type==="gel"&&!!item.valueEffects[e.type]).map(e=><Box key={e.type} sx={{display:"inline-flex",alignItems:"center",gap:"2px",flexShrink:0}}><img className={`initiative-effect-icon initiative-${e.type}`} src={`https://herbybow.github.io/Effect-Tracker/effects/${e.icon}`} alt={e.label}/><Typography component="span" className={`initiative-value initiative-${e.type}`}>{item.valueEffects[e.type]}</Typography></Box>)}{EFFECT_DEFS.filter(e=>["mark","horror","shield"].includes(e.type)&&item.activeEffects.includes(e.type)).map(e=><Box key={e.type} sx={{display:"inline-flex",alignItems:"center",gap:"1px",flexShrink:0}}><img className={`initiative-effect-icon initiative-${e.type}`} src={`https://herbybow.github.io/Effect-Tracker/effects/${e.icon}`} alt={e.label}/>{e.type==="horror"?(item.active&&!!item.turnDamageByEffect?.[e.type]?<Typography component="span" className={`initiative-damage initiative-${e.type}`}>−{item.turnDamageByEffect[e.type]}</Typography>:null):<Typography component="span" className={`initiative-value initiative-${e.type}`}>{item.chargeCounts[e.type]||0}</Typography>}</Box>)}</Box></Box>}/>
  </ListItem>:null)}</List></Box>
 </Stack>;
}
function App(){const [ready,setReady]=useState(false);useEffect(()=>{OBR.scene.isReady().then(setReady);return OBR.scene.onReadyChange(setReady);},[]);return ready?<Tracker/>:<Typography sx={{p:2}}>Open a scene to use the initiative tracker</Typography>;}
OBR.onReady(()=>ReactDOM.createRoot(document.getElementById("root")!).render(<App/>));
