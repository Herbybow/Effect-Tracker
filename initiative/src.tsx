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
const EFFECTS="com.effect-tracker/data";
type EffectType="bleed"|"poison"|"fire";
const EFFECTS:{type:EffectType;icon:string;label:string}[]=[{type:"bleed",icon:"Bleed.svg",label:"Bleed"},{type:"poison",icon:"Poison.svg",label:"Poison"},{type:"fire",icon:"Fire.svg",label:"Fire"}];
type Entry={id:string;count:string;name:string;active:boolean;visible:boolean;activeEffects:EffectType[];turnDamageByEffect?:Partial<Record<EffectType,number>>;turnDamage?:number};
const valid=(v:any)=>v&&typeof v==="object"&&typeof v.count==="string"&&typeof v.active==="boolean";

function Tracker(){
 const [items,setItems]=useState<Entry[]>([]);
 const [role,setRole]=useState<"GM"|"PLAYER">("PLAYER");
 useEffect(()=>{OBR.player.getRole().then(setRole);return OBR.player.onChange((p:Player)=>setRole(p.role));},[]);
 useEffect(()=>{
  const refresh=(sceneItems:Item[])=>setItems(sceneItems.filter(isImage).flatMap(item=>{
   const m=item.metadata[INIT]; if(!valid(m))return [];
   const effectData=item.metadata[EFFECTS]?.effects||{};
   const activeEffects=EFFECTS.filter(e=>{const raw=effectData[e.type],list=Array.isArray(raw)?raw:(raw&&typeof raw==="object"?[raw]:[]);return list.some((b:any)=>(Number(b.charges)||0)>0);}).map(e=>e.type);
   const saved= m.turnDamageByEffect&&typeof m.turnDamageByEffect==="object"?m.turnDamageByEffect:undefined;
   return [{id:item.id,count:m.count,name:item.text.plainText||item.name,active:m.active,visible:item.visible,activeEffects,turnDamageByEffect:saved,turnDamage:typeof m.turnDamage==="number"?m.turnDamage:undefined}];
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
    const data=item.metadata[EFFECTS], effects={...(data?.effects||{})};
    const damageByEffect:Partial<Record<EffectType,number>>={};
    for(const effect of EFFECTS){
     const raw=effects[effect.type],list=Array.isArray(raw)?raw:(raw&&typeof raw==="object"?[raw]:[]);
     let damage=0;
     const remaining=list.map((b:any)=>{const charges=Math.max(0,Number(b.charges)||0),power=Math.max(0,Number(b.power)||Number(b.damage)||0);if(charges>0)damage+=power;return {...b,charges:Math.max(0,charges-1)};}).filter((b:any)=>b.charges>0);
     if(remaining.length)effects[effect.type]=remaining;else delete effects[effect.type];
     if(damage>0)damageByEffect[effect.type]=damage;
    }
    if(data?.effects)item.metadata[EFFECTS]={...data,effects};
    if(Object.keys(damageByEffect).length){initiative.turnDamageByEffect=damageByEffect;initiative.turnDamage=Object.values(damageByEffect).reduce((sum,n)=>sum+(n||0),0);}else{delete initiative.turnDamageByEffect;delete initiative.turnDamage;}
   }
  });
 }
 function changeCount(id:string,value:string){setItems(old=>old.map(i=>i.id===id?{...i,count:value}:i));OBR.scene.items.updateItems([id],sceneItems=>sceneItems.forEach(item=>{const m=item.metadata[INIT];if(valid(m))m.count=value;}));}
 return <Stack height="100vh">
  <CardHeader title="Initiative" action={<IconButton aria-label="Next turn" onClick={nextTurn} disabled={!items.length}><SkipNextRounded/></IconButton>} titleTypographyProps={{sx:{fontSize:"1.125rem",fontWeight:"bold",lineHeight:"32px",color:"text.primary"}}}/>
  <Divider variant="middle"/>
  {!items.length&&<Typography variant="caption" sx={{px:2,py:1,color:"text.secondary"}}>Select a character to start initiative</Typography>}
  <Box sx={{overflowY:"auto"}}><List>{items.sort((a,b)=>parseFloat(b.count)-parseFloat(a.count)).map(item=>item.visible||role==="GM"?<ListItem key={item.id} divider selected={item.active} sx={{pr:"64px"}} secondaryAction={<Input disableUnderline sx={{width:48}} inputProps={{sx:{textAlign:"right"}}} value={item.count} onChange={e=>changeCount(item.id,e.target.value)}/>} onDoubleClick={async()=>{await OBR.player.select([item.id]);const bounds=await OBR.scene.items.getItemBounds([item.id]);const center=await OBR.viewport.transformPoint(bounds.center);const w=await OBR.viewport.getWidth(),h=await OBR.viewport.getHeight();const rel=await OBR.viewport.inverseTransformPoint({x:center.x-w/2,y:center.y-h/2});const scale=await OBR.viewport.getScale();await OBR.viewport.animateTo({scale,position:{x:-rel.x*scale,y:-rel.y*scale}});}}>
   {!item.visible&&role==="GM"&&<VisibilityOffRounded fontSize="small" sx={{mr:1,opacity:.5}}/>}
   <ListItemText disableTypography sx={{width:"100%",minWidth:0}} primary={<Box sx={{display:"flex",alignItems:"center",width:"100%",minWidth:0,gap:1}}><Box sx={{display:"flex",alignItems:"center",gap:1,minWidth:0,flex:1}}><span>{item.name}</span>{EFFECTS.filter(e=>item.activeEffects.includes(e.type)||!!item.turnDamageByEffect?.[e.type]).map(e=><Box key={e.type} sx={{display:"inline-flex",alignItems:"center",gap:"2px",flexShrink:0}}><img className={`initiative-effect-icon initiative-${e.type}`} src={`https://herbybow.github.io/Effect-Tracker/effects/${e.icon}`} alt={e.label}/>{!!item.turnDamageByEffect?.[e.type]&&<Typography component="span" className={`initiative-damage initiative-${e.type}`}>−{item.turnDamageByEffect[e.type]}</Typography>}</Box>)}</Box>{!item.turnDamageByEffect&&!!item.turnDamage&&<Typography component="span" sx={{color:"#ff3030 !important",fontWeight:"800 !important",marginLeft:"auto",textAlign:"right",minWidth:34,flexShrink:0}}>−{item.turnDamage}</Typography>}</Box>}/>
  </ListItem>:null)}</List></Box>
 </Stack>;
}
function App(){const [ready,setReady]=useState(false);useEffect(()=>{OBR.scene.isReady().then(setReady);return OBR.scene.onReadyChange(setReady);},[]);return ready?<Tracker/>:<Typography sx={{p:2}}>Open a scene to use the initiative tracker</Typography>;}
OBR.onReady(()=>ReactDOM.createRoot(document.getElementById("root")!).render(<App/>));
