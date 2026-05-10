import { useState, useEffect, useCallback, useRef } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const DEF_CATS = ["🛒 מזון","🍽️ מסעדות","🏠 בית","👕 ביגוד","🚗 רכב","💊 בריאות",
  "🎮 פנאי","📚 חינוך","✈️ נסיעות","🔧 תחזוקה","💡 חשבונות","🎁 מתנות","📦 אחר"];
const CAT_ICONS = ["🛒","🍽️","🏠","👕","🚗","💊","🎮","📚","✈️","🔧","💡","🎁","📦",
  "🏋️","🐾","🍺","🎭","🧴","👶","🎓","🏥","🍕","💈","🛵","🧹","🛍️","📱","🎂","🎻"];
const MHE = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const CLR = ["#6C63FF","#4ECDC4","#FFE66D","#FF8B94","#85C1E9","#A8E6CF","#F0B27A","#C39BD3","#82E0AA","#FAD7A0","#FF6B6B","#7FB3D3"];
const SAV_ICONS = ["🎯","🏖️","🚗","🏠","💻","✈️","💍","🎓","🐶","🎮","🍕","🎸","⛵","🏔️","🎪"];
const THEMES = [
  {l:"🌑 כהה",  bg:"#0F0F1A",text:"#ffffff",accent:"#6C63FF"},
  {l:"🌊 כחול", bg:"#0A1628",text:"#E8F4FD",accent:"#4ECDC4"},
  {l:"☀️ בהיר", bg:"#F5F7FA",text:"#111111",accent:"#6C63FF"},
  {l:"🌸 ורוד",  bg:"#1A0F18",text:"#ffffff",accent:"#FF8B94"},
];
const MAX_B = 100000;
const LS_PROF = "bp_STABLE_profile";
const LS_HH   = "bp_STABLE_household";
const OLD_KEYS = ["bpv6_profile","bpv7_profile","bp_prof_v5","bpv5_profile","bpv6_household","bpv7_household"];

// ─── Utils ────────────────────────────────────────────────────────────────────
const uid  = () => `${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
function lsGet(k,def){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):def; }catch{ return def; } }
function lsSet(k,v)  { try{ localStorage.setItem(k,JSON.stringify(v)); }catch{} }
function migrateLS(){
  if(!localStorage.getItem(LS_PROF)) for(const k of ["bpv6_profile","bpv7_profile","bp_prof_v5"]){ const v=localStorage.getItem(k); if(v){localStorage.setItem(LS_PROF,v);break;} }
  if(!localStorage.getItem(LS_HH))   for(const k of ["bpv6_household","bpv7_household","bp_hh_v5"]){ const v=localStorage.getItem(k); if(v){localStorage.setItem(LS_HH,v);break;} }
}
function getPK(date,rd=1){
  const d=new Date(date),day=d.getDate();
  let y=d.getFullYear(),m=d.getMonth();
  if(day<rd){m--;if(m<0){m=11;y--;}}
  return `${y}-${String(m+1).padStart(2,"0")}`;
}
function getPL(key,rd=1){
  if(!key) return "";
  const [y,ms]=key.split("-"),m=parseInt(ms)-1;
  if(rd===1) return `${MHE[m]} ${y}`;
  let em=m+1,ey=parseInt(y); if(em>11){em=0;ey++;}
  return `${rd} ${MHE[m]} – ${rd-1} ${MHE[em]} ${ey}`;
}
function offPK(key,n){
  const [y,ms]=key.split("-");
  const d=new Date(parseInt(y),parseInt(ms)-1-n,1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function addMonths(dateStr,n){
  const d=new Date(dateStr); d.setMonth(d.getMonth()+n); return d.toISOString().split("T")[0];
}
function isDark(c){ try{const h=c.replace("#","");return(parseInt(h.slice(0,2),16)*299+parseInt(h.slice(2,4),16)*587+parseInt(h.slice(4,6),16)*114)/1e3<128;}catch{return true;} }
function pkCompare(a,b){ return a<b?-1:a>b?1:0; }

// ─── Firebase ─────────────────────────────────────────────────────────────────
async function fbRead(url){
  try{ const r=await fetch(`${url}/household.json`,{cache:"no-store"}); if(!r.ok) return{ok:false,status:r.status}; return{ok:true,data:await r.json()}; }
  catch(e){ return{ok:false,error:e.message}; }
}
async function fbWrite(url,data){
  try{ const r=await fetch(`${url}/household.json`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)}); return{ok:r.ok}; }
  catch(e){ return{ok:false}; }
}
async function ntfy(ch,title,body,pri="default"){
  if(!ch) return;
  try{ await fetch(`https://ntfy.sh/${encodeURIComponent(ch.trim())}`,{method:"POST",headers:{"Title":title,"Priority":pri,"Tags":"moneybag","Content-Type":"text/plain;charset=utf-8"},body}); }catch{}
}
function canNotify(){ return "Notification" in window; }
async function askNotif(){ if(!canNotify()) return "unsupported"; if(Notification.permission==="granted") return "granted"; return await Notification.requestPermission(); }
function fireNotif(title,body){ if(!canNotify()||Notification.permission!=="granted") return; try{new Notification(title,{body,icon:"https://cdn.jsdelivr.net/npm/twemoji@14/assets/72x72/1f4b0.png"});}catch{} }

// ─── Defaults ─────────────────────────────────────────────────────────────────
const DEF_HH={accounts:[{id:"acc1",name:"כללי",icon:"🏠",resetDay:1}],data:{acc1:{defaultBudget:0,months:{},expenses:[],savings:[],recurring:[]}},cats:[...DEF_CATS]};
const DEF_S={fontSize:"medium",bg:"#0F0F1A",text:"#ffffff",accent:"#6C63FF",resetDay:1,reminder:false,reminderHour:21,reminderMin:0,reminderLang:"he",partnerNotif:true,ntfyChannel:""};

// ─── Budget helpers ────────────────────────────────────────────────────────────
// getBudget: returns base budget for a period (defaultBudget unless overridden)
function getBudget(accData,key){ return accData.months?.[key]?.budget ?? accData.defaultBudget ?? 0; }
// getTotal: base budget + any extras added for that specific month
function getTotalBudget(accData,key){ return getBudget(accData,key) + (accData.months?.[key]?.extra||0); }

// ══════════════════════════════════════════════════════════════════════════════
export default function App(){
  const [prof,  setProf_] = useState(null);
  const [hh,    setHH_]   = useState(DEF_HH);
  const [syncing,setSy]   = useState(false);
  const [syncOk, setSyOk] = useState(true);
  const [view,  setView]  = useState("home");
  const [toast, setToa]   = useState(null);
  const [sect,  setSect]  = useState("profile");
  const [hOff,  setHOff]  = useState(0); // period offset: 0=current, +1=past, -1=future

  // Onboarding
  const [oStep,setOS]=useState(0);const [oName,setON]=useState("");const [oDay,setOD]=useState(1);const [oUrl,setOU]=useState("");

  // Tutorial
  const [showTut,setShowTut]=useState(false);const [tutI,setTutI]=useState(0);

  // Modals
  const [editExp,setEditExp]=useState(null);
  const [showReset,setShowReset]=useState(false);
  const [showAddAcc,setShowAddAcc]=useState(false);
  const [newAcc,setNewAcc]=useState({name:"",icon:"💼",resetDay:1,dbUrl:"",initBudget:""});
  const [editAcc,setEditAcc]=useState(null);
  const [depG,setDepG]=useState(null);const [depA,setDepA]=useState("");
  const [wdG, setWdG] =useState(null);const [wdA,  setWdA] =useState("");
  const [showXfer,setShowXfer]=useState(false);const [xG,setXG]=useState("");const [xA,setXA]=useState("");
  const [showEOM,setShowEOM]=useState(false);const [eomMode,setEomMode]=useState("");const [eomSav,setEomSav]=useState("");
  const [delGC,setDelGC]=useState(null);
  const [rdConfirm,setRdConfirm]=useState(null);
  const [showRecurring,setShowRecurring]=useState(false);

  // Forms
  const TOD=new Date().toISOString().split("T")[0];
  const [ef,setEF]=useState({amt:"",cat:DEF_CATS[0],biz:"",note:"",date:TOD,inst:1,recurring:false,recM:12});
  const [budVal,setBV]=useState("");const [extraVal,setEV]=useState("");

  // Savings form
  const [svN,setSvN]=useState("");const [svT,setSvT]=useState("");const [svI,setSvI]=useState("🎯");

  // Analysis
  const [anM,setAnM]=useState(3);const [anCat,setAnCat]=useState("הכל");

  // Settings
  const [nCI,setNCI]=useState("🛒");const [nCN,setNCN]=useState("");
  const [sUrl,setSUrl]=useState("");const [jUrl,setJUrl]=useState("");const [sMsg,setSMsg]=useState("");

  // Export
  const [expMonths,setExpMonths]=useState(new Set());const [showExpPicker,setShowExpPicker]=useState(false);

  const TODAY=new Date();
  const knownIds=useRef(new Set());
  const remTimers=useRef([]);
  const saveProf=useCallback(p=>{lsSet(LS_PROF,p);setProf_(p);},[]);

  // ── Reminder ────────────────────────────────────────────────────────────────
  function remMsg(lang="he"){
    const m={he:["האם עדכנת את ההוצאות שלך היום? 💰","זכור לרשום את ההוצאות! 📝","זמן לעדכן תקציב! ⏰"],en:["Did you update your expenses today? 💰","Don't forget to log your spending! 📝"],ar:["هل سجلت مصاريفك اليوم؟ 💰","لا تنسَ تسجيل النفقات! 📝"]};
    const a=m[lang]||m.he; return a[Math.floor(Math.random()*a.length)];
  }
  function schedRem(s){
    remTimers.current.forEach(t=>clearTimeout(t));remTimers.current=[];
    if(!s.reminder||!canNotify()||Notification.permission!=="granted") return;
    const now=new Date(),fire=new Date(now);fire.setHours(s.reminderHour||21,s.reminderMin||0,0,0);
    if(fire<=now) fire.setDate(fire.getDate()+1);
    const lang=s.reminderLang||"he",titles={he:"תזכורת עדכון הוצאות",en:"Expense Reminder",ar:"تذكير المصاريف"};
    const t=setTimeout(()=>{
      fireNotif(titles[lang],remMsg(lang)); ntfy(s.ntfyChannel,titles[lang],remMsg(lang));
      schedRem(s);
    },fire-now);
    remTimers.current=[t];
  }

  // ── Init ────────────────────────────────────────────────────────────────────
  useEffect(()=>{
    migrateLS();
    const p=lsGet(LS_PROF,null);
    if(p?.onboarded){
      setProf_(p);setSUrl(p.dbUrl||"");
      const c=lsGet(LS_HH,DEF_HH);setHH_(c);
      knownIds.current=new Set((c.data?.[p.accId||"acc1"]?.expenses||[]).map(e=>e.id));
      if(p.dbUrl) pullCloud(p.dbUrl,p,false); else setSyOk(false);
      if(p.settings) schedRem(p.settings);
    } else { setProf_({name:"",dbUrl:"",accId:"acc1",onboarded:false,settings:{...DEF_S},eomSeen:{}}); }
    return()=>remTimers.current.forEach(t=>clearTimeout(t));
  },[]);

  // ── Cloud ───────────────────────────────────────────────────────────────────
  async function pullCloud(url,p,notify=true){
    if(!url){setSyOk(false);return;}
    setSy(true); const res=await fbRead(url); setSy(false);
    if(res.ok&&res.data){
      setSyOk(true);
      const m={...DEF_HH,...res.data,cats:res.data.cats||DEF_CATS,accounts:res.data.accounts||DEF_HH.accounts,data:res.data.data||DEF_HH.data};
      lsSet(LS_HH,m);setHH_(m);
      if(notify&&p) checkPartnerExp(m,p);
      if(p) checkEOM(p,m);
    } else { setSyOk(false); }
  }
  function checkPartnerExp(nh,p){
    if(!p.settings?.partnerNotif) return;
    const exps=nh.data?.[p.accId||"acc1"]?.expenses||[];
    const news=exps.filter(e=>!knownIds.current.has(e.id)&&e.by&&e.by!==p.name);
    if(news.length>0){
      const e=news[0],title=`הוצאה חדשה מ-${e.by} 💳`,body=`₪${e.amount.toLocaleString()} · ${e.cat}${e.biz?" · "+e.biz:""}`;
      fireNotif(title,body);ntfy(p.settings?.ntfyChannel,title,body,"high");
    }
    exps.forEach(e=>knownIds.current.add(e.id));
  }
  const saveHH=useCallback(async(nh,url)=>{
    lsSet(LS_HH,nh);setHH_(nh);
    if(!url){setSyOk(false);return;}
    setSy(true); const r=await fbWrite(url,nh); setSy(false); setSyOk(r.ok);
    if(!r.ok) toast2("נשמר מקומית · בעיית חיבור","warn");
  },[]);
  useEffect(()=>{
    if(!prof?.dbUrl||!prof?.onboarded) return;
    const id=setInterval(()=>pullCloud(prof.dbUrl,prof,true),12000);
    return()=>clearInterval(id);
  },[prof?.dbUrl,prof?.onboarded]);

  function toast2(msg,type="ok"){setToa({msg,type});setTimeout(()=>setToa(null),3200);}
  function checkEOM(p,h){
    const aId=p.accId||"acc1",ad=h.data?.[aId]||{};
    const rd=p.settings?.resetDay||1,prevKey=offPK(getPK(TODAY,rd),1);
    const pb=getTotalBudget(ad,prevKey); if(pb===0) return;
    const flag=`eom_${prevKey}`; if(p.eomSeen?.[flag]) return;
    const ps=(ad.expenses||[]).filter(e=>e.mKey===prevKey).reduce((s,e)=>s+e.amount,0);
    if(Math.abs(pb-ps)>5){setEomMode((pb-ps)>=0?"positive":"negative");setShowEOM(true);saveProf({...p,eomSeen:{...(p.eomSeen||{}),[flag]:true}});}
  }

  if(!prof) return <div style={{background:"#0F0F1A",minHeight:"100dvh",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontFamily:"sans-serif",fontSize:18}}>טוען...</div>;

  // ── Derived ─────────────────────────────────────────────────────────────────
  const accId    = prof.accId||"acc1";
  const acc_obj  = (hh.accounts||[]).find(a=>a.id===accId);
  const accData  = hh.data?.[accId]||{defaultBudget:0,months:{},expenses:[],savings:[],recurring:[]};
  const cats     = hh.cats||DEF_CATS;
  const s        = prof.settings||DEF_S;
  const rd       = acc_obj?.resetDay||s.resetDay||1;
  const zoom     = {small:0.88,medium:1,large:1.14}[s.fontSize]||1;
  const bg=s.bg||"#0F0F1A",tc=s.text||"#fff",acc=s.accent||"#6C63FF";
  const dark=isDark(bg);
  const cb  = dark?"rgba(255,255,255,0.05)":"rgba(0,0,0,0.05)";
  const cbr = dark?"rgba(255,255,255,0.1)" :"rgba(0,0,0,0.12)";
  const sub = dark?"#888":"#666";
  const sBg = dark?"#1a1a2e":"#ffffff";

  const CK  = getPK(TODAY,rd);             // current period key
  const VK  = offPK(CK,-hOff);            // viewed period key (hOff<0 = future, >0 = past)
  const PK  = offPK(CK,1);                // prev period key
  const isFuturePeriod = hOff<0;
  const isPastPeriod   = hOff>0;

  const totalBud = getTotalBudget(accData,VK);
  const allExp   = accData.expenses||[];
  const viewExp  = allExp.filter(e=>e.mKey===VK);
  const spent    = viewExp.reduce((s,e)=>s+e.amount,0);
  const rem      = totalBud-spent;
  const pct      = totalBud>0?Math.min(100,(spent/totalBud)*100):0;
  const savings  = accData.savings||[];
  const recurring= accData.recurring||[];
  const catSum   = {};viewExp.forEach(e=>{catSum[e.cat]=(catSum[e.cat]||0)+e.amount;});
  const prevBud  = getTotalBudget(accData,PK);
  const prevSpent= allExp.filter(e=>e.mKey===PK).reduce((s,e)=>s+e.amount,0);
  const prevRem  = prevBud-prevSpent;
  const futureExp= allExp.filter(e=>e.date>TOD&&e.mKey!==VK);

  const css=`
    @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;600;700;800&display=swap');
    html,body,#root{margin:0;padding:0;width:100%;background:${bg};}
    *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
    input,select,button,textarea{font-family:'Heebo',sans-serif;}
    ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#444;border-radius:4px}
    .card{background:${cb};border:1px solid ${cbr};border-radius:18px}
    .btn{background:linear-gradient(135deg,${acc},#4ECDC4);border:none;color:#fff;font-family:'Heebo',sans-serif;font-weight:700;border-radius:12px;cursor:pointer;transition:transform .15s;outline:none}
    .btn:active{transform:scale(.96)}
    .inp{width:100%;padding:10px 14px;border-radius:12px;border:1px solid ${cbr};background:${dark?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.05)"};color:${tc};font-size:16px;outline:none;-webkit-appearance:none;direction:rtl}
    .inp:focus{border-color:${acc}}
    .sel{width:100%;padding:10px 14px;border-radius:12px;border:1px solid ${cbr};background:${sBg};color:#111;font-size:15px;outline:none;direction:rtl;font-family:'Heebo',sans-serif;}
    .seg{border:1px solid ${cbr};background:transparent;color:${sub};cursor:pointer;font-family:'Heebo',sans-serif;font-weight:700;border-radius:10px;padding:8px 0;transition:all .15s;outline:none}
    .seg.on{border-color:${acc};background:${acc}33;color:${tc}}
    .tog{width:48px;height:26px;border-radius:50px;cursor:pointer;position:relative;transition:background .2s;flex-shrink:0}
    .tog .kn{position:absolute;top:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:left .2s;box-shadow:0 1px 4px rgba(0,0,0,0.3)}
    .ov{position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:900;display:flex;align-items:flex-end;justify-content:center;padding:0}
    .erow{display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid ${cbr};cursor:pointer}
  `;

  const doSave=async(nh)=>await saveHH(nh,prof.dbUrl);

  // ── Tog / BottomSheet ───────────────────────────────────────────────────────
  const Tog=({on,onChange})=>(<div onClick={onChange} className="tog" style={{background:on?acc:dark?"rgba(255,255,255,0.15)":"rgba(0,0,0,0.15)"}}><div className="kn" style={{left:on?"25px":"3px"}}/></div>);
  const BS=({children,onClose})=>(
    <div className="ov" onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:dark?"#1a1a2e":"#f0f0f5",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:440,padding:24,maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{width:40,height:4,background:cbr,borderRadius:2,margin:"0 auto 18px"}}/>
        {children}
      </div>
    </div>
  );

  // ── Period nav ──────────────────────────────────────────────────────────────
  const PNav=()=>(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:14,marginBottom:14}}>
      <button onClick={()=>setHOff(h=>h+1)} style={{background:"none",border:`1px solid ${cbr}`,color:tc,borderRadius:10,padding:"5px 14px",cursor:"pointer",fontSize:18,fontFamily:"Heebo"}}>‹</button>
      <div style={{textAlign:"center",minWidth:140}}>
        <div style={{fontSize:13,fontWeight:700}}>{getPL(VK,rd)}</div>
        {isFuturePeriod&&<div style={{fontSize:10,color:"#85C1E9"}}>📅 תקופה עתידית</div>}
        {isPastPeriod&&<div style={{fontSize:10,color:"#FFE66D"}}>🕐 תקופה קודמת</div>}
        {hOff===0&&<div style={{fontSize:10,color:"#4ECDC4"}}>● נוכחי</div>}
      </div>
      <button onClick={()=>setHOff(h=>h-1)}
        style={{background:"none",border:`1px solid ${hOff===0?cbr:acc}`,color:hOff===0?sub:acc,borderRadius:10,padding:"5px 14px",cursor:hOff===0?"default":"pointer",fontSize:18,fontFamily:"Heebo",opacity:hOff===0?0.4:1}}>›</button>
    </div>
  );

  // ── Expense handlers ────────────────────────────────────────────────────────
  async function addExp(){
    const v=parseFloat(ef.amt);if(!v||v<=0){toast2("הכנס סכום","err");return;}
    const newExps=[];
    if(ef.recurring){
      const rId=uid(),months=Math.max(1,parseInt(ef.recM)||12);
      const tpl={id:rId,amount:v,cat:ef.cat,biz:ef.biz.trim(),note:ef.note.trim(),startDate:ef.date,months,by:prof.name,active:true};
      for(let i=0;i<months;i++){
        const d=addMonths(ef.date,i),pk=getPK(new Date(d),rd);
        newExps.push({id:uid(),amount:v,cat:ef.cat,biz:ef.biz.trim(),note:`${ef.note.trim()} (${i+1}/${months})`.trim(),date:d,mKey:pk,by:prof.name,ts:Date.now(),recurringId:rId,rIdx:i+1,rTotal:months});
      }
      const nh={...hh,data:{...hh.data,[accId]:{...accData,expenses:[...allExp,...newExps],recurring:[...recurring,tpl]}}};
      await doSave(nh);toast2(`הוצאה קבועה ל-${months} חודשים 🔄`);
    } else if(ef.inst>1){
      const per=Math.round((v/ef.inst)*100)/100,iId=uid();
      for(let i=0;i<ef.inst;i++){
        const d=addMonths(ef.date,i),pk=getPK(new Date(d),rd);
        newExps.push({id:uid(),amount:per,cat:ef.cat,biz:ef.biz.trim(),note:`${ef.note.trim()} (${i+1}/${ef.inst})`.trim(),date:d,mKey:pk,by:prof.name,ts:Date.now(),iId,iIdx:i+1,iTotal:ef.inst,iSum:v});
      }
      const nh={...hh,data:{...hh.data,[accId]:{...accData,expenses:[...allExp,...newExps]}}};
      await doSave(nh);toast2(`${ef.inst} תשלומים × ₪${per.toLocaleString()} ✅`);
    } else {
      const pk=getPK(new Date(ef.date),rd),isFut=ef.date>TOD;
      const exp={id:uid(),amount:v,cat:ef.cat,biz:ef.biz.trim(),note:ef.note.trim(),date:ef.date,mKey:pk,by:prof.name,ts:Date.now(),future:isFut};
      knownIds.current.add(exp.id);
      await doSave({...hh,data:{...hh.data,[accId]:{...accData,expenses:[...allExp,exp]}}});
      toast2(isFut?`הוצאה עתידית ל-${getPL(pk,rd)} 📅`:"הוצאה נרשמה ✅");
    }
    setEF({amt:"",cat:cats[0],biz:"",note:"",date:TOD,inst:1,recurring:false,recM:12});
    setView("home");
  }
  async function saveEditExp(){
    if(!editExp) return;
    const v=parseFloat(editExp.amt??editExp.amount);if(!v||v<=0){toast2("הכנס סכום","err");return;}
    const pk=getPK(new Date(editExp.date),rd);
    const upd={...editExp,amount:v,mKey:pk,biz:(editExp.biz||"").trim(),note:(editExp.note||"").trim()};
    await doSave({...hh,data:{...hh.data,[accId]:{...accData,expenses:allExp.map(e=>e.id===upd.id?upd:e)}}});
    setEditExp(null);toast2("עודכן ✏️");
  }
  async function delExp(id){
    await doSave({...hh,data:{...hh.data,[accId]:{...accData,expenses:allExp.filter(e=>e.id!==id)}}});
  }
  async function delInstGroup(iId){
    await doSave({...hh,data:{...hh.data,[accId]:{...accData,expenses:allExp.filter(e=>e.iId!==iId)}}});
    toast2("כל התשלומים נמחקו");
  }
  async function stopRec(rId){
    const filtered=allExp.filter(e=>!(e.recurringId===rId&&e.date>TOD));
    const newRec=recurring.map(r=>r.id===rId?{...r,active:false}:r);
    await doSave({...hh,data:{...hh.data,[accId]:{...accData,expenses:filtered,recurring:newRec}}});
    toast2("הוצאה קבועה הופסקה");
  }
  async function delRec(rId){
    await doSave({...hh,data:{...hh.data,[accId]:{...accData,expenses:allExp.filter(e=>e.recurringId!==rId),recurring:recurring.filter(r=>r.id!==rId)}}});
    toast2("הוצאה קבועה נמחקה");
  }

  // ── Budget handlers ─────────────────────────────────────────────────────────
  // "קבע תקציב" = sets defaultBudget (applies to all months from now on)
  // also stores override for VK specifically
  async function setBudget(){
    const v=Math.min(MAX_B,parseFloat(budVal)||0);if(v<=0)return;
    const nh={...hh,data:{...hh.data,[accId]:{...accData,defaultBudget:v,
      months:{...accData.months,[VK]:{...(accData.months?.[VK]||{}),budget:v,extra:0}}
    }}};
    await doSave(nh);setBV("");setView("home");toast2("תקציב נקבע 🎯");
  }
  // "הוסף לתקציב" = adds extra ONLY to viewed month
  async function addExtra(){
    const v=parseFloat(extraVal)||0;
    if(v<=0||(totalBud+v>MAX_B)){toast2(`מקסימום ₪${MAX_B.toLocaleString()}!`,"err");return;}
    const mo=accData.months?.[VK]||{};
    const nh={...hh,data:{...hh.data,[accId]:{...accData,
      months:{...accData.months,[VK]:{...mo,extra:(mo.extra||0)+v}}
    }}};
    await doSave(nh);setEV("");setView("home");toast2(`נוספו ₪${v.toLocaleString()} לחודש זה 💰`);
  }
  async function clearBudget(){
    const mo=accData.months?.[VK]||{};
    await doSave({...hh,data:{...hh.data,[accId]:{...accData,months:{...accData.months,[VK]:{...mo,budget:undefined,extra:0}}}}});
    setView("home");toast2("תקציב אופס");
  }
  async function changeRD(nd){
    const remapped=allExp.map(e=>({...e,mKey:getPK(new Date(e.date),nd)}));
    await saveHH({...hh,data:{...hh.data,[accId]:{...accData,expenses:remapped}}},prof.dbUrl);
    saveProf({...prof,settings:{...s,resetDay:nd}});
    setRdConfirm(null);toast2(`יום איפוס שונה ל-${nd} ✅`);
  }

  // ── Savings ─────────────────────────────────────────────────────────────────
  async function addSav(){
    if(!svN.trim()||!svT){toast2("מלא שם וסכום","err");return;}
    const g={id:uid(),name:svN.trim(),target:parseFloat(svT),saved:0,icon:svI,deposits:[]};
    await doSave({...hh,data:{...hh.data,[accId]:{...accData,savings:[...savings,g]}}});
    setSvN("");setSvT("");toast2("יעד נוסף 🎯");
  }
  async function deposit(){
    const v=parseFloat(depA);if(!v||!depG)return;
    await doSave({...hh,data:{...hh.data,[accId]:{...accData,savings:savings.map(g=>g.id===depG?{...g,saved:(g.saved||0)+v,deposits:[...(g.deposits||[]),{id:uid(),amount:v,date:TOD}]}:g)}}});
    setDepG(null);setDepA("");toast2("חיסכון עודכן 💚");
  }
  async function withdraw(){
    const v=parseFloat(wdA),g=savings.find(x=>x.id===wdG);
    if(!v||!g||v>(g.saved||0)){toast2("אין מספיק בחיסכון","err");return;}
    await doSave({...hh,data:{...hh.data,[accId]:{...accData,savings:savings.map(g2=>g2.id===wdG?{...g2,saved:(g2.saved||0)-v}:g2)}}});
    setWdG(null);setWdA("");toast2("משיכה בוצעה 💸");
  }
  async function doXfer(){
    const v=parseFloat(xA)||0;if(!v||!xG){toast2("בחר יעד וסכום","err");return;}if(v>rem){toast2("אין מספיק יתרה!","err");return;}
    const exp={id:uid(),amount:v,cat:"🎯 חיסכון",biz:"",note:"העברה לחיסכון",date:TOD,mKey:VK,by:prof.name,transfer:true,ts:Date.now()};
    knownIds.current.add(exp.id);
    const nh={...hh,data:{...hh.data,[accId]:{...accData,expenses:[...allExp,exp],savings:savings.map(g=>g.id===xG?{...g,saved:(g.saved||0)+v,deposits:[...(g.deposits||[]),{id:uid(),amount:v,date:TOD}]}:g)}}};
    await doSave(nh);setShowXfer(false);setXG("");setXA("");toast2(`₪${v.toLocaleString()} הועבר לחיסכון 🎯`);
  }

  // ── Accounts ─────────────────────────────────────────────────────────────────
  async function doAddAcc(){
    if(!newAcc.name.trim())return;
    const id=uid();
    const a={id,name:newAcc.name.trim(),icon:newAcc.icon,resetDay:newAcc.resetDay,dbUrl:(newAcc.dbUrl||"").trim()||null};
    const initBud=parseFloat(newAcc.initBudget)||0;
    const nh={...hh,accounts:[...(hh.accounts||[]),a],data:{...hh.data,[id]:{defaultBudget:initBud,months:{},expenses:[],savings:[],recurring:[]}}};
    await doSave(nh);setShowAddAcc(false);setNewAcc({name:"",icon:"💼",resetDay:1,dbUrl:"",initBudget:""});toast2("חשבון נוסף");
  }
  async function saveEditAcc(){
    if(!editAcc?.name?.trim())return;
    const nh={...hh,accounts:(hh.accounts||[]).map(a=>a.id===editAcc.id?{...a,...editAcc}:a)};
    await doSave(nh);setEditAcc(null);toast2("חשבון עודכן");
  }
  async function delAcc(id){
    if((hh.accounts||[]).length<=1){toast2("לא ניתן למחוק את החשבון האחרון","err");return;}
    const nh={...hh,accounts:(hh.accounts||[]).filter(a=>a.id!==id)};
    await doSave(nh);if(id===accId) saveProf({...prof,accId:nh.accounts[0]?.id||"acc1"});toast2("חשבון נמחק");
  }

  // ── EOM ─────────────────────────────────────────────────────────────────────
  async function eomToNext(){
    const sign=eomMode==="positive"?1:-1,amt=Math.abs(prevRem);
    const cm=accData.months?.[CK]||{},nh={...hh,data:{...hh.data,[accId]:{...accData,months:{...accData.months,[CK]:{...cm,extra:(cm.extra||0)+sign*amt}}}}};
    await doSave(nh);setShowEOM(false);toast2(eomMode==="positive"?`₪${amt.toLocaleString()} עברו 🎉`:`מינוס ₪${amt.toLocaleString()} עבר`);
  }
  async function eomToSav(){
    const amt=Math.abs(prevRem);if(!eomSav){toast2("בחר יעד","err");return;}
    const nh={...hh,data:{...hh.data,[accId]:{...accData,savings:savings.map(g=>g.id===eomSav?{...g,saved:(g.saved||0)+amt,deposits:[...(g.deposits||[]),{id:uid(),amount:amt,date:TOD}]}:g)}}};
    await doSave(nh);setShowEOM(false);toast2(`₪${amt.toLocaleString()} עברו לחיסכון 🎯`);
  }

  // ── Cats ─────────────────────────────────────────────────────────────────────
  async function addCat(){
    const n=nCN.trim();if(!n)return;const full=`${nCI} ${n}`;
    if(cats.includes(full)){toast2("קיים","err");return;}
    await doSave({...hh,cats:[...cats,full]});setNCN("");toast2("נוסף");
  }

  // ── Export ───────────────────────────────────────────────────────────────────
  // Build list of all period keys that have expenses
  function allPKs(){
    const keys=new Set(allExp.map(e=>e.mKey));
    // also add last 12 months
    for(let i=0;i<12;i++) keys.add(offPK(CK,i));
    return [...keys].sort(pkCompare);
  }

  function getExportExps(){
    if(expMonths.size===0) return allExp;
    return allExp.filter(e=>expMonths.has(e.mKey));
  }

  function exportCSV(){
    const exps=[...getExportExps()].sort((a,b)=>a.date>b.date?1:-1);
    const bom="\uFEFF";
    const hdr=["תאריך","קטגוריה","בית עסק","הערה","סכום","הוסף על ידי","תקופה","סוג"];
    const rows=exps.map(e=>[e.date,e.cat,e.biz||"",e.note||"",e.amount,e.by||"",getPL(e.mKey,rd),e.iId?"תשלומים":e.recurringId?"קבוע":e.future?"עתידי":"רגיל"]);
    const csv=bom+[hdr,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\r\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;
    a.download=`הוצאות_${acc_obj?.name||"כללי"}_${TOD}.csv`;
    document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
    toast2("📊 קובץ Excel הורד!");
  }

  function exportPDF(){
    const exps=[...getExportExps()].sort((a,b)=>a.date>b.date?1:-1);
    const total=exps.reduce((s,e)=>s+e.amount,0);
    const byP={};exps.forEach(e=>{if(!byP[e.mKey])byP[e.mKey]=[];byP[e.mKey].push(e);});
    const catTot={};exps.forEach(e=>{catTot[e.cat]=(catTot[e.cat]||0)+e.amount;});

    const periodRows=Object.keys(byP).sort().map(k=>{
      const pt=byP[k].reduce((s,e)=>s+e.amount,0);
      const er=byP[k].map(e=>`<tr><td>${e.date}</td><td>${e.cat}</td><td>${e.biz||""}</td><td>${e.note||""}</td><td style="text-align:left;font-weight:600">₪${Number(e.amount).toLocaleString()}</td><td>${e.by||""}</td></tr>`).join("");
      return `<tr class="ph"><td colspan="5"><b>${getPL(k,rd)}</b></td><td style="text-align:left;font-weight:700">₪${pt.toLocaleString()}</td></tr>${er}`;
    }).join("");
    const catRows=Object.entries(catTot).sort((a,b)=>b[1]-a[1]).map(([c,v])=>`<tr><td>${c}</td><td>₪${v.toLocaleString()}</td><td>${Math.round((v/total)*100)}%</td></tr>`).join("");

    const html=`<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"><title>דוח הוצאות</title>
<style>
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{margin:15mm}}
body{font-family:Arial,sans-serif;direction:rtl;padding:20px;color:#222;font-size:13px}
.hdr{background:linear-gradient(135deg,#6C63FF,#4ECDC4);color:#fff;padding:16px 20px;border-radius:10px;margin-bottom:16px}
.hdr h1{margin:0 0 4px;font-size:20px}.hdr .sub{opacity:.9;font-size:12px}
.stats{display:flex;gap:10px;margin-bottom:16px}
.stat{flex:1;background:#f5f5f5;border:1px solid #e0e0e0;border-radius:8px;padding:10px;text-align:center}
.stat .v{font-size:18px;font-weight:800;color:#6C63FF}.stat .l{font-size:10px;color:#888}
table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px}
th{background:#f0f0f8;padding:7px 8px;text-align:right;border-bottom:2px solid #ddd;color:#333}
td{padding:6px 8px;border-bottom:1px solid #eee;color:#333}
.ph{background:#e8eaf0}.ph td{padding:8px;font-size:13px;color:#333}
.sec{font-size:14px;font-weight:800;margin:16px 0 8px;border-right:4px solid #6C63FF;padding-right:8px;color:#333}
</style></head><body>
<div class="hdr"><h1>📊 דוח הוצאות — ${acc_obj?.name||"כללי"}</h1>
<div class="sub">נוצר: ${new Date().toLocaleDateString("he-IL")} | ${exps.length} הוצאות${expMonths.size>0?` | ${expMonths.size} חודשים נבחרו`:""}</div></div>
<div class="stats">
<div class="stat"><div class="v">₪${total.toLocaleString()}</div><div class="l">סה"כ</div></div>
<div class="stat"><div class="v">₪${exps.length?Math.round(total/Math.max(1,Object.keys(byP).length)).toLocaleString():0}</div><div class="l">ממוצע/חודש</div></div>
<div class="stat"><div class="v">${Object.keys(byP).length}</div><div class="l">חודשים</div></div>
</div>
<div class="sec">פירוט לפי חודש</div>
<table><thead><tr><th>תאריך</th><th>קטגוריה</th><th>בית עסק</th><th>הערה</th><th>סכום</th><th>על ידי</th></tr></thead><tbody>${periodRows}</tbody></table>
<div class="sec">סיכום לפי קטגוריה</div>
<table><thead><tr><th>קטגוריה</th><th>סה"כ</th><th>%</th></tr></thead><tbody>${catRows}</tbody></table>
</body></html>`;

    // Open in new window and trigger print
    const w=window.open("","_blank","width=800,height=600");
    if(w){
      w.document.open();w.document.write(html);w.document.close();
      w.focus();
      setTimeout(()=>{try{w.print();}catch{}},500);
    } else {
      // Fallback for popup blockers: download as HTML file
      const blob=new Blob([html],{type:"text/html;charset=utf-8;"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");a.href=url;a.download=`דוח_הוצאות_${TOD}.html`;
      document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
      toast2("📄 קובץ HTML הורד — פתח בדפדפן להדפסה");
    }
  }

  // ── Analysis ─────────────────────────────────────────────────────────────────
  function getAnalysis(){
    const keys=[];for(let i=0;i<anM;i++) keys.push(offPK(CK,i));keys.reverse();
    let ex=allExp.filter(e=>keys.includes(e.mKey));
    if(anCat!=="הכל") ex=ex.filter(e=>e.cat===anCat);
    const total=ex.reduce((s,e)=>s+e.amount,0);
    const byCat={};ex.forEach(e=>{byCat[e.cat]=(byCat[e.cat]||0)+e.amount;});
    const byM={};keys.forEach(k=>{byM[k]=0;});ex.forEach(e=>{byM[e.mKey]=(byM[e.mKey]||0)+e.amount;});
    const byMBud={};keys.forEach(k=>{byMBud[k]=getTotalBudget(accData,k);});
    return {keys,total,byCat,byM,byMBud};
  }

  // ── Onboard finish ───────────────────────────────────────────────────────────
  async function finishOnboard(){
    const url=(oUrl||"").trim().replace(/\/+$/,"");
    let initHH=DEF_HH,inherited=null;
    if(url){
      setSy(true);const res=await fbRead(url);setSy(false);
      if(res.ok&&res.data){initHH={...DEF_HH,...res.data};if(res.data._ss)inherited=res.data._ss;toast2("הצטרפת! 🎉");}
      else{await fbWrite(url,{...initHH,_ss:{resetDay:oDay}});toast2("משק בית נוצר! 🏠");}
    }
    const nd=inherited?.resetDay||oDay;
    const np={name:oName.trim()||"משתמש",dbUrl:url,accId:"acc1",onboarded:true,settings:{...DEF_S,resetDay:nd},eomSeen:{}};
    lsSet(LS_HH,initHH);setHH_(initHH);saveProf(np);setSUrl(url);
    setShowTut(true);
  }

  // ── Tutorial ─────────────────────────────────────────────────────────────────
  const TUT=[
    {icon:"🏠",title:"ברוכים הבאים!",color:"#6C63FF",desc:"ניהול תקציב משפחתי חכם לשני בני הזוג",
     mock:`<div style="background:#0F0F1A;border-radius:16px;padding:14px;color:#fff;font-size:11px;direction:rtl">
      <div style="font-size:9px;color:#888">שלום, <b style="color:#6C63FF">רזיאל</b></div>
      <div style="font-weight:800;font-size:14px;margin-bottom:10px">מאי 2026</div>
      <div style="background:rgba(255,255,255,0.07);border-radius:12px;padding:12px;margin-bottom:8px">
        <div style="font-size:9px;color:#888">יתרה לחודש</div>
        <div style="font-size:28px;font-weight:800;color:#4ECDC4">₪2,340</div>
        <div style="background:rgba(255,255,255,0.1);border-radius:6px;height:6px;margin-top:8px;overflow:hidden"><div style="width:53%;height:6px;background:linear-gradient(90deg,#6C63FF,#4ECDC4)"></div></div>
        <div style="display:flex;justify-content:space-between;font-size:9px;color:#888;margin-top:4px"><span>53% מהתקציב</span><span>תקציב: ₪5,000</span></div>
      </div>
      <div style="display:flex;justify-content:space-around;background:rgba(255,255,255,0.05);border-radius:8px;padding:6px;font-size:9px;gap:4px">
        <div style="text-align:center">🏠<br>בית</div><div style="text-align:center;color:#6C63FF;background:rgba(108,99,255,0.2);border-radius:6px;padding:2px 6px">➕<br>הוצאה</div>
        <div style="text-align:center">📋<br>היסטוריה</div><div style="text-align:center">📊<br>ניתוח</div><div style="text-align:center">🎯<br>חיסכון</div>
      </div></div>`},
    {icon:"💰",title:"קביעת תקציב",color:"#4ECDC4",desc:"קבע תקציב חודשי ברירת מחדל לכל החודשים הבאים. הוסף לתקציב רק לחודש הנוכחי.",
     mock:`<div style="background:#0F0F1A;border-radius:16px;padding:14px;color:#fff;font-size:11px;direction:rtl">
      <div style="font-weight:800;font-size:13px;margin-bottom:10px">💰 קביעת תקציב</div>
      <div style="background:rgba(78,205,196,0.12);border:1px solid rgba(78,205,196,0.4);border-radius:10px;padding:12px;text-align:center;margin-bottom:8px">
        <div style="font-size:9px;color:#888">תקציב חודשי קבוע (כל החודשים)</div>
        <div style="font-size:28px;font-weight:800;color:#4ECDC4">8,000 ₪</div>
        <div style="position:relative;margin-top:8px">
          <div style="background:linear-gradient(135deg,#6C63FF,#4ECDC4);border-radius:8px;padding:8px;font-weight:700;font-size:11px">✓ קבע תקציב לכל החודשים</div>
          <div style="position:absolute;top:-8px;right:20%;background:#FFE66D;color:#111;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">👆</div>
        </div>
      </div>
      <div style="background:rgba(255,139,148,0.1);border:1px solid rgba(255,139,148,0.3);border-radius:10px;padding:10px;font-size:10px">
        <div style="color:#FF8B94;font-weight:700;margin-bottom:4px">➕ הוסף לתקציב (חודש זה בלבד)</div>
        <div style="color:#888">מוסיף סכום חד פעמי לחודש הנוכחי בלבד</div>
      </div></div>`},
    {icon:"➕",title:"הוספת הוצאה",color:"#FFE66D",dark:true,desc:"סכום ← קטגוריה ← שם עסק ← תאריך ← שמור",
     mock:`<div style="background:#0F0F1A;border-radius:16px;padding:12px;color:#fff;font-size:10px;direction:rtl">
      <div style="font-weight:800;font-size:13px;margin-bottom:8px">➕ הוספת הוצאה</div>
      <div style="background:rgba(255,255,255,0.07);border-radius:10px;padding:10px;margin-bottom:6px;text-align:center">
        <div style="font-size:9px;color:#888">סכום ₪</div><div style="font-size:24px;font-weight:800;color:#FFE66D">250 ←</div>
      </div>
      <div style="background:rgba(255,255,255,0.07);border-radius:10px;padding:8px;margin-bottom:6px">
        <div style="font-size:9px;color:#888;margin-bottom:4px">קטגוריה ← לחץ לבחור</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          <span style="background:rgba(255,227,100,0.3);border:1px solid #FFE66D;border-radius:12px;padding:2px 7px;font-size:9px">🍽️ מסעדות ✓</span>
          <span style="border:1px solid rgba(255,255,255,0.2);border-radius:12px;padding:2px 7px;font-size:9px">🛒 מזון</span>
        </div>
      </div>
      <div style="background:rgba(255,255,255,0.07);border-radius:10px;padding:7px;margin-bottom:6px">
        <div style="font-size:9px;color:#888">שם עסק:</div><div style="color:#aaa">קפה גרג</div>
      </div>
      <div style="background:linear-gradient(135deg,#FFE66D,#F0B27A);border-radius:10px;padding:9px;text-align:center;font-weight:700;font-size:11px;color:#111">➕ רשום הוצאה</div></div>`},
    {icon:"📅",title:"הוצאות עתידיות ותשלומים",color:"#85C1E9",desc:"בחר תאריך עתידי · הגדר תשלומים · הוצאה קבועה חודשית · דפדף ← → לראות עתיד/עבר",
     mock:`<div style="background:#0F0F1A;border-radius:16px;padding:12px;color:#fff;font-size:10px;direction:rtl">
      <div style="font-weight:800;font-size:13px;margin-bottom:8px">⚙️ אפשרויות מתקדמות</div>
      <div style="display:flex;gap:6px;background:rgba(255,255,255,0.05);border-radius:10px;padding:8px;margin-bottom:6px;align-items:center;justify-content:center">
        <span style="font-size:16px;cursor:pointer">‹</span>
        <span style="font-size:11px;font-weight:700">יוני 2026</span>
        <span style="font-size:9px;color:#85C1E9">📅 עתידי</span>
        <span style="font-size:16px;cursor:pointer;color:#85C1E9">›</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:5px">
        <div style="background:rgba(133,193,233,0.15);border:1px solid rgba(133,193,233,0.4);border-radius:8px;padding:8px;font-size:9px">
          <b style="color:#85C1E9">📅 הוצאה עתידית:</b> בחר תאריך בעתיד — ירד מאותו חודש
        </div>
        <div style="background:rgba(255,227,100,0.12);border:1px solid rgba(255,227,100,0.3);border-radius:8px;padding:8px;font-size:9px">
          <b style="color:#FFE66D">💳 תשלומים:</b> ₪1,200 ÷ 12 = ₪100/חודש ×12
        </div>
        <div style="background:rgba(130,224,170,0.12);border:1px solid rgba(130,224,170,0.3);border-radius:8px;padding:8px;font-size:9px">
          <b style="color:#82E0AA">🔄 הוצאה קבועה:</b> חוזרת אוטומטית כל חודש
        </div>
      </div></div>`},
    {icon:"🔄",title:"סנכרון בין שני נייד",color:"#82E0AA",dark:true,desc:"הגדרות → ☁️ ענן → Firebase URL → שתף לבן/בת הזוג. הם לא צריכים חשבון!",
     mock:`<div style="background:#0F0F1A;border-radius:16px;padding:12px;color:#fff;font-size:10px;direction:rtl">
      <div style="font-weight:800;font-size:13px;margin-bottom:8px">☁️ הגדרת סנכרון</div>
      <div style="background:rgba(130,224,170,0.12);border:1px solid rgba(130,224,170,0.4);border-radius:10px;padding:10px;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
          <div style="width:8px;height:8px;border-radius:50%;background:#4ECDC4"></div>
          <div style="font-size:10px;font-weight:700">מחובר ✅ סנכרון כל 12 שניות</div>
        </div>
        <div style="font-size:8px;color:#888;word-break:break-all">https://my-budget-rtdb.firebaseio.com</div>
      </div>
      <div style="position:relative;margin-bottom:6px">
        <div style="background:linear-gradient(135deg,#82E0AA,#4ECDC4);border-radius:8px;padding:8px;text-align:center;font-size:11px;font-weight:700;color:#111">📤 שתף URL לבן/בת הזוג</div>
        <div style="position:absolute;top:-8px;right:35%;background:#FFE66D;color:#111;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:12px">👆</div>
      </div>
      <div style="background:rgba(255,139,148,0.15);border-radius:8px;padding:6px;text-align:center;font-size:9px;color:#FF8B94">⚠️ בן/בת הזוג לא צריך/ה חשבון Firebase!</div></div>`},
    {icon:"📊",title:"ניתוח הוצאות",color:"#C39BD3",desc:"ניתוח → בחר תקופה → ראה פילוח לפי חודש ביחס לתקציב, ולפי קטגוריה",
     mock:`<div style="background:#0F0F1A;border-radius:16px;padding:12px;color:#fff;font-size:10px;direction:rtl">
      <div style="font-weight:800;font-size:13px;margin-bottom:8px">📊 ניתוח הוצאות</div>
      <div style="display:flex;gap:5px;margin-bottom:8px">
        <span style="background:rgba(195,155,211,0.3);border:1px solid #C39BD3;border-radius:8px;padding:4px 9px;font-size:9px;font-weight:700">3 ח' ✓</span>
        <span style="border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:4px 9px;font-size:9px">6 ח'</span>
        <span style="border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:4px 9px;font-size:9px">12 ח'</span>
      </div>
      <div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:8px;margin-bottom:6px">
        ${["מרץ ₪4,200/₪5,000","אפריל ₪5,100/₪5,000","מאי ₪3,600/₪5,000"].map((t,i)=>{
          const [lbl,vals]=t.split(" ");const[sp,bud]=vals.split("/");
          const spN=parseInt(sp.replace("₪","").replace(",",""));const budN=parseInt(bud.replace("₪","").replace(",",""));
          const pct=Math.min(100,Math.round(spN/budN*100));const clr=pct>100?"#FF6B6B":pct>85?"#FFE66D":"#6C63FF";
          return `<div style="margin-bottom:7px">
            <div style="display:flex;justify-content:space-between;font-size:9px;margin-bottom:3px">
              <span style="color:#888">${lbl}</span><span style="font-weight:700">${sp}</span>
            </div>
            <div style="background:rgba(255,255,255,0.1);border-radius:4px;height:8px;overflow:hidden">
              <div style="width:${pct}%;height:8px;background:${clr};border-radius:4px"></div>
            </div>
            <div style="font-size:8px;color:#888;text-align:left">${pct}% מ-${bud}</div>
          </div>`;
        }).join("")}
      </div></div>`},
    {icon:"🎯",title:"יעדי חיסכון",color:"#FF8B94",desc:"חיסכון → הוסף יעד → הפקד / משוך → עקוב אחר ההתקדמות",
     mock:`<div style="background:#0F0F1A;border-radius:16px;padding:12px;color:#fff;font-size:10px;direction:rtl">
      <div style="font-weight:800;font-size:13px;margin-bottom:8px">🎯 יעדי חיסכון</div>
      <div style="background:rgba(255,139,148,0.1);border:1px solid rgba(255,139,148,0.3);border-radius:12px;padding:10px;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-size:22px">🏖️</span>
          <div><div style="font-weight:700;font-size:12px">חופשה לאילת</div><div style="font-size:9px;color:#888">₪3,200 / ₪5,000 · נותר ₪1,800</div></div>
          <div style="margin-right:auto;font-size:18px;font-weight:800;color:#FF8B94">64%</div>
        </div>
        <div style="background:rgba(255,255,255,0.1);border-radius:8px;height:10px;overflow:hidden;margin-bottom:8px">
          <div style="width:64%;height:10px;background:linear-gradient(90deg,#FF8B94,#FFE66D);border-radius:8px"></div>
        </div>
        <div style="display:flex;gap:6px">
          <div style="background:linear-gradient(135deg,#FF8B94,#FFE66D);border-radius:8px;padding:6px;flex:1;text-align:center;font-size:9px;font-weight:700;color:#111">+ הפקד</div>
          <div style="border:1px solid #FFE66D;border-radius:8px;padding:6px;flex:1;text-align:center;font-size:9px;font-weight:700;color:#FFE66D">💸 משוך</div>
          <div style="border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:6px;font-size:9px;color:#888">🗑</div>
        </div>
      </div></div>`},
    {icon:"📲",title:"התראות ברקע",color:"#85C1E9",desc:"הורד ntfy → הגדרות → 🔔 התראות → הכנס שם ערוץ ייחודי",
     mock:`<div style="background:#0F0F1A;border-radius:16px;padding:12px;color:#fff;font-size:10px;direction:rtl">
      <div style="font-weight:800;font-size:13px;margin-bottom:8px">🔔 הגדרת התראות</div>
      <div style="background:rgba(133,193,233,0.12);border:1px solid rgba(133,193,233,0.4);border-radius:10px;padding:10px;margin-bottom:6px">
        <div style="font-size:9px;color:#85C1E9;font-weight:700;margin-bottom:6px">📲 ntfy — עובד גם כשסגור!</div>
        <div style="background:rgba(255,255,255,0.07);border-radius:8px;padding:6px;margin-bottom:6px">
          <div style="font-size:8px;color:#888">שם ערוץ:</div>
          <div style="font-size:11px;color:#fff;font-weight:700">mishpacha-cohen-25</div>
        </div>
        <div style="background:linear-gradient(135deg,#85C1E9,#4ECDC4);border-radius:8px;padding:7px;text-align:center;font-size:9px;font-weight:700;color:#111">✅ ערוץ פעיל</div>
      </div>
      <div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:8px;font-size:9px">
        <div style="color:#888;margin-bottom:4px">דוגמה להתראה:</div>
        <div style="background:rgba(255,255,255,0.1);border-radius:8px;padding:6px">💳 הוצאה חדשה מ-שרה: ₪180 · 🍽️ מסעדות</div>
      </div></div>`},
  ];

  if(showTut) return(
    <div style={{fontFamily:"'Heebo',sans-serif",direction:"rtl",background:"#0A0A16",minHeight:"100dvh",width:"100%",color:"#fff",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700;800&display=swap');*{box-sizing:border-box}button{font-family:'Heebo',sans-serif;outline:none}`}</style>
      <div style={{padding:"16px 20px 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:13,color:"#555"}}>{tutI+1}/{TUT.length}</div>
        <div style={{display:"flex",gap:4}}>
          {TUT.map((_,i)=><div key={i} onClick={()=>setTutI(i)} style={{width:i===tutI?28:6,height:6,borderRadius:10,background:i===tutI?TUT[i].color:i<tutI?"rgba(255,255,255,0.3)":"rgba(255,255,255,0.12)",transition:"all .3s",cursor:"pointer"}}/>)}
        </div>
        <button onClick={()=>setShowTut(false)} style={{background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:13,padding:0}}>דלג ›</button>
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",padding:"12px 20px 0",overflow:"hidden"}}>
        <div style={{textAlign:"center",marginBottom:10}}>
          <div style={{fontSize:32,lineHeight:1,marginBottom:6}}>{TUT[tutI].icon}</div>
          <div style={{fontSize:20,fontWeight:800,color:TUT[tutI].color,marginBottom:3}}>{TUT[tutI].title}</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.6)",lineHeight:1.6}}>{TUT[tutI].desc}</div>
        </div>
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
          <div style={{width:"100%",maxWidth:300,border:`2px solid ${TUT[tutI].color}55`,borderRadius:20,overflow:"hidden",boxShadow:`0 0 40px ${TUT[tutI].color}33`}}
            dangerouslySetInnerHTML={{__html:TUT[tutI].mock}}/>
        </div>
      </div>
      <div style={{padding:"12px 20px 32px",display:"flex",gap:10}}>
        {tutI>0?<button onClick={()=>setTutI(t=>t-1)} style={{flex:1,padding:12,borderRadius:14,border:"1px solid rgba(255,255,255,0.15)",background:"transparent",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:14}}>‹ הקודם</button>:<div style={{flex:1}}/>}
        {tutI<TUT.length-1
          ?<button onClick={()=>setTutI(t=>t+1)} style={{flex:2,padding:12,borderRadius:14,border:"none",background:`linear-gradient(135deg,${TUT[tutI].color},#4ECDC4)`,color:TUT[tutI].dark?"#111":"#fff",cursor:"pointer",fontWeight:800,fontSize:15}}>הבא ›</button>
          :<button onClick={()=>setShowTut(false)} style={{flex:2,padding:12,borderRadius:14,border:"none",background:"linear-gradient(135deg,#6C63FF,#4ECDC4)",color:"#fff",cursor:"pointer",fontWeight:800,fontSize:16}}>🚀 בואו נתחיל!</button>}
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // ONBOARDING
  // ══════════════════════════════════════════════════════════════════════════
  if(!prof.onboarded) return(
    <div style={{fontFamily:"'Heebo',sans-serif",direction:"rtl",background:"#0F0F1A",minHeight:"100dvh",width:"100%",color:"#fff",display:"flex",flexDirection:"column",padding:"28px 24px",fontSize:15}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700;800&display=swap');*{box-sizing:border-box}input,button{font-family:'Heebo',sans-serif;outline:none}
        .ob-inp{width:100%;padding:14px;border-radius:14px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.07);color:#fff;font-size:16px;direction:rtl}
        .ob-btn{width:100%;padding:16px;border:none;border-radius:14px;background:linear-gradient(135deg,#6C63FF,#4ECDC4);color:#fff;font-family:'Heebo',sans-serif;font-weight:800;font-size:17px;cursor:pointer}
        .d{border:1px solid rgba(255,255,255,0.15);background:transparent;color:#888;cursor:pointer;font-family:'Heebo',sans-serif;font-weight:700;border-radius:10px;width:42px;height:42px;font-size:13px}
        .d.on{border-color:#6C63FF;background:rgba(108,99,255,0.3);color:#fff}
      `}</style>
      {/* Step dots */}
      <div style={{display:"flex",justifyContent:"center",gap:8,paddingTop:4,marginBottom:8}}>
        {[0,1,2].slice(0,oUrl||oStep===2?3:2).map((i,_)=>[0,1,oUrl?"":null].filter(x=>x!==null).map((_2,ii)=>(
          <div key={ii} style={{height:5,borderRadius:10,transition:"all .3s",width:ii===oStep?32:16,background:ii===oStep?"#6C63FF":ii<oStep?"rgba(108,99,255,0.5)":"rgba(255,255,255,0.15)"}}/>
        )))[0]}
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center"}}>
        {/* Step 0: Name */}
        {oStep===0&&<>
          <div style={{textAlign:"center",marginBottom:32}}>
            <div style={{fontSize:64,marginBottom:12}}>🏠</div>
            <div style={{fontSize:26,fontWeight:800,marginBottom:6}}>תקציב משפחתי</div>
            <div style={{fontSize:14,color:"#888"}}>ניהול חכם לשני בני הזוג</div>
          </div>
          <div style={{fontSize:13,color:"#888",marginBottom:8,textAlign:"center"}}>מה שמך?</div>
          <input className="ob-inp" placeholder="הכנס את שמך" value={oName} autoFocus
            onChange={e=>setON(e.target.value)} onKeyDown={e=>e.key==="Enter"&&oName.trim()&&setOS(1)}
            style={{marginBottom:20,fontWeight:800,fontSize:22,textAlign:"center"}} />
          <button className="ob-btn" onClick={()=>oName.trim()&&setOS(1)}>המשך ›</button>
        </>}
        {/* Step 1: Sharing key */}
        {oStep===1&&<>
          <div style={{textAlign:"center",marginBottom:20}}>
            <div style={{fontSize:52,marginBottom:10}}>🔑</div>
            <div style={{fontSize:22,fontWeight:800,marginBottom:6}}>מפתח שיתוף</div>
            <div style={{fontSize:13,color:"#888",lineHeight:1.7}}>יש לך מפתח מבן/בת הזוג?<br/>הכנס אותו לקבלת כל ההגדרות אוטומטית</div>
          </div>
          <div style={{background:"rgba(78,205,196,0.08)",border:"1px solid rgba(78,205,196,0.3)",borderRadius:16,padding:16,marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:700,color:"#4ECDC4",marginBottom:8}}>📲 יש לי Firebase URL:</div>
            <input type="url" className="ob-inp" placeholder="https://...firebaseio.com"
              value={oUrl} onChange={e=>setOU(e.target.value)}
              style={{marginBottom:10,direction:"ltr",textAlign:"left",fontSize:13,background:"rgba(0,0,0,0.3)"}} />
            <button className="ob-btn" onClick={finishOnboard} style={{background:"linear-gradient(135deg,#4ECDC4,#82E0AA)",color:"#111"}}>{syncing?"מתחבר...":"🔗 הצטרף למשק בית"}</button>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
            <div style={{flex:1,height:1,background:"rgba(255,255,255,0.1)"}}/><div style={{fontSize:13,color:"#555"}}>או</div><div style={{flex:1,height:1,background:"rgba(255,255,255,0.1)"}}/>
          </div>
          <div style={{background:"rgba(108,99,255,0.08)",border:"1px solid rgba(108,99,255,0.25)",borderRadius:16,padding:14}}>
            <div style={{fontSize:13,fontWeight:700,color:"#6C63FF",marginBottom:6}}>✨ אני ראשון — צור משק בית חדש</div>
            <div style={{fontSize:12,color:"#888",lineHeight:1.8,marginBottom:10}}>
              1. <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" style={{color:"#4ECDC4"}}>console.firebase.google.com</a><br/>
              2. Build → <b>Realtime Database</b> → Create → <b style={{color:"#FFE66D"}}>TEST MODE</b><br/>
              3. העתק URL → הכנס למעלה, או דלג כדי לבחור יום איפוס
            </div>
            <button className="ob-btn" onClick={()=>setOS(2)} style={{background:"linear-gradient(135deg,#6C63FF,#4ECDC4)"}}>המשך לבחירת יום איפוס ›</button>
          </div>
        </>}
        {/* Step 2: Reset day (only if no URL) */}
        {oStep===2&&<>
          <div style={{textAlign:"center",marginBottom:24}}>
            <div style={{fontSize:48,marginBottom:10}}>📅</div>
            <div style={{fontSize:22,fontWeight:800,marginBottom:4}}>יום איפוס תקציב</div>
            <div style={{fontSize:13,color:"#888"}}>באיזה יום בחודש מתחיל תקציב חדש?</div>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center",marginBottom:24}}>
            {Array.from({length:28},(_,i)=>i+1).map(d=>(
              <button key={d} onClick={()=>setOD(d)} className={`d${oDay===d?" on":""}`}>{d}</button>
            ))}
          </div>
          <button className="ob-btn" onClick={finishOnboard}>{syncing?"יוצר...":"🚀 צור משק בית"}</button>
        </>}
      </div>
      {oStep>0&&<button onClick={()=>setOS(p=>p-1)} style={{background:"none",border:"none",color:"#555",cursor:"pointer",fontFamily:"Heebo",fontSize:14,padding:"12px 0",textAlign:"center"}}>‹ חזור</button>}
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // MAIN APP
  // ══════════════════════════════════════════════════════════════════════════
  return(
    <div style={{fontFamily:"'Heebo',sans-serif",direction:"rtl",background:bg,minHeight:"100dvh",width:"100%",color:tc,position:"relative",zoom}}>
      <style>{css}</style>

      {/* Toast */}
      {toast&&<div style={{position:"fixed",top:14,left:"50%",transform:"translateX(-50%)",
        background:toast.type==="err"?"#FF6B6B":toast.type==="warn"?"#FFE66D":toast.type==="info"?"#4ECDC4":acc,
        color:["warn","info"].includes(toast.type)?"#111":"#fff",
        padding:"9px 22px",borderRadius:50,zIndex:9999,fontWeight:700,fontSize:13,whiteSpace:"nowrap",boxShadow:"0 4px 20px rgba(0,0,0,0.5)",pointerEvents:"none"}}>{toast.msg}</div>}

      {/* ── EOM ── */}
      {showEOM&&<BS onClose={()=>setShowEOM(false)}>
        {eomMode==="positive"?<>
          <div style={{textAlign:"center"}}><div style={{fontSize:48,marginBottom:8}}>🎉</div>
            <div style={{fontSize:22,fontWeight:800,color:"#4ECDC4",marginBottom:6}}>כל הכבוד!</div>
            <div style={{fontSize:13,color:sub,marginBottom:6}}>סיימתם את {getPL(PK,rd)} עם יתרה של</div>
            <div style={{fontSize:32,fontWeight:800,color:"#4ECDC4",marginBottom:16}}>₪{Math.abs(prevRem).toLocaleString()}</div>
          </div>
          <button className="btn" onClick={eomToNext} style={{width:"100%",padding:13,fontSize:15,marginBottom:10}}>➕ הוסף לתקציב החודש הנוכחי</button>
          {savings.length>0&&<><select value={eomSav} onChange={e=>setEomSav(e.target.value)} className="sel" style={{marginBottom:10}}><option value="">בחר יעד חיסכון...</option>{savings.map(g=><option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}</select>
          <button className="btn" onClick={eomToSav} style={{width:"100%",padding:13,fontSize:15,marginBottom:10,background:"linear-gradient(135deg,#4ECDC4,#82E0AA)"}}>🎯 העבר לחיסכון</button></>}
          <button onClick={()=>setShowEOM(false)} style={{width:"100%",padding:10,borderRadius:12,border:`1px solid ${cbr}`,background:"transparent",color:sub,cursor:"pointer",fontFamily:"Heebo",fontWeight:600,fontSize:13}}>אחליט מאוחר</button>
        </>:<>
          <div style={{textAlign:"center"}}><div style={{fontSize:48,marginBottom:8}}>💪</div>
            <div style={{fontSize:22,fontWeight:800,color:"#FFE66D",marginBottom:6}}>קרה, זה בסדר!</div>
            <div style={{fontSize:13,color:sub,marginBottom:6}}>יצאתם מהתקציב ב-{getPL(PK,rd)} ב-</div>
            <div style={{fontSize:32,fontWeight:800,color:"#FF6B6B",marginBottom:12}}>₪{Math.abs(prevRem).toLocaleString()}</div>
            <div style={{fontSize:13,color:sub,marginBottom:16}}>חודש הבא הוא הזדמנות חדשה! 🌟</div>
          </div>
          <button className="btn" onClick={eomToNext} style={{width:"100%",padding:13,fontSize:15,marginBottom:10,background:"linear-gradient(135deg,#FF8B94,#FF6B6B)"}}>📉 העבר מינוס לחודש הנוכחי</button>
          <button onClick={()=>setShowEOM(false)} style={{width:"100%",padding:10,borderRadius:12,border:`1px solid ${cbr}`,background:"transparent",color:sub,cursor:"pointer",fontFamily:"Heebo",fontWeight:600,fontSize:13}}>אני מכסה בדרך אחרת</button>
        </>}
      </BS>}

      {/* ── Reset day confirm ── */}
      {rdConfirm!==null&&<BS onClose={()=>setRdConfirm(null)}>
        <div style={{textAlign:"center"}}><div style={{fontSize:42,marginBottom:10}}>📅</div>
          <div style={{fontSize:17,fontWeight:800,marginBottom:8}}>שינוי יום איפוס ל-{rdConfirm}?</div>
          <div style={{fontSize:13,color:sub,marginBottom:6,lineHeight:1.7}}>כל ההוצאות הקיימות יוצמדו מחדש לפי יום האיפוס החדש.</div>
          <div style={{fontSize:12,color:"#FFE66D",marginBottom:20,padding:"8px 12px",background:"rgba(255,227,100,0.1)",borderRadius:10}}>⚠️ הפעולה תשפיע על כל ההיסטוריה</div>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>setRdConfirm(null)} style={{flex:1,padding:12,borderRadius:12,border:`1px solid ${cbr}`,background:"transparent",color:tc,cursor:"pointer",fontWeight:700,fontFamily:"Heebo"}}>ביטול</button>
          <button onClick={()=>changeRD(rdConfirm)} className="btn" style={{flex:1,padding:12}}>אישור — שנה</button>
        </div>
      </BS>}

      {/* ── Edit Expense ── */}
      {editExp&&<BS onClose={()=>setEditExp(null)}>
        <div style={{fontSize:17,fontWeight:800,marginBottom:14}}>✏️ עריכת הוצאה</div>
        <div style={{fontSize:12,color:sub,marginBottom:5}}>סכום ₪</div>
        <input type="number" inputMode="decimal" className="inp" value={editExp.amt??editExp.amount}
          onChange={e=>setEditExp({...editExp,amt:e.target.value})} autoFocus
          style={{textAlign:"center",fontSize:24,fontWeight:800,marginBottom:10}} />
        <div style={{fontSize:12,color:sub,marginBottom:6}}>קטגוריה</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:10}}>
          {cats.map(cat=><button key={cat} onClick={()=>setEditExp({...editExp,cat})}
            style={{padding:"4px 9px",borderRadius:20,border:`1px solid ${editExp.cat===cat?acc:cbr}`,background:editExp.cat===cat?acc+"33":"transparent",color:editExp.cat===cat?tc:sub,fontSize:11,cursor:"pointer",fontFamily:"Heebo",fontWeight:600}}>{cat}</button>)}
        </div>
        <div style={{fontSize:12,color:sub,marginBottom:5}}>שם בית העסק</div>
        <input type="text" className="inp" value={editExp.biz||""} onChange={e=>setEditExp({...editExp,biz:e.target.value})} style={{marginBottom:8}} />
        <div style={{fontSize:12,color:sub,marginBottom:5}}>הערה</div>
        <input type="text" className="inp" value={editExp.note||""} onChange={e=>setEditExp({...editExp,note:e.target.value})} style={{marginBottom:8}} />
        <div style={{fontSize:12,color:sub,marginBottom:5}}>תאריך</div>
        <input type="date" className="inp" value={editExp.date||""} onChange={e=>setEditExp({...editExp,date:e.target.value})} style={{marginBottom:14}} />
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setEditExp(null)} style={{flex:1,padding:11,borderRadius:12,border:`1px solid ${cbr}`,background:"transparent",color:tc,cursor:"pointer",fontWeight:700,fontFamily:"Heebo"}}>ביטול</button>
          <button onClick={async()=>{await delExp(editExp.id);setEditExp(null);toast2("נמחק 🗑");}}
            style={{flex:1,padding:11,borderRadius:12,border:"1px solid #FF6B6B",background:"transparent",color:"#FF6B6B",cursor:"pointer",fontWeight:700,fontFamily:"Heebo"}}>🗑 מחק</button>
          <button onClick={saveEditExp} className="btn" style={{flex:2,padding:11}}>שמור</button>
        </div>
      </BS>}

      {/* ── Reset all ── */}
      {showReset&&<BS onClose={()=>setShowReset(false)}>
        <div style={{textAlign:"center"}}><div style={{fontSize:42,marginBottom:10}}>⚠️</div>
          <div style={{fontSize:17,fontWeight:800,marginBottom:6}}>מחיקת כל הנתונים</div>
          <div style={{fontSize:13,color:sub,marginBottom:22}}>פעולה זו אינה הפיכה</div></div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>setShowReset(false)} style={{flex:1,padding:12,borderRadius:12,border:`1px solid ${cbr}`,background:"transparent",color:tc,cursor:"pointer",fontWeight:700,fontFamily:"Heebo"}}>ביטול</button>
          <button onClick={async()=>{localStorage.removeItem(LS_PROF);localStorage.removeItem(LS_HH);setProf_({name:"",dbUrl:"",accId:"acc1",onboarded:false,settings:{...DEF_S},eomSeen:{}});setHH_(DEF_HH);setShowReset(false);}} style={{flex:1,padding:12,borderRadius:12,border:"none",background:"#FF6B6B",color:"#fff",cursor:"pointer",fontWeight:700,fontFamily:"Heebo"}}>מחק הכל</button>
        </div>
      </BS>}

      {/* ── Add Account ── */}
      {showAddAcc&&<BS onClose={()=>setShowAddAcc(false)}>
        <div style={{fontSize:17,fontWeight:800,marginBottom:12}}>חשבון חדש</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:12}}>
          {["💼","🏡","🚗","🌴","💊","🎓","🎪","🛒","🐾","🎵"].map(ic=>(
            <button key={ic} onMouseDown={e=>e.preventDefault()} onClick={()=>setNewAcc({...newAcc,icon:ic})}
              style={{fontSize:22,width:42,height:42,border:`2px solid ${ic===newAcc.icon?acc:cbr}`,borderRadius:10,background:ic===newAcc.icon?acc+"22":"transparent",cursor:"pointer"}}>{ic}</button>
          ))}
        </div>
        <input className="inp" placeholder="שם החשבון" value={newAcc.name} onChange={e=>setNewAcc({...newAcc,name:e.target.value})} onFocus={e=>e.stopPropagation()} style={{marginBottom:10}} autoFocus />
        <div style={{fontSize:12,color:sub,marginBottom:6}}>תקציב חודשי ראשוני (₪)</div>
        <input type="number" inputMode="numeric" className="inp" placeholder="0" value={newAcc.initBudget} onChange={e=>setNewAcc({...newAcc,initBudget:e.target.value})} onFocus={e=>e.stopPropagation()} style={{marginBottom:10}} />
        <div style={{fontSize:12,color:sub,marginBottom:8}}>יום איפוס עצמאי</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:10}}>
          {Array.from({length:28},(_,i)=>i+1).map(d=>(
            <button key={d} onMouseDown={e=>e.preventDefault()} onClick={()=>setNewAcc({...newAcc,resetDay:d})}
              className={`seg${newAcc.resetDay===d?" on":""}`} style={{width:34,height:34,borderRadius:8,fontSize:11}}>{d}</button>
          ))}
        </div>
        <div style={{fontSize:12,color:sub,marginBottom:5}}>Firebase URL לשיתוף נפרד (אופציונלי)</div>
        <input type="url" className="inp" placeholder="https://...firebaseio.com" value={newAcc.dbUrl} onChange={e=>setNewAcc({...newAcc,dbUrl:e.target.value})} onFocus={e=>e.stopPropagation()} style={{marginBottom:14,direction:"ltr",textAlign:"left",fontSize:12}} />
        <div style={{display:"flex",gap:10}}>
          <button onMouseDown={e=>e.preventDefault()} onClick={()=>{setShowAddAcc(false);setNewAcc({name:"",icon:"💼",resetDay:1,dbUrl:"",initBudget:""}); }} style={{flex:1,padding:12,borderRadius:12,border:`1px solid ${cbr}`,background:"transparent",color:tc,cursor:"pointer",fontWeight:700,fontFamily:"Heebo"}}>ביטול</button>
          <button onMouseDown={e=>e.preventDefault()} onClick={doAddAcc} className="btn" style={{flex:1,padding:12}}>הוסף</button>
        </div>
      </BS>}

      {/* ── Edit Account ── */}
      {editAcc&&<BS onClose={()=>setEditAcc(null)}>
        <div style={{fontSize:17,fontWeight:800,marginBottom:12}}>✏️ עריכת חשבון</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:12}}>
          {["💼","🏡","🚗","🌴","💊","🎓","🎪","🛒","🐾","🎵"].map(ic=>(
            <button key={ic} onMouseDown={e=>e.preventDefault()} onClick={()=>setEditAcc({...editAcc,icon:ic})}
              style={{fontSize:22,width:42,height:42,border:`2px solid ${ic===editAcc.icon?acc:cbr}`,borderRadius:10,background:ic===editAcc.icon?acc+"22":"transparent",cursor:"pointer"}}>{ic}</button>
          ))}
        </div>
        <input className="inp" placeholder="שם החשבון" value={editAcc.name||""} onChange={e=>setEditAcc({...editAcc,name:e.target.value})} onFocus={e=>e.stopPropagation()} style={{marginBottom:10}} autoFocus />
        <div style={{fontSize:12,color:sub,marginBottom:5}}>Firebase URL לשיתוף נפרד (אופציונלי)</div>
        <input type="url" className="inp" placeholder="https://...firebaseio.com" value={editAcc.dbUrl||""} onChange={e=>setEditAcc({...editAcc,dbUrl:e.target.value})} onFocus={e=>e.stopPropagation()} style={{marginBottom:14,direction:"ltr",textAlign:"left",fontSize:12}} />
        <div style={{display:"flex",gap:8}}>
          <button onMouseDown={e=>e.preventDefault()} onClick={()=>setEditAcc(null)} style={{flex:1,padding:12,borderRadius:12,border:`1px solid ${cbr}`,background:"transparent",color:tc,cursor:"pointer",fontWeight:700,fontFamily:"Heebo"}}>ביטול</button>
          {(hh.accounts||[]).length>1&&<button onMouseDown={e=>e.preventDefault()} onClick={()=>{delAcc(editAcc.id);setEditAcc(null);}} style={{flex:1,padding:12,borderRadius:12,border:"1px solid #FF6B6B",background:"transparent",color:"#FF6B6B",cursor:"pointer",fontWeight:700,fontFamily:"Heebo"}}>🗑 מחק</button>}
          <button onMouseDown={e=>e.preventDefault()} onClick={saveEditAcc} className="btn" style={{flex:1,padding:12}}>שמור</button>
        </div>
      </BS>}

      {/* ── Deposit / Withdraw / Xfer ── */}
      {depG&&<BS onClose={()=>{setDepG(null);setDepA("");}}>
        <div style={{textAlign:"center"}}><div style={{fontSize:34,marginBottom:8}}>💚</div><div style={{fontSize:17,fontWeight:800,marginBottom:14}}>הפקדה לחיסכון</div></div>
        <input type="number" inputMode="numeric" className="inp" placeholder="סכום ₪" value={depA} onChange={e=>setDepA(e.target.value)} autoFocus style={{textAlign:"center",fontSize:26,fontWeight:800,padding:14,marginBottom:14}} onKeyDown={e=>e.key==="Enter"&&deposit()} />
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>{setDepG(null);setDepA("");}} style={{flex:1,padding:12,borderRadius:12,border:`1px solid ${cbr}`,background:"transparent",color:tc,cursor:"pointer",fontWeight:700,fontFamily:"Heebo"}}>ביטול</button>
          <button onClick={deposit} className="btn" style={{flex:1,padding:12}}>הפקד</button>
        </div>
      </BS>}
      {wdG&&<BS onClose={()=>{setWdG(null);setWdA("");}}>
        {(()=>{const g=savings.find(x=>x.id===wdG);return(<>
          <div style={{textAlign:"center"}}><div style={{fontSize:34,marginBottom:8}}>💸</div>
            <div style={{fontSize:17,fontWeight:800,marginBottom:4}}>משיכה מחיסכון</div>
            {g&&<div style={{fontSize:13,color:sub,marginBottom:14}}>{g.icon} {g.name} · יתרה: ₪{(g.saved||0).toLocaleString()}</div>}</div>
          <input type="number" inputMode="numeric" className="inp" placeholder="סכום ₪" value={wdA} onChange={e=>setWdA(e.target.value)} autoFocus style={{textAlign:"center",fontSize:26,fontWeight:800,padding:14,marginBottom:14}} onKeyDown={e=>e.key==="Enter"&&withdraw()} />
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>{setWdG(null);setWdA("");}} style={{flex:1,padding:12,borderRadius:12,border:`1px solid ${cbr}`,background:"transparent",color:tc,cursor:"pointer",fontWeight:700,fontFamily:"Heebo"}}>ביטול</button>
            <button onClick={withdraw} style={{flex:1,padding:12,borderRadius:12,border:"none",background:"linear-gradient(135deg,#FF8B94,#FF6B6B)",color:"#fff",cursor:"pointer",fontWeight:700,fontFamily:"Heebo"}}>משוך</button>
          </div>
        </>);})()}
      </BS>}
      {showXfer&&<BS onClose={()=>{setShowXfer(false);setXG("");setXA("");}}>
        <div style={{textAlign:"center",marginBottom:14}}><div style={{fontSize:34,marginBottom:4}}>🔄</div><div style={{fontSize:17,fontWeight:800}}>העברה לחיסכון</div><div style={{fontSize:12,color:sub,marginTop:4}}>יתרה: ₪{rem.toLocaleString()}</div></div>
        {savings.length===0?<div style={{textAlign:"center",color:sub,padding:"14px 0",fontSize:13}}>אין יעדי חיסכון עדיין</div>:<>
          <select value={xG} onChange={e=>setXG(e.target.value)} className="sel" style={{marginBottom:10}}><option value="">בחר יעד...</option>{savings.map(g=><option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}</select>
          <input type="number" inputMode="numeric" className="inp" placeholder="סכום ₪" value={xA} onChange={e=>setXA(e.target.value)} style={{textAlign:"center",fontSize:22,fontWeight:800,marginBottom:14}} />
        </>}
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>{setShowXfer(false);setXG("");setXA("");}} style={{flex:1,padding:12,borderRadius:12,border:`1px solid ${cbr}`,background:"transparent",color:tc,cursor:"pointer",fontWeight:700,fontFamily:"Heebo"}}>ביטול</button>
          {savings.length>0&&<button onClick={doXfer} className="btn" style={{flex:1,padding:12}}>העבר</button>}
        </div>
      </BS>}
      {delGC&&<BS onClose={()=>setDelGC(null)}>
        <div style={{textAlign:"center"}}><div style={{fontSize:36,marginBottom:8}}>🗑</div><div style={{fontSize:16,fontWeight:800,marginBottom:6}}>מחיקת יעד חיסכון</div><div style={{fontSize:13,color:sub,marginBottom:20}}>כל הנתונים יימחקו</div></div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>setDelGC(null)} style={{flex:1,padding:12,borderRadius:12,border:`1px solid ${cbr}`,background:"transparent",color:tc,cursor:"pointer",fontWeight:700,fontFamily:"Heebo"}}>ביטול</button>
          <button onClick={async()=>{await doSave({...hh,data:{...hh.data,[accId]:{...accData,savings:savings.filter(g=>g.id!==delGC)}}});setDelGC(null);toast2("יעד נמחק");}} style={{flex:1,padding:12,borderRadius:12,border:"none",background:"#FF6B6B",color:"#fff",cursor:"pointer",fontWeight:700,fontFamily:"Heebo"}}>מחק</button>
        </div>
      </BS>}

      {/* ── Export month picker ── */}
      {showExpPicker&&<BS onClose={()=>setShowExpPicker(false)}>
        <div style={{fontSize:17,fontWeight:800,marginBottom:6}}>📅 בחר חודשים לייצוא</div>
        <div style={{fontSize:12,color:sub,marginBottom:14}}>{expMonths.size===0?"כל החודשים נבחרו":`${expMonths.size} חודשים נבחרו`}</div>
        <button onClick={()=>setExpMonths(new Set())} style={{width:"100%",padding:9,borderRadius:10,border:`1px solid ${cbr}`,background:"transparent",color:sub,cursor:"pointer",fontFamily:"Heebo",fontSize:13,marginBottom:12}}>ביטול בחירה — ייצא הכל</button>
        <div style={{maxHeight:300,overflowY:"auto"}}>
          {allPKs().reverse().map(k=>{
            const on=expMonths.has(k);
            const cnt=allExp.filter(e=>e.mKey===k).length;
            return <div key={k} onClick={()=>{const nm=new Set(expMonths);if(on)nm.delete(k);else nm.add(k);setExpMonths(nm);}}
              style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",marginBottom:6,borderRadius:12,border:`1px solid ${on?acc:cbr}`,background:on?acc+"22":cb,cursor:"pointer"}}>
              <div style={{fontSize:14,fontWeight:on?700:400}}>{getPL(k,rd)}</div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:12,color:sub}}>{cnt} הוצאות</span>
                <div style={{width:20,height:20,borderRadius:6,border:`2px solid ${on?acc:cbr}`,background:on?acc:"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>
                  {on&&"✓"}
                </div>
              </div>
            </div>;
          })}
        </div>
        <button className="btn" onClick={()=>setShowExpPicker(false)} style={{width:"100%",padding:12,marginTop:14,fontSize:15}}>אישור</button>
      </BS>}

      {/* ── Header ── */}
      <div style={{padding:"18px 18px 0",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
        <div>
          <div style={{fontSize:11,color:sub}}>שלום, <span style={{color:acc,fontWeight:700}}>{prof.name}</span></div>
          <div style={{fontSize:17,fontWeight:800}}>{getPL(VK,rd)}</div>
          {hOff!==0&&<div style={{fontSize:10,color:hOff<0?"#85C1E9":"#FFE66D"}}>{hOff<0?"📅 תקופה עתידית":"🕐 תקופה קודמת"}</div>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          {(hh.accounts||[]).length>1&&<select value={accId} onChange={e=>saveProf({...prof,accId:e.target.value})} className="sel" style={{padding:"3px 8px",fontSize:11,borderRadius:8,width:"auto"}}>{hh.accounts.map(a=><option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}</select>}
          <div onClick={()=>pullCloud(prof.dbUrl,prof,false)} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:20,background:cb,border:`1px solid ${cbr}`,cursor:"pointer",userSelect:"none"}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:syncing?"#FFE66D":(prof.dbUrl?syncOk?"#4ECDC4":"#FF6B6B":"#666"),transition:"background .3s"}}/>
            <span style={{fontSize:10,color:sub}}>{syncing?"...":"סנכרן"}</span>
          </div>
          <button onClick={()=>setView("settings")} style={{width:34,height:34,borderRadius:"50%",border:`1px solid ${cbr}`,background:cb,color:tc,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>⚙️</button>
        </div>
      </div>

      <div style={{padding:"12px 18px 115px"}}>

        {/* ════ HOME ══════════════════════════════════════════════════════ */}
        {view==="home"&&<>
          <PNav/>
          {/* Budget card */}
          <div className="card" style={{padding:20,marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:14}}>
              <div>
                <div style={{fontSize:11,color:sub,marginBottom:2}}>יתרה לתקופה</div>
                <div style={{fontSize:44,fontWeight:800,lineHeight:1,color:rem<0?"#FF6B6B":rem<totalBud*0.15?"#FFE66D":"#4ECDC4"}}>
                  {rem<0?"-":""}₪{Math.abs(rem).toLocaleString()}</div>
                {rem<0&&<div style={{display:"inline-block",background:"rgba(255,107,107,0.2)",border:"1px solid #FF6B6B",borderRadius:20,padding:"3px 12px",fontSize:12,fontWeight:800,color:"#FF6B6B",marginTop:4}}>⚠️ חרגת מהתקציב!</div>}
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:11,color:sub}}>תקציב</div>
                <div style={{fontSize:20,fontWeight:700}}>₪{totalBud.toLocaleString()}</div>
                <div style={{fontSize:11,color:sub}}>הוצאות: ₪{spent.toLocaleString()}</div>
              </div>
            </div>
            <div style={{background:dark?"rgba(255,255,255,0.1)":"rgba(0,0,0,0.1)",borderRadius:10,height:10,marginBottom:6}}>
              <div style={{width:`${pct}%`,height:10,borderRadius:10,background:pct>90?"#FF6B6B":pct>70?"#FFE66D":`linear-gradient(90deg,${acc},#4ECDC4)`,transition:"width .6s"}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:sub,marginBottom:14}}>
              <span>{Math.round(pct)}% מהתקציב</span><span>איפוס ב-{rd} לחודש</span>
            </div>
            <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
              <button className="btn" onClick={()=>setView("setBudget")} style={{flex:1,padding:"9px 0",fontSize:13,minWidth:90}}>קבע תקציב</button>
              <button className="btn" onClick={()=>setView("addExtra")} style={{flex:1,padding:"9px 0",fontSize:13,minWidth:90,background:"linear-gradient(135deg,#FF8B94,#FFE66D)"}}>הוסף לחודש זה</button>
              {rem>0&&savings.length>0&&<button className="btn" onClick={()=>setShowXfer(true)} style={{flex:1,padding:"9px 0",fontSize:13,minWidth:80,background:"linear-gradient(135deg,#4ECDC4,#82E0AA)"}}>🔄 לחיסכון</button>}
            </div>
          </div>

          {/* Category summary */}
          {Object.keys(catSum).length>0&&<div className="card" style={{padding:16,marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:700,color:sub,marginBottom:10}}>לפי קטגוריה</div>
            {Object.entries(catSum).sort((a,b)=>b[1]-a[1]).map(([cat,amt],i)=>(
              <div key={cat} style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                <div style={{width:7,height:7,borderRadius:"50%",background:CLR[i%CLR.length],flexShrink:0}}/>
                <div style={{flex:1,fontSize:13}}>{cat}</div>
                <div style={{fontWeight:700,fontSize:13}}>₪{amt.toLocaleString()}</div>
                <div style={{width:50,background:dark?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.08)",borderRadius:6,height:6}}>
                  <div style={{width:`${spent>0?(amt/spent)*100:0}%`,height:6,borderRadius:6,background:CLR[i%CLR.length]}}/>
                </div>
              </div>
            ))}
          </div>}

          {/* Recent expenses */}
          {viewExp.length>0&&<div className="card" style={{padding:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:12,fontWeight:700,color:sub}}>הוצאות אחרונות</div>
              <button onClick={()=>setView("history")} style={{background:"none",border:"none",color:acc,fontSize:12,cursor:"pointer",fontFamily:"Heebo",fontWeight:700}}>הכל ›</button>
            </div>
            {[...viewExp].reverse().slice(0,5).map(e=>(
              <div key={e.id} className="erow" onClick={()=>setEditExp({...e})}>
                <div style={{fontSize:20}}>{e.cat.split(" ")[0]}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <div style={{fontSize:13,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.biz||e.cat.split(" ").slice(1).join(" ")}</div>
                    {e.iId&&<span style={{fontSize:9,background:"rgba(255,227,100,0.2)",border:"1px solid #FFE66D",borderRadius:10,padding:"1px 5px",color:"#FFE66D",flexShrink:0}}>{e.iIdx}/{e.iTotal}</span>}
                    {e.recurringId&&<span style={{fontSize:9,background:"rgba(130,224,170,0.2)",border:"1px solid #82E0AA",borderRadius:10,padding:"1px 5px",color:"#82E0AA",flexShrink:0}}>קבוע</span>}
                    {e.date>TOD&&<span style={{fontSize:9,background:"rgba(133,193,233,0.2)",border:"1px solid #85C1E9",borderRadius:10,padding:"1px 5px",color:"#85C1E9",flexShrink:0}}>📅</span>}
                  </div>
                  <div style={{fontSize:10,color:sub}}>{new Date(e.date).toLocaleDateString("he-IL")} · {e.by}</div>
                </div>
                <div style={{fontWeight:700,color:e.transfer?"#4ECDC4":"#FF6B6B",fontSize:13,flexShrink:0}}>-₪{e.amount.toLocaleString()}</div>
              </div>
            ))}
          </div>}

          {viewExp.length===0&&totalBud===0&&hOff===0&&<div style={{textAlign:"center",padding:"50px 0",color:sub}}>
            <div style={{fontSize:52,marginBottom:14}}>💰</div>
            <div style={{fontSize:18,fontWeight:800,marginBottom:6}}>שלום {prof.name}!</div>
            <div style={{fontSize:13,marginBottom:16}}>התחל בקביעת תקציב חודשי</div>
            {!prof.dbUrl&&<div style={{padding:"10px 16px",borderRadius:12,background:acc+"22",border:`1px solid ${acc}44`,fontSize:12,color:sub,lineHeight:1.7}}>💡 לסנכרון — הגדרות → ☁️ ענן</div>}
          </div>}

          {/* Future period info */}
          {isFuturePeriod&&viewExp.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:sub}}>
            <div style={{fontSize:40,marginBottom:12}}>📅</div>
            <div style={{fontSize:16,fontWeight:700,marginBottom:6}}>תקופה עתידית</div>
            <div style={{fontSize:13}}>הוצאות תשלומים/קבועות יופיעו כאן</div>
          </div>}
        </>}

        {/* ════ SET BUDGET ════════════════════════════════════════════════ */}
        {view==="setBudget"&&<div className="card" style={{padding:24}}>
          <button onClick={()=>setView("home")} style={{background:"none",border:"none",color:sub,cursor:"pointer",fontSize:22,marginBottom:14,padding:0}}>‹</button>
          <div style={{fontSize:20,fontWeight:800,marginBottom:4}}>קביעת תקציב חודשי</div>
          <div style={{fontSize:12,color:sub,marginBottom:4}}>ברירת מחדל לכל החודשים מכאן ולהבא</div>
          <div style={{fontSize:11,color:acc,marginBottom:14,padding:"6px 10px",background:acc+"11",borderRadius:8}}>תקציב נוכחי: ₪{(accData.defaultBudget||0).toLocaleString()}</div>
          <input type="number" inputMode="numeric" className="inp" placeholder="סכום ₪" value={budVal}
            onChange={e=>setBV(e.target.value)} style={{textAlign:"center",fontSize:28,fontWeight:800,padding:16,marginBottom:16}} autoFocus
            onKeyDown={e=>e.key==="Enter"&&setBudget()} />
          <button className="btn" onClick={setBudget} style={{width:"100%",padding:14,fontSize:16,marginBottom:10}}>{syncing?"שומר...":"קבע תקציב לכל החודשים"}</button>
          {totalBud>0&&<button onClick={clearBudget} style={{width:"100%",padding:12,borderRadius:12,border:"1px solid #FF6B6B",background:"transparent",color:"#FF6B6B",cursor:"pointer",fontFamily:"Heebo",fontWeight:700,fontSize:14}}>אפס תקציב תקופה זו</button>}
        </div>}

        {/* ════ ADD EXTRA ════════════════════════════════════════════════ */}
        {view==="addExtra"&&<div className="card" style={{padding:24}}>
          <button onClick={()=>setView("home")} style={{background:"none",border:"none",color:sub,cursor:"pointer",fontSize:22,marginBottom:14,padding:0}}>‹</button>
          <div style={{fontSize:20,fontWeight:800,marginBottom:4}}>הוסף לתקציב</div>
          <div style={{fontSize:12,color:sub,marginBottom:4}}>תוספת חד-פעמית לחודש {getPL(VK,rd)} בלבד</div>
          <div style={{fontSize:11,color:acc,marginBottom:14,padding:"6px 10px",background:acc+"11",borderRadius:8}}>תקציב נוכחי: ₪{totalBud.toLocaleString()}</div>
          <input type="number" inputMode="numeric" className="inp" placeholder="סכום להוספה ₪" value={extraVal}
            onChange={e=>setEV(e.target.value)} style={{textAlign:"center",fontSize:28,fontWeight:800,padding:16,marginBottom:20}} autoFocus
            onKeyDown={e=>e.key==="Enter"&&addExtra()} />
          <button className="btn" onClick={addExtra} style={{width:"100%",padding:14,fontSize:16,background:"linear-gradient(135deg,#FF8B94,#FFE66D)",color:"#111"}}>{syncing?"שומר...":"הוסף לחודש זה בלבד"}</button>
        </div>}

        {/* ════ ADD EXPENSE ════════════════════════════════════════════════ */}
        {view==="add"&&<div>
          <button onClick={()=>setView("home")} style={{background:"none",border:"none",color:sub,cursor:"pointer",fontSize:22,marginBottom:14,padding:0}}>‹</button>
          <div style={{fontSize:20,fontWeight:800,marginBottom:14}}>הוספת הוצאה</div>

          <div className="card" style={{padding:16,marginBottom:10}}>
            <div style={{fontSize:12,color:sub,marginBottom:6}}>סכום כולל (₪)</div>
            <input type="number" inputMode="decimal" placeholder="0.00" value={ef.amt}
              onChange={e=>setEF(f=>({...f,amt:e.target.value}))} className="inp"
              style={{textAlign:"center",fontSize:28,fontWeight:800}} autoFocus />
          </div>
          <div className="card" style={{padding:16,marginBottom:10}}>
            <div style={{fontSize:12,color:sub,marginBottom:8}}>קטגוריה</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {cats.map(cat=><button key={cat} onClick={()=>setEF(f=>({...f,cat}))}
                style={{padding:"5px 9px",borderRadius:20,border:`1px solid ${ef.cat===cat?acc:cbr}`,background:ef.cat===cat?acc+"33":"transparent",color:ef.cat===cat?tc:sub,fontSize:12,cursor:"pointer",fontFamily:"Heebo",fontWeight:600}}>{cat}</button>)}
            </div>
          </div>
          <div className="card" style={{padding:16,marginBottom:10}}>
            <div style={{fontSize:12,color:sub,marginBottom:6}}>שם בית העסק</div>
            <input type="text" value={ef.biz} onChange={e=>setEF(f=>({...f,biz:e.target.value}))} className="inp" />
          </div>
          <div className="card" style={{padding:16,marginBottom:10}}>
            <div style={{fontSize:12,color:sub,marginBottom:6}}>הערה</div>
            <input type="text" value={ef.note} onChange={e=>setEF(f=>({...f,note:e.target.value}))} className="inp" />
          </div>
          <div className="card" style={{padding:16,marginBottom:10}}>
            <div style={{fontSize:12,color:sub,marginBottom:6}}>תאריך</div>
            <input type="date" value={ef.date} onChange={e=>setEF(f=>({...f,date:e.target.value}))} className="inp" />
            <div style={{fontSize:11,marginTop:6,color:ef.date>TOD?"#85C1E9":sub}}>
              {ef.date>TOD?"📅 הוצאה עתידית — ":""}תקופה: <b style={{color:acc}}>{getPL(getPK(new Date(ef.date),rd),rd)}</b>
            </div>
          </div>

          {/* Advanced */}
          <div className="card" style={{padding:16,marginBottom:10}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:14}}>⚙️ אפשרויות מתקדמות</div>
            {/* Installments */}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>💳 תשלומים</div>
              <div style={{fontSize:11,color:sub,marginBottom:8}}>הסכום יתחלק לחודשים</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {[1,2,3,6,10,12,18,24,36].map(n=>(
                  <button key={n} onClick={()=>setEF(f=>({...f,inst:n,recurring:n>1?false:f.recurring}))}
                    className={`seg${ef.inst===n&&!ef.recurring?" on":""}`}
                    style={{minWidth:40,padding:"6px 8px",fontSize:12,borderRadius:10}}>
                    {n===1?"חד פעמי":`×${n}`}
                  </button>
                ))}
              </div>
              {ef.inst>1&&!ef.recurring&&<div style={{marginTop:8,padding:"8px 10px",background:acc+"11",borderRadius:10,fontSize:12,color:sub}}>
                ₪{ef.amt?(Math.round((parseFloat(ef.amt)||0)/ef.inst*100)/100).toLocaleString():"?"} × {ef.inst} חודשים = ₪{ef.amt?((parseFloat(ef.amt)||0).toLocaleString()):"?"} סה"כ
              </div>}
            </div>
            {/* Recurring */}
            <div style={{borderTop:`1px solid ${cbr}`,paddingTop:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:ef.recurring?10:0}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600}}>🔄 הוצאה קבועה חודשית</div>
                  <div style={{fontSize:11,color:sub}}>תרד אוטומטית כל חודש</div>
                </div>
                <Tog on={ef.recurring} onChange={()=>setEF(f=>({...f,recurring:!f.recurring,inst:!f.recurring?1:f.inst}))} />
              </div>
              {ef.recurring&&<>
                <div style={{fontSize:12,color:sub,marginBottom:8}}>לכמה חודשים?</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {[3,6,12,24,36].map(n=>(
                    <button key={n} onClick={()=>setEF(f=>({...f,recM:n}))}
                      className={`seg${ef.recM===n?" on":""}`} style={{flex:1,padding:"7px 0",fontSize:12,minWidth:40}}>{n}ח'</button>
                  ))}
                </div>
                <div style={{marginTop:8,padding:"8px 10px",background:"rgba(130,224,170,0.1)",borderRadius:10,fontSize:12,color:sub}}>
                  ₪{ef.amt||"?"} × {ef.recM} חודשים
                </div>
              </>}
            </div>
          </div>

          <button className="btn" onClick={addExp} style={{width:"100%",padding:16,fontSize:17}}>
            {syncing?"שומר...":ef.recurring?`🔄 הוסף הוצאה קבועה (${ef.recM} חודשים)`:ef.inst>1?`💳 הוסף ${ef.inst} תשלומים`:"➕ רשום הוצאה"}
          </button>
        </div>}

        {/* ════ HISTORY ════════════════════════════════════════════════════ */}
        {view==="history"&&<div>
          <button onClick={()=>setView("home")} style={{background:"none",border:"none",color:sub,cursor:"pointer",fontSize:22,marginBottom:14,padding:0}}>‹</button>
          <div style={{fontSize:20,fontWeight:800,marginBottom:10}}>היסטוריה</div>
          <PNav/>
          {/* Active recurring list */}
          {recurring.filter(r=>r.active).length>0&&<div className="card" style={{padding:14,marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:showRecurring?10:0}}>
              <div style={{fontSize:12,fontWeight:700,color:"#82E0AA"}}>🔄 הוצאות קבועות פעילות ({recurring.filter(r=>r.active).length})</div>
              <button onClick={()=>setShowRecurring(!showRecurring)} style={{background:"none",border:"none",color:sub,cursor:"pointer",fontFamily:"Heebo",fontSize:12}}>{showRecurring?"הסתר":"הצג"}</button>
            </div>
            {showRecurring&&recurring.filter(r=>r.active).map(r=>(
              <div key={r.id} style={{display:"flex",alignItems:"center",gap:9,padding:"7px 0",borderBottom:`1px solid ${cbr}`}}>
                <div style={{fontSize:18}}>{r.cat.split(" ")[0]}</div>
                <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600}}>{r.biz||r.cat.split(" ").slice(1).join(" ")}</div>
                  <div style={{fontSize:10,color:sub}}>₪{r.amount.toLocaleString()}/חודש · {r.months} חודשים</div></div>
                <button onClick={()=>stopRec(r.id)} style={{padding:"4px 8px",borderRadius:10,border:"1px solid #FFE66D",background:"transparent",color:"#FFE66D",cursor:"pointer",fontFamily:"Heebo",fontSize:11}}>עצור</button>
                <button onClick={()=>delRec(r.id)} style={{background:"none",border:"none",color:"#FF6B6B",cursor:"pointer",fontSize:16,padding:"0 2px"}}>🗑</button>
              </div>
            ))}
          </div>}
          {viewExp.length===0&&<div style={{textAlign:"center",color:sub,padding:40}}>
            {isFuturePeriod?"אין הוצאות מתוכננות לתקופה זו":"אין הוצאות בתקופה זו"}
          </div>}
          {[...viewExp].reverse().map(e=>(
            <div key={e.id} className="card" style={{padding:"12px 14px",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:9}}>
                <div style={{fontSize:22}}>{e.cat.split(" ")[0]}</div>
                <div style={{flex:1,minWidth:0}}>
                  {e.biz&&<div style={{fontSize:14,fontWeight:700}}>{e.biz}</div>}
                  <div style={{fontSize:13,fontWeight:e.biz?400:600,color:e.biz?sub:tc}}>{e.cat}</div>
                  {e.note&&<div style={{fontSize:11,color:sub}}>{e.note}</div>}
                  <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:2}}>
                    <span style={{fontSize:10,color:sub}}>{new Date(e.date).toLocaleDateString("he-IL")} · {e.by}</span>
                    {e.iId&&<span style={{fontSize:9,background:"rgba(255,227,100,0.2)",border:"1px solid #FFE66D",borderRadius:10,padding:"1px 5px",color:"#FFE66D"}}>תשלום {e.iIdx}/{e.iTotal}</span>}
                    {e.recurringId&&<span style={{fontSize:9,background:"rgba(130,224,170,0.2)",border:"1px solid #82E0AA",borderRadius:10,padding:"1px 5px",color:"#82E0AA"}}>קבוע {e.rIdx}/{e.rTotal}</span>}
                    {e.date>TOD&&<span style={{fontSize:9,background:"rgba(133,193,233,0.2)",border:"1px solid #85C1E9",borderRadius:10,padding:"1px 5px",color:"#85C1E9"}}>עתידי 📅</span>}
                  </div>
                </div>
                <div style={{fontWeight:700,color:e.transfer?"#4ECDC4":"#FF6B6B",fontSize:13,flexShrink:0}}>-₪{e.amount.toLocaleString()}</div>
                <button onClick={()=>setEditExp({...e})} style={{background:"none",border:"none",color:acc,cursor:"pointer",fontSize:15,padding:"0 2px"}}>✏️</button>
                {e.iId&&<button onClick={()=>delInstGroup(e.iId)} style={{background:"none",border:"none",color:"#FF6B6B",cursor:"pointer",fontSize:13,padding:"0 2px"}} title="מחק כל התשלומים">🗑×</button>}
              </div>
            </div>
          ))}
        </div>}

        {/* ════ ANALYSIS ══════════════════════════════════════════════════ */}
        {view==="analysis"&&(()=>{
          const {keys,total,byCat,byM,byMBud}=getAnalysis();
          const sc=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
          // For bars: use budget as max reference, not max spent
          return <div>
            <button onClick={()=>setView("home")} style={{background:"none",border:"none",color:sub,cursor:"pointer",fontSize:22,marginBottom:14,padding:0}}>‹</button>
            <div style={{fontSize:20,fontWeight:800,marginBottom:14}}>ניתוח הוצאות 📊</div>
            <div className="card" style={{padding:16,marginBottom:14}}>
              <div style={{display:"flex",gap:8,marginBottom:14}}>
                {[1,3,6,12].map(n=><button key={n} onClick={()=>setAnM(n)} className={`seg${anM===n?" on":""}`} style={{flex:1,fontSize:13}}>{n===1?"חודש":`${n}ח'`}</button>)}
              </div>
              <select value={anCat} onChange={e=>setAnCat(e.target.value)} className="sel">
                <option value="הכל">הכל</option>
                {cats.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="card" style={{padding:16,marginBottom:14,textAlign:"center"}}>
              <div style={{fontSize:11,color:sub}}>סה"כ {anM} תקופות{anCat!=="הכל"?` · ${anCat}`:""}</div>
              <div style={{fontSize:36,fontWeight:800,color:acc}}>₪{total.toLocaleString()}</div>
              <div style={{fontSize:12,color:sub}}>ממוצע: ₪{Math.round(total/anM).toLocaleString()} / תקופה</div>
            </div>
            <div className="card" style={{padding:16,marginBottom:14}}>
              <div style={{fontSize:12,fontWeight:700,color:sub,marginBottom:10}}>לפי תקופה — ביחס לתקציב</div>
              {keys.map((k,i)=>{
                const sp=byM[k]||0,bud=byMBud[k]||0;
                const pct2=bud>0?Math.min(130,Math.round((sp/bud)*100)):0;
                const barColor=pct2>100?"#FF6B6B":pct2>85?"#FFE66D":CLR[i%CLR.length];
                const barW=bud>0?Math.min(100,(sp/bud)*100):0;
                return <div key={k} style={{marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
                    <span style={{color:sub}}>{getPL(k,rd)}</span>
                    <span style={{fontWeight:700}}>₪{sp.toLocaleString()}{bud>0?<span style={{fontWeight:400,color:sub}}> / ₪{bud.toLocaleString()} ({pct2}%)</span>:""}</span>
                  </div>
                  <div style={{background:dark?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.08)",borderRadius:8,height:10,position:"relative"}}>
                    <div style={{width:`${barW}%`,height:10,borderRadius:8,background:barColor,transition:"width .5s"}}/>
                    {/* Budget marker at 100% */}
                    {bud>0&&<div style={{position:"absolute",top:-2,right:`${Math.max(0,100-100)}%`,left:`calc(${Math.min(100,100)}% - 1px)`,width:2,height:14,background:"rgba(255,255,255,0.5)",borderRadius:1}}/>}
                  </div>
                </div>;
              })}
            </div>
            {anCat==="הכל"&&sc.length>0&&<div className="card" style={{padding:16}}>
              <div style={{fontSize:12,fontWeight:700,color:sub,marginBottom:10}}>לפי קטגוריה</div>
              {sc.map(([cat,amt],i)=>(
                <div key={cat} style={{marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}>
                    <span>{cat}</span><span style={{fontWeight:700}}>₪{amt.toLocaleString()} <span style={{fontWeight:400,color:sub,fontSize:11}}>({Math.round((amt/total)*100)}%)</span></span>
                  </div>
                  <div style={{background:dark?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.08)",borderRadius:8,height:8}}>
                    <div style={{width:`${total>0?(amt/total)*100:0}%`,height:8,borderRadius:8,background:CLR[i%CLR.length]}}/>
                  </div>
                </div>
              ))}
            </div>}
          </div>;
        })()}

        {/* ════ SAVINGS ════════════════════════════════════════════════════ */}
        {view==="savings"&&<div>
          <button onClick={()=>setView("home")} style={{background:"none",border:"none",color:sub,cursor:"pointer",fontSize:22,marginBottom:14,padding:0}}>‹</button>
          <div style={{fontSize:20,fontWeight:800,marginBottom:14}}>יעדי חיסכון 🎯</div>
          {rem>0&&savings.length>0&&<button onClick={()=>setShowXfer(true)} className="btn" style={{width:"100%",padding:11,fontSize:14,marginBottom:14,background:"linear-gradient(135deg,#4ECDC4,#82E0AA)"}}>
            🔄 העבר מהתקציב לחיסכון (₪{rem.toLocaleString()} זמין)</button>}
          {savings.length===0&&<div style={{textAlign:"center",color:sub,padding:"24px 0 10px",fontSize:13}}>הוסף יעד חיסכון ראשון!</div>}
          {savings.map(g=>(
            <div key={g.id} className="card" style={{padding:16,marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:30}}>{g.icon}</span>
                  <div><div style={{fontWeight:700,fontSize:15}}>{g.name}</div>
                    <div style={{fontSize:11,color:sub}}>₪{(g.saved||0).toLocaleString()} / ₪{g.target.toLocaleString()}</div>
                    <div style={{fontSize:11,color:sub}}>נותר: ₪{Math.max(0,g.target-(g.saved||0)).toLocaleString()}</div></div>
                </div>
                <div style={{fontSize:26,fontWeight:800,color:g.saved>=g.target?"#4ECDC4":acc}}>{Math.min(100,Math.round(((g.saved||0)/g.target)*100))}%</div>
              </div>
              <div style={{background:dark?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.08)",borderRadius:10,height:14,marginBottom:10,overflow:"hidden"}}>
                <div style={{width:`${Math.min(100,((g.saved||0)/g.target)*100)}%`,height:14,borderRadius:10,background:g.saved>=g.target?"#4ECDC4":`linear-gradient(90deg,${acc},#4ECDC4)`,transition:"width .5s"}}/>
              </div>
              {g.saved>=g.target&&<div style={{textAlign:"center",color:"#4ECDC4",fontWeight:700,fontSize:14,marginBottom:8}}>🎉 יעד הושג!</div>}
              <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                <button className="btn" onClick={()=>setDepG(g.id)} style={{flex:1,padding:9,fontSize:13,minWidth:80}}>+ הפקד</button>
                {(g.saved||0)>0&&<button onClick={()=>{setWdG(g.id);setWdA("");}} style={{flex:1,padding:9,borderRadius:12,border:"1px solid #FFE66D",background:"transparent",color:"#FFE66D",cursor:"pointer",fontFamily:"Heebo",fontWeight:700,fontSize:13,minWidth:80}}>💸 משוך</button>}
                <button onClick={()=>setDelGC(g.id)} style={{padding:"9px 12px",borderRadius:10,border:`1px solid ${cbr}`,background:"transparent",color:"#FF6B6B",cursor:"pointer",fontSize:14}}>🗑</button>
              </div>
            </div>
          ))}
          <div className="card" style={{padding:16,marginTop:4}}>
            <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>יעד חדש ✨</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:12}}>
              {SAV_ICONS.map(ic=><button key={ic} onClick={()=>setSvI(ic)} style={{fontSize:22,width:40,height:40,border:`2px solid ${ic===svI?acc:cbr}`,borderRadius:10,background:ic===svI?acc+"22":"transparent",cursor:"pointer"}}>{ic}</button>)}
            </div>
            <input type="text" className="inp" placeholder="שם היעד" value={svN} onChange={e=>setSvN(e.target.value)} style={{marginBottom:10}} />
            <input type="number" inputMode="numeric" className="inp" placeholder="סכום יעד ₪" value={svT} onChange={e=>setSvT(e.target.value)} style={{marginBottom:14}} />
            <button className="btn" onClick={addSav} style={{width:"100%",padding:12,fontSize:15}}>{syncing?"שומר...":"הוסף יעד"}</button>
          </div>
        </div>}

        {/* ════ SETTINGS ══════════════════════════════════════════════════ */}
        {view==="settings"&&<div>
          <button onClick={()=>setView("home")} style={{background:"none",border:"none",color:sub,cursor:"pointer",fontSize:22,marginBottom:14,padding:0}}>‹</button>
          <div style={{fontSize:20,fontWeight:800,marginBottom:14}}>הגדרות ⚙️</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
            {[{id:"profile",l:"👤"},{id:"cloud",l:"☁️ ענן"},{id:"notif",l:"🔔 התראות"},{id:"export",l:"📤 יצוא"},{id:"cats",l:"🏷️"},{id:"appear",l:"🎨"},{id:"accounts",l:"💼"},{id:"danger",l:"⚠️"}].map(({id,l})=>(
              <button key={id} onClick={()=>setSect(id)} className={`seg${sect===id?" on":""}`} style={{padding:"7px 12px",fontSize:13}}>{l}</button>
            ))}
          </div>

          {/* Profile */}
          {sect==="profile"&&<div className="card" style={{padding:20}}>
            <div style={{fontSize:13,color:sub,marginBottom:6}}>שם</div>
            <input type="text" className="inp" value={prof.name} onChange={e=>saveProf({...prof,name:e.target.value})} style={{marginBottom:16}} />
            <div style={{fontSize:13,color:sub,marginBottom:10}}>יום איפוס בחודש</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {Array.from({length:28},(_,i)=>i+1).map(d=>(
                <button key={d} onClick={()=>{if(d!==s.resetDay) setRdConfirm(d);}}
                  className={`seg${s.resetDay===d?" on":""}`} style={{width:38,height:38,borderRadius:8,fontSize:12}}>{d}</button>
              ))}
            </div>
          </div>}

          {/* Cloud */}
          {sect==="cloud"&&<div>
            <div className="card" style={{padding:16,marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <div style={{width:12,height:12,borderRadius:"50%",background:prof.dbUrl?(syncOk?"#4ECDC4":"#FF6B6B"):"#666",flexShrink:0}}/>
                <div style={{fontSize:14,fontWeight:700}}>{prof.dbUrl?(syncOk?"מחובר ✅":"בעיית חיבור ❌"):"לא מחובר לענן"}</div>
              </div>
              {prof.dbUrl&&<div style={{fontSize:11,color:sub,wordBreak:"break-all",padding:"6px 10px",background:cb,borderRadius:8,border:`1px solid ${cbr}`}}>{prof.dbUrl}</div>}
            </div>
            <div className="card" style={{padding:16,marginBottom:12}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:10}}>Firebase URL</div>
              <div style={{fontSize:12,color:sub,lineHeight:1.9,marginBottom:12,padding:"10px 12px",background:acc+"11",borderRadius:10,border:`1px solid ${acc}33`}}>
                <b>הגדרה (5 דקות, חינם):</b><br/>
                1. <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" style={{color:"#4ECDC4"}}>console.firebase.google.com</a><br/>
                2. Build → Realtime Database → Create → <b style={{color:"#FFE66D"}}>TEST MODE</b><br/>
                3. העתק URL → הכנס → "בדוק וחבר"<br/>
                <span style={{color:"#FF8B94"}}>⚠️ בן/בת הזוג לא צריך/ה חשבון Firebase!</span>
              </div>
              <input type="url" className="inp" value={sUrl} onChange={e=>setSUrl(e.target.value)} style={{marginBottom:8,direction:"ltr",textAlign:"left",fontSize:12}} />
              <button className="btn" onClick={async()=>{
                const url=(sUrl||"").trim().replace(/\/+$/,"");if(!url){setSMsg("❌ הכנס כתובת");return;}
                setSMsg("בודק..."); const res=await fbRead(url);
                if(res.ok){setSMsg("✅ חיבור תקין!");saveProf({...prof,dbUrl:url});await fbWrite(url,hh);}
                else if(res.status===401||res.status===403) setSMsg("❌ שגיאת הרשאות — ודא TEST MODE");
                else setSMsg("❌ שגיאה — בדוק שה-URL נכון");
              }} style={{width:"100%",padding:12,fontSize:14,marginBottom:6}}>{syncing?"בודק...":"בדוק וחבר"}</button>
              {sMsg&&<div style={{fontSize:12,padding:"8px 12px",borderRadius:10,background:sMsg.startsWith("✅")?"rgba(78,205,196,0.15)":"rgba(255,107,107,0.15)",color:sMsg.startsWith("✅")?"#4ECDC4":"#FF6B6B",textAlign:"center"}}>{sMsg}</div>}
            </div>
            {prof.dbUrl&&<div className="card" style={{padding:16,marginBottom:12}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:8}}>שתף עם בן/בת הזוג</div>
              <button className="btn" onClick={()=>{
                const t=`קוד סנכרון לאפליקציית תקציב: ${prof.dbUrl}`;
                if(navigator.share) navigator.share({title:"תקציב משפחתי",text:t}).catch(()=>{});
                else{ navigator.clipboard?.writeText(prof.dbUrl); toast2("URL הועתק ✓"); }
              }} style={{width:"100%",padding:11,fontSize:14}}>📤 שתף URL</button>
            </div>}
            <div className="card" style={{padding:16}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:8}}>הצטרפות (קיבלת URL?)</div>
              <input type="url" className="inp" value={jUrl} onChange={e=>setJUrl(e.target.value)} style={{marginBottom:12,direction:"ltr",textAlign:"left",fontSize:12}} />
              <button className="btn" onClick={async()=>{
                const url=(jUrl||"").trim().replace(/\/+$/,"");if(!url)return;
                setSy(true);const res=await fbRead(url);setSy(false);
                if(!res.ok||!res.data){toast2("כתובת לא נמצאה","err");return;}
                saveProf({...prof,dbUrl:url});setSUrl(url);lsSet(LS_HH,res.data);setHH_(res.data);setJUrl("");toast2("הצטרפת! 🎉");
              }} style={{width:"100%",padding:12,fontSize:15}}>{syncing?"מחבר...":"הצטרף למשק בית"}</button>
            </div>
          </div>}

          {/* Notifications */}
          {sect==="notif"&&<div>
            <div className="card" style={{padding:16,marginBottom:12}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:10}}>סטטוס התראות</div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:s.notifPerm==="granted"?"#4ECDC4":"#666",flexShrink:0}}/>
                <div style={{fontSize:13}}>{s.notifPerm==="granted"?"התראות פעילות ✅":!canNotify()?"הדפדפן לא תומך בהתראות":"לא הופעלו עדיין"}</div>
              </div>
              {s.notifPerm!=="granted"&&canNotify()&&<button className="btn" onClick={async()=>{
                const p=await askNotif();const ns={...prof,settings:{...s,notifPerm:p}};saveProf(ns);
                if(p==="granted"){toast2("התראות הופעלו ✅");schedRem(ns.settings);}
                else toast2(p==="denied"?"נחסמו בדפדפן":"לא ניתן","warn");
              }} style={{width:"100%",padding:11,fontSize:14}}>🔔 הפעל התראות</button>}
              {!canNotify()&&<div style={{fontSize:12,color:sub,marginTop:8,padding:"8px 10px",background:"rgba(255,227,100,0.1)",borderRadius:10}}>💡 ב-iPhone: הוסף לדף הבית (Safari → Share → Add to Home Screen)</div>}
            </div>
            <div className="card" style={{padding:16,marginBottom:12,border:`1px solid ${acc}44`}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <span style={{fontSize:22}}>📲</span>
                <div><div style={{fontSize:14,fontWeight:700}}>ntfy — התראות ברקע</div><div style={{fontSize:11,color:sub}}>עובד גם כשהאפליקציה סגורה</div></div>
                <div style={{marginRight:"auto",padding:"2px 8px",borderRadius:20,background:(s.ntfyChannel||"").trim()?acc+"33":"rgba(255,107,107,0.2)",border:`1px solid ${(s.ntfyChannel||"").trim()?acc:"#FF6B6B"}`,fontSize:10,fontWeight:700,color:(s.ntfyChannel||"").trim()?acc:"#FF6B6B"}}>
                  {(s.ntfyChannel||"").trim()?"פעיל ✓":"לא מוגדר"}
                </div>
              </div>
              <div style={{fontSize:12,color:sub,lineHeight:1.9,marginBottom:10,padding:"8px 10px",background:acc+"11",borderRadius:8}}>
                1. הורד <b>ntfy</b> — <a href="https://apps.apple.com/app/ntfy/id1625396347" target="_blank" rel="noreferrer" style={{color:"#4ECDC4"}}>App Store</a><br/>
                2. פתח ntfy → + → שם ערוץ ייחודי (לדוגמה: cohen-family-25)<br/>
                3. שניכם מכניסים אותו שם ערוץ<br/>
                <span style={{color:"#FFE66D"}}>⚠️ בחר שם ייחודי שרק אתם יודעים!</span>
              </div>
              <div style={{display:"flex",gap:8,marginBottom:8}}>
                <input type="text" className="inp" placeholder="cohen-family-25" value={s.ntfyChannel||""}
                  onChange={e=>saveProf({...prof,settings:{...s,ntfyChannel:e.target.value.replace(/\s/g,"-").toLowerCase()}})}
                  style={{flex:1,direction:"ltr",textAlign:"left",fontSize:13}} />
                <button className="btn" onClick={async()=>{
                  const ch=(s.ntfyChannel||"").trim();if(!ch){toast2("הכנס שם ערוץ","err");return;}
                  await ntfy(ch,"✅ ntfy עובד!","האפליקציה מחוברת ל-"+ch,"high");toast2("נשלח! בדוק ntfy 📲");
                }} style={{padding:"10px 14px",fontSize:13,flexShrink:0}}>בדוק</button>
              </div>
              {(s.ntfyChannel||"").trim()&&<div style={{fontSize:11,color:sub,textAlign:"center",padding:"6px 10px",background:acc+"11",borderRadius:8}}>ערוץ: <b style={{color:acc}}>{s.ntfyChannel}</b></div>}
            </div>
            {s.notifPerm==="granted"&&<div className="card" style={{padding:16,marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <div><div style={{fontSize:14,fontWeight:600}}>התראה על הוצאת בן/בת הזוג</div><div style={{fontSize:11,color:sub}}>כשהשני מוסיף הוצאה</div></div>
                <Tog on={s.partnerNotif} onChange={()=>saveProf({...prof,settings:{...s,partnerNotif:!s.partnerNotif}})} />
              </div>
            </div>}
            {s.notifPerm==="granted"&&<div className="card" style={{padding:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:s.reminder?14:0}}>
                <div><div style={{fontSize:14,fontWeight:600}}>תזכורת יומית</div><div style={{fontSize:11,color:sub}}>התראה בשעה שתקבע</div></div>
                <Tog on={s.reminder} onChange={()=>{ const ns={...s,reminder:!s.reminder};saveProf({...prof,settings:ns});schedRem(ns); }} />
              </div>
              {s.reminder&&<>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,marginTop:10}}>
                  <div style={{flex:1}}><div style={{fontSize:11,color:sub,marginBottom:4}}>שעה</div>
                    <select value={s.reminderHour??21} onChange={e=>{const ns={...s,reminderHour:parseInt(e.target.value)};saveProf({...prof,settings:ns});schedRem(ns);}} className="sel">
                      {Array.from({length:24},(_,i)=>i).map(h=><option key={h} value={h}>{String(h).padStart(2,"0")}</option>)}
                    </select></div>
                  <div style={{fontSize:20,fontWeight:800,paddingTop:16}}>:</div>
                  <div style={{flex:1}}><div style={{fontSize:11,color:sub,marginBottom:4}}>דקה</div>
                    <select value={s.reminderMin??0} onChange={e=>{const ns={...s,reminderMin:parseInt(e.target.value)};saveProf({...prof,settings:ns});schedRem(ns);}} className="sel">
                      {[0,5,10,15,20,30,45].map(m=><option key={m} value={m}>{String(m).padStart(2,"0")}</option>)}
                    </select></div>
                </div>
                <div style={{fontSize:13,color:sub,marginBottom:8}}>לשון הודעה</div>
                <div style={{display:"flex",gap:8,marginBottom:10}}>
                  {[["he","🇮🇱 עברית"],["en","🇺🇸 English"],["ar","🇸🇦 العربية"]].map(([lang,lbl])=>(
                    <button key={lang} onClick={()=>saveProf({...prof,settings:{...s,reminderLang:lang}})}
                      className={`seg${(s.reminderLang||"he")===lang?" on":""}`} style={{flex:1,padding:"8px 4px",fontSize:11}}>{lbl}</button>
                  ))}
                </div>
                <div style={{fontSize:12,color:acc,textAlign:"center",padding:"8px 12px",background:acc+"11",borderRadius:10,border:`1px solid ${acc}33`}}>
                  📅 כל יום ב-{String(s.reminderHour??21).padStart(2,"0")}:{String(s.reminderMin??0).padStart(2,"0")}
                </div>
              </>}
            </div>}
          </div>}

          {/* Export */}
          {sect==="export"&&<div>
            <div className="card" style={{padding:16,marginBottom:12}}>
              <div style={{fontSize:15,fontWeight:800,marginBottom:4}}>📤 יצוא נתונים</div>
              <div style={{fontSize:12,color:sub,marginBottom:12}}>
                חשבון: <b style={{color:acc}}>{acc_obj?.name||"כללי"}</b> · {allExp.length} הוצאות
              </div>
              {/* Month selection */}
              <div style={{background:cb,borderRadius:12,padding:12,marginBottom:14,border:`1px solid ${cbr}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <div style={{fontSize:13,fontWeight:600}}>📅 בחירת חודשים לייצוא</div>
                  <span style={{fontSize:11,color:sub}}>{expMonths.size===0?"הכל":expMonths.size+" חודשים"}</span>
                </div>
                <button onClick={()=>setShowExpPicker(true)} style={{width:"100%",padding:9,borderRadius:10,border:`1px solid ${acc}`,background:acc+"11",color:acc,cursor:"pointer",fontFamily:"Heebo",fontWeight:700,fontSize:13}}>
                  {expMonths.size===0?"בחר חודשים ספציפיים":"שנה בחירה ("+expMonths.size+" נבחרו)"}
                </button>
                {expMonths.size>0&&<button onClick={()=>setExpMonths(new Set())} style={{width:"100%",padding:7,marginTop:6,borderRadius:10,border:`1px solid ${cbr}`,background:"transparent",color:sub,cursor:"pointer",fontFamily:"Heebo",fontSize:12}}>ביטול — ייצא הכל</button>}
              </div>
              <div style={{background:acc+"11",border:`1px solid ${acc}33`,borderRadius:12,padding:12,marginBottom:12}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>📊 Excel / CSV</div>
                <div style={{fontSize:11,color:sub,marginBottom:10}}>קובץ שנפתח ב-Excel, Google Sheets, Numbers</div>
                <button className="btn" onClick={exportCSV} style={{width:"100%",padding:13,fontSize:15}}>⬇️ הורד קובץ Excel</button>
              </div>
              <div style={{background:"rgba(108,99,255,0.08)",border:"1px solid rgba(108,99,255,0.25)",borderRadius:12,padding:12}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>📄 דוח PDF</div>
                <div style={{fontSize:11,color:sub,marginBottom:6}}>פתח → הדפס → שמור כ-PDF</div>
                <div style={{fontSize:11,color:"#FFE66D",marginBottom:10,padding:"6px 8px",background:"rgba(255,227,100,0.08)",borderRadius:8}}>
                  💡 ב-iPhone: לחץ "PDF" → Safari יפתח חלון חדש. אם לא נפתח — נשמר כקובץ HTML.
                </div>
                <button onClick={exportPDF} style={{width:"100%",padding:13,borderRadius:12,border:"none",background:"linear-gradient(135deg,#6C63FF,#4ECDC4)",color:"#fff",cursor:"pointer",fontFamily:"Heebo",fontWeight:700,fontSize:15}}>📄 צור דוח PDF</button>
              </div>
            </div>
          </div>}

          {/* Categories */}
          {sect==="cats"&&<div>
            <div className="card" style={{padding:16,marginBottom:12}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>קטגוריות קיימות</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                {cats.map(cat=>(
                  <div key={cat} style={{display:"flex",alignItems:"center",gap:4,padding:"5px 10px",borderRadius:20,border:`1px solid ${cbr}`,background:cb}}>
                    <span style={{fontSize:13}}>{cat}</span>
                    {cats.length>1&&<button onClick={async()=>{if(cats.length<=1)return;await doSave({...hh,cats:cats.filter(c=>c!==cat)});}} style={{background:"none",border:"none",color:"#FF6B6B",cursor:"pointer",fontSize:16,padding:"0 2px",lineHeight:1}}>×</button>}
                  </div>
                ))}
              </div>
            </div>
            <div className="card" style={{padding:16}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>הוסף קטגוריה</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:12}}>
                {CAT_ICONS.map(ic=><button key={ic} onClick={()=>setNCI(ic)} style={{fontSize:20,width:38,height:38,border:`2px solid ${ic===nCI?acc:cbr}`,borderRadius:9,background:ic===nCI?acc+"22":"transparent",cursor:"pointer"}}>{ic}</button>)}
              </div>
              <input type="text" className="inp" placeholder="שם הקטגוריה" value={nCN} onChange={e=>setNCN(e.target.value)} style={{marginBottom:12}} onKeyDown={e=>e.key==="Enter"&&addCat()} />
              <button className="btn" onClick={addCat} style={{width:"100%",padding:12,fontSize:15}}>+ הוסף</button>
            </div>
          </div>}

          {/* Appearance */}
          {sect==="appear"&&<div className="card" style={{padding:20}}>
            <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>גודל תצוגה</div>
            <div style={{display:"flex",gap:8,marginBottom:20}}>
              {[["small","קטן"],["medium","בינוני"],["large","גדול"]].map(([sz,l])=>(
                <button key={sz} onClick={()=>saveProf({...prof,settings:{...s,fontSize:sz}})} className={`seg${s.fontSize===sz?" on":""}`} style={{flex:1,padding:"10px 0",fontSize:14}}>{l}</button>
              ))}
            </div>
            <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>ערכות נושא</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:20}}>
              {THEMES.map(t=><button key={t.l} onClick={()=>saveProf({...prof,settings:{...s,bg:t.bg,text:t.text,accent:t.accent}})}
                style={{flex:"1 1 calc(50% - 4px)",padding:"11px 4px",borderRadius:12,border:`2px solid ${s.bg===t.bg?t.accent:cbr}`,background:t.bg,color:t.text,cursor:"pointer",fontFamily:"Heebo",fontSize:12,fontWeight:700}}>{t.l}</button>)}
            </div>
            <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>צבעים מותאמים</div>
            {[{l:"רקע",k:"bg"},{l:"טקסט",k:"text"},{l:"צבע ראשי",k:"accent"}].map(({l,k})=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <span style={{fontSize:13}}>{l}</span>
                <input type="color" value={s[k]} onChange={e=>saveProf({...prof,settings:{...s,[k]:e.target.value}})} style={{width:40,height:36,borderRadius:8,border:`1px solid ${cbr}`,cursor:"pointer",background:"transparent",padding:2}} />
              </div>
            ))}
          </div>}

          {/* Accounts */}
          {sect==="accounts"&&<div>
            {(hh.accounts||[]).map(a=>(
              <div key={a.id} className="card" style={{padding:14,marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
                <div style={{fontSize:26}}>{a.icon}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600}}>{a.name}</div>
                  <div style={{fontSize:11,color:sub}}>איפוס ב-{a.resetDay||1} · תקציב: ₪{(hh.data?.[a.id]?.defaultBudget||0).toLocaleString()}</div>
                </div>
                {a.id===accId&&<span style={{fontSize:11,color:acc,fontWeight:700,border:`1px solid ${acc}`,borderRadius:20,padding:"2px 8px"}}>פעיל</span>}
                {a.id!==accId&&<button onClick={()=>saveProf({...prof,accId:a.id})} style={{padding:"5px 10px",borderRadius:10,border:`1px solid ${cbr}`,background:"transparent",color:sub,cursor:"pointer",fontFamily:"Heebo",fontSize:12}}>עבור</button>}
                <button onClick={()=>setEditAcc({id:a.id,name:a.name,icon:a.icon,dbUrl:a.dbUrl||""})} style={{padding:"5px 8px",borderRadius:10,border:`1px solid ${cbr}`,background:"transparent",color:sub,cursor:"pointer",fontSize:14}}>✏️</button>
              </div>
            ))}
            <button className="btn" onClick={()=>setShowAddAcc(true)} style={{width:"100%",padding:12,marginTop:4,fontSize:15}}>+ חשבון חדש</button>
          </div>}

          {/* Danger */}
          {sect==="danger"&&<div>
            <div className="card" style={{padding:16,marginBottom:12}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:10}}>📖 מדריך האפליקציה</div>
              <button onClick={()=>{setTutI(0);setShowTut(true);}} className="btn" style={{width:"100%",padding:12,fontSize:15}}>🎓 פתח מדריך</button>
            </div>
            <div className="card" style={{padding:20}}>
              <div style={{fontSize:14,fontWeight:700,color:"#FF6B6B",marginBottom:16}}>⚠️ אזור מסוכן</div>
              <button onClick={()=>setShowReset(true)} style={{width:"100%",padding:12,borderRadius:12,border:"1px solid #FF6B6B",background:"transparent",color:"#FF6B6B",cursor:"pointer",fontFamily:"Heebo",fontWeight:700,fontSize:14}}>מחק את כל הנתונים</button>
            </div>
          </div>}
        </div>}
      </div>

      {/* ── Bottom Nav ── */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:dark?"rgba(10,10,20,0.97)":"rgba(245,245,245,0.97)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderTop:`1px solid ${cbr}`,display:"flex",padding:"8px 0 20px",zIndex:50}}>
        {[{id:"home",ic:"🏠",l:"בית"},{id:"add",ic:"➕",l:"הוצאה"},{id:"history",ic:"📋",l:"היסטוריה"},{id:"analysis",ic:"📊",l:"ניתוח"},{id:"savings",ic:"🎯",l:"חיסכון"}].map(t=>(
          <button key={t.id} onClick={()=>setView(t.id)}
            style={{flex:1,background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"6px 0",outline:"none"}}>
            <span style={{fontSize:21}}>{t.ic}</span>
            <span style={{fontSize:9,color:view===t.id?acc:sub,fontFamily:"Heebo",fontWeight:view===t.id?700:400}}>{t.l}</span>
            {view===t.id&&<div style={{width:5,height:5,borderRadius:"50%",background:acc}}/>}
          </button>
        ))}
      </div>
    </div>
  );
}