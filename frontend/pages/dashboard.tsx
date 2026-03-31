import Head from 'next/head'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import {
  onAuth, signOut, getConnections, saveConnection, removeConnection, touchConnection,
  subscribeToLogs, persistLog,
  type SavedConnection,
} from '../lib/firebase'
import type { User } from 'firebase/auth'

const API  = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'
const POLL = 2500

type Tab    = 'feed' | 'analytics' | 'packages' | 'quarantine'
type Filter = 'all' | 'today' | 'hour' | 'week'

interface Log {
  id: number; package: string; manager: string
  status: 'allowed'|'blocked'|'quarantined'; risk_score: number
  reason: string; flags: string[]; timestamp: string; connection_id: string
}
interface Stats {
  total:number; allowed:number; blocked:number; quarantined:number; avg_risk:number
  top_flags:{flag:string;count:number}[]
}
interface QuarantineEntry { package:string; manager:string; risk_score:number; reason:string; added_at:string }

// ── Toast ─────────────────────────────────────────────────────────────────────
interface Toast { id:number; msg:string; type:'ok'|'err'|'warn'|'info' }
function ToastStack({ items, rm }: { items:Toast[]; rm:(id:number)=>void }) {
  return (
    <div style={{ position:'fixed',bottom:24,right:24,zIndex:9999,display:'flex',flexDirection:'column',gap:8 }}>
      {items.map(t => (
        <div key={t.id} onClick={()=>rm(t.id)} style={{
          padding:'11px 17px',borderRadius:12,cursor:'pointer',backdropFilter:'blur(12px)',
          background: t.type==='ok'?'rgba(197,213,69,.14)':t.type==='err'?'rgba(255,59,48,.12)':t.type==='warn'?'rgba(234,198,66,.12)':'rgba(234,102,61,.12)',
          border:`1px solid ${t.type==='ok'?'rgba(197,213,69,.4)':t.type==='err'?'rgba(255,59,48,.3)':t.type==='warn'?'rgba(234,198,66,.3)':'rgba(234,102,61,.3)'}`,
          color: t.type==='ok'?'#4a6e00':t.type==='err'?'#cc2200':t.type==='warn'?'#7a5800':'#EA663D',
          fontSize:13,fontWeight:600,display:'flex',alignItems:'center',gap:8,maxWidth:320,
          boxShadow:'0 8px 28px rgba(0,0,0,.15)',animation:'toastIn .3s cubic-bezier(.34,1.56,.64,1) both',
        }}>
          <span>{t.type==='ok'?'✓':t.type==='err'?'✗':t.type==='warn'?'⚠':'◈'}</span>
          <span style={{flex:1}}>{t.msg}</span>
          <span style={{opacity:.4,fontSize:11}}>✕</span>
        </div>
      ))}
    </div>
  )
}

// ── RiskBar ───────────────────────────────────────────────────────────────────
function RiskBar({ s }: { s:number }) {
  const c = s>=75?'#FF3B30':s>=45?'#EAC642':'#C5D545'
  return (
    <div style={{display:'flex',alignItems:'center',gap:8,minWidth:140}}>
      <div style={{flex:1,height:5,background:'rgba(0,0,0,.07)',borderRadius:3,overflow:'hidden'}}>
        <div style={{height:'100%',width:`${s}%`,background:c,borderRadius:3,transition:'width .6s ease',boxShadow:`0 0 5px ${c}60`}} />
      </div>
      <span style={{fontFamily:'var(--mono)',fontSize:12,color:c,fontWeight:700,minWidth:24}}>{s}</span>
    </div>
  )
}

// ── StatusPill ────────────────────────────────────────────────────────────────
function StatusPill({ s }: { s:string }) {
  const m: Record<string,{c:string;bg:string;b:string;icon:string}> = {
    allowed:    {c:'#4a6e00',bg:'rgba(197,213,69,.12)',b:'rgba(197,213,69,.3)',icon:'✓'},
    blocked:    {c:'#cc2200',bg:'rgba(255,59,48,.09)', b:'rgba(255,59,48,.25)',icon:'✗'},
    quarantined:{c:'#7a5800',bg:'rgba(234,198,66,.1)', b:'rgba(234,198,66,.3)',icon:'⚠'},
  }
  const p = m[s]??m.allowed
  return <span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:100,background:p.bg,color:p.c,fontFamily:'var(--mono)',fontSize:11,fontWeight:700,border:`1px solid ${p.b}`,whiteSpace:'nowrap'}}>{p.icon} {s.toUpperCase()}</span>
}

// ── Donut ─────────────────────────────────────────────────────────────────────
function Donut({ val, total, color, label }: { val:number; total:number; color:string; label:string }) {
  const r=34, c=2*Math.PI*r, pct=total>0?val/total:0, dash=pct*c
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
      <svg width={88} height={88} viewBox="0 0 88 88">
        <circle cx={44} cy={44} r={r} fill="none" stroke="rgba(0,0,0,.06)" strokeWidth={7}/>
        <circle cx={44} cy={44} r={r} fill="none" stroke={color} strokeWidth={7}
          strokeDasharray={`${dash} ${c}`} strokeLinecap="round" transform="rotate(-90 44 44)"
          style={{filter:`drop-shadow(0 0 4px ${color})`,transition:'stroke-dasharray .8s ease'}}/>
        <text x={44} y={49} textAnchor="middle" fill={color} fontSize={13} fontWeight={700} fontFamily="'JetBrains Mono',monospace">{val}</text>
      </svg>
      <div style={{fontSize:12,color:'#666',textAlign:'center'}}>{label}</div>
      <div style={{fontFamily:'var(--mono)',fontSize:11,color,fontWeight:700}}>{total>0?Math.round(pct*100):0}%</div>
    </div>
  )
}

function applyFilter(logs: Log[], f: Filter): Log[] {
  if (f==='all') return logs
  const now=Date.now(), cut={today:new Date().setHours(0,0,0,0),hour:now-3600000,week:now-7*86400000}[f]||0
  return logs.filter(l=>new Date(l.timestamp).getTime()>=cut)
}

// ── ConnModal ─────────────────────────────────────────────────────────────────
function ConnModal({ uid, saved, active, onSwitch, onRemove, onClose }:
  { uid:string; saved:SavedConnection[]; active:string; onSwitch:(c:SavedConnection)=>void; onRemove:(id:string)=>void; onClose:()=>void }) {
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:500,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',padding:16,backdropFilter:'blur(4px)',animation:'backdropIn .2s ease'}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:20,width:'100%',maxWidth:460,maxHeight:'80vh',overflow:'hidden',boxShadow:'0 28px 64px rgba(0,0,0,.25)',animation:'modalIn .3s cubic-bezier(.34,1.56,.64,1)',display:'flex',flexDirection:'column'}}>
        <div style={{padding:'18px 22px 14px',borderBottom:'1px solid rgba(0,0,0,.07)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <div style={{fontFamily:'var(--font-display)',fontWeight:900,fontSize:19,textTransform:'uppercase',letterSpacing:.5}}>SDK Connections</div>
            <div style={{fontSize:12,color:'#888',marginTop:2}}>Switch between your SIGIL connection IDs</div>
          </div>
          <button onClick={onClose} style={{width:30,height:30,borderRadius:'50%',background:'rgba(0,0,0,.06)',border:'none',cursor:'pointer',fontSize:15,display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'10px 14px'}}>
          {saved.length===0 ? (
            <div style={{textAlign:'center',padding:'28px 16px',color:'#aaa'}}>
              <div style={{fontSize:28,marginBottom:10}}>◈</div>
              <p style={{fontSize:13}}>No saved connections yet.</p>
              <p style={{fontSize:12,marginTop:4}}>Run <code style={{background:'rgba(0,0,0,.06)',padding:'2px 5px',borderRadius:3}}>sigil init</code> to get started.</p>
            </div>
          ) : saved.map(c => {
            const isAct=c.id===active
            return (
              <div key={c.id} style={{display:'flex',alignItems:'center',gap:11,padding:'11px 13px',borderRadius:11,marginBottom:5,cursor:'pointer',background:isAct?'rgba(234,102,61,.07)':'rgba(0,0,0,.02)',border:`1.5px solid ${isAct?'rgba(234,102,61,.28)':'rgba(0,0,0,.07)'}`,transition:'all .18s'}}
                onMouseEnter={e=>{if(!isAct)(e.currentTarget as HTMLElement).style.background='rgba(0,0,0,.04)'}}
                onMouseLeave={e=>{if(!isAct)(e.currentTarget as HTMLElement).style.background='rgba(0,0,0,.02)'}}>
                <span style={{width:9,height:9,borderRadius:'50%',background:isAct?'#C5D545':'#ccc',flexShrink:0,boxShadow:isAct?'0 0 6px rgba(197,213,69,.6)':'none'}} />
                <div style={{flex:1,minWidth:0}} onClick={()=>onSwitch(c)}>
                  <div style={{fontFamily:'var(--mono)',fontWeight:700,fontSize:12.5,color:isAct?'#EA663D':'#111'}}>{c.id}</div>
                  <div style={{fontSize:11,color:'#888',marginTop:1}}>{c.label||'Unnamed'} · {new Date(c.lastUsed).toLocaleString()}</div>
                </div>
                {isAct&&<span style={{fontSize:10,color:'#EA663D',fontWeight:700,background:'rgba(234,102,61,.1)',padding:'3px 8px',borderRadius:100}}>ACTIVE</span>}
                {!isAct&&<button onClick={e=>{e.stopPropagation();onRemove(c.id)}} style={{padding:'4px 9px',borderRadius:7,border:'1px solid rgba(255,59,48,.2)',background:'rgba(255,59,48,.05)',color:'#cc2200',fontSize:11,cursor:'pointer',fontWeight:600}}
                  onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='rgba(255,59,48,.12)'}
                  onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='rgba(255,59,48,.05)'}>Remove</button>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser]           = useState<User|null>(null)
  const [authLoad, setAuthLoad]   = useState(true)
  const [tab, setTab]             = useState<Tab>('feed')
  const [filter, setFilter]       = useState<Filter>('all')
  const [filterOpen, setFilterOpen]=useState(false)
  const [cid, setCid]             = useState('')
  const [input, setInput]         = useState('')
  const [inputErr, setInputErr]   = useState('')
  const [logs, setLogs]           = useState<Log[]>([])
  const [stats, setStats]         = useState<Stats|null>(null)
  const [quarantine, setQuarantine]=useState<QuarantineEntry[]>([])
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting]=useState(false)
  const [connErr, setConnErr]     = useState('')
  const [lastUpdate, setLastUpdate]=useState<Date|null>(null)
  const [newIds, setNewIds]       = useState<Set<number>>(new Set())
  const [saved, setSaved]         = useState<SavedConnection[]>([])
  const [connModal, setConnModal] = useState(false)
  const [toasts, setToasts]       = useState<Toast[]>([])
  const pollRef  = useRef<ReturnType<typeof setInterval>|null>(null)
  const fbUnsubRef = useRef<(()=>void)|null>(null)
  const prevCount= useRef(0)
  const toastId  = useRef(0)
  const filterRef= useRef<HTMLDivElement>(null)

  const toast = useCallback((msg:string, type:Toast['type']='info') => {
    const id=++toastId.current
    setToasts(p=>[...p,{id,msg,type}])
    setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),3800)
  },[])

  // Auth guard
  useEffect(()=>{
    const unsub=onAuth(u=>{ setUser(u); setAuthLoad(false); if(!u) router.replace('/') })
    return ()=>unsub()
  },[router])

  // Load saved connections
  useEffect(()=>{ if(!user) return; getConnections(user.uid).then(setSaved) },[user])

  // Restore persisted connection
  useEffect(()=>{
    if(!user) return
    const persisted=localStorage.getItem(`sigil_cid_${user.uid}`)
    if(persisted) setInput(persisted)
  },[user])

  // Close filter popover on outside click
  useEffect(()=>{
    const fn=(e:MouseEvent)=>{ if(filterRef.current&&!filterRef.current.contains(e.target as Node)) setFilterOpen(false) }
    document.addEventListener('mousedown',fn); return ()=>document.removeEventListener('mousedown',fn)
  },[])

  const fetchData = useCallback(async(id:string)=>{
    try {
      const [lRes,sRes]=await Promise.all([
        fetch(`${API}/api/logs?connection_id=${encodeURIComponent(id)}`),
        fetch(`${API}/api/stats?connection_id=${encodeURIComponent(id)}`),
      ])
      if(!lRes.ok) return
      const {logs:incoming}=await lRes.json()
      const sd=sRes.ok?await sRes.json():null
      if(incoming.length>prevCount.current){
        const ids=new Set<number>(incoming.slice(0,incoming.length-prevCount.current).map((l:Log)=>l.id))
        setNewIds(ids)
        setTimeout(()=>setNewIds(new Set()),2200)
        // Fire toast for blocked packages
        incoming.slice(0,incoming.length-prevCount.current).forEach((l:Log)=>{
          if(l.status==='blocked') toast(`⛔ ${l.package} BLOCKED (risk: ${l.risk_score})`, 'err')
          if(l.status==='quarantined') toast(`⚠ ${l.package} quarantined (risk: ${l.risk_score})`, 'warn')
        })
      }
      prevCount.current=incoming.length
      setLogs(incoming); if(sd) setStats(sd); setLastUpdate(new Date()); setConnErr('')
    } catch(e:any){ setConnErr(e.message) }
  },[toast])

  const fetchQuarantine = useCallback(async(id:string)=>{
    try {
      const r=await fetch(`${API}/api/quarantine?connection_id=${encodeURIComponent(id)}`)
      if(r.ok){ const d=await r.json(); setQuarantine(d.quarantined||[]) }
    } catch {}
  },[])

  const connect=async(idOverride?:string)=>{
    const id=(idOverride??input).trim().toUpperCase()
    if(!id) return
    if(!id.startsWith('SIGIL-')){ setInputErr('ID must start with SIGIL-'); return }
    setConnecting(true); setConnErr(''); setInputErr('')
    try {
      const r=await fetch(`${API}/api/connect`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({connection_id:id,user_id:user?.uid||'',user_email:user?.email||''})})
      if(!r.ok){ const e=await r.json(); throw new Error(e.detail||'Failed') }
      setCid(id); setConnected(true)
      if(user){
        localStorage.setItem(`sigil_cid_${user.uid}`,id)
        await touchConnection(user.uid,id)
        if(!saved.find(s=>s.id===id)){
          const nc:SavedConnection={id,label:'',addedAt:new Date().toISOString(),lastUsed:new Date().toISOString()}
          await saveConnection(user.uid,nc); setSaved(p=>[nc,...p])
        }
      }
      // Subscribe Firebase realtime
      if(fbUnsubRef.current) fbUnsubRef.current()
      fbUnsubRef.current=subscribeToLogs(id,(fbLogs)=>{
        if(fbLogs.length>prevCount.current) setLogs(fbLogs)
      })
      await fetchData(id); await fetchQuarantine(id)
      if(pollRef.current) clearInterval(pollRef.current)
      pollRef.current=setInterval(()=>{ fetchData(id); fetchQuarantine(id) },POLL)
      toast(`Connected to ${id}`,'ok')
    } catch(e:any){ setConnErr(e.message); toast(e.message,'err') }
    finally{ setConnecting(false) }
  }

  const disconnect=()=>{
    if(pollRef.current) clearInterval(pollRef.current)
    if(fbUnsubRef.current) fbUnsubRef.current()
    setConnected(false); setLogs([]); setStats(null); setLastUpdate(null); prevCount.current=0
    if(user) localStorage.removeItem(`sigil_cid_${user.uid}`)
    toast(`Disconnected from ${cid}`,'info'); setCid('')
  }

  const logout=async()=>{ disconnect(); await signOut(); router.replace('/') }

  const switchConn=(c:SavedConnection)=>{ if(c.id===cid){ setConnModal(false); return } disconnect(); setInput(c.id); connect(c.id); setConnModal(false) }
  const removeConn=async(id:string)=>{ if(!user) return; await removeConnection(user.uid,id); setSaved(p=>p.filter(c=>c.id!==id)); toast(`Removed ${id}`,'info') }

  const releaseQuarantine=async(pkg:string)=>{
    try {
      await fetch(`${API}/api/quarantine`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({connection_id:cid,package:pkg,force:true})})
      setQuarantine(p=>p.filter(q=>q.package!==pkg)); toast(`${pkg} released from quarantine`,'ok')
    } catch{ toast('Failed to release package','err') }
  }

  useEffect(()=>(()=>{ if(pollRef.current) clearInterval(pollRef.current) })(),[])

  const filteredLogs=applyFilter(logs,filter)
  const TITLES:Record<Tab,string>={feed:'Live Security Feed',analytics:'Analytics',packages:'Packages',quarantine:'Quarantine'}

  if(authLoad) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#EEEDED'}}>
      <div style={{width:36,height:36,border:'3px solid rgba(234,102,61,.2)',borderTopColor:'#EA663D',borderRadius:'50%',animation:'spin .7s linear infinite'}} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
  if(!user) return null

  const BTN=(a:boolean)=>({display:'flex' as const,alignItems:'center' as const,gap:10,padding:'10px 13px',borderRadius:10,border:`1.5px solid ${a?'rgba(234,102,61,.25)':'transparent'}`,background:a?'#EA663D':'transparent',color:a?'#fff':'#666',fontWeight:a?700:400,fontSize:14,transition:'all .18s',width:'100%' as const,textAlign:'left' as const,cursor:'pointer',fontFamily:'var(--font)',} as React.CSSProperties)

  return (
    <>
      <Head><title>SIGIL v4 — Dashboard</title></Head>
      <ToastStack items={toasts} rm={id=>setToasts(p=>p.filter(t=>t.id!==id))} />
      {connModal&&<ConnModal uid={user.uid} saved={saved} active={cid} onSwitch={switchConn} onRemove={removeConn} onClose={()=>setConnModal(false)} />}

      <style>{`
        @keyframes spin      {to{transform:rotate(360deg)}}
        @keyframes pulse     {0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes toastIn   {from{opacity:0;transform:translateX(120%)}to{opacity:1;transform:translateX(0)}}
        @keyframes backdropIn{from{opacity:0}to{opacity:1}}
        @keyframes modalIn   {from{opacity:0;transform:scale(.94) translateY(12px)}to{opacity:1;transform:scale(1) translateY(0)}}
        @keyframes tabSlide  {from{opacity:0;transform:translateY(9px)}to{opacity:1;transform:translateY(0)}}
        @keyframes rowIn     {from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
        @keyframes slideDown {from{opacity:0;transform:translateY(-8px) scaleY(.96)}to{opacity:1;transform:translateY(0) scaleY(1)}}
        *{box-sizing:border-box;margin:0;padding:0}
        html{scroll-behavior:smooth;-webkit-font-smoothing:antialiased}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:rgba(0,0,0,.12);border-radius:3px}
        :root{--font-display:'Barlow Condensed',sans-serif;--font:'DM Sans',sans-serif;--mono:'JetBrains Mono',monospace;--orange:#EA663D;--lime:#C5D545;--warn:#EAC642;--danger:#FF3B30;--sidebar-w:244px}
      `}</style>

      <div style={{display:'grid',gridTemplateColumns:'var(--sidebar-w) 1fr',minHeight:'100vh',background:'#EEEDED',fontFamily:'var(--font)'}}>

        {/* SIDEBAR */}
        <aside style={{background:'#fff',borderRight:'1px solid rgba(0,0,0,.08)',display:'flex',flexDirection:'column',position:'sticky',top:0,height:'100vh',overflow:'hidden'}}>
          {/* Brand */}
          <div style={{padding:'18px 18px 14px',borderBottom:'1px solid rgba(0,0,0,.07)'}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:32,height:32,borderRadius:9,background:'#EA663D',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:17,boxShadow:'0 4px 12px rgba(234,102,61,.35)'}}>◈</div>
              <div>
                <div style={{fontFamily:'var(--font-display)',fontWeight:900,fontSize:19,letterSpacing:2,textTransform:'uppercase'}}>SIGIL</div>
                <div style={{fontFamily:'var(--mono)',fontSize:9,color:'#bbb',textTransform:'uppercase',letterSpacing:'.1em'}}>v4 · Security Monitor</div>
              </div>
            </div>
            <div style={{marginTop:10,padding:'6px 9px',borderRadius:7,background:'rgba(0,0,0,.04)',border:'1px solid rgba(0,0,0,.07)'}}>
              <div style={{fontSize:11,color:'#888',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user.email}</div>
            </div>
          </div>

          {/* Nav */}
          <nav style={{padding:'11px 9px',display:'flex',flexDirection:'column',gap:2}}>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:'1.5px',textTransform:'uppercase',color:'#bbb',padding:'0 9px',marginBottom:5}}>Main</div>
            {([
              {id:'feed',      emoji:'📡', label:'Live Feed'},
              {id:'analytics', emoji:'📊', label:'Analytics'},
              {id:'packages',  emoji:'📦', label:'Packages'},
              {id:'quarantine',emoji:'🧪', label:'Quarantine', badge: quarantine.length},
            ] as {id:Tab;emoji:string;label:string;badge?:number}[]).map(t => (
              <button key={t.id} onClick={()=>setTab(t.id)} style={BTN(tab===t.id)}
                onMouseEnter={e=>{if(tab!==t.id)(e.currentTarget as HTMLElement).style.background='rgba(0,0,0,.04)'}}
                onMouseLeave={e=>{if(tab!==t.id)(e.currentTarget as HTMLElement).style.background='transparent'}}>
                <span style={{fontSize:15}}>{t.emoji}</span>
                <span>{t.label}</span>
                {tab===t.id&&<span style={{marginLeft:'auto',width:6,height:6,borderRadius:'50%',background:'rgba(255,255,255,.7)',display:'block'}} />}
                {t.badge!=null&&t.badge>0&&<span style={{marginLeft:'auto',minWidth:18,height:18,borderRadius:100,background:'#EAC642',color:'#fff',fontSize:10,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 5px'}}>{t.badge}</span>}
              </button>
            ))}
          </nav>

          {/* Session stats */}
          {connected&&stats&&(
            <div style={{margin:'0 9px',padding:'12px 13px',borderRadius:11,border:'1px solid rgba(0,0,0,.08)',background:'rgba(0,0,0,.02)',animation:'tabSlide .3s ease both'}}>
              <div style={{fontFamily:'var(--mono)',fontSize:9,color:'#bbb',textTransform:'uppercase',letterSpacing:'.1em',marginBottom:9}}>Session</div>
              {[
                {l:'Total scans',v:stats.total,             c:'#111'},
                {l:'Avg risk',   v:stats.avg_risk,          c:stats.avg_risk>=60?'var(--danger)':'var(--lime)'},
                {l:'Threats',    v:stats.blocked+stats.quarantined, c:'var(--danger)'},
              ].map(s=>(
                <div key={s.l} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:7}}>
                  <span style={{fontSize:12,color:'#888'}}>{s.l}</span>
                  <span style={{fontFamily:'var(--mono)',fontWeight:700,fontSize:14,color:s.c,transition:'color .3s'}}>{s.v}</span>
                </div>
              ))}
            </div>
          )}

          {/* Connection */}
          <div style={{padding:'9px',marginTop:'auto'}}>
            {connected?(
              <div style={{borderRadius:11,border:'1px solid rgba(197,213,69,.3)',background:'rgba(197,213,69,.07)',padding:'11px 12px',animation:'tabSlide .3s ease both'}}>
                <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:7}}>
                  <span style={{width:7,height:7,borderRadius:'50%',background:'var(--lime)',display:'block',animation:'pulse 2s ease infinite',boxShadow:'0 0 5px rgba(197,213,69,.5)'}} />
                  <span style={{fontFamily:'var(--mono)',fontSize:9,color:'#4a6e00',fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase'}}>Connected</span>
                </div>
                <div style={{fontFamily:'var(--mono)',fontSize:11,color:'#555',wordBreak:'break-all',marginBottom:9}}>{cid}</div>
                <div style={{display:'flex',gap:5}}>
                  <button onClick={()=>setConnModal(true)} style={{flex:1,padding:'6px',border:'1px solid rgba(0,0,0,.1)',background:'rgba(0,0,0,.04)',color:'#555',borderRadius:7,fontSize:11,cursor:'pointer',fontWeight:600,transition:'all .15s',fontFamily:'var(--font)'}}>Switch</button>
                  <button onClick={disconnect} style={{flex:1,padding:'6px',border:'1px solid rgba(255,59,48,.22)',background:'rgba(255,59,48,.05)',color:'var(--danger)',borderRadius:7,fontSize:11,cursor:'pointer',fontWeight:600,transition:'all .15s',fontFamily:'var(--font)'}}>Disconnect</button>
                </div>
              </div>
            ):(
              <div style={{borderRadius:11,border:'1px solid rgba(0,0,0,.08)',background:'rgba(0,0,0,.02)',padding:'11px 12px'}}>
                <div style={{fontFamily:'var(--mono)',fontSize:10,color:'#ccc',marginBottom:7}}>No active connection</div>
                {saved.length>0&&<button onClick={()=>setConnModal(true)} style={{width:'100%',padding:'7px',borderRadius:8,border:'1.5px solid rgba(234,102,61,.25)',background:'rgba(234,102,61,.06)',color:'#EA663D',fontSize:12,fontWeight:700,cursor:'pointer',transition:'all .2s',fontFamily:'var(--font)'}}>Saved IDs ({saved.length}) →</button>}
              </div>
            )}
          </div>

          {/* Bottom actions */}
          <div style={{padding:'0 9px 14px',display:'flex',flexDirection:'column',gap:5}}>
            <button onClick={()=>{router.push('/')}} style={{display:'flex',alignItems:'center',gap:8,padding:'9px 13px',borderRadius:9,border:'1.5px solid rgba(234,102,61,.2)',background:'rgba(234,102,61,.04)',color:'#EA663D',fontWeight:700,fontSize:13,transition:'all .18s',fontFamily:'var(--font)',cursor:'pointer',width:'100%',textAlign:'left' as const}}>← Home</button>
            <button onClick={logout} style={{display:'flex',alignItems:'center',gap:8,padding:'9px 13px',borderRadius:9,border:'1.5px solid rgba(255,59,48,.18)',background:'rgba(255,59,48,.04)',color:'var(--danger)',fontWeight:700,fontSize:13,transition:'all .18s',fontFamily:'var(--font)',cursor:'pointer',width:'100%',textAlign:'left' as const}}>⎋ Log Out</button>
          </div>
        </aside>

        {/* MAIN */}
        <main style={{display:'flex',flexDirection:'column',gap:'1.25rem',padding:'1.5rem',overflowY:'auto',minHeight:'100vh'}}>

          {/* Topbar */}
          <div style={{borderRadius:15,border:'1px solid rgba(0,0,0,.08)',background:'rgba(255,255,255,.9)',backdropFilter:'blur(12px)',padding:'13px 22px',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10,position:'sticky',top:0,zIndex:50}}>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <h1 style={{fontFamily:'var(--font-display)',fontSize:21,fontWeight:900,textTransform:'uppercase',letterSpacing:.5,transition:'all .25s'}}>{TITLES[tab]}</h1>
              {connected&&(
                <div style={{display:'flex',alignItems:'center',gap:6,padding:'4px 11px',borderRadius:100,background:'rgba(234,102,61,.08)',border:'1px solid rgba(234,102,61,.2)',animation:'tabSlide .3s ease both'}}>
                  <span style={{width:6,height:6,borderRadius:'50%',background:'var(--lime)',display:'block',animation:'pulse 1.5s ease infinite'}} />
                  <span style={{fontFamily:'var(--mono)',fontSize:11,color:'#EA663D'}}>{cid}</span>
                  <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--lime)',fontWeight:700,letterSpacing:'.1em'}}>LIVE</span>
                </div>
              )}
            </div>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              {/* Filter popover */}
              {connected&&tab==='feed'&&(
                <div ref={filterRef} style={{position:'relative'}}>
                  <button onClick={()=>setFilterOpen(p=>!p)} style={{display:'flex',alignItems:'center',gap:7,padding:'7px 15px',borderRadius:100,border:`1.5px solid ${filterOpen?'#EA663D':'rgba(0,0,0,.1)'}`,background:filterOpen?'rgba(234,102,61,.07)':'#fff',color:filterOpen?'#EA663D':'#555',fontWeight:600,fontSize:12.5,cursor:'pointer',transition:'all .18s',fontFamily:'var(--font)'}}>
                    <span>{{all:'∞',today:'☀',hour:'◷',week:'◫'}[filter]}</span>
                    <span>{{all:'All Time',today:'Today',hour:'Last Hour',week:'This Week'}[filter]}</span>
                    <span style={{fontSize:9,opacity:.6,transform:filterOpen?'rotate(180deg)':'',transition:'transform .2s'}}>▼</span>
                  </button>
                  {filterOpen&&(
                    <div className="slideDown" style={{position:'absolute',top:'calc(100% + 7px)',left:0,zIndex:200,background:'#fff',border:'1px solid rgba(0,0,0,.1)',borderRadius:14,boxShadow:'0 14px 40px rgba(0,0,0,.14)',overflow:'hidden',minWidth:240,animation:'slideDown .2s ease both'}}>
                      <div style={{padding:'8px 13px 5px',fontSize:10,fontWeight:700,color:'#bbb',textTransform:'uppercase',letterSpacing:'.1em',borderBottom:'1px solid rgba(0,0,0,.06)',fontFamily:'var(--mono)'}}>Time Filter</div>
                      {([{id:'all',icon:'∞',label:'All Time',desc:'Every scan in this session'},
                        {id:'today',icon:'☀',label:'Today',desc:`Scans from ${new Date().toLocaleDateString()}`},
                        {id:'hour',icon:'◷',label:'Last Hour',desc:'Last 60 minutes'},
                        {id:'week',icon:'◫',label:'This Week',desc:'Last 7 days'},
                      ] as {id:Filter;icon:string;label:string;desc:string}[]).map(o=>(
                        <div key={o.id} onClick={()=>{setFilter(o.id);setFilterOpen(false)}} style={{display:'flex',alignItems:'center',gap:11,padding:'11px 15px',cursor:'pointer',background:filter===o.id?'rgba(234,102,61,.06)':'transparent',borderLeft:filter===o.id?'3px solid #EA663D':'3px solid transparent',transition:'all .12s'}}
                          onMouseEnter={e=>{if(filter!==o.id)(e.currentTarget as HTMLElement).style.background='rgba(0,0,0,.03)'}}
                          onMouseLeave={e=>{if(filter!==o.id)(e.currentTarget as HTMLElement).style.background='transparent'}}>
                          <span style={{fontSize:17,minWidth:22,textAlign:'center'}}>{o.icon}</span>
                          <div>
                            <div style={{fontWeight:700,fontSize:13.5,color:filter===o.id?'#EA663D':'#111'}}>{o.label}</div>
                            <div style={{fontSize:11,color:'#999',marginTop:1}}>{o.desc}</div>
                          </div>
                          {filter===o.id&&<span style={{marginLeft:'auto',color:'#EA663D',fontSize:12}}>✓</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {lastUpdate&&<span style={{fontFamily:'var(--mono)',fontSize:10.5,color:'#bbb'}}>Updated {lastUpdate.toLocaleTimeString()}</span>}
            </div>
          </div>

          {/* Connection error banner */}
          {connErr&&(
            <div style={{padding:'11px 17px',borderRadius:11,background:'rgba(255,59,48,.08)',border:'1px solid rgba(255,59,48,.2)',color:'#cc2200',fontSize:13,display:'flex',alignItems:'center',gap:9}}>
              <span>⚠</span>{connErr}
              <button onClick={()=>setConnErr('')} style={{marginLeft:'auto',background:'none',border:'none',color:'#cc2200',cursor:'pointer',fontSize:15}}>✕</button>
            </div>
          )}

          {/* Tab content */}
          <div key={tab} style={{display:'flex',flexDirection:'column',gap:'1.25rem',animation:'tabSlide .26s cubic-bezier(.4,0,.2,1) both'}}>

            {/* ── LIVE FEED ── */}
            {tab==='feed'&&(
              <>
                {!connected?(
                  <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:'2rem',flex:1}}>
                    <div style={{maxWidth:480,width:'100%',borderRadius:20,border:'1px solid rgba(0,0,0,.09)',background:'#fff',padding:'42px 34px',textAlign:'center',boxShadow:'0 8px 36px rgba(0,0,0,.06)'}}>
                      <div style={{width:64,height:64,borderRadius:'50%',background:'rgba(234,102,61,.1)',border:'2px solid rgba(234,102,61,.2)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 22px',fontSize:28,animation:'float 3s ease-in-out infinite'}}>🔐</div>
                      <h2 style={{fontFamily:'var(--font-display)',fontSize:26,fontWeight:900,textTransform:'uppercase',marginBottom:6}}>Connect Your SDK</h2>
                      <p style={{color:'#777',fontSize:13.5,lineHeight:1.7,marginBottom:26}}>Run <code style={{color:'#EA663D',background:'rgba(234,102,61,.08)',padding:'.1em .45em',borderRadius:4,fontFamily:'monospace',fontSize:'.9em'}}>sigil init</code> to generate your Connection ID, then enter it below.</p>
                      <div style={{display:'flex',gap:9,marginBottom:inputErr?8:16}}>
                        <input autoComplete="off" style={{flex:1,padding:'11px 16px',background:'#fafafa',border:`1.5px solid ${inputErr?'var(--danger)':'rgba(0,0,0,.1)'}`,borderRadius:100,color:'#111',fontFamily:'var(--mono)',fontSize:13,outline:'none',textTransform:'uppercase',letterSpacing:'.05em',transition:'all .18s'}}
                          placeholder="SIGIL-XXXX-XXXX" value={input}
                          onChange={e=>{const v=e.target.value.replace(/[<>'";&|`$]/g,'').slice(0,30).toUpperCase();setInput(v);if(inputErr)setInputErr('')}}
                          onFocus={e=>{if(!inputErr){e.currentTarget.style.borderColor='#EA663D';e.currentTarget.style.boxShadow='0 0 0 3px rgba(234,102,61,.12)'}}}
                          onBlur={e=>{if(!inputErr){e.currentTarget.style.borderColor='rgba(0,0,0,.1)';e.currentTarget.style.boxShadow='none'}}}
                          onKeyDown={e=>e.key==='Enter'&&connect()} maxLength={30}/>
                        <button onClick={()=>connect()} disabled={connecting||!input.trim()} style={{padding:'11px 22px',background:connecting||!input.trim()?'#e0e0e0':'#EA663D',color:connecting||!input.trim()?'#aaa':'#fff',fontWeight:700,fontSize:14,border:'none',borderRadius:100,cursor:connecting||!input.trim()?'not-allowed':'pointer',transition:'all .18s',whiteSpace:'nowrap',boxShadow:!connecting&&input.trim()?'0 4px 14px rgba(234,102,61,.4)':'none'}}>
                          {connecting?<span style={{display:'flex',alignItems:'center',gap:7}}><span style={{width:13,height:13,border:'2px solid rgba(255,255,255,.3)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin .7s linear infinite',display:'block'}} />Wait…</span>:'Connect →'}
                        </button>
                      </div>
                      {inputErr&&<div style={{padding:'7px 12px',background:'rgba(255,59,48,.07)',border:'1px solid rgba(255,59,48,.2)',borderRadius:8,color:'#cc2200',fontSize:12,marginBottom:10,textAlign:'left',fontFamily:'monospace'}}>{inputErr}</div>}
                      {connErr&&<div style={{padding:'7px 12px',background:'rgba(255,59,48,.07)',border:'1px solid rgba(255,59,48,.2)',borderRadius:8,color:'#cc2200',fontSize:12,marginBottom:14,textAlign:'left'}}>⚠ {connErr}</div>}
                      <div style={{background:'rgba(197,213,69,.08)',border:'1px solid rgba(197,213,69,.25)',borderRadius:11,padding:'9px 13px',textAlign:'left',marginBottom:18}}>
                        <div style={{fontSize:11,fontWeight:700,color:'#4a6e00',fontFamily:'var(--mono)',marginBottom:3}}>🔒 SECURITY ACTIVE</div>
                        <div style={{fontSize:11,color:'#888',lineHeight:1.6}}>CSRF protected · XSS sanitized · Rate limited · Firebase encrypted</div>
                      </div>
                      <div style={{background:'#1C1C1E',borderRadius:11,padding:'14px 18px',textAlign:'left'}}>
                        <div style={{fontFamily:'var(--mono)',fontSize:9,color:'#555',marginBottom:8,letterSpacing:'.1em',textTransform:'uppercase'}}>Quick start</div>
                        {[{c:'sigil init',k:'#EA663D'},{c:'sigil install pandas',k:'#EA663D'},{c:'# watch dashboard update live',k:'#555'}].map((l,i)=>(
                          <div key={i} style={{display:'flex',gap:8,fontFamily:'monospace',fontSize:12,marginBottom:i<2?4:0}}>
                            <span style={{color:'#EA663D'}}>$</span><span style={{color:l.k}}>{l.c}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ):(
                  <>
                    {/* Stat cards */}
                    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:13}}>
                      {[
                        {l:'Total Scans',v:filteredLogs.length,   c:'#111',           bg:'#fff',                  border:'rgba(0,0,0,.08)'},
                        {l:'Allowed',    v:filteredLogs.filter(l=>l.status==='allowed').length, c:'#4a6e00',bg:'rgba(197,213,69,.1)',border:'rgba(197,213,69,.25)'},
                        {l:'Blocked',    v:filteredLogs.filter(l=>l.status==='blocked').length, c:'#cc2200',bg:'rgba(255,59,48,.07)',border:'rgba(255,59,48,.2)'},
                        {l:'Quarantined',v:filteredLogs.filter(l=>l.status==='quarantined').length,c:'#7a5800',bg:'rgba(234,198,66,.1)',border:'rgba(234,198,66,.25)'},
                      ].map(s=>(
                        <div key={s.l} style={{borderRadius:15,border:`1px solid ${s.border}`,background:s.bg,padding:'17px 20px',transition:'transform .2s,box-shadow .2s',cursor:'default'}}
                          onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='translateY(-3px)';el.style.boxShadow='0 8px 22px rgba(0,0,0,.1)'}}
                          onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='';el.style.boxShadow=''}}>
                          <div style={{fontFamily:'var(--mono)',fontSize:9,color:'#888',textTransform:'uppercase',letterSpacing:'.1em',marginBottom:7}}>{s.l}</div>
                          <div style={{fontFamily:'var(--font-display)',fontSize:42,fontWeight:900,color:s.c,lineHeight:1}}>{s.v}</div>
                        </div>
                      ))}
                    </div>
                    {/* Log table */}
                    <div style={{borderRadius:15,border:'1px solid rgba(0,0,0,.08)',background:'#fff',overflow:'hidden'}}>
                      <div style={{padding:'13px 20px',borderBottom:'1px solid rgba(0,0,0,.07)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                        <span style={{fontFamily:'var(--font-display)',fontSize:15,fontWeight:800,textTransform:'uppercase',letterSpacing:.5}}>Live Log</span>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <span style={{width:7,height:7,borderRadius:'50%',background:'var(--lime)',display:'block',animation:'pulse 1.5s ease infinite',boxShadow:'0 0 5px rgba(197,213,69,.6)'}} />
                          <span style={{padding:'3px 9px',borderRadius:100,fontSize:10.5,fontWeight:700,fontFamily:'var(--mono)',background:'rgba(234,102,61,.07)',border:'1px solid rgba(234,102,61,.2)',color:'#EA663D'}}>⚡ Live · Firebase synced</span>
                        </div>
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1.5fr 1fr',padding:'9px 20px',background:'#fafafa',borderBottom:'1px solid rgba(0,0,0,.07)'}}>
                        {['PACKAGE','MANAGER','RISK','STATUS','TIME'].map(h=><span key={h} style={{fontSize:9,fontWeight:700,color:'#bbb',textTransform:'uppercase',letterSpacing:'1.5px'}}>{h}</span>)}
                      </div>
                      {filteredLogs.length===0?(
                        <div style={{padding:'56px 20px',textAlign:'center'}}>
                          <div style={{fontSize:36,marginBottom:12}}>📡</div>
                          <div style={{fontFamily:'var(--font-display)',fontSize:20,fontWeight:900,textTransform:'uppercase',marginBottom:7}}>Waiting for scans</div>
                          <div style={{fontSize:13,color:'#aaa'}}>Run <code style={{fontFamily:'monospace',background:'rgba(234,102,61,.08)',color:'#EA663D',padding:'.1em .4em',borderRadius:4}}>sigil install &lt;package&gt;</code></div>
                        </div>
                      ):filteredLogs.map((log,idx)=>{
                        const isNew=newIds.has(log.id)
                        return (
                          <div key={`${log.id}-${idx}`}
                            style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1.5fr 1fr',padding:'12px 20px',borderBottom:'1px solid rgba(0,0,0,.04)',transition:'background .12s',animation:isNew?'rowIn .38s ease both':'none'}}
                            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='#fafafa'}
                            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                            <span style={{fontFamily:'var(--mono)',fontWeight:600,fontSize:13,display:'flex',alignItems:'center',gap:6}}>
                              {isNew&&<span style={{width:6,height:6,borderRadius:'50%',background:'#EA663D',display:'inline-block',flexShrink:0}} />}
                              {log.package}
                              {log.flags?.length>0&&<span style={{fontSize:9,color:'#EAC642',fontWeight:700,background:'rgba(234,198,66,.1)',padding:'2px 5px',borderRadius:3,border:'1px solid rgba(234,198,66,.25)'}}>{log.flags.length} flag{log.flags.length>1?'s':''}</span>}
                            </span>
                            <span style={{display:'flex',alignItems:'center'}}><span style={{padding:'2px 8px',borderRadius:5,background:'#f0f0f0',fontSize:10.5,fontFamily:'var(--mono)',color:'#666'}}>{log.manager}</span></span>
                            <div style={{display:'flex',alignItems:'center'}}><RiskBar s={log.risk_score} /></div>
                            <div style={{display:'flex',alignItems:'center'}}><StatusPill s={log.status} /></div>
                            <span style={{fontSize:11,color:'#aaa',display:'flex',alignItems:'center',fontFamily:'var(--mono)'}}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </>
            )}

            {/* ── ANALYTICS ── */}
            {tab==='analytics'&&(
              !connected?(
                <div style={{padding:'4rem 2rem',textAlign:'center',color:'#888'}}><div style={{fontSize:32,marginBottom:12}}>📊</div><h3 style={{fontFamily:'var(--font-display)',fontWeight:900,textTransform:'uppercase',marginBottom:6}}>Not Connected</h3><p style={{fontSize:13}}>Connect your SDK from the Live Feed tab.</p></div>
              ):!logs.length?(
                <div style={{padding:'4rem 2rem',textAlign:'center',color:'#888'}}><div style={{fontSize:32,marginBottom:12}}>📊</div><h3 style={{fontFamily:'var(--font-display)',fontWeight:900,textTransform:'uppercase',marginBottom:6}}>No Data Yet</h3><p style={{fontSize:13}}>Run <code>sigil install &lt;pkg&gt;</code> to generate data.</p></div>
              ):(
                <>
                  {/* Donuts */}
                  <div style={{borderRadius:15,border:'1px solid rgba(0,0,0,.08)',background:'#fff',padding:'22px'}}>
                    <div style={{fontFamily:'var(--mono)',fontSize:10,color:'#bbb',textTransform:'uppercase',letterSpacing:'.1em',marginBottom:22}}>Decision Breakdown</div>
                    <div style={{display:'flex',gap:32,justifyContent:'center',flexWrap:'wrap'}}>
                      <Donut val={logs.filter(l=>l.status==='allowed').length}     total={logs.length} color="#C5D545" label="Allowed" />
                      <Donut val={logs.filter(l=>l.status==='quarantined').length}  total={logs.length} color="#EAC642" label="Quarantined" />
                      <Donut val={logs.filter(l=>l.status==='blocked').length}      total={logs.length} color="#FF3B30" label="Blocked" />
                    </div>
                  </div>
                  {/* Risk histogram */}
                  <div style={{borderRadius:15,border:'1px solid rgba(0,0,0,.08)',background:'#fff',padding:'22px'}}>
                    <div style={{fontFamily:'var(--mono)',fontSize:10,color:'#bbb',textTransform:'uppercase',letterSpacing:'.1em',marginBottom:22}}>Risk Score Distribution</div>
                    <div style={{display:'flex',gap:10,alignItems:'flex-end',height:130}}>
                      {[{r:'0–20',min:0,max:20,c:'#C5D545'},{r:'21–40',min:21,max:40,c:'#9BBED3'},{r:'41–60',min:41,max:60,c:'#EAC642'},{r:'61–80',min:61,max:80,c:'#EA663D'},{r:'81–100',min:81,max:100,c:'#FF3B30'}].map(b=>{
                        const cnt=logs.filter(l=>l.risk_score>=b.min&&l.risk_score<=b.max).length
                        const mx=Math.max(...[0,20,40,60,80,100].map((_,i,a)=>logs.filter(l=>l.risk_score>=a[i]&&l.risk_score<=(a[i+1]||100)).length),1)
                        return (
                          <div key={b.r} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:5,height:'100%'}}>
                            <div style={{flex:1,width:'100%',display:'flex',alignItems:'flex-end'}}>
                              <div style={{width:'100%',background:b.c,borderRadius:'4px 4px 0 0',height:`${cnt/mx*100}%`,minHeight:cnt>0?4:0,transition:'height .6s ease',boxShadow:cnt>0?`0 0 8px ${b.c}50`:''}} />
                            </div>
                            <span style={{fontFamily:'var(--mono)',fontSize:11,color:b.c,fontWeight:700}}>{cnt}</span>
                            <span style={{fontFamily:'var(--mono)',fontSize:9,color:'#aaa'}}>{b.r}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  {/* Top flags */}
                  {stats?.top_flags&&stats.top_flags.length>0&&(
                    <div style={{borderRadius:15,border:'1px solid rgba(0,0,0,.08)',background:'#fff',padding:'22px'}}>
                      <div style={{fontFamily:'var(--mono)',fontSize:10,color:'#bbb',textTransform:'uppercase',letterSpacing:'.1em',marginBottom:18}}>Top Threat Flags</div>
                      {stats.top_flags.map((f,i)=>(
                        <div key={f.flag} style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
                          <span style={{fontFamily:'var(--mono)',fontSize:12,color:'#555',minWidth:130}}>{f.flag}</span>
                          <div style={{flex:1,height:7,background:'rgba(0,0,0,.06)',borderRadius:4,overflow:'hidden'}}>
                            <div style={{height:'100%',width:`${(f.count/stats.top_flags[0].count)*100}%`,background:'#EA663D',borderRadius:4,transition:'width .6s ease'}} />
                          </div>
                          <span style={{fontFamily:'var(--mono)',fontSize:12,color:'#EA663D',fontWeight:700,minWidth:20}}>{f.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )
            )}

            {/* ── PACKAGES ── */}
            {tab==='packages'&&(
              !connected?(
                <div style={{padding:'4rem 2rem',textAlign:'center',color:'#888'}}><div style={{fontSize:32,marginBottom:12}}>📦</div><h3 style={{fontFamily:'var(--font-display)',fontWeight:900,textTransform:'uppercase',marginBottom:6}}>Not Connected</h3></div>
              ):(
                <div style={{borderRadius:15,border:'1px solid rgba(0,0,0,.08)',background:'#fff',overflow:'hidden'}}>
                  <div style={{padding:'13px 20px',borderBottom:'1px solid rgba(0,0,0,.07)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <span style={{fontFamily:'var(--font-display)',fontSize:15,fontWeight:800,textTransform:'uppercase',letterSpacing:.5}}>All Packages ({logs.length})</span>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'2fr 100px 1fr 150px 150px 100px',padding:'9px 20px',background:'#fafafa',borderBottom:'1px solid rgba(0,0,0,.07)'}}>
                    {['PACKAGE','MANAGER','RISK','STATUS','FLAGS','TIME'].map(h=><span key={h} style={{fontSize:9,fontWeight:700,color:'#bbb',textTransform:'uppercase',letterSpacing:'1.2px'}}>{h}</span>)}
                  </div>
                  {logs.length===0?<div style={{padding:'40px',textAlign:'center',color:'#aaa'}}>No packages scanned yet.</div>:
                    logs.map((log,idx)=>(
                      <div key={idx} style={{display:'grid',gridTemplateColumns:'2fr 100px 1fr 150px 150px 100px',padding:'12px 20px',borderBottom:'1px solid rgba(0,0,0,.04)',transition:'background .12s'}}
                        onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='#fafafa'}
                        onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                        <span style={{fontFamily:'var(--mono)',fontWeight:600,fontSize:13}}>{log.package}</span>
                        <span style={{display:'flex',alignItems:'center'}}><span style={{padding:'2px 8px',borderRadius:5,background:'#f0f0f0',fontSize:10.5,fontFamily:'var(--mono)',color:'#666'}}>{log.manager}</span></span>
                        <div style={{display:'flex',alignItems:'center'}}><RiskBar s={log.risk_score} /></div>
                        <div style={{display:'flex',alignItems:'center'}}><StatusPill s={log.status} /></div>
                        <div style={{display:'flex',alignItems:'center',gap:4,flexWrap:'wrap'}}>
                          {(log.flags||[]).slice(0,2).map(f=><span key={f} style={{fontSize:9,color:'#EAC642',fontWeight:700,background:'rgba(234,198,66,.1)',padding:'2px 5px',borderRadius:3,border:'1px solid rgba(234,198,66,.25)',whiteSpace:'nowrap'}}>{f.split(':')[0]}</span>)}
                        </div>
                        <span style={{fontSize:11,color:'#aaa',fontFamily:'var(--mono)'}}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                      </div>
                    ))
                  }
                </div>
              )
            )}

            {/* ── QUARANTINE ── */}
            {tab==='quarantine'&&(
              !connected?(
                <div style={{padding:'4rem 2rem',textAlign:'center',color:'#888'}}><div style={{fontSize:32,marginBottom:12}}>🧪</div><h3 style={{fontFamily:'var(--font-display)',fontWeight:900,textTransform:'uppercase',marginBottom:6}}>Not Connected</h3></div>
              ):(
                <>
                  <div style={{padding:'14px 18px',borderRadius:12,background:'rgba(234,198,66,.08)',border:'1px solid rgba(234,198,66,.25)'}}>
                    <div style={{fontSize:12,fontWeight:700,color:'#7a5800',marginBottom:4,fontFamily:'var(--mono)'}}>⚠ QUARANTINE ZONE</div>
                    <div style={{fontSize:12,color:'#666',lineHeight:1.6}}>Packages here are installed in <code style={{background:'rgba(0,0,0,.06)',padding:'1px 5px',borderRadius:3}}>.sigil_sandbox/</code> — isolated from your project. Review before releasing.</div>
                  </div>
                  <div style={{borderRadius:15,border:'1px solid rgba(0,0,0,.08)',background:'#fff',overflow:'hidden'}}>
                    <div style={{padding:'13px 20px',borderBottom:'1px solid rgba(0,0,0,.07)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                      <span style={{fontFamily:'var(--font-display)',fontSize:15,fontWeight:800,textTransform:'uppercase',letterSpacing:.5}}>Quarantined Packages ({quarantine.length})</span>
                    </div>
                    {quarantine.length===0?(
                      <div style={{padding:'48px',textAlign:'center'}}>
                        <div style={{fontSize:28,marginBottom:10}}>✓</div>
                        <div style={{fontFamily:'var(--font-display)',fontSize:18,fontWeight:900,textTransform:'uppercase',marginBottom:6}}>Quarantine Clear</div>
                        <div style={{fontSize:13,color:'#aaa'}}>No suspicious packages pending review.</div>
                      </div>
                    ):quarantine.map((q,i)=>(
                      <div key={i} style={{padding:'16px 20px',borderBottom:'1px solid rgba(0,0,0,.05)',display:'flex',alignItems:'center',gap:14,transition:'background .12s'}}
                        onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='#fffef9'}
                        onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                        <span style={{width:8,height:8,borderRadius:'50%',background:'#EAC642',flexShrink:0}} />
                        <div style={{flex:1}}>
                          <div style={{fontFamily:'var(--mono)',fontWeight:700,fontSize:13,marginBottom:3}}>{q.package}</div>
                          <div style={{fontSize:11.5,color:'#666'}}>{q.reason}</div>
                        </div>
                        <span style={{fontFamily:'var(--mono)',fontSize:12,fontWeight:700,color:'#EAC642'}}>{q.risk_score}/100</span>
                        <span style={{fontFamily:'var(--mono)',fontSize:11,color:'#aaa'}}>{q.manager}</span>
                        <div style={{display:'flex',gap:6}}>
                          <button onClick={()=>releaseQuarantine(q.package)} style={{padding:'6px 12px',borderRadius:8,border:'1px solid rgba(197,213,69,.3)',background:'rgba(197,213,69,.08)',color:'#4a6e00',fontSize:12,cursor:'pointer',fontWeight:600,transition:'all .15s'}}
                            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='rgba(197,213,69,.15)'}
                            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='rgba(197,213,69,.08)'}>
                            Release
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )
            )}
          </div>
        </main>
      </div>
    </>
  )
}
