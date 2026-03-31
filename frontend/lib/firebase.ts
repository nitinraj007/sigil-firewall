// SIGIL v4 — Firebase client SDK
// Uses the exact config provided by the project owner

import { initializeApp, getApps, FirebaseApp } from 'firebase/app'
import {
  getAuth, Auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider, signInWithPopup,
  signOut as _signOut,
  onAuthStateChanged,
  browserLocalPersistence, setPersistence,
  User,
} from 'firebase/auth'
import {
  getDatabase, Database,
  ref, set, push, get, remove, update, onValue, off,
} from 'firebase/database'

// ✅ REPLACE WITH YOUR OWN:
export const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  databaseURL:       process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL!,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket:     `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.appspot.com`,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
}

let app: FirebaseApp
let auth: Auth
let db: Database

if (typeof window !== 'undefined') {
  app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
  auth = getAuth(app)
  db   = getDatabase(app)
  setPersistence(auth, browserLocalPersistence).catch(() => {})
}

export { app, auth, db }

// ── Auth helpers ───────────────────────────────────────────────────────────────
export const signIn      = (email: string, pw: string) => signInWithEmailAndPassword(auth, email, pw).then(c => c.user)
export const signUp      = (email: string, pw: string) => createUserWithEmailAndPassword(auth, email, pw).then(c => c.user)
export const signInGoogle = () => signInWithPopup(auth, new GoogleAuthProvider()).then(c => c.user)
export const signOut     = () => _signOut(auth)
export const onAuth      = (cb: (u: User|null)=>void) => onAuthStateChanged(auth, cb)
export const currentUser = () => auth?.currentUser ?? null

// ── User connections store ─────────────────────────────────────────────────────
// /users/{uid}/connections/{key} → SavedConnection
export interface SavedConnection {
  id: string; label: string; addedAt: string; lastUsed: string;
}

export async function getConnections(uid: string): Promise<SavedConnection[]> {
  if (!db) return []
  const snap = await get(ref(db, `users/${uid}/connections`))
  if (!snap.exists()) return []
  return Object.values(snap.val() as Record<string, SavedConnection>)
    .sort((a,b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime())
}

export async function saveConnection(uid: string, conn: SavedConnection) {
  if (!db) return
  const key = conn.id.replace(/[^A-Z0-9]/g,'_')
  await set(ref(db, `users/${uid}/connections/${key}`), conn)
}

export async function removeConnection(uid: string, id: string) {
  if (!db) return
  const key = id.replace(/[^A-Z0-9]/g,'_')
  await remove(ref(db, `users/${uid}/connections/${key}`))
}

export async function touchConnection(uid: string, id: string) {
  if (!db) return
  const key = id.replace(/[^A-Z0-9]/g,'_')
  await update(ref(db, `users/${uid}/connections/${key}`), { lastUsed: new Date().toISOString() })
}

// ── Log persistence ────────────────────────────────────────────────────────────
// /logs/{connectionId}/{pushKey} → LogEntry
export async function persistLog(connectionId: string, entry: object) {
  if (!db) return
  await push(ref(db, `logs/${connectionId}`), entry)
}

export async function fetchPersistedLogs(connectionId: string): Promise<any[]> {
  if (!db) return []
  const snap = await get(ref(db, `logs/${connectionId}`))
  if (!snap.exists()) return []
  return Object.values(snap.val() as Record<string, any>)
    .sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

// ── Real-time log listener ─────────────────────────────────────────────────────
export function subscribeToLogs(connectionId: string, cb: (logs: any[]) => void): () => void {
  if (!db) return () => {}
  const r = ref(db, `logs/${connectionId}`)
  const handler = (snap: any) => {
    if (!snap.exists()) { cb([]); return }
    const arr = Object.values(snap.val() as Record<string, any>)
      .sort((a:any,b:any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    cb(arr)
  }
  onValue(r, handler)
  return () => off(r, 'value', handler)
}

// ── Webhook preference ─────────────────────────────────────────────────────────
export async function saveWebhook(uid: string, webhookUrl: string) {
  if (!db) return
  await set(ref(db, `users/${uid}/webhook`), { url: webhookUrl, updatedAt: new Date().toISOString() })
}

export async function getWebhook(uid: string): Promise<string> {
  if (!db) return ''
  const snap = await get(ref(db, `users/${uid}/webhook`))
  return snap.exists() ? snap.val().url : ''
}
