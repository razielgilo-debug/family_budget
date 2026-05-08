import { useState, useEffect, useCallback, useRef } from "react";

// ─── Constants ──────────────────────────────────────────────────────────────
const DEF_CATS = ["🛒 מזון","🍽️ מסעדות","🏠 בית","👕 ביגוד","🚗 רכב","💊 בריאות",
  "🎮 פנאי","📚 חינוך","✈️ נסיעות","🔧 תחזוקה","💡 חשבונות","🎁 מתנות","📦 אחר"];
const CAT_ICONS = ["🛒","🍽️","🏠","👕","🚗","💊","🎮","📚","✈️","🔧","💡","🎁","📦",
  "🏋️","🐾","🍺","🎭","🧴","👶","🎓","🏥","🍕","💈","🛵","🧹","🛍️","📱","🎂","🎻"];
const MHE = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const CLR = ["#FF6B6B","#4ECDC4","#FFE66D","#A8E6CF","#FF8B94","#85C1E9","#F0B27A","#C39BD3","#82E0AA","#F1948A","#7FB3D3","#FAD7A0"];
const SAV_ICONS = ["🎯","🏖️","🚗","🏠","💻","✈️","💍","🎓","🐶","🎮","🍕","🎸","⛵","🏔️","🎪"];
const THEMES = [
  {l:"🌑 כהה",  bg:"#0F0F1A",text:"#ffffff",accent:"#6C63FF"},
  {l:"🌊 כחול", bg:"#0A1628",text:"#E8F4FD",accent:"#4ECDC4"},
  {l:"☀️ בהיר", bg:"#F5F7FA",text:"#111111",accent:"#6C63FF"},
  {l:"🌸 ורוד",  bg:"#1A0F18",text:"#ffffff",accent:"#FF8B94"},
];
const MAX_B = 100000;
// Stable LS key – never change this between versions so data persists!
const LS_PROF = "bp_STABLE_profile";
const LS_HH   = "bp_STABLE_household";
// Old keys to migrate from (previous versions)
const OLD_KEYS_PROF = ["bpv6_profile","bpv7_profile","bp_prof_v5","bp_v8_prof","bpv5_profile"];
const OLD_KEYS_HH   = ["bpv6_household","bpv7_household","bp_hh_v5","bpv5_household"];

// ─── Helpers ────────────────────────────────────────────────────────────────
const uid  = () => `${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
function lsGet(k,def){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):def; }catch{ return def; } }
function lsSet(k,v)  { try{ localStorage.setItem(k,JSON.stringify(v)); }catch{} }

// Migrate data from any old localStorage key to new stable key
function migrateLS() {
  if(!localStorage.getItem(LS_PROF)) {
    for(const k of OLD_KEYS_PROF) {
      const v = localStorage.getItem(k);
      if(v) { localStorage.setItem(LS_PROF, v); break; }
    }
  }
  if(!localStorage.getItem(LS_HH)) {
    for(const k of OLD_KEYS_HH) {
      const v = localStorage.getItem(k);
      if(v) { localStorage.setItem(LS_HH, v); break; }
    }
  }
}

function getPeriodKey(date, resetDay=1) {
  const d = new Date(date); const day = d.getDate();
  let y = d.getFullYear(), m = d.getMonth();
  if(day < resetDay) { m--; if(m < 0) { m = 11; y--; } }
  return `${y}-${String(m+1).padStart(2,"0")}`;
}
function getPeriodLabel(key, resetDay=1) {
  const [y, mStr] = key.split("-"); const m = parseInt(mStr)-1;
  if(resetDay===1) return `${MHE[m]} ${y}`;
  let em = m+1, ey = parseInt(y); if(em>11){em=0;ey++;}
  return `${resetDay} ${MHE[m]} – ${resetDay-1} ${MHE[em]} ${ey}`;
}
function offsetPeriod(key, n) {
  const [y, mStr] = key.split("-");
  const d = new Date(parseInt(y), parseInt(mStr)-1-n, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function isDark(c){ try{ const h=c.replace("#",""); return (parseInt(h.slice(0,2),16)*299+parseInt(h.slice(2,4),16)*587+parseInt(h.slice(4,6),16)*114)/1e3<128; }catch{return true;} }

// ─── Firebase REST ────────────────────────────────────────────────────────────
async function fbRead(dbUrl) {
  try { const r=await fetch(`${dbUrl}/household.json`,{cache:"no-store"}); if(!r.ok) return{ok:false,status:r.status}; return{ok:true,data:await r.json()}; }
  catch(e){ return{ok:false,error:e.message}; }
}
async function fbWrite(dbUrl,data) {
  try { const r=await fetch(`${dbUrl}/household.json`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)}); return{ok:r.ok,status:r.status}; }
  catch(e){ return{ok:false,error:e.message}; }
}

// ─── Web Notifications ────────────────────────────────────────────────────────
function canNotify() { return "Notification" in window; }
async function requestNotifPerm() {
  if(!canNotify()) return "unsupported";
  if(Notification.permission==="granted") return "granted";
  const p = await Notification.requestPermission();
  return p;
}
function sendNotif(title, body) {
  if(!canNotify()||Notification.permission!=="granted") return;
  try { new Notification(title,{body,icon:"https://cdn.jsdelivr.net/npm/twemoji@14/assets/72x72/1f4b0.png"}); }
  catch(e){}
}

// ntfy.sh push — works in background, even when app is closed
async function ntfyPush(channel, title, body, priority="default") {
  if(!channel) return;
  const ch = channel.trim();
  if(!ch) return;
  try {
    await fetch(`https://ntfy.sh/${encodeURIComponent(ch)}`, {
      method:"POST",
      headers:{
        "Title": title,
        "Priority": priority,
        "Tags": "moneybag",
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: body
    });
  } catch(e) { /* silently fail — no network */ }
}

// ─── Defaults ─────────────────────────────────────────────────────────────────
const DEF_HH = {
  accounts:[{id:"acc1",name:"כללי",icon:"🏠"}],
  data:{acc1:{months:{},expenses:[],savings:[]}},
  cats:[...DEF_CATS],
};
const DEF_SETTINGS = {
  fontSize:"medium", bg:"#0F0F1A", text:"#ffffff", accent:"#6C63FF", resetDay:1,
  reminder:false, reminderHour:21, reminderMin:0,
  partnerNotif:true,   // notify when partner adds expense
  ntfyChannel:"",      // ntfy.sh channel name for background push
  reminderLang:"he",   // he | en | ar
  notifPerm:"default", // granted | denied | default | unsupported
};

// ════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [prof,    setProf_]     = useState(null);
  const [hh,      setHH_]       = useState(DEF_HH);
  const [syncing, setSyncing]   = useState(false);
  const [syncStatus,setSyncStatus]= useState("idle");
  const [view,    setView]      = useState("home");
  const [toast,   setToast]     = useState(null);
  const [sect,    setSect]      = useState("profile");
  const [histOffset,setHistOffset]= useState(0);
  // Onboarding
  const [obStep,setObStep]=useState(0); const [obName,setObName]=useState("");
  const [obDay,setObDay]=useState(1);   const [obDbUrl,setObDbUrl]=useState("");
  const [showTutorial,setShowTutorial]=useState(false);
  const [tutStep,setTutStep]=useState(0);
  // Modals
  const [showReset,setShowReset]=useState(false);
  const [showAddAcc,setShowAddAcc]=useState(false); const [accName,setAccName]=useState(""); const [accIcon,setAccIcon]=useState("💼");
  const [editAcc,setEditAcc]=useState(null); // {id,name,icon} being edited
  const [reminderLang,setReminderLang_]=useState("he"); // he | en | ar
  const [depGoalId,setDepGoalId]=useState(null);   const [depAmt,setDepAmt]=useState("");
  const [wdGoalId,setWdGoalId]=useState(null);     const [wdAmt,setWdAmt]=useState("");
  const [showXfer,setShowXfer]=useState(false);     const [xferGoal,setXferGoal]=useState(""); const [xferAmt,setXferAmt]=useState("");
  const [showEOM,setShowEOM]=useState(false);       const [eomMode,setEomMode]=useState(""); const [eomSavGoal,setEomSavGoal]=useState("");
  const [delGoalConfirm,setDelGoalConfirm]=useState(null);
  // Edit expense modal
  const [editExp, setEditExp] = useState(null); // expense object being edited
  // Forms
  const [ef,setEF]=useState({amt:"",cat:DEF_CATS[0],biz:"",note:"",date:new Date().toISOString().split("T")[0]});
  const [budVal,setBudVal]=useState(""); const [addBudVal,setAddBudVal]=useState("");
  const [svName,setSvName]=useState(""); const [svTarget,setSvTarget]=useState(""); const [svIcon,setSvIcon]=useState("🎯");
  const [anM,setAnM]=useState(3); const [anCat,setAnCat]=useState("הכל");
  const [newCatIcon,setNCI]=useState("🛒"); const [newCatName,setNCN]=useState("");
  const [settingsDbUrl,setSettingsDbUrl]=useState("");
  const [joinDbUrl,setJoinDbUrl]=useState("");
  const [syncTestMsg,setSyncTestMsg]=useState("");
  // Notification state
  const [notifPerm,setNotifPerm]=useState("default");
  const knownExpIds = useRef(new Set()); // track expense IDs we've seen
  const reminderTimers = useRef([]);

  const TODAY = new Date();
  const saveProf = useCallback(p=>{ lsSet(LS_PROF,p); setProf_(p); },[]);

  // ─── Reminder scheduler ───────────────────────────────────────────────────
  function getReminderMsg(lang="he"){
    const msgs={
      he:["האם עדכנת את ההוצאות שלך היום? 💰","זכור לרשום את ההוצאות! 📝","זמן לעדכן תקציב! ⏰"],
      en:["Did you update your expenses today? 💰","Don't forget to log your spending! 📝","Time to update your budget! ⏰"],
      ar:["هل سجلت مصاريفك اليوم؟ 💰","لا تنسَ تسجيل النفقات! 📝","حان وقت تحديث الميزانية! ⏰"]
    };
    const arr=msgs[lang]||msgs.he;
    return arr[Math.floor(Math.random()*arr.length)];
  }
  function scheduleReminder(s) {
    reminderTimers.current.forEach(t=>clearTimeout(t));
    reminderTimers.current=[];
    if(!s.reminder||!canNotify()||Notification.permission!=="granted") return;
    const now=new Date();
    const fire=new Date(now); fire.setHours(s.reminderHour||21,s.reminderMin||0,0,0);
    if(fire<=now) fire.setDate(fire.getDate()+1); // tomorrow if already past
    const ms=fire-now;
    const lang=s.reminderLang||"he";
    const titles={he:"תזכורת עדכון הוצאות",en:"Expense Update Reminder",ar:"تذكير المصاريف"};
    const t=setTimeout(()=>{
      const _t=titles[lang]||titles.he;
      const _b=getReminderMsg(lang);
      sendNotif(_t, _b);
      ntfyPush(s.ntfyChannel, _t, _b); // background push
      lsSet("bp_last_reminder", new Date().toISOString().split("T")[0]);
      scheduleReminder(s); // reschedule for tomorrow
    },ms);
    reminderTimers.current=[t];
  }

  // ─── Init ─────────────────────────────────────────────────────────────────
  useEffect(()=>{
    migrateLS(); // migrate data from old version keys first!
    const p = lsGet(LS_PROF, null);
    if(p?.onboarded){
      setProf_(p);
      setSettingsDbUrl(p.dbUrl||"");
      setNotifPerm(p.settings?.notifPerm||"default");
      const cached = lsGet(LS_HH, DEF_HH);
      setHH_(cached);
      // seed known expense IDs so we don't notify about existing ones
      const allIds = (cached.data?.[p.accId||"acc1"]?.expenses||[]).map(e=>e.id);
      knownExpIds.current = new Set(allIds);
      if(p.dbUrl) pullCloud(p.dbUrl, p, false);
      else setSyncStatus("nocloud");
      // Schedule reminder
      if(p.settings) scheduleReminder(p.settings);
      // Check if reminder time already passed today (app was opened after reminder time)
      if(p.settings?.reminder && canNotify() && Notification.permission==="granted") {
        const now=new Date();
        const lastReminderShown = lsGet("bp_last_reminder","");
        const todayStr = now.toISOString().split("T")[0];
        const h=p.settings.reminderHour||21, m=p.settings.reminderMin||0;
        if(lastReminderShown!==todayStr && now.getHours()>=h && (now.getHours()>h || now.getMinutes()>=m)){
          const _lang=p.settings?.reminderLang||"he";
          const _titles={he:"תזכורת עדכון הוצאות 💰",en:"Expense Update Reminder",ar:"تذكير المصاريف"};
          sendNotif(_titles[_lang]||_titles.he, getReminderMsg(_lang));
          lsSet("bp_last_reminder", todayStr);
        }
      }
    } else {
      setProf_({name:"",dbUrl:"",accId:"acc1",onboarded:false,settings:{...DEF_SETTINGS},eomSeen:{}});
      setSyncStatus("nocloud");
    }
    return()=>{ reminderTimers.current.forEach(t=>clearTimeout(t)); };
  },[]);

  // ─── Cloud ────────────────────────────────────────────────────────────────
  async function pullCloud(dbUrl, p, notify=true) {
    if(!dbUrl){ setSyncStatus("nocloud"); return; }
    setSyncing(true);
    const res = await fbRead(dbUrl);
    setSyncing(false);
    if(res.ok && res.data){
      setSyncStatus("ok");
      const merged={...DEF_HH,...res.data,cats:res.data.cats||DEF_CATS,accounts:res.data.accounts||DEF_HH.accounts,data:res.data.data||DEF_HH.data};
      lsSet(LS_HH,merged);
      setHH_(merged);
      if(p && notify) checkForPartnerExpenses(merged, p);
      if(p) checkEOM(p, merged);
    } else if(res.ok && !res.data){ setSyncStatus("ok"); }
    else { setSyncStatus("err"); }
  }

  function checkForPartnerExpenses(newHH, p) {
    if(!p.settings?.partnerNotif) return;
    const aId=p.accId||"acc1";
    const exps=newHH.data?.[aId]?.expenses||[];
    const newOnes=exps.filter(e=>!knownExpIds.current.has(e.id) && e.by && e.by!==p.name);
    if(newOnes.length>0){
      const e=newOnes[0];
      const title=`הוצאה חדשה מ-${e.by} 💳`;
      const body=`₪${e.amount.toLocaleString()} · ${e.cat}${e.biz?" · "+e.biz:""}`;
      sendNotif(title, body); // works when app is open
      ntfyPush(p.settings?.ntfyChannel, title, body, "high"); // works in background
      if(newOnes.length>1){
        const t2=`עוד ${newOnes.length-1} הוצאות חדשות`;
        const b2=`מ-${e.by}`;
        setTimeout(()=>{ sendNotif(t2,b2); ntfyPush(p.settings?.ntfyChannel,t2,b2); },1500);
      }
    }
    exps.forEach(e=>knownExpIds.current.add(e.id));
  }

  const saveHH = useCallback(async(newHH,dbUrl)=>{
    lsSet(LS_HH,newHH); setHH_(newHH);
    if(!dbUrl){ setSyncStatus("nocloud"); return; }
    setSyncing(true);
    const res=await fbWrite(dbUrl,newHH);
    setSyncing(false); setSyncStatus(res.ok?"ok":"err");
    if(!res.ok) showToast("נשמר מקומית · בעיית חיבור","warn");
  },[]);

  useEffect(()=>{
    if(!prof?.dbUrl||!prof?.onboarded) return;
    const id=setInterval(()=>pullCloud(prof.dbUrl,prof,true),12000);
    return()=>clearInterval(id);
  },[prof?.dbUrl,prof?.onboarded]);

  function showToast(msg,type="ok"){ setToast({msg,type}); setTimeout(()=>setToast(null),3200); }

  function checkEOM(p,h){
    const aId=p.accId||"acc1"; const ad=h.data?.[aId]||{};
    const rd=p.settings?.resetDay||1;
    const prevKey=offsetPeriod(getPeriodKey(TODAY,rd),1);
    const pm=ad.months?.[prevKey]||{budget:0,extra:0};
    const pb=(pm.budget||0)+(pm.extra||0); if(pb===0) return;
    const flag=`eom_${prevKey}`;
    if(p.eomSeen?.[flag]) return;
    const ps=(ad.expenses||[]).filter(e=>e.mKey===prevKey).reduce((s,e)=>s+e.amount,0);
    if(Math.abs(pb-ps)>5){ setEomMode((pb-ps)>=0?"positive":"negative"); setShowEOM(true); saveProf({...p,eomSeen:{...(p.eomSeen||{}),[flag]:true}}); }
  }

  if(!prof) return <div style={{background:"#0F0F1A",minHeight:"100dvh",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{color:"#fff",fontFamily:"sans-serif",fontSize:18}}>טוען...</div></div>;

  // ─── Derived ──────────────────────────────────────────────────────────────
  const accId   = prof.accId||"acc1";
  const accData = hh.data?.[accId]||{months:{},expenses:[],savings:[]};
  const cats    = hh.cats||DEF_CATS;
  const s       = prof.settings||DEF_SETTINGS;
  const resetDay= s.resetDay||1;
  const zoom    = {small:0.88,medium:1,large:1.14}[s.fontSize]||1;
  const bg=s.bg||"#0F0F1A", tc=s.text||"#fff", acc=s.accent||"#6C63FF";
  const dark=isDark(bg);
  const cb  = dark?"rgba(255,255,255,0.05)":"rgba(0,0,0,0.05)";
  const cbr = dark?"rgba(255,255,255,0.1)" :"rgba(0,0,0,0.12)";
  const sub = dark?"#888":"#666";
  const selBg = dark?"#1a1a2e":"#ffffff";
  const CUR_KEY  = getPeriodKey(TODAY,resetDay);
  const VIEW_KEY = offsetPeriod(CUR_KEY,histOffset);
  const PREV_KEY = offsetPeriod(CUR_KEY,1);
  const curMo    = accData.months?.[VIEW_KEY]||{budget:0,extra:0};
  const totalBud = (curMo.budget||0)+(curMo.extra||0);
  const viewExp  = (accData.expenses||[]).filter(e=>e.mKey===VIEW_KEY);
  const spent    = viewExp.reduce((s,e)=>s+e.amount,0);
  const rem      = totalBud-spent;
  const pct      = totalBud>0?Math.min(100,(spent/totalBud)*100):0;
  const savings  = accData.savings||[];
  const catSum   = {}; viewExp.forEach(e=>{catSum[e.cat]=(catSum[e.cat]||0)+e.amount;});
  const prevMo   = accData.months?.[PREV_KEY]||{budget:0,extra:0};
  const prevBud  = (prevMo.budget||0)+(prevMo.extra||0);
  const prevSpent= (accData.expenses||[]).filter(e=>e.mKey===PREV_KEY).reduce((s,e)=>s+e.amount,0);
  const prevRem  = prevBud-prevSpent;

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
    .sel{width:100%;padding:10px 14px;border-radius:12px;border:1px solid ${cbr};background:${selBg};color:#111;font-size:15px;outline:none;direction:rtl;font-family:'Heebo',sans-serif;}
    .seg{border:1px solid ${cbr};background:transparent;color:${sub};cursor:pointer;font-family:'Heebo',sans-serif;font-weight:700;border-radius:10px;padding:8px 0;transition:all .15s;outline:none}
    .seg.on{border-color:${acc};background:${acc}33;color:${tc}}
    .ov{position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:900;display:flex;align-items:flex-end;justify-content:center;padding:0}
  `;

  async function doSaveHH(nh){ await saveHH(nh,prof.dbUrl); }

  // ─── Handlers ─────────────────────────────────────────────────────────────
  async function finishOnboard(){
    const dbUrl=(obDbUrl||"").trim().replace(/\/+$/,"");
    let inheritedSettings=null;
    let initHH=DEF_HH;
    if(dbUrl){
      setSyncing(true);
      const res=await fbRead(dbUrl);
      setSyncing(false);
      if(res.ok&&res.data){
        initHH={...DEF_HH,...res.data};
        // Inherit resetDay and other settings from existing household if present
        if(res.data._sharedSettings) inheritedSettings=res.data._sharedSettings;
        showToast("הצטרפת! 🎉");
      } else {
        // New household — write defaults
        await fbWrite(dbUrl,{...initHH,_sharedSettings:{resetDay:obDay}});
        showToast("משק בית נוצר! 🏠");
      }
    }
    const resetDay=inheritedSettings?.resetDay||obDay;
    const np={name:obName.trim()||"משתמש",dbUrl,accId:"acc1",onboarded:true,
      settings:{...DEF_SETTINGS,resetDay},eomSeen:{}};
    lsSet(LS_HH,initHH); setHH_(initHH); saveProf(np); setSettingsDbUrl(dbUrl);
    setShowTutorial(true); // show tutorial after onboarding
  }
  async function setBudget(){
    const v=Math.min(MAX_B,parseFloat(budVal)||0); if(v<=0) return;
    const nh={...hh,data:{...hh.data,[accId]:{...accData,months:{...accData.months,[VIEW_KEY]:{...curMo,budget:v,extra:0}}}}};
    await doSaveHH(nh); setBudVal(""); setView("home"); showToast("תקציב נקבע 🎯");
  }
  async function addBudget(){
    const v=parseFloat(addBudVal)||0;
    if(v<=0||totalBud+v>MAX_B){showToast(`מקסימום ₪${MAX_B.toLocaleString()}!`,"err");return;}
    const nh={...hh,data:{...hh.data,[accId]:{...accData,months:{...accData.months,[VIEW_KEY]:{...curMo,extra:(curMo.extra||0)+v}}}}};
    await doSaveHH(nh); setAddBudVal(""); setView("home"); showToast(`נוספו ₪${v.toLocaleString()} 💰`);
  }
  async function clearBudget(){
    const nh={...hh,data:{...hh.data,[accId]:{...accData,months:{...accData.months,[VIEW_KEY]:{budget:0,extra:0}}}}};
    await doSaveHH(nh); setView("home"); showToast("תקציב אופס");
  }
  async function addExp(){
    const v=parseFloat(ef.amt); if(!v||v<=0){showToast("הכנס סכום","err");return;}
    const periodK=getPeriodKey(new Date(ef.date),resetDay);
    const exp={id:uid(),amount:v,cat:ef.cat,biz:ef.biz.trim(),note:ef.note.trim(),date:ef.date,mKey:periodK,by:prof.name,ts:Date.now()};
    knownExpIds.current.add(exp.id);
    const nh={...hh,data:{...hh.data,[accId]:{...accData,expenses:[...(accData.expenses||[]),exp]}}};
    await doSaveHH(nh);
    setEF({amt:"",cat:cats[0],biz:"",note:"",date:new Date().toISOString().split("T")[0]});
    setView("home"); showToast("הוצאה נרשמה ✅");
  }
  async function saveEditedExp(){
    if(!editExp) return;
    const v=parseFloat(editExp.amt||editExp.amount); if(!v||v<=0){showToast("הכנס סכום","err");return;}
    const periodK=getPeriodKey(new Date(editExp.date),resetDay);
    const updated={...editExp,amount:v,mKey:periodK,cat:editExp.cat,biz:(editExp.biz||"").trim(),note:(editExp.note||"").trim()};
    const nh={...hh,data:{...hh.data,[accId]:{...accData,expenses:(accData.expenses||[]).map(e=>e.id===updated.id?updated:e)}}};
    await doSaveHH(nh); setEditExp(null); showToast("הוצאה עודכנה ✏️");
  }
  async function delExp(id){
    const nh={...hh,data:{...hh.data,[accId]:{...accData,expenses:(accData.expenses||[]).filter(e=>e.id!==id)}}};
    await doSaveHH(nh);
  }
  async function addSavGoal(){
    if(!svName.trim()||!svTarget){showToast("מלא שם וסכום","err");return;}
    const g={id:uid(),name:svName.trim(),target:parseFloat(svTarget),saved:0,icon:svIcon,deposits:[]};
    const nh={...hh,data:{...hh.data,[accId]:{...accData,savings:[...savings,g]}}};
    await doSaveHH(nh); setSvName(""); setSvTarget(""); showToast("יעד נוסף 🎯");
  }
  async function deposit(){
    const v=parseFloat(depAmt); if(!v||!depGoalId) return;
    const nh={...hh,data:{...hh.data,[accId]:{...accData,savings:savings.map(g=>
      g.id===depGoalId?{...g,saved:(g.saved||0)+v,deposits:[...(g.deposits||[]),{id:uid(),amount:v,date:new Date().toISOString().split("T")[0]}]}:g)}}};
    await doSaveHH(nh); setDepGoalId(null); setDepAmt(""); showToast("חיסכון עודכן 💚");
  }
  async function withdraw(){
    const v=parseFloat(wdAmt); if(!v||!wdGoalId) return;
    const goal=savings.find(g=>g.id===wdGoalId);
    if(!goal||v>(goal.saved||0)){showToast("אין מספיק בחיסכון","err");return;}
    const nh={...hh,data:{...hh.data,[accId]:{...accData,savings:savings.map(g=>g.id===wdGoalId?{...g,saved:(g.saved||0)-v}:g)}}};
    await doSaveHH(nh); setWdGoalId(null); setWdAmt(""); showToast("משיכה בוצעה 💸");
  }
  async function doDelGoal(id){
    const nh={...hh,data:{...hh.data,[accId]:{...accData,savings:savings.filter(g=>g.id!==id)}}};
    await doSaveHH(nh); setDelGoalConfirm(null); showToast("יעד נמחק");
  }
  async function doXfer(){
    const v=parseFloat(xferAmt)||0;
    if(!v||!xferGoal){showToast("בחר יעד וסכום","err");return;} if(v>rem){showToast("אין מספיק יתרה!","err");return;}
    const exp={id:uid(),amount:v,cat:"🎯 חיסכון",biz:"",note:"העברה לחיסכון",date:new Date().toISOString().split("T")[0],mKey:VIEW_KEY,by:prof.name,transfer:true,ts:Date.now()};
    knownExpIds.current.add(exp.id);
    const nh={...hh,data:{...hh.data,[accId]:{...accData,
      expenses:[...(accData.expenses||[]),exp],
      savings:savings.map(g=>g.id===xferGoal?{...g,saved:(g.saved||0)+v,deposits:[...(g.deposits||[]),{id:uid(),amount:v,date:new Date().toISOString().split("T")[0]}]}:g)
    }}};
    await doSaveHH(nh); setShowXfer(false); setXferAmt(""); setXferGoal(""); showToast(`₪${v.toLocaleString()} הועבר לחיסכון 🎯`);
  }
  async function doAddAccount(){
    if(!accName.trim()) return;
    const id=uid();
    const nh={...hh,accounts:[...(hh.accounts||[]),{id,name:accName.trim(),icon:accIcon}],data:{...hh.data,[id]:{months:{},expenses:[],savings:[]}}};
    await doSaveHH(nh); setShowAddAcc(false); setAccName(""); showToast("חשבון נוסף");
  }
  async function doResetAll(){
    localStorage.removeItem(LS_PROF); localStorage.removeItem(LS_HH);
    setProf_({name:"",dbUrl:"",accId:"acc1",onboarded:false,settings:{...DEF_SETTINGS},eomSeen:{}}); setHH_(DEF_HH); setShowReset(false);
  }
  async function addCat(){
    const n=newCatName.trim(); if(!n) return; const full=`${newCatIcon} ${n}`;
    if(cats.includes(full)){showToast("קטגוריה קיימת","err");return;}
    await doSaveHH({...hh,cats:[...cats,full]}); setNCN(""); showToast("קטגוריה נוספה");
  }
  async function removeCat(cat){ if(cats.length<=1) return; await doSaveHH({...hh,cats:cats.filter(c=>c!==cat)}); }
  async function eomToNext(){
    const sign=eomMode==="positive"?1:-1; const amt=Math.abs(prevRem);
    const cm=accData.months?.[CUR_KEY]||{budget:0,extra:0};
    const nh={...hh,data:{...hh.data,[accId]:{...accData,months:{...accData.months,[CUR_KEY]:{...cm,extra:(cm.extra||0)+sign*amt}}}}};
    await doSaveHH(nh); setShowEOM(false); showToast(eomMode==="positive"?`₪${amt.toLocaleString()} עברו 🎉`:`מינוס ₪${amt.toLocaleString()} עבר`);
  }
  async function eomToSav(){
    const amt=Math.abs(prevRem); if(!eomSavGoal){showToast("בחר יעד","err");return;}
    const nh={...hh,data:{...hh.data,[accId]:{...accData,savings:savings.map(g=>
      g.id===eomSavGoal?{...g,saved:(g.saved||0)+amt,deposits:[...(g.deposits||[]),{id:uid(),amount:amt,date:new Date().toISOString().split("T")[0]}]}:g)}}};
    await doSaveHH(nh); setShowEOM(false); showToast(`₪${amt.toLocaleString()} עברו לחיסכון 🎯`);
  }
  async function testSync(){
    setSyncTestMsg("בודק..."); const url=(settingsDbUrl||"").trim().replace(/\/+$/,"");
    if(!url){setSyncTestMsg("❌ לא הוכנסה כתובת");return;}
    const res=await fbRead(url);
    if(res.ok){ setSyncTestMsg("✅ חיבור תקין!"); saveProf({...prof,dbUrl:url}); await fbWrite(url,hh); }
    else if(res.status===401||res.status===403) setSyncTestMsg("❌ שגיאת הרשאות — ודא TEST MODE");
    else setSyncTestMsg(`❌ שגיאה — בדוק שה-URL נכון`);
  }
  async function handleNotifPermRequest(){
    const perm=await requestNotifPerm();
    setNotifPerm(perm);
    const np={...prof,settings:{...s,notifPerm:perm}};
    saveProf(np);
    if(perm==="granted"){ showToast("התראות הופעלו ✅"); scheduleReminder(np.settings); }
    else if(perm==="denied") showToast("ההתראות נדחו בדפדפן","err");
    else showToast("לא ניתן להפעיל התראות במכשיר זה","warn");
  }
  function updateReminder(key,val){
    const ns={...s,[key]:val};
    const np={...prof,settings:ns}; saveProf(np);
    scheduleReminder(ns);
  }
  // ── Export helpers ──────────────────────────────────────────────────────
  function exportCSV(){
    const exps=accData.expenses||[];
    const rows=[["תאריך","קטגוריה","בית עסק","הערה","סכום","הוסף על ידי","תקופה"]];
    [...exps].sort((a,b)=>a.date>b.date?1:-1).forEach(e=>{
      rows.push([e.date,e.cat,e.biz||"",e.note||"",e.amount,e.by||"",getPeriodLabel(e.mKey,resetDay)]);
    });
    const bom="﻿"; // UTF-8 BOM for Excel Hebrew support
    const csv=bom+rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download="הוצאות.csv"; a.click();
    URL.revokeObjectURL(url);
    showToast("קובץ CSV הורד ✅ (פתח עם Excel)");
  }
  function exportPDF(){
    const exps=[...( accData.expenses||[])].sort((a,b)=>a.date>b.date?1:-1);
    const rows=exps.map(e=>`
      <tr>
        <td>${e.date}</td><td>${e.cat}</td><td>${e.biz||""}</td>
        <td>${e.note||""}</td><td style="text-align:left">₪${Number(e.amount).toLocaleString()}</td>
        <td>${e.by||""}</td>
      </tr>`).join("");
    const totalSpentAll=exps.reduce((s,e)=>s+e.amount,0);
    const html=`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8">
      <title>דוח הוצאות</title>
      <style>
        body{font-family:Arial,sans-serif;direction:rtl;padding:20px;color:#111}
        h1{font-size:20px;margin-bottom:4px}
        .sub{color:#666;font-size:13px;margin-bottom:20px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th{background:#f0f0f0;padding:8px 10px;text-align:right;border-bottom:2px solid #ddd}
        td{padding:7px 10px;border-bottom:1px solid #eee}
        tr:nth-child(even){background:#fafafa}
        .total{margin-top:16px;font-size:15px;font-weight:bold;text-align:left}
      </style></head><body>
      <h1>📊 דוח הוצאות</h1>
      <div class="sub">חשבון: ${activeAcc?.name||"כללי"} | נוצר: ${new Date().toLocaleDateString("he-IL")}</div>
      <table><thead><tr>
        <th>תאריך</th><th>קטגוריה</th><th>בית עסק</th><th>הערה</th><th>סכום</th><th>הוסף על ידי</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <div class="total">סה"כ הוצאות: ₪${totalSpentAll.toLocaleString()}</div>
      <script>window.onload=()=>{window.print();}<\/script>
      </body></html>`;
    const blob=new Blob([html],{type:"text/html;charset=utf-8;"});
    const url=URL.createObjectURL(blob);
    window.open(url,"_blank");
    showToast("נפתח חלון הדפסה לPDF");
  }

  // ── Account edit/delete ──────────────────────────────────────────────────
  async function saveEditAcc(){
    if(!editAcc?.name?.trim()) return;
    const nh={...hh,accounts:(hh.accounts||[]).map(a=>a.id===editAcc.id?{...a,name:editAcc.name.trim(),icon:editAcc.icon}:a)};
    await doSaveHH(nh); setEditAcc(null); showToast("חשבון עודכן");
  }
  async function deleteAcc(id){
    if((hh.accounts||[]).length<=1){showToast("לא ניתן למחוק את החשבון האחרון","err");return;}
    const nh={...hh,accounts:(hh.accounts||[]).filter(a=>a.id!==id)};
    const newAccId=nh.accounts[0]?.id||"acc1";
    await doSaveHH(nh);
    if(id===accId) saveProf({...prof,accId:newAccId});
    showToast("חשבון נמחק");
  }

  function getAnalysis(){
    const keys=[]; for(let i=0;i<anM;i++) keys.push(offsetPeriod(CUR_KEY,i)); keys.reverse();
    let ex=(accData.expenses||[]).filter(e=>keys.includes(e.mKey));
    if(anCat!=="הכל") ex=ex.filter(e=>e.cat===anCat);
    const total=ex.reduce((s,e)=>s+e.amount,0);
    const byCat={}; ex.forEach(e=>{byCat[e.cat]=(byCat[e.cat]||0)+e.amount;});
    const byM={}; keys.forEach(k=>{byM[k]=0;}); ex.forEach(e=>{byM[e.mKey]=(byM[e.mKey]||0)+e.amount;});
    return {keys,total,byCat,byM};
  }

  // ─── Sync indicator color ──────────────────────────────────────────────────
  const syncColor = syncStatus==="ok"?"#4ECDC4":syncStatus==="err"?"#FF6B6B":"#666";

  // ══════════════════════════════════════════════════════════════════════════
  // ONBOARDING
  // ══════════════════════════════════════════════════════════════════════════
  const TUT_STEPS=[
    {icon:"🏠",title:"ברוכים הבאים!",desc:"אפליקציה לניהול תקציב משפחתי משותף בין שני נייד",color:"#6C63FF"},
    {icon:"💰",title:"קביעת תקציב",desc:'לחץ "קבע תקציב" בכרטיס הראשי → הכנס סכום חודשי → שמור',color:"#4ECDC4"},
    {icon:"➕",title:"הוספת הוצאה",desc:'לחץ על "הוצאה" בתפריט התחתון → סכום → קטגוריה → שם עסק → שמור',color:"#FFE66D",dark:true},
    {icon:"🔄",title:"סנכרון עם בן/בת הזוג",desc:'הגדרות → ☁️ ענן → Firebase URL. בן/בת הזוג מכניס/ה אותו URL בהגדרות → הצטרפות',color:"#82E0AA",dark:true},
    {icon:"📊",title:"ניתוח הוצאות",desc:"לשונית ניתוח → בחר מספר חודשים וקטגוריה → ראה פילוח מפורט",color:"#C39BD3"},
    {icon:"🎯",title:"יעדי חיסכון",desc:'לשונית חיסכון → הוסף יעד (חופשה, רכב...) → הפקד כסף → עקוב אחר ההתקדמות',color:"#FF8B94"},
    {icon:"📲",title:"התראות ברקע",desc:'הורד ntfy → הגדרות → 🔔 התראות → הכנס שם ערוץ → קבל התראות גם כשהאפליקציה סגורה',color:"#85C1E9"},
  ];

  if(showTutorial) return(
    <div style={{fontFamily:"'Heebo',sans-serif",direction:"rtl",background:"#0F0F1A",minHeight:"100dvh",width:"100%",color:"#fff",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700;800&display=swap');*{box-sizing:border-box}button,input{font-family:'Heebo',sans-serif;outline:none}`}</style>
      {/* Progress dots */}
      <div style={{display:"flex",justifyContent:"center",gap:6,padding:"18px 0 0"}}>
        {TUT_STEPS.map((_,i)=>(
          <div key={i} style={{width:i===tutStep?22:7,height:7,borderRadius:10,background:i===tutStep?"#6C63FF":i<tutStep?"rgba(108,99,255,0.5)":"rgba(255,255,255,0.2)",transition:"all .3s"}}/>
        ))}
      </div>
      {/* Card */}
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 28px"}}>
        <div style={{width:"100%",background:TUT_STEPS[tutStep].color+"22",border:`1px solid ${TUT_STEPS[tutStep].color}44`,borderRadius:28,padding:"36px 28px",textAlign:"center",transition:"all .3s"}}>
          <div style={{fontSize:72,marginBottom:20,lineHeight:1}}>{TUT_STEPS[tutStep].icon}</div>
          <div style={{fontSize:24,fontWeight:800,marginBottom:12,color:TUT_STEPS[tutStep].color}}>
            {TUT_STEPS[tutStep].title}
          </div>
          <div style={{fontSize:15,color:"rgba(255,255,255,0.8)",lineHeight:1.8}}>
            {TUT_STEPS[tutStep].desc}
          </div>
        </div>
      </div>
      {/* Buttons */}
      <div style={{padding:"20px 28px 36px",display:"flex",gap:10}}>
        {tutStep>0
          ? <button onClick={()=>setTutStep(t=>t-1)}
              style={{flex:1,padding:14,borderRadius:14,border:"1px solid rgba(255,255,255,0.2)",background:"transparent",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:16}}>‹ הקודם</button>
          : <button onClick={()=>setShowTutorial(false)}
              style={{flex:1,padding:14,borderRadius:14,border:"1px solid rgba(255,255,255,0.15)",background:"transparent",color:"#888",cursor:"pointer",fontSize:14}}>דלג</button>
        }
        {tutStep<TUT_STEPS.length-1
          ? <button onClick={()=>setTutStep(t=>t+1)}
              style={{flex:2,padding:14,borderRadius:14,border:"none",background:`linear-gradient(135deg,${TUT_STEPS[tutStep].color},#4ECDC4)`,color:TUT_STEPS[tutStep].dark?"#111":"#fff",cursor:"pointer",fontWeight:800,fontSize:16}}>הבא ›</button>
          : <button onClick={()=>setShowTutorial(false)}
              style={{flex:2,padding:14,borderRadius:14,border:"none",background:"linear-gradient(135deg,#6C63FF,#4ECDC4)",color:"#fff",cursor:"pointer",fontWeight:800,fontSize:17}}>🚀 בואו נתחיל!</button>
        }
      </div>
    </div>
  );

  if(!prof.onboarded) return(
    <div style={{fontFamily:"'Heebo',sans-serif",direction:"rtl",background:"#0F0F1A",minHeight:"100dvh",width:"100%",color:"#fff",display:"flex",flexDirection:"column",padding:"28px 24px",fontSize:15}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700;800&display=swap');
        *{box-sizing:border-box}input,button{font-family:'Heebo',sans-serif;outline:none}
        .ob-inp{width:100%;padding:14px 16px;border-radius:14px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.07);color:#fff;font-size:18px;direction:rtl;text-align:center}
        .ob-btn{width:100%;padding:16px;border:none;border-radius:14px;background:linear-gradient(135deg,#6C63FF,#4ECDC4);color:#fff;font-family:'Heebo',sans-serif;font-weight:800;font-size:17px;cursor:pointer}
        .ob-skip{background:none;border:none;color:#555;cursor:pointer;font-family:'Heebo',sans-serif;font-size:14px;padding:10px 0;text-align:center;width:100%}
      `}</style>
      {/* Step indicator */}
      <div style={{display:"flex",justifyContent:"center",gap:8,paddingTop:8,marginBottom:8}}>
        {[0,1].map(i=>(
          <div key={i} style={{height:5,borderRadius:10,background:i===obStep?"#6C63FF":i<obStep?"rgba(108,99,255,0.5)":"rgba(255,255,255,0.15)",transition:"all .3s",width:i===obStep?32:16}}/>
        ))}
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center"}}>

        {/* ── Step 0: Name ── */}
        {obStep===0&&<>
          <div style={{textAlign:"center",marginBottom:36}}>
            <div style={{fontSize:68,marginBottom:16}}>🏠</div>
            <div style={{fontSize:28,fontWeight:800,marginBottom:8}}>תקציב משפחתי</div>
            <div style={{fontSize:14,color:"#888",lineHeight:1.6}}>ניהול תקציב חכם לשני בני הזוג</div>
          </div>
          <div style={{fontSize:13,color:"#888",marginBottom:8,textAlign:"center"}}>מה שמך?</div>
          <input className="ob-inp" placeholder="הכנס את שמך" value={obName} autoFocus
            onChange={e=>setObName(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&obName.trim()&&setObStep(1)}
            style={{marginBottom:20,fontWeight:800,fontSize:22}} />
          <button className="ob-btn" onClick={()=>obName.trim()&&setObStep(1)}>המשך ›</button>
        </>}

        {/* ── Step 1: Firebase URL (sharing key) ── */}
        {obStep===1&&<>
          <div style={{textAlign:"center",marginBottom:24}}>
            <div style={{fontSize:56,marginBottom:12}}>🔑</div>
            <div style={{fontSize:24,fontWeight:800,marginBottom:8}}>מפתח שיתוף</div>
            <div style={{fontSize:14,color:"#888",lineHeight:1.7}}>יש לך מפתח מבן/בת הזוג? הכנס אותו כאן<br/>ותקבל את כל ההגדרות אוטומטית</div>
          </div>
          {/* Joining existing */}
          <div style={{background:"rgba(78,205,196,0.08)",border:"1px solid rgba(78,205,196,0.25)",borderRadius:16,padding:16,marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:700,color:"#4ECDC4",marginBottom:8}}>📲 יש לי מפתח שיתוף:</div>
            <input type="url" className="ob-inp"
              placeholder="https://...firebaseio.com"
              value={obDbUrl} onChange={e=>setObDbUrl(e.target.value)}
              style={{marginBottom:10,direction:"ltr",textAlign:"left",fontSize:13,background:"rgba(0,0,0,0.3)"}} />
            <button className="ob-btn" onClick={finishOnboard}
              style={{background:"linear-gradient(135deg,#4ECDC4,#82E0AA)",color:"#111"}}>
              {syncing?"מתחבר...":"🔗 הצטרף למשק בית"}
            </button>
          </div>
          {/* Divider */}
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
            <div style={{flex:1,height:1,background:"rgba(255,255,255,0.1)"}}/>
            <div style={{fontSize:13,color:"#555"}}>או</div>
            <div style={{flex:1,height:1,background:"rgba(255,255,255,0.1)"}}/>
          </div>
          {/* Creating new */}
          <div style={{background:"rgba(108,99,255,0.08)",border:"1px solid rgba(108,99,255,0.25)",borderRadius:16,padding:14,marginBottom:6}}>
            <div style={{fontSize:13,fontWeight:700,color:"#6C63FF",marginBottom:6}}>✨ אני ראשון — צור משק בית חדש:</div>
            <div style={{fontSize:12,color:"#888",lineHeight:1.8,marginBottom:10}}>
              1. <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" style={{color:"#4ECDC4"}}>console.firebase.google.com</a><br/>
              2. צור פרויקט → Build → <b>Realtime Database</b><br/>
              3. Create database → <b style={{color:"#FFE66D"}}>Start in TEST MODE</b><br/>
              4. העתק URL → הכנס למעלה
            </div>
            <button className="ob-btn" onClick={()=>{setObDbUrl("");finishOnboard();}}
              style={{background:"linear-gradient(135deg,#6C63FF,#4ECDC4)"}}>
              המשך בלי שיתוף
            </button>
          </div>
        </>}
      </div>
      {obStep>0&&<button className="ob-skip" onClick={()=>setObStep(p=>p-1)}>‹ חזור</button>}
    </div>
  );


  // ══════════════════════════════════════════════════════════════════════════
  // MAIN APP
  // ══════════════════════════════════════════════════════════════════════════
  const BottomSheet = ({children,onClose})=>(
    <div className="ov" onClick={onClose}>
      <div onClick={e=>e.stopPropagation()}
        style={{background:dark?"#1a1a2e":"#f0f0f5",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:430,padding:24,maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{width:40,height:4,borderRadius:2,background:cbr,margin:"0 auto 20px"}}/>
        {children}
      </div>
    </div>
  );

  const PeriodNav = ()=>(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:16,marginBottom:14}}>
      <button onClick={()=>setHistOffset(h=>h+1)}
        style={{background:"none",border:`1px solid ${cbr}`,color:tc,borderRadius:10,padding:"4px 14px",cursor:"pointer",fontSize:18,fontFamily:"Heebo"}}>‹</button>
      <span style={{fontSize:13,color:sub,minWidth:130,textAlign:"center"}}>{getPeriodLabel(VIEW_KEY,resetDay)}</span>
      <button onClick={()=>setHistOffset(h=>Math.max(0,h-1))} disabled={histOffset===0}
        style={{background:"none",border:`1px solid ${histOffset===0?cbr:acc}`,color:histOffset===0?sub:acc,borderRadius:10,padding:"4px 14px",cursor:histOffset===0?"default":"pointer",fontSize:18,fontFamily:"Heebo",opacity:histOffset===0?0.4:1}}>›</button>
    </div>
  );

  return(
    <div style={{fontFamily:"'Heebo',sans-serif",direction:"rtl",background:bg,minHeight:"100dvh",width:"100%",color:tc,position:"relative",zoom}}>
      <style>{css}</style>

      {/* Toast */}
      {toast&&<div style={{position:"fixed",top:14,left:"50%",transform:"translateX(-50%)",
        background:toast.type==="err"?"#FF6B6B":toast.type==="warn"?"#FFE66D":toast.type==="info"?"#4ECDC4":acc,
        color:["warn","info"].includes(toast.type)?"#111":"#fff",
        padding:"9px 22px",borderRadius:50,zIndex:9999,fontWeight:700,fontSize:13,
        whiteSpace:"nowrap",boxShadow:"0 4px 20px rgba(0,0,0,0.5)",pointerEvents:"none"}}>{toast.msg}</div>}

      {/* ── Edit Expense Sheet ── */}
      {editExp&&<BottomSheet onClose={()=>setEditExp(null)}>
        <div style={{fontSize:17,fontWeight:800,marginBottom:16}}>✏️ עריכת הוצאה</div>
        <div style={{fontSize:12,color:sub,marginBottom:6}}>סכום ₪</div>
        <input type="number" inputMode="decimal" className="inp"
          value={editExp.amt??editExp.amount}
          onChange={e=>setEditExp({...editExp,amt:e.target.value})}
          style={{textAlign:"center",fontSize:24,fontWeight:800,marginBottom:12}} autoFocus />
        <div style={{fontSize:12,color:sub,marginBottom:8}}>קטגוריה</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
          {cats.map(cat=>(
            <button key={cat} onClick={()=>setEditExp({...editExp,cat})}
              style={{padding:"5px 9px",borderRadius:20,border:`1px solid ${editExp.cat===cat?acc:cbr}`,background:editExp.cat===cat?acc+"33":"transparent",color:editExp.cat===cat?tc:sub,fontSize:12,cursor:"pointer",fontFamily:"Heebo",fontWeight:600}}>
              {cat}</button>
          ))}
        </div>
        <div style={{fontSize:12,color:sub,marginBottom:6}}>שם בית העסק</div>
        <input type="text" className="inp" value={editExp.biz||""} onChange={e=>setEditExp({...editExp,biz:e.target.value})} style={{marginBottom:10}} />
        <div style={{fontSize:12,color:sub,marginBottom:6}}>הערה</div>
        <input type="text" className="inp" value={editExp.note||""} onChange={e=>setEditExp({...editExp,note:e.target.value})} style={{marginBottom:10}} />
        <div style={{fontSize:12,color:sub,marginBottom:6}}>תאריך</div>
        <input type="date" className="inp" value={editExp.date||""} onChange={e=>setEditExp({...editExp,date:e.target.value})} style={{marginBottom:16}} />
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={()=>setEditExp(null)} style={{flex:1,padding:12,borderRadius:12,border:`1px solid ${cbr}`,background:"transparent",color:tc,cursor:"pointer",fontWeight:700,fontFamily:"Heebo",minWidth:80}}>ביטול</button>
          <button onClick={async()=>{await delExp(editExp.id);setEditExp(null);showToast("הוצאה נמחקה 🗑");}}
            style={{flex:1,padding:12,borderRadius:12,border:"1px solid #FF6B6B",background:"transparent",color:"#FF6B6B",cursor:"pointer",fontWeight:700,fontFamily:"Heebo",minWidth:80}}>🗑 מחק</button>
          <button onClick={saveEditedExp} className="btn" style={{flex:2,padding:12,minWidth:120}}>שמור שינויים</button>
        </div>
      </BottomSheet>}

      {/* ── EOM Modal ── */}
      {showEOM&&<BottomSheet onClose={()=>setShowEOM(false)}>
        {eomMode==="positive"?<>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:52,marginBottom:8}}>🎉</div>
            <div style={{fontSize:22,fontWeight:800,color:"#4ECDC4",marginBottom:6}}>כל הכבוד!</div>
            <div style={{fontSize:13,color:sub,marginBottom:6}}>סיימתם את {getPeriodLabel(PREV_KEY,resetDay)} עם יתרה של</div>
            <div style={{fontSize:34,fontWeight:800,color:"#4ECDC4",marginBottom:16}}>₪{Math.abs(prevRem).toLocaleString()}</div>
          </div>
          <button className="btn" onClick={eomToNext} style={{width:"100%",padding:13,fontSize:15,marginBottom:10}}>➕ הוסף לתקציב החודש</button>
          {savings.length>0&&<>
            <select value={eomSavGoal} onChange={e=>setEomSavGoal(e.target.value)} className="sel" style={{marginBottom:10}}>
              <option value="">בחר יעד חיסכון...</option>
              {savings.map(g=><option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}
            </select>
            <button className="btn" onClick={eomToSav} style={{width:"100%",padding:13,fontSize:15,marginBottom:10,background:"linear-gradient(135deg,#4ECDC4,#82E0AA)"}}>🎯 העבר לחיסכון</button>
          </>}
          <button onClick={()=>setShowEOM(false)} style={{width:"100%",padding:10,borderRadius:12,border:`1px solid ${cbr}`,background:"transparent",color:sub,cursor:"pointer",fontFamily:"Heebo",fontWeight:600,fontSize:13}}>אחליט מאוחר</button>
        </>:<>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:52,marginBottom:8}}>💪</div>
            <div style={{fontSize:22,fontWeight:800,color:"#FFE66D",marginBottom:6}}>קרה, זה בסדר!</div>
            <div style={{fontSize:13,color:sub,marginBottom:6}}>יצאתם מהתקציב ב-{getPeriodLabel(PREV_KEY,resetDay)} ב-</div>
            <div style={{fontSize:34,fontWeight:800,color:"#FF6B6B",marginBottom:12}}>₪{Math.abs(prevRem).toLocaleString()}</div>
            <div style={{fontSize:13,color:sub,marginBottom:16}}>חודש הבא הוא הזדמנות חדשה! 🌟</div>
          </div>
          <button className="btn" onClick={eomToNext} style={{width:"100%",padding:13,fontSize:15,marginBottom:10,background:"linear-gradient(135deg,#FF8B94,#FF6B6B)"}}>📉 העבר מינוס לחודש זה</button>
          <button onClick={()=>setShowEOM(false)} style={{width:"100%",padding:10,borderRadius:12,border:`1px solid ${cbr}`,background:"transparent",color:sub,cursor:"pointer",fontFamily:"Heebo",fontWeight:600,fontSize:13}}>אני מכסה בדרך אחרת</button>
        </>}
      </BottomSheet>}

      {/* ── Other Modals ── */}
      {showReset&&<BottomSheet onClose={()=>setShowReset(false)}>
        <div style={{textAlign:"center"}}><div style={{fontSize:42,marginBottom:10}}>⚠️</div>
          <div style={{fontSize:17,fontWeight:800,marginBottom:6}}>מחיקת כל הנתונים</div>
          <div style={{fontSize:13,color:sub,marginBottom:22}}>פעולה זו אינה הפיכה</div></div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>setShowReset(false)} style={{flex:1,padding:12,borderRadius:12,border:`1px solid ${cbr}`,background:"transparent",color:tc,cursor:"pointer",fontWeight:700,fontFamily:"Heebo"}}>ביטול</button>
          <button onClick={doResetAll} style={{flex:1,padding:12,borderRadius:12,border:"none",background:"#FF6B6B",color:"#fff",cursor:"pointer",fontWeight:700,fontFamily:"Heebo"}}>מחק הכל</button>
        </div>
      </BottomSheet>}

      {delGoalConfirm&&<BottomSheet onClose={()=>setDelGoalConfirm(null)}>
        <div style={{textAlign:"center"}}><div style={{fontSize:36,marginBottom:8}}>🗑</div>
          <div style={{fontSize:16,fontWeight:800,marginBottom:6}}>מחיקת יעד חיסכון</div>
          <div style={{fontSize:13,color:sub,marginBottom:20}}>כל הנתונים של יעד זה יימחקו</div></div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>setDelGoalConfirm(null)} style={{flex:1,padding:12,borderRadius:12,border:`1px solid ${cbr}`,background:"transparent",color:tc,cursor:"pointer",fontWeight:700,fontFamily:"Heebo"}}>ביטול</button>
          <button onClick={()=>doDelGoal(delGoalConfirm)} style={{flex:1,padding:12,borderRadius:12,border:"none",background:"#FF6B6B",color:"#fff",cursor:"pointer",fontWeight:700,fontFamily:"Heebo"}}>מחק</button>
        </div>
      </BottomSheet>}

      {showAddAcc&&<BottomSheet onClose={()=>setShowAddAcc(false)}>
        <div style={{fontSize:17,fontWeight:800,marginBottom:12}}>חשבון חדש</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:12}}>
          {["💼","🏡","🚗","🌴","💊","🎓","🎪","🛒","🐾","🎵"].map(ic=>(
            <button key={ic} onMouseDown={e=>e.preventDefault()} onClick={()=>setAccIcon(ic)}
              style={{fontSize:22,width:42,height:42,border:`2px solid ${ic===accIcon?acc:cbr}`,borderRadius:10,background:ic===accIcon?acc+"22":"transparent",cursor:"pointer"}}>{ic}</button>
          ))}
        </div>
        <input className="inp" placeholder="שם החשבון" value={accName}
          onChange={e=>setAccName(e.target.value)}
          onFocus={e=>e.stopPropagation()}
          style={{marginBottom:14}} autoFocus />
        <div style={{display:"flex",gap:10}}>
          <button onMouseDown={e=>e.preventDefault()} onClick={()=>{setShowAddAcc(false);setAccName("");}} style={{flex:1,padding:12,borderRadius:12,border:`1px solid ${cbr}`,background:"transparent",color:tc,cursor:"pointer",fontWeight:700,fontFamily:"Heebo"}}>ביטול</button>
          <button onMouseDown={e=>e.preventDefault()} onClick={doAddAccount} className="btn" style={{flex:1,padding:12}}>הוסף</button>
        </div>
      </BottomSheet>}

      {editAcc&&<BottomSheet onClose={()=>setEditAcc(null)}>
        <div style={{fontSize:17,fontWeight:800,marginBottom:12}}>✏️ עריכת חשבון</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:12}}>
          {["💼","🏡","🚗","🌴","💊","🎓","🎪","🛒","🐾","🎵"].map(ic=>(
            <button key={ic} onMouseDown={e=>e.preventDefault()} onClick={()=>setEditAcc({...editAcc,icon:ic})}
              style={{fontSize:22,width:42,height:42,border:`2px solid ${ic===editAcc.icon?acc:cbr}`,borderRadius:10,background:ic===editAcc.icon?acc+"22":"transparent",cursor:"pointer"}}>{ic}</button>
          ))}
        </div>
        <input className="inp" placeholder="שם החשבון" value={editAcc.name}
          onChange={e=>setEditAcc({...editAcc,name:e.target.value})}
          onFocus={e=>e.stopPropagation()}
          style={{marginBottom:14}} autoFocus />
        <div style={{display:"flex",gap:8}}>
          <button onMouseDown={e=>e.preventDefault()} onClick={()=>setEditAcc(null)} style={{flex:1,padding:12,borderRadius:12,border:`1px solid ${cbr}`,background:"transparent",color:tc,cursor:"pointer",fontWeight:700,fontFamily:"Heebo"}}>ביטול</button>
          {(hh.accounts||[]).length>1&&<button onMouseDown={e=>e.preventDefault()} onClick={()=>{deleteAcc(editAcc.id);setEditAcc(null);}}
            style={{flex:1,padding:12,borderRadius:12,border:"1px solid #FF6B6B",background:"transparent",color:"#FF6B6B",cursor:"pointer",fontWeight:700,fontFamily:"Heebo"}}>🗑 מחק</button>}
          <button onMouseDown={e=>e.preventDefault()} onClick={saveEditAcc} className="btn" style={{flex:1,padding:12}}>שמור</button>
        </div>
      </BottomSheet>}

      {depGoalId&&<BottomSheet onClose={()=>{setDepGoalId(null);setDepAmt("");}}>
        <div style={{textAlign:"center"}}><div style={{fontSize:34,marginBottom:8}}>💚</div>
          <div style={{fontSize:17,fontWeight:800,marginBottom:14}}>הפקדה לחיסכון</div></div>
        <input type="number" inputMode="numeric" className="inp" placeholder="סכום ₪" value={depAmt}
          onChange={e=>setDepAmt(e.target.value)} autoFocus
          style={{textAlign:"center",fontSize:26,fontWeight:800,padding:14,marginBottom:14}} onKeyDown={e=>e.key==="Enter"&&deposit()} />
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>{setDepGoalId(null);setDepAmt("");}} style={{flex:1,padding:12,borderRadius:12,border:`1px solid ${cbr}`,background:"transparent",color:tc,cursor:"pointer",fontWeight:700,fontFamily:"Heebo"}}>ביטול</button>
          <button onClick={deposit} className="btn" style={{flex:1,padding:12}}>הפקד</button>
        </div>
      </BottomSheet>}

      {wdGoalId&&<BottomSheet onClose={()=>{setWdGoalId(null);setWdAmt("");}}>
        {(()=>{const g=savings.find(x=>x.id===wdGoalId);return(<>
          <div style={{textAlign:"center"}}><div style={{fontSize:34,marginBottom:8}}>💸</div>
            <div style={{fontSize:17,fontWeight:800,marginBottom:4}}>משיכה מחיסכון</div>
            {g&&<div style={{fontSize:13,color:sub,marginBottom:14}}>{g.icon} {g.name} · יתרה: ₪{(g.saved||0).toLocaleString()}</div>}</div>
          <input type="number" inputMode="numeric" className="inp" placeholder="סכום ₪" value={wdAmt}
            onChange={e=>setWdAmt(e.target.value)} autoFocus
            style={{textAlign:"center",fontSize:26,fontWeight:800,padding:14,marginBottom:14}} onKeyDown={e=>e.key==="Enter"&&withdraw()} />
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>{setWdGoalId(null);setWdAmt("");}} style={{flex:1,padding:12,borderRadius:12,border:`1px solid ${cbr}`,background:"transparent",color:tc,cursor:"pointer",fontWeight:700,fontFamily:"Heebo"}}>ביטול</button>
            <button onClick={withdraw} style={{flex:1,padding:12,borderRadius:12,border:"none",background:"linear-gradient(135deg,#FF8B94,#FF6B6B)",color:"#fff",cursor:"pointer",fontWeight:700,fontFamily:"Heebo"}}>משוך</button>
          </div>
        </>);})()}
      </BottomSheet>}

      {showXfer&&<BottomSheet onClose={()=>{setShowXfer(false);setXferAmt("");setXferGoal("");}}>
        <div style={{textAlign:"center",marginBottom:14}}><div style={{fontSize:34,marginBottom:4}}>🔄</div>
          <div style={{fontSize:17,fontWeight:800}}>העברה לחיסכון</div>
          <div style={{fontSize:12,color:sub,marginTop:4}}>יתרה: ₪{rem.toLocaleString()}</div></div>
        {savings.length===0?<div style={{textAlign:"center",color:sub,padding:"14px 0",fontSize:13}}>אין יעדי חיסכון עדיין</div>:<>
          <select value={xferGoal} onChange={e=>setXferGoal(e.target.value)} className="sel" style={{marginBottom:10}}>
            <option value="">בחר יעד...</option>
            {savings.map(g=><option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}
          </select>
          <input type="number" inputMode="numeric" className="inp" placeholder="סכום ₪" value={xferAmt}
            onChange={e=>setXferAmt(e.target.value)} style={{textAlign:"center",fontSize:22,fontWeight:800,marginBottom:14}} />
        </>}
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>{setShowXfer(false);setXferAmt("");setXferGoal("");}} style={{flex:1,padding:12,borderRadius:12,border:`1px solid ${cbr}`,background:"transparent",color:tc,cursor:"pointer",fontWeight:700,fontFamily:"Heebo"}}>ביטול</button>
          {savings.length>0&&<button onClick={doXfer} className="btn" style={{flex:1,padding:12}}>העבר</button>}
        </div>
      </BottomSheet>}

      {/* ── Header ── */}
      <div style={{padding:"18px 18px 0",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
        <div>
          <div style={{fontSize:11,color:sub}}>שלום, <span style={{color:acc,fontWeight:700}}>{prof.name}</span></div>
          <div style={{fontSize:17,fontWeight:800}}>{getPeriodLabel(VIEW_KEY,resetDay)}</div>
          {histOffset>0&&<div style={{fontSize:10,color:"#FFE66D"}}>📅 תקופה קודמת</div>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          {(hh.accounts||[]).length>1&&(
            <select value={accId} onChange={e=>saveProf({...prof,accId:e.target.value})} className="sel" style={{padding:"3px 8px",fontSize:11,borderRadius:8,width:"auto"}}>
              {hh.accounts.map(a=><option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
            </select>
          )}
          <div onClick={()=>pullCloud(prof.dbUrl,prof,false)}
            style={{display:"flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:20,background:cb,border:`1px solid ${cbr}`,cursor:"pointer",userSelect:"none"}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:syncing?"#FFE66D":syncColor,transition:"background .3s"}}/>
            <span style={{fontSize:10,color:sub}}>{syncing?"...":"סנכרן"}</span>
          </div>
          <button onClick={()=>setView("settings")}
            style={{width:34,height:34,borderRadius:"50%",border:`1px solid ${cbr}`,background:cb,color:tc,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>⚙️</button>
        </div>
      </div>

      <div style={{padding:"12px 18px 115px"}}>

        {/* ════ HOME ══════════════════════════════════════════════════════════ */}
        {view==="home"&&<>
          <PeriodNav/>
          <div className="card" style={{padding:20,marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:14}}>
              <div>
                <div style={{fontSize:11,color:sub,marginBottom:2}}>יתרה לתקופה</div>
                <div style={{fontSize:44,fontWeight:800,lineHeight:1,color:rem<0?"#FF6B6B":rem<totalBud*0.15?"#FFE66D":"#4ECDC4"}}>
                  {rem<0?"-":""}₪{Math.abs(rem).toLocaleString()}</div>
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
              <span>{Math.round(pct)}% מהתקציב</span><span>איפוס ב-{resetDay} לחודש</span>
            </div>
            <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
              <button className="btn" onClick={()=>setView("setBudget")} style={{flex:1,padding:"9px 0",fontSize:13,minWidth:90}}>קבע תקציב</button>
              <button className="btn" onClick={()=>setView("addBudget")} style={{flex:1,padding:"9px 0",fontSize:13,minWidth:90,background:"linear-gradient(135deg,#FF8B94,#FFE66D)"}}>הגדל</button>
              {rem>0&&savings.length>0&&<button className="btn" onClick={()=>setShowXfer(true)} style={{flex:1,padding:"9px 0",fontSize:13,minWidth:90,background:"linear-gradient(135deg,#4ECDC4,#82E0AA)"}}>🔄 לחיסכון</button>}
            </div>
          </div>

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

          {viewExp.length>0&&<div className="card" style={{padding:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:12,fontWeight:700,color:sub}}>הוצאות אחרונות</div>
              <button onClick={()=>setView("history")} style={{background:"none",border:"none",color:acc,fontSize:12,cursor:"pointer",fontFamily:"Heebo",fontWeight:700}}>הכל ›</button>
            </div>
            {[...viewExp].reverse().slice(0,5).map(e=>(
              <div key={e.id} style={{display:"flex",alignItems:"center",gap:9,padding:"7px 0",borderBottom:`1px solid ${cbr}`}} onClick={()=>setEditExp({...e})}>
                <div style={{fontSize:20}}>{e.cat.split(" ")[0]}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.biz||e.cat.split(" ").slice(1).join(" ")}</div>
                  {e.biz&&<div style={{fontSize:11,color:sub}}>{e.cat}</div>}
                  <div style={{fontSize:10,color:sub}}>{new Date(e.date).toLocaleDateString("he-IL")} · {e.by}</div>
                </div>
                <div style={{fontWeight:700,color:e.transfer?"#4ECDC4":"#FF6B6B",fontSize:13,flexShrink:0}}>-₪{e.amount.toLocaleString()}</div>
                <span style={{fontSize:14,color:sub}}>✏️</span>
              </div>
            ))}
          </div>}

          {viewExp.length===0&&totalBud===0&&histOffset===0&&<div style={{textAlign:"center",padding:"50px 0",color:sub}}>
            <div style={{fontSize:52,marginBottom:14}}>💰</div>
            <div style={{fontSize:18,fontWeight:800,marginBottom:6}}>שלום {prof.name}!</div>
            <div style={{fontSize:13}}>התחל בקביעת תקציב חודשי</div>
            {!prof.dbUrl&&<div style={{marginTop:16,padding:"10px 16px",borderRadius:12,background:acc+"22",border:`1px solid ${acc}44`,fontSize:12,color:sub,lineHeight:1.7}}>
              💡 לסנכרון — הגדרות → ☁️ ענן</div>}
          </div>}
        </>}

        {/* ════ SET/ADD BUDGET ════════════════════════════════════════════════ */}
        {(view==="setBudget"||view==="addBudget")&&<div className="card" style={{padding:24}}>
          <button onClick={()=>setView("home")} style={{background:"none",border:"none",color:sub,cursor:"pointer",fontSize:22,marginBottom:14,padding:0}}>‹</button>
          <div style={{fontSize:20,fontWeight:800,marginBottom:4}}>{view==="setBudget"?"קביעת תקציב":"הגדלת תקציב"}</div>
          <div style={{fontSize:12,color:sub,marginBottom:14}}>{getPeriodLabel(VIEW_KEY,resetDay)}</div>
          <input type="number" inputMode="numeric" className="inp"
            placeholder="סכום ₪"
            value={view==="setBudget"?budVal:addBudVal}
            onChange={e=>view==="setBudget"?setBudVal(e.target.value):setAddBudVal(e.target.value)}
            style={{textAlign:"center",fontSize:28,fontWeight:800,padding:16,marginBottom:16}} autoFocus
            onKeyDown={e=>e.key==="Enter"&&(view==="setBudget"?setBudget():addBudget())} />
          <button className="btn" onClick={view==="setBudget"?setBudget:addBudget}
            style={{width:"100%",padding:14,fontSize:16,marginBottom:10,background:view==="setBudget"?undefined:"linear-gradient(135deg,#FF8B94,#FFE66D)"}}>
            {syncing?"שומר...":view==="setBudget"?"קבע תקציב":"הוסף לתקציב"}</button>
          {view==="setBudget"&&totalBud>0&&<button onClick={clearBudget}
            style={{width:"100%",padding:12,borderRadius:12,border:"1px solid #FF6B6B",background:"transparent",color:"#FF6B6B",cursor:"pointer",fontFamily:"Heebo",fontWeight:700,fontSize:14}}>
            אפס תקציב תקופה זו</button>}
        </div>}

        {/* ════ ADD EXPENSE ════════════════════════════════════════════════════ */}
        {view==="add"&&<div>
          <button onClick={()=>setView("home")} style={{background:"none",border:"none",color:sub,cursor:"pointer",fontSize:22,marginBottom:14,padding:0}}>‹</button>
          <div style={{fontSize:20,fontWeight:800,marginBottom:14}}>הוספת הוצאה</div>
          <div className="card" style={{padding:16,marginBottom:10}}>
            <div style={{fontSize:12,color:sub,marginBottom:6}}>סכום (₪)</div>
            <input type="number" inputMode="decimal" placeholder="0.00" value={ef.amt}
              onChange={e=>setEF(f=>({...f,amt:e.target.value}))}
              className="inp" style={{textAlign:"center",fontSize:28,fontWeight:800}} autoFocus />
          </div>
          <div className="card" style={{padding:16,marginBottom:10}}>
            <div style={{fontSize:12,color:sub,marginBottom:8}}>קטגוריה</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {cats.map(cat=>(
                <button key={cat} onClick={()=>setEF(f=>({...f,cat}))}
                  style={{padding:"5px 9px",borderRadius:20,border:`1px solid ${ef.cat===cat?acc:cbr}`,background:ef.cat===cat?acc+"33":"transparent",color:ef.cat===cat?tc:sub,fontSize:12,cursor:"pointer",fontFamily:"Heebo",fontWeight:600}}>
                  {cat}</button>
              ))}
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
          <div className="card" style={{padding:16,marginBottom:18}}>
            <div style={{fontSize:12,color:sub,marginBottom:6}}>תאריך</div>
            <input type="date" value={ef.date} onChange={e=>setEF(f=>({...f,date:e.target.value}))} className="inp" />
            <div style={{fontSize:11,color:sub,marginTop:6}}>תקופה: <b style={{color:acc}}>{getPeriodLabel(getPeriodKey(new Date(ef.date),resetDay),resetDay)}</b></div>
          </div>
          <button className="btn" onClick={addExp} style={{width:"100%",padding:16,fontSize:17}}>{syncing?"שומר...":"➕ רשום הוצאה"}</button>
        </div>}

        {/* ════ HISTORY ═══════════════════════════════════════════════════════ */}
        {view==="history"&&<div>
          <button onClick={()=>setView("home")} style={{background:"none",border:"none",color:sub,cursor:"pointer",fontSize:22,marginBottom:14,padding:0}}>‹</button>
          <div style={{fontSize:20,fontWeight:800,marginBottom:10}}>היסטוריה</div>
          <PeriodNav/>
          {viewExp.length===0&&<div style={{textAlign:"center",color:sub,padding:40}}>אין הוצאות בתקופה זו</div>}
          {[...viewExp].reverse().map(e=>(
            <div key={e.id} className="card" style={{padding:"12px 14px",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:9}}>
                <div style={{fontSize:22}}>{e.cat.split(" ")[0]}</div>
                <div style={{flex:1,minWidth:0}}>
                  {e.biz&&<div style={{fontSize:14,fontWeight:700}}>{e.biz}</div>}
                  <div style={{fontSize:13,fontWeight:e.biz?400:600,color:e.biz?sub:tc}}>{e.cat}</div>
                  {e.note&&<div style={{fontSize:11,color:sub}}>{e.note}</div>}
                  <div style={{fontSize:10,color:sub}}>{new Date(e.date).toLocaleDateString("he-IL")} · {e.by}</div>
                </div>
                <div style={{fontWeight:700,color:e.transfer?"#4ECDC4":"#FF6B6B",fontSize:13,flexShrink:0}}>-₪{e.amount.toLocaleString()}</div>
                <button onClick={()=>setEditExp({...e})} style={{background:"none",border:"none",color:acc,cursor:"pointer",fontSize:16,padding:"0 2px"}}>✏️</button>
                <button onClick={()=>delExp(e.id)} style={{background:"none",border:"none",color:sub,cursor:"pointer",fontSize:17,padding:"0 4px"}}>🗑</button>
              </div>
            </div>
          ))}
        </div>}

        {/* ════ ANALYSIS ══════════════════════════════════════════════════════ */}
        {view==="analysis"&&(()=>{
          const {keys,total,byCat,byM}=getAnalysis();
          const sc=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
          const maxM=Math.max(...Object.values(byM),1);
          return <div>
            <button onClick={()=>setView("home")} style={{background:"none",border:"none",color:sub,cursor:"pointer",fontSize:22,marginBottom:14,padding:0}}>‹</button>
            <div style={{fontSize:20,fontWeight:800,marginBottom:14}}>ניתוח הוצאות 📊</div>
            <div className="card" style={{padding:16,marginBottom:14}}>
              <div style={{display:"flex",gap:8,marginBottom:14}}>
                {[1,3,6,12].map(n=>(
                  <button key={n} onClick={()=>setAnM(n)} className={`seg${anM===n?" on":""}`} style={{flex:1,fontSize:13}}>{n===1?"חודש":`${n}ח'`}</button>
                ))}
              </div>
              <select value={anCat} onChange={e=>setAnCat(e.target.value)} className="sel">
                <option value="הכל">הכל</option>
                {cats.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="card" style={{padding:16,marginBottom:14,textAlign:"center"}}>
              <div style={{fontSize:11,color:sub}}>סה"כ {anM} תקופות</div>
              <div style={{fontSize:36,fontWeight:800,color:acc}}>₪{total.toLocaleString()}</div>
              <div style={{fontSize:12,color:sub}}>ממוצע: ₪{Math.round(total/anM).toLocaleString()} / תקופה</div>
            </div>
            <div className="card" style={{padding:16,marginBottom:14}}>
              <div style={{fontSize:12,fontWeight:700,color:sub,marginBottom:10}}>לפי תקופה</div>
              {keys.map((k,i)=>(
                <div key={k} style={{marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
                    <span style={{color:sub}}>{getPeriodLabel(k,resetDay)}</span>
                    <span style={{fontWeight:700}}>₪{(byM[k]||0).toLocaleString()}</span>
                  </div>
                  <div style={{background:dark?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.08)",borderRadius:8,height:8}}>
                    <div style={{width:`${((byM[k]||0)/maxM)*100}%`,height:8,borderRadius:8,background:CLR[i%CLR.length]}}/>
                  </div>
                </div>
              ))}
            </div>
            {anCat==="הכל"&&sc.length>0&&<div className="card" style={{padding:16}}>
              <div style={{fontSize:12,fontWeight:700,color:sub,marginBottom:10}}>לפי קטגוריה</div>
              {sc.map(([cat,amt],i)=>(
                <div key={cat} style={{marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}>
                    <span>{cat}</span><span style={{fontWeight:700}}>₪{amt.toLocaleString()}</span>
                  </div>
                  <div style={{background:dark?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.08)",borderRadius:8,height:8}}>
                    <div style={{width:`${total>0?(amt/total)*100:0}%`,height:8,borderRadius:8,background:CLR[i%CLR.length]}}/>
                  </div>
                </div>
              ))}
            </div>}
          </div>;
        })()}

        {/* ════ SAVINGS ═══════════════════════════════════════════════════════ */}
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
                  <div>
                    <div style={{fontWeight:700,fontSize:15}}>{g.name}</div>
                    <div style={{fontSize:11,color:sub}}>₪{(g.saved||0).toLocaleString()} / ₪{g.target.toLocaleString()}</div>
                    <div style={{fontSize:11,color:sub}}>נותר: ₪{Math.max(0,g.target-(g.saved||0)).toLocaleString()}</div>
                  </div>
                </div>
                <div style={{fontSize:26,fontWeight:800,color:g.saved>=g.target?"#4ECDC4":acc}}>{Math.min(100,Math.round(((g.saved||0)/g.target)*100))}%</div>
              </div>
              <div style={{background:dark?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.08)",borderRadius:10,height:14,marginBottom:10,overflow:"hidden"}}>
                <div style={{width:`${Math.min(100,((g.saved||0)/g.target)*100)}%`,height:14,borderRadius:10,background:g.saved>=g.target?"#4ECDC4":`linear-gradient(90deg,${acc},#4ECDC4)`,transition:"width .5s"}}/>
              </div>
              {g.saved>=g.target&&<div style={{textAlign:"center",color:"#4ECDC4",fontWeight:700,fontSize:14,marginBottom:8}}>🎉 יעד הושג!</div>}
              <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                <button className="btn" onClick={()=>setDepGoalId(g.id)} style={{flex:1,padding:9,fontSize:13,minWidth:80}}>+ הפקד</button>
                {(g.saved||0)>0&&<button onClick={()=>{setWdGoalId(g.id);setWdAmt("");}}
                  style={{flex:1,padding:9,borderRadius:12,border:"1px solid #FFE66D",background:"transparent",color:"#FFE66D",cursor:"pointer",fontFamily:"Heebo",fontWeight:700,fontSize:13,minWidth:80}}>💸 משוך</button>}
                <button onClick={()=>setDelGoalConfirm(g.id)}
                  style={{padding:"9px 12px",borderRadius:10,border:`1px solid ${cbr}`,background:"transparent",color:"#FF6B6B",cursor:"pointer",fontSize:14}}>🗑</button>
              </div>
            </div>
          ))}
          <div className="card" style={{padding:16,marginTop:4}}>
            <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>יעד חדש ✨</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:12}}>
              {SAV_ICONS.map(ic=>(
                <button key={ic} onClick={()=>setSvIcon(ic)}
                  style={{fontSize:22,width:40,height:40,border:`2px solid ${ic===svIcon?acc:cbr}`,borderRadius:10,background:ic===svIcon?acc+"22":"transparent",cursor:"pointer"}}>{ic}</button>
              ))}
            </div>
            <input type="text" className="inp" placeholder="שם היעד" value={svName} onChange={e=>setSvName(e.target.value)} style={{marginBottom:10}} />
            <input type="number" inputMode="numeric" className="inp" placeholder="סכום יעד ₪" value={svTarget} onChange={e=>setSvTarget(e.target.value)} style={{marginBottom:14}} />
            <button className="btn" onClick={addSavGoal} style={{width:"100%",padding:12,fontSize:15}}>{syncing?"שומר...":"הוסף יעד"}</button>
          </div>
        </div>}

        {/* ════ SETTINGS ══════════════════════════════════════════════════════ */}
        {view==="settings"&&<div>
          <button onClick={()=>setView("home")} style={{background:"none",border:"none",color:sub,cursor:"pointer",fontSize:22,marginBottom:14,padding:0}}>‹</button>
          <div style={{fontSize:20,fontWeight:800,marginBottom:14}}>הגדרות ⚙️</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
            {[{id:"profile",l:"👤"},{id:"cloud",l:"☁️ ענן"},{id:"notif",l:"🔔 התראות"},{id:"export",l:"📤 יצוא"},{id:"cats",l:"🏷️"},{id:"appear",l:"🎨"},{id:"accounts",l:"💼"},{id:"danger",l:"⚠️"}].map(({id,l})=>(
              <button key={id} onClick={()=>setSect(id)} className={`seg${sect===id?" on":""}`} style={{padding:"7px 12px",fontSize:13}}>{l}</button>
            ))}
          </div>

          {sect==="profile"&&<div className="card" style={{padding:20}}>
            <div style={{fontSize:13,color:sub,marginBottom:6}}>שם</div>
            <input type="text" className="inp" value={prof.name} onChange={e=>saveProf({...prof,name:e.target.value})} style={{marginBottom:16}} />
            <div style={{fontSize:13,color:sub,marginBottom:10}}>יום איפוס בחודש</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {Array.from({length:28},(_,i)=>i+1).map(d=>(
                <button key={d} onClick={async()=>{
                  saveProf({...prof,settings:{...s,resetDay:d}});
                  // sync resetDay to cloud so partner inherits it
                  if(prof.dbUrl){ const nh2={...hh,_sharedSettings:{resetDay:d}}; await saveHH(nh2,prof.dbUrl); }
                }}
                  className={`seg${s.resetDay===d?" on":""}`} style={{width:38,height:38,borderRadius:8,fontSize:12}}>{d}</button>
              ))}
            </div>
          </div>}

          {/* ── Notifications ── */}
          {sect==="notif"&&<div>
            {/* Permission status */}
            <div className="card" style={{padding:16,marginBottom:12}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:10}}>סטטוס התראות</div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:notifPerm==="granted"?"#4ECDC4":"#FF6B6B",flexShrink:0}}/>
                <div style={{fontSize:13}}>{notifPerm==="granted"?"התראות פעילות ✅":notifPerm==="denied"?"התראות נחסמו בדפדפן ❌":!canNotify()?"הדפדפן לא תומך בהתראות":"התראות לא הופעלו עדיין"}</div>
              </div>
              {notifPerm!=="granted"&&canNotify()&&<button className="btn" onClick={handleNotifPermRequest} style={{width:"100%",padding:11,fontSize:14}}>
                🔔 הפעל התראות
              </button>}
              {notifPerm==="denied"&&<div style={{fontSize:12,color:sub,marginTop:8,lineHeight:1.7,padding:"8px 10px",background:"rgba(255,107,107,0.1)",borderRadius:10}}>
                ההתראות נחסמו ידנית. כדי להפעיל: גדרות הדפדפן → האתר הזה → התראות → אפשר, ואז רענן את האפליקציה.</div>}
              {!canNotify()&&<div style={{fontSize:12,color:sub,marginTop:8,lineHeight:1.7,padding:"8px 10px",background:"rgba(255,227,100,0.1)",borderRadius:10}}>
                💡 ב-iPhone: הוסף לדף הבית (Add to Home Screen) כדי לאפשר התראות (iOS 16.4+)</div>}
            </div>

            {/* ntfy.sh background push setup */}
            <div className="card" style={{padding:16,marginBottom:12,border:`1px solid ${acc}44`}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <span style={{fontSize:22}}>📲</span>
                <div>
                  <div style={{fontSize:14,fontWeight:700}}>התראות ברקע — ntfy</div>
                  <div style={{fontSize:11,color:sub}}>מופיע גם כשהאפליקציה סגורה</div>
                </div>
                <div style={{marginRight:"auto",padding:"2px 8px",borderRadius:20,background:(s.ntfyChannel||"").trim()?acc+"33":"rgba(255,107,107,0.2)",border:`1px solid ${(s.ntfyChannel||"").trim()?acc:"#FF6B6B"}`,fontSize:10,fontWeight:700,color:(s.ntfyChannel||"").trim()?acc:"#FF6B6B"}}>
                  {(s.ntfyChannel||"").trim()?"פעיל ✓":"לא מוגדר"}
                </div>
              </div>

              {/* Step by step setup */}
              <div style={{background:acc+"11",border:`1px solid ${acc}22`,borderRadius:12,padding:12,marginBottom:12,fontSize:12,color:sub,lineHeight:1.9}}>
                <div style={{fontWeight:700,color:tc,marginBottom:4}}>⚡ הגדרה (2 דקות):</div>
                <div>1. הורד <b style={{color:acc}}>ntfy</b> ב-<a href="https://apps.apple.com/app/ntfy/id1625396347" target="_blank" rel="noreferrer" style={{color:"#4ECDC4"}}>App Store</a> (iPhone) / <a href="https://play.google.com/store/apps/details?id=io.hndrk.ntfy" target="_blank" rel="noreferrer" style={{color:"#4ECDC4"}}>Google Play</a> (אנדרואיד)</div>
                <div>2. פתח ntfy → לחץ <b>+</b> → הכנס שם ערוץ ייחודי (ראה למטה)</div>
                <div>3. בן/בת הזוג עושה אותו דבר עם <b>אותו שם ערוץ</b></div>
                <div>4. הכנס את שם הערוץ כאן ↓</div>
                <div style={{color:"#FFE66D",marginTop:4}}>⚠️ בחר שם ייחודי! לדוגמה: <b>mishpacha-cohen-25</b></div>
              </div>

              <div style={{fontSize:12,color:sub,marginBottom:6}}>שם הערוץ שלך</div>
              <div style={{display:"flex",gap:8,marginBottom:8}}>
                <input type="text" className="inp"
                  placeholder="mishpacha-cohen-25"
                  value={s.ntfyChannel||""}
                  onChange={e=>saveProf({...prof,settings:{...s,ntfyChannel:e.target.value.replace(/\s/g,"-").toLowerCase()}})}
                  style={{flex:1,direction:"ltr",textAlign:"left",fontSize:13}}
                />
                <button className="btn"
                  onClick={async()=>{
                    const ch=(s.ntfyChannel||"").trim();
                    if(!ch){showToast("הכנס שם ערוץ","err");return;}
                    showToast("שולח בדיקה...");
                    await ntfyPush(ch,"✅ ntfy עובד!","האפליקציה מחוברת לערוץ "+ch,"high");
                    showToast("נשלח! בדוק את אפליקציית ntfy 📲");
                  }}
                  style={{padding:"10px 14px",fontSize:13,flexShrink:0}}>
                  בדוק
                </button>
              </div>
              {(s.ntfyChannel||"").trim()&&<div style={{fontSize:11,color:sub,textAlign:"center",padding:"6px 10px",background:acc+"11",borderRadius:8}}>
                ערוץ פעיל: <b style={{color:acc}}>{s.ntfyChannel}</b> — שלח שם זה לבן/בת הזוג
              </div>}
            </div>

            {/* Partner notifications */}
            <div className="card" style={{padding:16,marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div>
                  <div style={{fontSize:14,fontWeight:600}}>התראה על הוצאה של בן/בת הזוג</div>
                  <div style={{fontSize:11,color:sub,marginTop:2}}>קבל התראה כשבן/בת הזוג מוסיף/ה הוצאה</div>
                </div>
                <div onClick={()=>saveProf({...prof,settings:{...s,partnerNotif:!s.partnerNotif}})}
                  style={{width:48,height:26,borderRadius:50,background:s.partnerNotif?acc:dark?"rgba(255,255,255,0.15)":"rgba(0,0,0,0.15)",cursor:"pointer",position:"relative",transition:"background .2s",flexShrink:0}}>
                  <div style={{position:"absolute",top:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s",left:s.partnerNotif?"25px":"3px",boxShadow:"0 1px 4px rgba(0,0,0,0.3)"}}/>
                </div>
              </div>
              <div style={{fontSize:11,color:sub,lineHeight:1.6,padding:"6px 10px",background:cb,borderRadius:8,marginTop:4}}>
                💡 לפעולה ברקע — הגדר ערוץ ntfy למעלה. ללא ntfy, ההתראה תגיע רק כשהאפליקציה פתוחה.
              </div>
            </div>

            {/* Reminder */}
            {notifPerm==="granted"&&<div className="card" style={{padding:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div>
                  <div style={{fontSize:14,fontWeight:600}}>תזכורת עדכון הוצאות</div>
                  <div style={{fontSize:11,color:sub,marginTop:2}}>התראה יומית לעדכון</div>
                </div>
                <div onClick={()=>updateReminder("reminder",!s.reminder)}
                  style={{width:48,height:26,borderRadius:50,background:s.reminder?acc:dark?"rgba(255,255,255,0.15)":"rgba(0,0,0,0.15)",cursor:"pointer",position:"relative",transition:"background .2s",flexShrink:0}}>
                  <div style={{position:"absolute",top:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s",left:s.reminder?"25px":"3px",boxShadow:"0 1px 4px rgba(0,0,0,0.3)"}}/>
                </div>
              </div>
              {s.reminder&&<>
                <div style={{fontSize:13,color:sub,marginBottom:10}}>שעת התזכורת</div>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:11,color:sub,marginBottom:4}}>שעה</div>
                    <select value={s.reminderHour??21} onChange={e=>updateReminder("reminderHour",parseInt(e.target.value))} className="sel">
                      {Array.from({length:24},(_,i)=>i).map(h=><option key={h} value={h}>{String(h).padStart(2,"0")}</option>)}
                    </select>
                  </div>
                  <div style={{fontSize:20,fontWeight:800,paddingTop:16}}>:</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:11,color:sub,marginBottom:4}}>דקה</div>
                    <select value={s.reminderMin??0} onChange={e=>updateReminder("reminderMin",parseInt(e.target.value))} className="sel">
                      {[0,5,10,15,20,30,45].map(m=><option key={m} value={m}>{String(m).padStart(2,"0")}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{fontSize:12,color:acc,textAlign:"center",padding:"8px 12px",background:acc+"11",borderRadius:10,border:`1px solid ${acc}33`}}>
                  📅 תזכורת ב-{String(s.reminderHour??21).padStart(2,"0")}:{String(s.reminderMin??0).padStart(2,"0")} בכל יום
                </div>
                <div style={{fontSize:13,color:sub,marginTop:14,marginBottom:8,fontWeight:600}}>לשון הודעת התזכורת</div>
                <div style={{display:"flex",gap:8,marginBottom:4}}>
                  {[["he","🇮🇱 עברית"],["en","🇺🇸 English"],["ar","🇸🇦 العربية"]].map(([lang,label])=>(
                    <button key={lang} onClick={()=>saveProf({...prof,settings:{...s,reminderLang:lang}})}
                      className={`seg${(s.reminderLang||"he")===lang?" on":""}`}
                      style={{flex:1,padding:"8px 4px",fontSize:12}}>{label}</button>
                  ))}
                </div>
                {(()=>{
                  const msgs={
                    he:["האם עדכנת את ההוצאות שלך היום? 💰","זכור לרשום את ההוצאות! 📝","זמן לעדכן תקציב! ⏰"],
                    en:["Did you update your expenses today? 💰","Don't forget to log your spending! 📝","Time to update your budget! ⏰"],
                    ar:["هل سجلت مصاريفك اليوم؟ 💰","لا تنسَ تسجيل النفقات! 📝","حان وقت تحديث الميزانية! ⏰"]
                  };
                  const lang=s.reminderLang||"he";
                  return <div style={{fontSize:11,color:sub,marginTop:6,padding:"8px 10px",background:cb,borderRadius:8,lineHeight:1.8}}>
                    {msgs[lang].map((m,i)=><div key={i}>• {m}</div>)}
                  </div>;
                })()}
                <div style={{fontSize:11,color:sub,marginTop:8,lineHeight:1.6,textAlign:"center"}}>
                  ⚠️ ב-iPhone ההתראה תצלצל רק כשהאפליקציה פתוחה, אלא אם כן הוספת לדף הבית (PWA)
                </div>
              </>}
            </div>}
          </div>}

          {sect==="cloud"&&<div>
            <div className="card" style={{padding:16,marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <div style={{width:12,height:12,borderRadius:"50%",background:syncColor,flexShrink:0}}/>
                <div style={{fontSize:14,fontWeight:700}}>{prof.dbUrl?(syncStatus==="ok"?"מחובר ✅":"בעיית חיבור ❌"):"לא מחובר לענן"}</div>
              </div>
              {prof.dbUrl&&<div style={{fontSize:11,color:sub,wordBreak:"break-all",padding:"6px 10px",background:cb,borderRadius:8,border:`1px solid ${cbr}`}}>{prof.dbUrl}</div>}
            </div>
            <div className="card" style={{padding:16,marginBottom:12}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:10}}>Firebase URL</div>
              <div style={{fontSize:12,color:sub,lineHeight:1.9,marginBottom:12,padding:"10px 12px",background:acc+"11",borderRadius:10,border:`1px solid ${acc}33`}}>
                <div style={{fontWeight:700,color:tc,marginBottom:4}}>🔧 הגדרה (5 דקות, חינם):</div>
                <div>1. <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" style={{color:"#4ECDC4"}}>console.firebase.google.com</a></div>
                <div>2. Build → Realtime Database → Create → <b style={{color:"#FFE66D"}}>TEST MODE</b></div>
                <div>3. העתק URL → הכנס → "בדוק וחבר"</div>
                <div>4. שלח URL לבן/בת הזוג → הגדרות → ענן → הצטרפות</div>
                <div style={{color:"#FF8B94",marginTop:4}}>⚠️ בן/בת הזוג לא צריך/ה חשבון Firebase!</div>
              </div>
              <input type="url" className="inp" value={settingsDbUrl} onChange={e=>setSettingsDbUrl(e.target.value)}
                style={{marginBottom:8,direction:"ltr",textAlign:"left",fontSize:12}} />
              <button className="btn" onClick={testSync} style={{width:"100%",padding:12,fontSize:14,marginBottom:6}}>
                {syncing?"בודק...":"בדוק וחבר"}</button>
              {syncTestMsg&&<div style={{fontSize:12,padding:"8px 12px",borderRadius:10,background:syncTestMsg.startsWith("✅")?"rgba(78,205,196,0.15)":"rgba(255,107,107,0.15)",color:syncTestMsg.startsWith("✅")?"#4ECDC4":"#FF6B6B",textAlign:"center"}}>{syncTestMsg}</div>}
            </div>
            {prof.dbUrl&&<div className="card" style={{padding:16,marginBottom:12}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:8}}>שתף עם בן/בת הזוג</div>
              <button className="btn" onClick={()=>{
                const t=`קוד סנכרון לאפליקציית תקציב: ${prof.dbUrl}`;
                if(navigator.share) navigator.share({title:"תקציב משפחתי",text:t}).catch(()=>{});
                else{ navigator.clipboard?.writeText(prof.dbUrl); showToast("URL הועתק ✓"); }
              }} style={{width:"100%",padding:11,fontSize:14}}>📤 שתף URL</button>
            </div>}
            <div className="card" style={{padding:16}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:8}}>הצטרפות</div>
              <input type="url" className="inp" value={joinDbUrl} onChange={e=>setJoinDbUrl(e.target.value)}
                style={{marginBottom:12,direction:"ltr",textAlign:"left",fontSize:12}} />
              <button className="btn" onClick={async()=>{
                const url=(joinDbUrl||"").trim().replace(/\/+$/,""); if(!url) return;
                setSyncing(true); const res=await fbRead(url); setSyncing(false);
                if(!res.ok||!res.data){showToast("כתובת לא נמצאה","err");return;}
                saveProf({...prof,dbUrl:url}); setSettingsDbUrl(url);
                lsSet(LS_HH,res.data); setHH_(res.data); setJoinDbUrl(""); showToast("הצטרפת! 🎉");
              }} style={{width:"100%",padding:12,fontSize:15}}>{syncing?"מחבר...":"הצטרף למשק בית"}</button>
            </div>
          </div>}

          {sect==="cats"&&<div>
            <div className="card" style={{padding:16,marginBottom:12}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>קטגוריות קיימות</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                {cats.map(cat=>(
                  <div key={cat} style={{display:"flex",alignItems:"center",gap:4,padding:"5px 10px",borderRadius:20,border:`1px solid ${cbr}`,background:cb}}>
                    <span style={{fontSize:13}}>{cat}</span>
                    {cats.length>1&&<button onClick={()=>removeCat(cat)}
                      style={{background:"none",border:"none",color:"#FF6B6B",cursor:"pointer",fontSize:16,padding:"0 2px",lineHeight:1}}>×</button>}
                  </div>
                ))}
              </div>
            </div>
            <div className="card" style={{padding:16}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>הוסף קטגוריה</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:12}}>
                {CAT_ICONS.map(ic=>(
                  <button key={ic} onClick={()=>setNCI(ic)}
                    style={{fontSize:20,width:38,height:38,border:`2px solid ${ic===newCatIcon?acc:cbr}`,borderRadius:9,background:ic===newCatIcon?acc+"22":"transparent",cursor:"pointer"}}>{ic}</button>
                ))}
              </div>
              <input type="text" className="inp" placeholder="שם הקטגוריה" value={newCatName}
                onChange={e=>setNCN(e.target.value)} style={{marginBottom:12}} onKeyDown={e=>e.key==="Enter"&&addCat()} />
              <button className="btn" onClick={addCat} style={{width:"100%",padding:12,fontSize:15}}>+ הוסף</button>
            </div>
          </div>}

          {sect==="appear"&&<div className="card" style={{padding:20}}>
            <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>גודל תצוגה</div>
            <div style={{display:"flex",gap:8,marginBottom:20}}>
              {[["small","קטן"],["medium","בינוני"],["large","גדול"]].map(([sz,l])=>(
                <button key={sz} onClick={()=>saveProf({...prof,settings:{...s,fontSize:sz}})}
                  className={`seg${s.fontSize===sz?" on":""}`} style={{flex:1,padding:"10px 0",fontSize:14}}>{l}</button>
              ))}
            </div>
            <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>ערכות נושא</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:20}}>
              {THEMES.map(t=>(
                <button key={t.l} onClick={()=>saveProf({...prof,settings:{...s,bg:t.bg,text:t.text,accent:t.accent}})}
                  style={{flex:"1 1 calc(50% - 4px)",padding:"11px 4px",borderRadius:12,border:`2px solid ${s.bg===t.bg?t.accent:cbr}`,background:t.bg,color:t.text,cursor:"pointer",fontFamily:"Heebo",fontSize:12,fontWeight:700}}>{t.l}</button>
              ))}
            </div>
            <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>צבעים מותאמים</div>
            {[{l:"רקע",k:"bg"},{l:"טקסט",k:"text"},{l:"צבע ראשי",k:"accent"}].map(({l,k})=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <span style={{fontSize:13}}>{l}</span>
                <input type="color" value={s[k]} onChange={e=>saveProf({...prof,settings:{...s,[k]:e.target.value}})}
                  style={{width:40,height:36,borderRadius:8,border:`1px solid ${cbr}`,cursor:"pointer",background:"transparent",padding:2}} />
              </div>
            ))}
          </div>}

          {sect==="accounts"&&<div>
            {(hh.accounts||[]).map(a=>(
              <div key={a.id} className="card" style={{padding:14,marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
                <div style={{fontSize:26}}>{a.icon}</div>
                <div style={{flex:1,fontWeight:600}}>{a.name}</div>
                {a.id===accId&&<span style={{fontSize:11,color:acc,fontWeight:700,border:`1px solid ${acc}`,borderRadius:20,padding:"2px 8px"}}>פעיל</span>}
                {a.id!==accId&&<button onClick={()=>saveProf({...prof,accId:a.id})}
                  style={{padding:"5px 10px",borderRadius:10,border:`1px solid ${cbr}`,background:"transparent",color:sub,cursor:"pointer",fontFamily:"Heebo",fontSize:12}}>עבור</button>}
                <button onClick={()=>setEditAcc({id:a.id,name:a.name,icon:a.icon})}
                  style={{padding:"5px 8px",borderRadius:10,border:`1px solid ${cbr}`,background:"transparent",color:sub,cursor:"pointer",fontSize:14}}>✏️</button>
              </div>
            ))}
            <button className="btn" onClick={()=>setShowAddAcc(true)} style={{width:"100%",padding:12,marginTop:4,fontSize:15}}>+ חשבון חדש</button>
          </div>}

          {sect==="danger"&&<div className="card" style={{padding:20}}>
            <div style={{fontSize:14,fontWeight:700,color:"#FF6B6B",marginBottom:16}}>⚠️ אזור מסוכן</div>
            <button onClick={()=>setShowReset(true)} style={{width:"100%",padding:12,borderRadius:12,border:"1px solid #FF6B6B",background:"transparent",color:"#FF6B6B",cursor:"pointer",fontFamily:"Heebo",fontWeight:700,fontSize:14}}>מחק את כל הנתונים</button>
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
