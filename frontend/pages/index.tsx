import Head from 'next/head'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { onAuth, signIn, signUp, signInGoogle } from '../lib/firebase'
import type { User } from 'firebase/auth'

type AuthMode = 'login' | 'signup'

const FEATURES = [
  { icon:'🛡', t:'AI Risk Scoring',       d:'Every package scored 0–100 using heuristics, known-threat DB, and static analysis.' },
  { icon:'⚡', t:'Real-Time Firewall',     d:'Intercepts npm/pip before execution. Blocked packages never touch your system.' },
  { icon:'📦', t:'Sandbox Quarantine',     d:'Suspicious packages isolated in .sigil_sandbox/ — test before trusting.' },
  { icon:'🔍', t:'Static Analysis',        d:'Scans install scripts for eval(), exec(), subprocess, obfuscation, and network calls.' },
  { icon:'🔒', t:'Persistent Audit Trail', d:'Every decision logged to Firebase in real-time. Full history, zero data loss.' },
  { icon:'📊', t:'Live Dashboard',         d:'Real-time feed, analytics, quarantine manager — stream updates every 2 seconds.' },
]

const DEMOS = [
  { pkg:'crypto-stealer', risk:98, s:'blocked',    c:'#FF3B30', why:'Known cryptominer payload' },
  { pkg:'colourama',      risk:92, s:'blocked',    c:'#FF3B30', why:"Typosquatting 'colorama'" },
  { pkg:'requestx',       risk:85, s:'blocked',    c:'#FF3B30', why:'Dependency confusion attack' },
  { pkg:'nodemailer-safe',risk:74, s:'quarantined',c:'#EAC642', why:"Impersonating 'nodemailer'" },
  { pkg:'pandas',         risk:4,  s:'allowed',    c:'#C5D545', why:'Official PyPI — verified' },
  { pkg:'express',        risk:7,  s:'allowed',    c:'#C5D545', why:'Official npm — audited' },
]

function Spinner({ size=18, color='#fff' }: { size?: number; color?: string }) {
  return <div style={{ width:size, height:size, border:`2.5px solid rgba(255,255,255,0.25)`, borderTopColor:color, borderRadius:'50%', animation:'spin .7s linear infinite', flexShrink:0 }} />
}

function AuthModal({ mode0, onClose, onSuccess }: { mode0:AuthMode; onClose:()=>void; onSuccess:(u:User)=>void }) {
  const [mode, setMode] = useState<AuthMode>(mode0)
  const [email, setEmail] = useState('')
  const [pass, setPass]   = useState('')
  const [busy, setBusy]   = useState(false)
  const [err, setErr]     = useState('')
  const [shk, setShk]     = useState(false)
  const eRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setTimeout(() => eRef.current?.focus(), 80) }, [])

  const boom = (msg: string) => { setErr(msg); setShk(true); setTimeout(() => setShk(false), 500) }

  const go = async (googleMode = false) => {
    setErr('')
    if (!googleMode) {
      if (!email.trim() || !pass.trim()) return boom('Fill in both fields.')
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return boom('Enter a valid email.')
      if (pass.length < 6) return boom('Password needs 6+ characters.')
    }
    setBusy(true)
    try {
      const user = googleMode
        ? await signInGoogle()
        : mode === 'login' ? await signIn(email.trim(), pass) : await signUp(email.trim(), pass)
      onSuccess(user)
    } catch (e: any) {
      const m = e.code === 'auth/user-not-found'       ? 'No account with that email.' :
                e.code === 'auth/wrong-password'        ? 'Incorrect password.' :
                e.code === 'auth/email-already-in-use'  ? 'Email already registered.' :
                e.code === 'auth/popup-closed-by-user'  ? 'Google sign-in cancelled.' :
                e.code === 'auth/too-many-requests'     ? 'Too many attempts — wait a moment.' :
                e.message || 'Authentication error.'
      boom(m)
    } finally { setBusy(false) }
  }

  const S = (active: boolean) => ({
    flex:1, padding:'9px', borderRadius:9, border:'none',
    background: active ? '#EA663D' : 'transparent',
    color: active ? '#fff' : 'rgba(255,255,255,0.45)',
    fontWeight: active ? 700 : 400, fontSize:13, cursor:'pointer',
    transition:'all .2s', fontFamily:'DM Sans,sans-serif',
  } as React.CSSProperties)

  return (
    <div onClick={onClose} style={{ position:'fixed',inset:0,zIndex:900,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',padding:16,backdropFilter:'blur(4px)',animation:'backdropIn .2s ease' }}>
      <div onClick={e=>e.stopPropagation()} className={shk?'shake':''} style={{ background:'#fff',borderRadius:24,width:'100%',maxWidth:420,overflow:'hidden',boxShadow:'0 32px 80px rgba(0,0,0,0.3)',animation:'modalIn .33s cubic-bezier(0.34,1.56,0.64,1)' }}>
        {/* Dark header */}
        <div style={{ background:'#111',padding:'26px 28px 22px',position:'relative' }}>
          <div style={{ position:'absolute',inset:0,backgroundImage:'linear-gradient(rgba(234,102,61,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(234,102,61,.06) 1px,transparent 1px)',backgroundSize:'32px 32px' }} />
          <button onClick={onClose} style={{ position:'absolute',top:14,right:14,width:28,height:28,borderRadius:'50%',border:'1px solid rgba(255,255,255,0.12)',background:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)',cursor:'pointer',fontSize:13,display:'flex',alignItems:'center',justifyContent:'center' }}>✕</button>
          <div style={{ position:'relative',display:'flex',alignItems:'center',gap:10,marginBottom:16 }}>
            <div style={{ width:36,height:36,borderRadius:9,background:'#EA663D',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,boxShadow:'0 4px 16px rgba(234,102,61,.45)' }}>◈</div>
            <span style={{ fontFamily:'Barlow Condensed,sans-serif',fontWeight:900,fontSize:20,letterSpacing:3,textTransform:'uppercase',color:'#fff' }}>SIGIL</span>
          </div>
          <div style={{ position:'relative',display:'flex',background:'rgba(255,255,255,0.07)',borderRadius:11,padding:4 }}>
            <button style={S(mode==='login')} onClick={() => { setMode('login'); setErr('') }}>Sign In</button>
            <button style={S(mode==='signup')} onClick={() => { setMode('signup'); setErr('') }}>Create Account</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding:'26px 28px 28px' }}>
          <h2 style={{ fontFamily:'Barlow Condensed,sans-serif',fontWeight:900,fontSize:26,textTransform:'uppercase',letterSpacing:.5,marginBottom:4 }}>
            {mode==='login' ? 'Welcome Back' : 'Get Started Free'}
          </h2>
          <p style={{ color:'#888',fontSize:13,marginBottom:20,lineHeight:1.6 }}>
            {mode==='login' ? 'Sign in to your security dashboard.' : 'Protect your dependencies in 30 seconds.'}
          </p>

          {err && <div style={{ padding:'9px 13px',borderRadius:9,background:'rgba(255,59,48,.08)',border:'1px solid rgba(255,59,48,.25)',color:'#cc2200',fontSize:12.5,marginBottom:16,display:'flex',gap:7 }}><span>⚠</span>{err}</div>}

          <div style={{ display:'flex',flexDirection:'column',gap:13 }}>
            {/* Google */}
            <button onClick={() => go(true)} disabled={busy}
              style={{ padding:'12px',borderRadius:11,border:'1.5px solid rgba(0,0,0,.12)',background:'#fff',fontSize:13.5,fontWeight:600,display:'flex',alignItems:'center',justifyContent:'center',gap:10,cursor:'pointer',transition:'all .2s' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor='#EA663D'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor='rgba(0,0,0,.12)'}>
              <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M16.5 9.2c0-.6-.1-1.1-.2-1.7H9v3.2h4.2c-.2 1-.8 1.8-1.6 2.4v2h2.6c1.5-1.4 2.3-3.4 2.3-5.9z"/><path fill="#34A853" d="M9 17c2.2 0 4-.7 5.3-2l-2.6-2c-.7.5-1.6.8-2.7.8-2.1 0-3.8-1.4-4.5-3.3H1.9v2C3.2 15.1 5.9 17 9 17z"/><path fill="#FBBC05" d="M4.5 10.5c-.2-.5-.3-1-.3-1.5s.1-1 .3-1.5v-2H1.9C1.3 6.5 1 7.7 1 9s.3 2.5.9 3.5l2.6-2z"/><path fill="#EA4335" d="M9 3.8c1.2 0 2.2.4 3 1.2l2.2-2.2C12.9 1.6 11.2 1 9 1 5.9 1 3.2 2.9 1.9 5.5l2.6 2C5.2 5.2 6.9 3.8 9 3.8z"/></svg>
              Continue with Google
            </button>

            <div style={{ display:'flex',alignItems:'center',gap:12 }}>
              <div style={{ flex:1,height:1,background:'rgba(0,0,0,.08)' }} /><span style={{ fontSize:12,color:'#bbb' }}>or</span><div style={{ flex:1,height:1,background:'rgba(0,0,0,.08)' }} />
            </div>

            {/* Email */}
            <div>
              <label style={{ display:'block',fontWeight:700,fontSize:12,color:'#555',marginBottom:5,textTransform:'uppercase',letterSpacing:'.5px' }}>Email</label>
              <input ref={eRef} type="email" value={email} onChange={e=>setEmail(e.target.value)}
                placeholder="you@company.com"
                style={{ width:'100%',padding:'11px 15px',borderRadius:10,border:'1.5px solid rgba(0,0,0,.12)',background:'#f9f9f9',fontSize:14,outline:'none',transition:'all .2s',color:'#111' }}
                onFocus={e=>{e.currentTarget.style.borderColor='#EA663D';e.currentTarget.style.background='#fff';e.currentTarget.style.boxShadow='0 0 0 3px rgba(234,102,61,.12)'}}
                onBlur={e=>{e.currentTarget.style.borderColor='rgba(0,0,0,.12)';e.currentTarget.style.background='#f9f9f9';e.currentTarget.style.boxShadow='none'}}
              />
            </div>
            <div>
              <label style={{ display:'block',fontWeight:700,fontSize:12,color:'#555',marginBottom:5,textTransform:'uppercase',letterSpacing:'.5px' }}>Password</label>
              <input type="password" value={pass} onChange={e=>setPass(e.target.value)}
                placeholder={mode==='signup'?'Min. 6 characters':'••••••••'}
                onKeyDown={e=>e.key==='Enter'&&go()}
                style={{ width:'100%',padding:'11px 15px',borderRadius:10,border:'1.5px solid rgba(0,0,0,.12)',background:'#f9f9f9',fontSize:14,outline:'none',transition:'all .2s',color:'#111' }}
                onFocus={e=>{e.currentTarget.style.borderColor='#EA663D';e.currentTarget.style.background='#fff';e.currentTarget.style.boxShadow='0 0 0 3px rgba(234,102,61,.12)'}}
                onBlur={e=>{e.currentTarget.style.borderColor='rgba(0,0,0,.12)';e.currentTarget.style.background='#f9f9f9';e.currentTarget.style.boxShadow='none'}}
              />
            </div>

            <button onClick={() => go()} disabled={busy}
              style={{ padding:'13px',borderRadius:11,border:'none',background:'#EA663D',color:'#fff',fontWeight:900,fontSize:15,cursor:busy?'not-allowed':'pointer',transition:'all .2s',display:'flex',alignItems:'center',justifyContent:'center',gap:10,opacity:busy?.7:1,fontFamily:'Barlow Condensed,sans-serif',letterSpacing:.5,textTransform:'uppercase',boxShadow:'0 4px 18px rgba(234,102,61,.35)',marginTop:2 }}
              onMouseEnter={e=>{if(!busy)(e.currentTarget as HTMLElement).style.transform='translateY(-2px)'}}
              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform=''}}>
              {busy && <Spinner />}
              {busy ? 'Please wait…' : mode==='login' ? 'Sign In →' : 'Create Account →'}
            </button>
          </div>

          <p style={{ textAlign:'center',marginTop:18,color:'#999',fontSize:13 }}>
            {mode==='login' ? "Don't have an account? " : 'Already have an account? '}
            <button onClick={()=>{setMode(mode==='login'?'signup':'login');setErr('')}} style={{ color:'#EA663D',fontWeight:700,background:'none',border:'none',cursor:'pointer',fontSize:13 }}>
              {mode==='login' ? 'Create one free' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const router   = useRouter()
  const [checking, setChecking] = useState(true)
  const [modal, setModal]       = useState<AuthMode|null>(null)
  const [scrollY, setScrollY]   = useState(0)

  useEffect(() => {
    const unsub = onAuth(u => { if(u) router.replace('/dashboard'); else setChecking(false) })
    return () => unsub()
  }, [router])

  useEffect(() => {
    if (checking) return
    const fn = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', fn, { passive:true })
    return () => window.removeEventListener('scroll', fn)
  }, [checking])

  useEffect(() => {
    if (checking) return
    const obs = new IntersectionObserver(entries => entries.forEach(e => { if(e.isIntersecting) e.target.classList.add('visible') }), { threshold:.1 })
    document.querySelectorAll('.reveal').forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [checking])

  if (checking) return (
    <div style={{ minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#EEEDED' }}>
      <div style={{ width:36,height:36,border:'3px solid rgba(234,102,61,.2)',borderTopColor:'#EA663D',borderRadius:'50%',animation:'spin .7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <>
      <Head>
        <title>SIGIL v4 — AI Dependency Execution Firewall</title>
        <meta name="description" content="Stop malicious npm and pip packages before they execute. AI risk scoring, sandbox quarantine, real-time dashboard." />
      </Head>

      {modal && <AuthModal mode0={modal} onClose={()=>setModal(null)} onSuccess={() => { setModal(null); router.push('/dashboard') }} />}

      <style>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html{scroll-behavior:smooth;-webkit-font-smoothing:antialiased}
        body{background:#EEEDED;color:#111;font-family:'DM Sans',sans-serif;overflow-x:hidden}
        :root{--font-display:'Barlow Condensed',sans-serif;--font:'DM Sans',sans-serif;--mono:'JetBrains Mono',monospace}
        a{color:inherit;text-decoration:none} button{cursor:pointer;font-family:'DM Sans',sans-serif}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:3px}
        .reveal{opacity:0;transform:translateY(24px);transition:opacity .6s cubic-bezier(0.4,0,.2,1),transform .6s cubic-bezier(0.4,0,.2,1)}
        .reveal.visible{opacity:1;transform:translateY(0)}
        .stagger>*:nth-child(1){transition-delay:0s}.stagger>*:nth-child(2){transition-delay:.07s}.stagger>*:nth-child(3){transition-delay:.14s}.stagger>*:nth-child(4){transition-delay:.21s}.stagger>*:nth-child(5){transition-delay:.28s}.stagger>*:nth-child(6){transition-delay:.35s}
        .fc{transition:transform .22s,box-shadow .22s,border-color .22s}.fc:hover{transform:translateY(-4px);box-shadow:0 14px 36px rgba(0,0,0,.1);border-color:rgba(234,102,61,.3)!important}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes backdropIn{from{opacity:0}to{opacity:1}}
        @keyframes modalIn{from{opacity:0;transform:scale(.94) translateY(14px)}to{opacity:1;transform:scale(1) translateY(0)}}
        @keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}
        @keyframes gradShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
        @keyframes tickerMove{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
        @keyframes blink{50%{opacity:0}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
        .shake{animation:shake .45s ease both}
      `}</style>

      {/* NAV */}
      <nav style={{ position:'fixed',top:0,left:0,right:0,zIndex:100,height:58,background:'rgba(238,237,237,.88)',backdropFilter:'blur(16px)',borderBottom:'1px solid rgba(0,0,0,.07)',display:'flex',alignItems:'center' }}>
        <div style={{ maxWidth:1160,margin:'0 auto',padding:'0 22px',width:'100%',display:'flex',alignItems:'center',gap:28 }}>
          <div style={{ display:'flex',alignItems:'center',gap:9 }}>
            <div style={{ width:30,height:30,borderRadius:8,background:'#EA663D',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:16,boxShadow:'0 3px 10px rgba(234,102,61,.35)' }}>◈</div>
            <span style={{ fontFamily:'Barlow Condensed,sans-serif',fontWeight:900,fontSize:21,letterSpacing:3,textTransform:'uppercase' }}>SIGIL</span>
          </div>
          <div style={{ display:'flex',gap:24,marginLeft:8 }}>
            {['Features','How It Works','Threats'].map(l => (
              <a key={l} href={`#${l.toLowerCase().replace(/ /g,'-')}`} style={{ fontSize:14,color:'#666',fontWeight:500,transition:'color .2s' }}
                onMouseEnter={e=>(e.currentTarget.style.color='#EA663D')} onMouseLeave={e=>(e.currentTarget.style.color='#666')}>{l}</a>
            ))}
          </div>
          <div style={{ marginLeft:'auto',display:'flex',gap:10 }}>
            <button onClick={()=>setModal('login')} style={{ padding:'7px 18px',borderRadius:8,border:'1.5px solid rgba(0,0,0,.15)',background:'transparent',color:'#111',fontSize:13,fontWeight:600,transition:'all .2s' }}
              onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.borderColor='#EA663D';el.style.color='#EA663D'}}
              onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.borderColor='rgba(0,0,0,.15)';el.style.color='#111'}}>Sign In</button>
            <button onClick={()=>setModal('signup')} style={{ padding:'7px 18px',borderRadius:8,border:'none',background:'#EA663D',color:'#fff',fontSize:13,fontWeight:700,boxShadow:'0 3px 12px rgba(234,102,61,.35)',transition:'all .2s' }}
              onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='translateY(-1px)';el.style.boxShadow='0 6px 20px rgba(234,102,61,.45)'}}
              onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='';el.style.boxShadow='0 3px 12px rgba(234,102,61,.35)'}}>
              Get Started Free →</button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ minHeight:'100vh',display:'flex',alignItems:'center',paddingTop:58,position:'relative',overflow:'hidden' }}>
        <div style={{ position:'absolute',inset:0,background:'#111',zIndex:0 }} />
        <div style={{ position:'absolute',inset:0,backgroundImage:'linear-gradient(rgba(234,102,61,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(234,102,61,.05) 1px,transparent 1px)',backgroundSize:'48px 48px',zIndex:1 }} />
        <div style={{ position:'absolute',top:'-12%',right:'-6%',width:600,height:600,borderRadius:'50%',background:'#EA663D',filter:'blur(130px)',opacity:.09,zIndex:1,transform:`translateY(${scrollY*.12}px)` }} />
        <div style={{ position:'absolute',bottom:'-14%',left:'-5%',width:500,height:500,borderRadius:'50%',background:'#AAAAD5',filter:'blur(120px)',opacity:.07,zIndex:1 }} />

        <div style={{ maxWidth:1160,margin:'0 auto',padding:'80px 22px',width:'100%',position:'relative',zIndex:2,display:'grid',gridTemplateColumns:'1fr 500px',gap:56,alignItems:'center' }}>
          <div>
            <div style={{ display:'inline-flex',alignItems:'center',gap:8,padding:'5px 14px',borderRadius:100,border:'1px solid rgba(234,102,61,.3)',background:'rgba(234,102,61,.1)',marginBottom:26 }}>
              <span style={{ width:6,height:6,borderRadius:'50%',background:'#C5D545',boxShadow:'0 0 6px rgba(197,213,69,.7)',animation:'pulse 2s ease infinite',display:'block' }} />
              <span style={{ fontFamily:'var(--mono)',fontSize:11,color:'rgba(255,255,255,.7)',letterSpacing:'.08em' }}>AI-Powered Dependency Execution Firewall</span>
            </div>

            <h1 style={{ fontFamily:'Barlow Condensed,sans-serif',fontWeight:900,fontSize:'clamp(3rem,6vw,5.2rem)',lineHeight:.96,letterSpacing:'-.01em',color:'#fff',marginBottom:26 }}>
              Stop Malicious<br/>
              <span style={{ backgroundImage:'linear-gradient(135deg,#EA663D,#C284B8,#AAAAD5)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',backgroundClip:'text',backgroundSize:'200%',animation:'gradShift 5s ease infinite' }}>Dependencies</span><br/>
              Before They Run
            </h1>

            <p style={{ color:'rgba(255,255,255,.5)',fontSize:17,lineHeight:1.72,maxWidth:480,marginBottom:36 }}>
              SIGIL wraps every{' '}
              <code style={{ color:'#EA663D',background:'rgba(234,102,61,.15)',padding:'2px 7px',borderRadius:4,fontFamily:'monospace',fontSize:14 }}>npm install</code> and{' '}
              <code style={{ color:'#EA663D',background:'rgba(234,102,61,.15)',padding:'2px 7px',borderRadius:4,fontFamily:'monospace',fontSize:14 }}>pip install</code>{' '}
              in real-time AI analysis — and blocks dangerous packages before a single file executes.
            </p>

            <div style={{ display:'flex',gap:12,marginBottom:44 }}>
              <button onClick={()=>setModal('signup')} style={{ padding:'13px 26px',borderRadius:12,border:'none',background:'#EA663D',color:'#fff',fontFamily:'Barlow Condensed,sans-serif',fontWeight:900,fontSize:17,letterSpacing:.5,textTransform:'uppercase',cursor:'pointer',boxShadow:'0 6px 24px rgba(234,102,61,.45)',transition:'all .25s' }}
                onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='translateY(-3px)';el.style.boxShadow='0 12px 36px rgba(234,102,61,.55)'}}
                onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='';el.style.boxShadow='0 6px 24px rgba(234,102,61,.45)'}}>
                Get Started Free →</button>
              <button onClick={()=>setModal('login')} style={{ padding:'13px 26px',borderRadius:12,border:'1.5px solid rgba(255,255,255,.15)',background:'rgba(255,255,255,.07)',color:'rgba(255,255,255,.8)',fontFamily:'Barlow Condensed,sans-serif',fontWeight:700,fontSize:17,letterSpacing:.5,textTransform:'uppercase',cursor:'pointer',transition:'all .2s',backdropFilter:'blur(8px)' }}
                onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.borderColor='rgba(255,255,255,.35)';el.style.color='#fff'}}
                onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.borderColor='rgba(255,255,255,.15)';el.style.color='rgba(255,255,255,.8)'}}>Sign In</button>
            </div>

            {/* Stats */}
            <div style={{ display:'flex',gap:0,borderRadius:12,overflow:'hidden',border:'1px solid rgba(255,255,255,.07)' }}>
              {[['< 1.5s','Scan time'],['98%','Detection'],['npm+pip','Managers'],['0','Config']].map(([v,l],i) => (
                <div key={l} style={{ flex:1,padding:'13px 10px',background:'rgba(255,255,255,.04)',borderLeft:i>0?'1px solid rgba(255,255,255,.07)':'none',textAlign:'center' }}>
                  <div style={{ fontFamily:'monospace',fontWeight:700,fontSize:14,color:'#EA663D',marginBottom:3 }}>{v}</div>
                  <div style={{ fontSize:10,color:'rgba(255,255,255,.3)',textTransform:'uppercase',letterSpacing:'.08em' }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Terminal */}
          <div style={{ position:'relative',transform:`translateY(${scrollY*-.06}px)` }}>
            <div style={{ position:'absolute',inset:-20,background:'#EA663D',borderRadius:'50%',filter:'blur(60px)',opacity:.07 }} />
            <div style={{ position:'relative',borderRadius:17,border:'1px solid rgba(255,255,255,.1)',background:'rgba(18,18,18,.95)',backdropFilter:'blur(20px)',overflow:'hidden',boxShadow:'0 40px 80px rgba(0,0,0,.5)' }}>
              <div style={{ padding:'11px 16px',borderBottom:'1px solid rgba(255,255,255,.06)',display:'flex',alignItems:'center',gap:7,background:'rgba(0,0,0,.3)' }}>
                <span style={{ width:11,height:11,borderRadius:'50%',background:'#FF5F57' }} /><span style={{ width:11,height:11,borderRadius:'50%',background:'#FFBD2E' }} /><span style={{ width:11,height:11,borderRadius:'50%',background:'#28C840' }} />
                <span style={{ marginLeft:'auto',fontFamily:'monospace',fontSize:11,color:'rgba(255,255,255,.3)' }}>sigil — zsh</span>
              </div>
              <div style={{ padding:'18px 20px',fontFamily:'monospace',fontSize:12.5,lineHeight:1.9 }}>
                {[
                  { p:true,  t:'sigil init',                    c:'#fff' },
                  { p:false, t:'✓ SIGIL v4 initialised',          c:'#C5D545' },
                  { p:false, t:'  ID  SIGIL-K7P2-X4NM',          c:'#EA663D' },
                  { p:true,  t:'sigil install pandas', mt:true,   c:'#fff' },
                  { p:false, t:'  Scanning pandas…',             c:'rgba(255,255,255,.4)' },
                  { p:false, t:'  Risk   ██░░░ 4/100',           c:'#C5D545' },
                  { p:false, t:'  Status ✓ ALLOWED',             c:'#C5D545' },
                  { p:false, t:'  ↓ Installing pandas…',         c:'rgba(255,255,255,.4)' },
                  { p:true,  t:'sigil install crypto-stealer', mt:true, c:'#fff' },
                  { p:false, t:'  Risk   ██████████ 98/100',     c:'#FF3B30' },
                  { p:false, t:'  Status ✗ BLOCKED',             c:'#FF3B30' },
                  { p:false, t:'  ⛔ No files installed',        c:'#FF3B30' },
                ].map((l,i) => (
                  <div key={i} style={{ display:'flex',gap:'.6em',marginTop:l.mt?'.8em':undefined }}>
                    {l.p&&<span style={{ color:'#EA663D',userSelect:'none' }}>$</span>}
                    {!l.p&&<span style={{ minWidth:'.6em' }} />}
                    <span style={{ color:l.c }}>{l.t}</span>
                  </div>
                ))}
                <div style={{ display:'flex',gap:'.6em',marginTop:'.8em' }}>
                  <span style={{ color:'#EA663D' }}>$</span>
                  <span style={{ display:'inline-block',width:8,height:'1em',background:'#EA663D',animation:'blink 1s step-end infinite',verticalAlign:'middle',marginTop:3 }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TICKER */}
      <div style={{ background:'#111',borderTop:'1px solid rgba(234,102,61,.2)',borderBottom:'1px solid rgba(234,102,61,.2)',padding:'13px 0',overflow:'hidden' }}>
        <div style={{ display:'flex',animation:'tickerMove 20s linear infinite',width:'max-content' }}>
          {[...DEMOS,...DEMOS].map((d,i) => (
            <div key={i} style={{ display:'flex',alignItems:'center',gap:9,padding:'0 28px',borderRight:'1px solid rgba(255,255,255,.05)',whiteSpace:'nowrap' }}>
              <span style={{ fontFamily:'monospace',fontSize:11,color:d.c,fontWeight:700 }}>{d.s==='blocked'?'✗ BLOCKED':d.s==='allowed'?'✓ ALLOWED':'⚠ SUSPICIOUS'}</span>
              <span style={{ fontFamily:'monospace',fontSize:11,color:'rgba(255,255,255,.45)' }}>{d.pkg}</span>
              <span style={{ fontFamily:'monospace',fontSize:10,color:'rgba(255,255,255,.2)' }}>risk:{d.risk}</span>
            </div>
          ))}
        </div>
      </div>

      {/* HOW IT WORKS */}
      <section id="how-it-works" style={{ padding:'90px 22px',background:'#EEEDED' }}>
        <div style={{ maxWidth:1160,margin:'0 auto' }}>
          <div className="reveal" style={{ marginBottom:50,textAlign:'center' }}>
            <div style={{ fontFamily:'monospace',fontSize:10,color:'#EA663D',letterSpacing:'.14em',textTransform:'uppercase',marginBottom:10 }}>HOW IT WORKS</div>
            <h2 style={{ fontFamily:'Barlow Condensed,sans-serif',fontWeight:900,fontSize:'clamp(2rem,4vw,3.3rem)',textTransform:'uppercase',letterSpacing:'-.01em' }}>Three commands. Zero config.</h2>
          </div>
          <div className="reveal stagger" style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:2,background:'rgba(0,0,0,.07)',borderRadius:18,overflow:'hidden',border:'1px solid rgba(0,0,0,.07)' }}>
            {[
              { n:'01', t:'Initialize', cmd:'sigil init', d:'Generates your SIGIL-XXXX ID and links to Firebase. Saved to ~/.sigil/config.json.' },
              { n:'02', t:'Scan & Decide', cmd:'sigil install pandas', d:'AI risk analysis runs. Allowed → installs. Quarantined → sandbox. Blocked → stopped.' },
              { n:'03', t:'Monitor Live', cmd:'dashboard.localhost:3000', d:'Every decision streams to your dashboard via Firebase Realtime DB in under 2 seconds.' },
            ].map(s => (
              <div key={s.n} className="fc" style={{ padding:'32px 28px',background:'#fff',cursor:'default' }}>
                <div style={{ fontFamily:'monospace',fontWeight:700,fontSize:38,color:'rgba(234,102,61,.15)',lineHeight:1,marginBottom:18 }}>{s.n}</div>
                <div style={{ width:2,height:24,background:'linear-gradient(#EA663D,transparent)',marginBottom:16 }} />
                <h3 style={{ fontFamily:'Barlow Condensed,sans-serif',fontWeight:900,fontSize:22,textTransform:'uppercase',marginBottom:8 }}>{s.t}</h3>
                <div style={{ background:'#111',borderRadius:7,padding:'7px 13px',marginBottom:12,display:'inline-block' }}>
                  <code style={{ fontFamily:'monospace',fontSize:11,color:'#EA663D' }}>{s.cmd}</code>
                </div>
                <p style={{ color:'#666',fontSize:13.5,lineHeight:1.7 }}>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" style={{ padding:'90px 22px',background:'#fff' }}>
        <div style={{ maxWidth:1160,margin:'0 auto' }}>
          <div className="reveal" style={{ marginBottom:50 }}>
            <div style={{ fontFamily:'monospace',fontSize:10,color:'#EA663D',letterSpacing:'.14em',textTransform:'uppercase',marginBottom:10 }}>Features</div>
            <h2 style={{ fontFamily:'Barlow Condensed,sans-serif',fontWeight:900,fontSize:'clamp(2rem,4vw,3.3rem)',textTransform:'uppercase',letterSpacing:'-.01em',maxWidth:520 }}>Enterprise security. Developer experience.</h2>
          </div>
          <div className="reveal stagger" style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14 }}>
            {FEATURES.map(f => (
              <div key={f.t} className="fc" style={{ padding:'26px 22px',borderRadius:16,border:'1.5px solid rgba(0,0,0,.07)',background:'#fafafa' }}>
                <div style={{ fontSize:26,marginBottom:14 }}>{f.icon}</div>
                <h3 style={{ fontFamily:'Barlow Condensed,sans-serif',fontWeight:900,fontSize:19,textTransform:'uppercase',marginBottom:8 }}>{f.t}</h3>
                <p style={{ color:'#666',fontSize:13.5,lineHeight:1.7 }}>{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* THREATS TABLE */}
      <section id="threats" style={{ padding:'90px 22px',background:'#EEEDED' }}>
        <div style={{ maxWidth:1160,margin:'0 auto' }}>
          <div className="reveal" style={{ marginBottom:44 }}>
            <div style={{ fontFamily:'monospace',fontSize:10,color:'#EA663D',letterSpacing:'.14em',textTransform:'uppercase',marginBottom:10 }}>Live Threat Intelligence</div>
            <h2 style={{ fontFamily:'Barlow Condensed,sans-serif',fontWeight:900,fontSize:'clamp(2rem,4vw,3.3rem)',textTransform:'uppercase',letterSpacing:'-.01em' }}>What SIGIL catches</h2>
          </div>
          <div className="reveal" style={{ borderRadius:18,border:'1.5px solid rgba(0,0,0,.08)',background:'#fff',overflow:'hidden' }}>
            <div style={{ padding:'12px 22px',borderBottom:'1px solid rgba(0,0,0,.06)',display:'grid',gridTemplateColumns:'1.5fr 80px 1fr 130px 1.5fr',gap:12 }}>
              {['PACKAGE','MANAGER','RISK','STATUS','REASON'].map(h => <div key={h} style={{ fontFamily:'monospace',fontSize:9,fontWeight:700,color:'#bbb',letterSpacing:'.1em',textTransform:'uppercase' }}>{h}</div>)}
            </div>
            {DEMOS.map((d,i) => (
              <div key={d.pkg} style={{ padding:'14px 22px',borderBottom:i<DEMOS.length-1?'1px solid rgba(0,0,0,.05)':'none',display:'grid',gridTemplateColumns:'1.5fr 80px 1fr 130px 1.5fr',gap:12,alignItems:'center',transition:'background .2s' }}
                onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='rgba(0,0,0,.02)'}
                onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                  <span style={{ width:7,height:7,borderRadius:'50%',background:d.c,flexShrink:0 }} />
                  <code style={{ fontFamily:'monospace',fontWeight:700,fontSize:13 }}>{d.pkg}</code>
                </div>
                <span style={{ fontFamily:'monospace',fontSize:11,color:'#aaa',background:'rgba(0,0,0,.05)',padding:'2px 7px',borderRadius:4,display:'inline-block' }}>pip</span>
                <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                  <div style={{ flex:1,height:4,background:'rgba(0,0,0,.07)',borderRadius:2,overflow:'hidden' }}>
                    <div style={{ height:'100%',width:`${d.risk}%`,background:d.c,borderRadius:2 }} />
                  </div>
                  <span style={{ fontFamily:'monospace',fontSize:11,color:d.c,fontWeight:700,minWidth:24 }}>{d.risk}</span>
                </div>
                <span style={{ fontFamily:'monospace',fontSize:11,fontWeight:700,color:d.c,background:`${d.c}16`,padding:'3px 9px',borderRadius:100,display:'inline-block',border:`1px solid ${d.c}28`,whiteSpace:'nowrap' }}>
                  {d.s==='blocked'?'✗ BLOCKED':d.s==='allowed'?'✓ ALLOWED':'⚠ SUSPICIOUS'}
                </span>
                <span style={{ fontSize:12,color:'#888' }}>{d.why}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding:'110px 22px',background:'#111',position:'relative',overflow:'hidden' }}>
        <div style={{ position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:700,height:700,borderRadius:'50%',background:'#EA663D',filter:'blur(140px)',opacity:.07 }} />
        <div style={{ position:'absolute',inset:0,backgroundImage:'linear-gradient(rgba(234,102,61,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(234,102,61,.04) 1px,transparent 1px)',backgroundSize:'48px 48px' }} />
        <div className="reveal" style={{ maxWidth:600,margin:'0 auto',textAlign:'center',position:'relative',zIndex:1 }}>
          <div style={{ fontFamily:'monospace',fontSize:10,color:'rgba(234,102,61,.8)',letterSpacing:'.14em',textTransform:'uppercase',marginBottom:18 }}>Ready to secure your stack?</div>
          <h2 style={{ fontFamily:'Barlow Condensed,sans-serif',fontWeight:900,fontSize:'clamp(2.4rem,5vw,4.2rem)',letterSpacing:'-.01em',color:'#fff',textTransform:'uppercase',lineHeight:.96,marginBottom:22 }}>
            Zero config.<br/>Real protection.
          </h2>
          <p style={{ color:'rgba(255,255,255,.4)',fontSize:15,lineHeight:1.72,marginBottom:38 }}>Three commands and you're live. No cloud accounts, no agents, no data collection. Just your terminal and a dashboard.</p>
          <div style={{ display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap' }}>
            <button onClick={()=>setModal('signup')} style={{ padding:'15px 34px',borderRadius:12,border:'none',background:'#EA663D',color:'#fff',fontFamily:'Barlow Condensed,sans-serif',fontWeight:900,fontSize:18,letterSpacing:.5,textTransform:'uppercase',cursor:'pointer',boxShadow:'0 6px 24px rgba(234,102,61,.45)',transition:'all .25s' }}
              onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='translateY(-3px)';el.style.boxShadow='0 12px 36px rgba(234,102,61,.55)'}}
              onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='';el.style.boxShadow='0 6px 24px rgba(234,102,61,.45)'}}>
              Create Free Account →</button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background:'#0a0a0a',padding:'28px 22px',borderTop:'1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth:1160,margin:'0 auto',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:14 }}>
          <div style={{ display:'flex',alignItems:'center',gap:9 }}>
            <div style={{ width:26,height:26,borderRadius:6,background:'#EA663D',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:13 }}>◈</div>
            <span style={{ fontFamily:'Barlow Condensed,sans-serif',fontWeight:900,fontSize:17,letterSpacing:2,textTransform:'uppercase',color:'#fff' }}>SIGIL</span>
          </div>
          <p style={{ color:'rgba(255,255,255,.2)',fontSize:12,fontFamily:'monospace' }}>© 2026 SIGIL v4 — AI Dependency Execution Firewall</p>
          <button onClick={()=>setModal('signup')} style={{ padding:'7px 18px',borderRadius:7,border:'1px solid rgba(234,102,61,.3)',background:'rgba(234,102,61,.08)',color:'#EA663D',fontSize:13,fontWeight:600,cursor:'pointer',transition:'all .2s',fontFamily:'DM Sans,sans-serif' }}
            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='rgba(234,102,61,.16)'}
            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='rgba(234,102,61,.08)'}>
            Get Started →</button>
        </div>
      </footer>
    </>
  )
}
