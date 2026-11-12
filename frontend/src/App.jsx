import React, { useState, useEffect, useCallback } from 'react'
import { api, token } from './api.js'

/* ── Theme & helpers ─────────────────────────────────────────────────────── */
const C = {
  navy: '#0f172a', navy2: '#1e293b', accent: '#2563eb', accentDark: '#1d4ed8',
  green: '#16a34a', greenL: '#dcfce7', red: '#dc2626', redL: '#fee2e2',
  amber: '#b45309', amberL: '#fef3c7', text: '#1f2937', textMid: '#475569',
  textMuted: '#94a3b8', border: '#e2e8f0', surface: '#ffffff', bg: '#f1f5f9',
}
const money = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })
const titleCase = (s) => (s || '').replace(/(^|\s|-)\w/g, (m) => m.toUpperCase())

/* ── Primitives ──────────────────────────────────────────────────────────── */
function Btn({ children, onClick, variant = 'primary', size = 'md', disabled, type = 'button', style = {} }) {
  const base = {
    border: '1px solid transparent', borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 600, opacity: disabled ? 0.55 : 1, transition: 'filter .15s',
    padding: size === 'sm' ? '6px 12px' : '9px 16px', fontSize: size === 'sm' ? 13 : 14,
  }
  const v = {
    primary: { background: C.accent, color: '#fff' },
    navy: { background: C.navy, color: '#fff' },
    danger: { background: C.red, color: '#fff' },
    success: { background: C.green, color: '#fff' },
    secondary: { background: '#fff', color: C.text, border: `1px solid ${C.border}` },
    ghost: { background: 'transparent', color: C.textMid },
  }[variant]
  return <button type={type} disabled={disabled} onClick={onClick} style={{ ...base, ...v, ...style }}>{children}</button>
}
function Field({ label, children }) {
  return <label style={{ display: 'block', marginBottom: 12 }}>
    <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 5 }}>{label}</span>
    {children}
  </label>
}
const inputStyle = { width: '100%', padding: '9px 11px', border: `1px solid ${C.border}`, borderRadius: 8, outline: 'none', background: '#fff' }
function Input({ value, onChange, placeholder, type = 'text', ...p }) {
  return <input type={type} value={value ?? ''} placeholder={placeholder}
    onChange={(e) => onChange(e.target.value)} style={inputStyle} {...p} />
}
function Sel({ value, onChange, options }) {
  return <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
    {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
}
function Badge({ children, color = 'gray' }) {
  const m = {
    green: [C.greenL, '#15803d'], red: [C.redL, '#b91c1c'], amber: [C.amberL, C.amber],
    blue: ['#dbeafe', '#1d4ed8'], gray: ['#f1f5f9', C.textMid],
  }[color]
  return <span style={{ background: m[0], color: m[1], fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 999 }}>{children}</span>
}
function Card({ children, style = {} }) {
  return <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, ...style }}>{children}</div>
}
function Stat({ label, value, sub, accent = C.accent }) {
  return <Card style={{ padding: 16 }}>
    <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
    <div style={{ fontSize: 26, fontWeight: 800, color: accent, marginTop: 4 }}>{value}</div>
    {sub && <div style={{ fontSize: 12, color: C.textMid, marginTop: 2 }}>{sub}</div>}
  </Card>
}
function Modal({ title, onClose, children, width = 520 }) {
  return <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24, zIndex: 50, overflow: 'auto' }}>
    <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: width, marginTop: 40, boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
        <h3 style={{ margin: 0, fontSize: 17 }}>{title}</h3>
        <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 22, cursor: 'pointer', color: C.textMuted, lineHeight: 1 }}>×</button>
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  </div>
}
function Spinner({ label = 'Loading…' }) {
  return <div style={{ padding: 40, textAlign: 'center', color: C.textMuted }}>{label}</div>
}
function Empty({ children }) {
  return <div style={{ padding: 32, textAlign: 'center', color: C.textMuted, border: `1px dashed ${C.border}`, borderRadius: 12 }}>{children}</div>
}
const th = { textAlign: 'left', fontSize: 12, color: C.textMuted, fontWeight: 700, padding: '10px 12px', borderBottom: `1px solid ${C.border}`, textTransform: 'uppercase', letterSpacing: 0.3 }
const td = { padding: '10px 12px', borderBottom: `1px solid ${C.border}`, fontSize: 14 }

/* ── Login (password → email OTP) ────────────────────────────────────────── */
function Login({ onAuthed }) {
  const [phase, setPhase] = useState('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')

  const submitPw = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true)
    try {
      const { data } = await api.login(email.trim(), password)
      if (data && data.otp_required) {
        setPhase('otp')
        setNote(data.sent ? `We emailed a 6-digit code to ${email}.` : 'Code generated — check the server mail log if email is not configured.')
      } else if (data && data.token) {
        token.set(data.token); onAuthed(data.user)
      }
    } catch (x) { setErr(x.message || 'Sign-in failed') } finally { setBusy(false) }
  }
  const submitOtp = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true)
    try {
      const { data } = await api.verify(email.trim(), code.trim())
      token.set(data.token); onAuthed(data.user)
    } catch (x) { setErr(x.message || 'Verification failed') } finally { setBusy(false) }
  }

  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${C.navy}, ${C.navy2})`, padding: 20 }}>
    <div style={{ background: '#fff', borderRadius: 16, padding: 32, width: '100%', maxWidth: 400, boxShadow: '0 24px 70px rgba(0,0,0,.35)' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.navy }}>LearnersForge <span style={{ color: C.accent }}>HQ</span></div>
      <div style={{ color: C.textMid, fontSize: 13, marginTop: 4, marginBottom: 22 }}>Group control-plane · super-admin only</div>
      {err && <div style={{ background: C.redL, color: '#b91c1c', padding: '10px 12px', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{err}</div>}
      {note && phase === 'otp' && <div style={{ background: '#eff6ff', color: C.accentDark, padding: '10px 12px', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{note}</div>}
      {phase === 'password' ? (
        <form onSubmit={submitPw}>
          <Field label="Email"><Input type="email" value={email} onChange={setEmail} placeholder="you@example.com" /></Field>
          <Field label="Password"><Input type="password" value={password} onChange={setPassword} placeholder="••••••••" /></Field>
          <Btn type="submit" disabled={busy} style={{ width: '100%', marginTop: 6 }}>{busy ? 'Checking…' : 'Continue'}</Btn>
        </form>
      ) : (
        <form onSubmit={submitOtp}>
          <Field label="6-digit code">
            <Input value={code} onChange={setCode} placeholder="123456" inputMode="numeric" maxLength={6} />
          </Field>
          <Btn type="submit" disabled={busy} style={{ width: '100%', marginTop: 6 }}>{busy ? 'Verifying…' : 'Verify & sign in'}</Btn>
          <button type="button" onClick={() => { setPhase('password'); setCode(''); setErr('') }}
            style={{ border: 'none', background: 'transparent', color: C.textMid, marginTop: 12, cursor: 'pointer', width: '100%' }}>← Back</button>
        </form>
      )}
    </div>
  </div>
}

/* ── Overview ────────────────────────────────────────────────────────────── */
function Overview({ onOpen, banner }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { api.overview().then((r) => setD(r.data)).catch((x) => setErr(x.message)) }, [])
  if (err) return <div style={{ color: C.red }}>{err}</div>
  if (!d) return <Spinner />
  const t = d.totals
  return <div>
    {banner}
    <h1 style={{ fontSize: 22, margin: '0 0 4px' }}>Group overview</h1>
    <div style={{ color: C.textMid, fontSize: 13, marginBottom: 18 }}>{t.schools} schools · {t.active} active · {t.suspended} suspended{t.unreachable ? ` · ${t.unreachable} unreachable` : ''}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 22 }}>
      <Stat label="Students" value={t.students.toLocaleString()} />
      <Stat label="Staff" value={t.staff.toLocaleString()} accent={C.navy} />
      <Stat label="Fees collected" value={money(t.fees_collected)} accent={C.green} />
      <Stat label="Outstanding" value={money(t.fees_outstanding)} accent={C.amber} />
      <Stat label="Exams" value={t.exams.toLocaleString()} accent={C.accentDark} />
    </div>
    <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>Schools</h2>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14 }}>
      {d.schools.map((s) => (
        <Card key={s.id} style={{ cursor: 'pointer' }}>
          <div onClick={() => onOpen(s.id)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <strong style={{ fontSize: 15 }}>{s.name}</strong>
              <Badge color={s.status === 'suspended' ? 'red' : s.ok === false ? 'amber' : 'green'}>
                {s.status === 'suspended' ? 'Suspended' : s.ok === false ? 'Unreachable' : 'Active'}
              </Badge>
            </div>
            {s.ok === false ? (
              <div style={{ color: C.textMuted, fontSize: 13 }}>Could not reach this school's database.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
                <Kv k="Students" v={s.students} />
                <Kv k="Staff" v={s.staff} />
                <Kv k="Collected" v={money(s.fees_collected)} />
                <Kv k="Outstanding" v={money(s.fees_outstanding)} />
                <Kv k="Attendance" v={s.attendance_today == null ? '—' : s.attendance_today + '%'} />
                <Kv k="Results avg" v={s.results?.avg_score == null ? '—' : s.results.avg_score} />
              </div>
            )}
            <div style={{ marginTop: 12, color: C.accent, fontSize: 13, fontWeight: 600 }}>Open →</div>
          </div>
        </Card>
      ))}
    </div>
  </div>
}
function Kv({ k, v }) {
  return <div><div style={{ color: C.textMuted, fontSize: 11 }}>{k}</div><div style={{ fontWeight: 600 }}>{v}</div></div>
}

/* ── Schools registry ────────────────────────────────────────────────────── */
function Schools({ onOpen, toast }) {
  const [rows, setRows] = useState(null)
  const [reg, setReg] = useState(false)
  const [suspend, setSuspend] = useState(null)
  const load = useCallback(() => api.schools().then((r) => setRows(r.data.schools)).catch(() => setRows([])), [])
  useEffect(() => { load() }, [load])

  const doResume = async (s) => {
    try { await api.resume(s.id); toast(`${s.name} resumed`); load() } catch (x) { toast(x.message, true) }
  }

  if (!rows) return <Spinner />
  return <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Schools</h1>
      <Btn variant="navy" onClick={() => setReg(true)}>+ Register school</Btn>
    </div>
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <table>
        <thead><tr><th style={th}>School</th><th style={th}>Database</th><th style={th}>Domain</th><th style={th}>Status</th><th style={{ ...th, textAlign: 'right' }}>Actions</th></tr></thead>
        <tbody>
          {rows.filter((r) => r.is_registered).map((s) => (
            <tr key={s.id}>
              <td style={td}><strong>{s.name}</strong></td>
              <td style={{ ...td, color: C.textMid, fontFamily: 'monospace', fontSize: 12 }}>{s.db_schema}</td>
              <td style={{ ...td, color: C.textMid }}>{s.domain || '—'}</td>
              <td style={td}><Badge color={s.status === 'suspended' ? 'red' : 'green'}>{s.status === 'suspended' ? 'Suspended' : 'Active'}</Badge></td>
              <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                <Btn size="sm" variant="secondary" onClick={() => onOpen(s.id)} style={{ marginRight: 6 }}>Open</Btn>
                {s.status === 'suspended'
                  ? <Btn size="sm" variant="success" onClick={() => doResume(s)}>Resume</Btn>
                  : <Btn size="sm" variant="danger" onClick={() => setSuspend(s)}>Suspend</Btn>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.filter((r) => r.is_registered).length === 0 && <div style={{ padding: 20 }}><Empty>No schools registered yet. Click “Register school” to discover the databases on this account.</Empty></div>}
    </Card>
    {reg && <RegisterModal onClose={() => setReg(false)} onDone={() => { setReg(false); load() }} toast={toast} />}
    {suspend && <SuspendModal school={suspend} onClose={() => setSuspend(null)} onDone={() => { setSuspend(null); load() }} toast={toast} />}
  </div>
}

function RegisterModal({ onClose, onDone, toast }) {
  const [cands, setCands] = useState(null)
  const [busy, setBusy] = useState('')
  useEffect(() => { api.discover().then((r) => setCands(r.data.candidates)).catch((x) => { toast(x.message, true); setCands([]) }) }, [])
  const add = async (c) => {
    setBusy(c.db_schema)
    try { await api.register({ db_schema: c.db_schema, name: c.detected_name || c.db_schema }); toast('School registered'); onDone() }
    catch (x) { toast(x.message, true) } finally { setBusy('') }
  }
  return <Modal title="Register a school" onClose={onClose} width={560}>
    <p style={{ marginTop: 0, color: C.textMid, fontSize: 13 }}>Databases detected on this account. Register the ones that are schools.</p>
    {!cands ? <Spinner /> : cands.length === 0 ? <Empty>No candidate databases found.</Empty> : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {cands.map((c) => (
          <div key={c.db_schema} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px' }}>
            <div>
              <div style={{ fontWeight: 600 }}>{c.detected_name || <span style={{ color: C.textMuted }}>Unknown</span>}</div>
              <div style={{ fontFamily: 'monospace', fontSize: 12, color: C.textMid }}>{c.db_schema}</div>
            </div>
            {c.registered ? <Badge color="blue">Registered</Badge>
              : !c.is_school ? <Badge color="gray">Not a school</Badge>
              : <Btn size="sm" disabled={busy === c.db_schema} onClick={() => add(c)}>{busy === c.db_schema ? '…' : 'Register'}</Btn>}
          </div>
        ))}
      </div>
    )}
  </Modal>
}

function SuspendModal({ school, onClose, onDone, toast }) {
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('This school portal is temporarily unavailable. Please contact your administrator.')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    try { await api.suspend(school.id, { reason, message }); toast(`${school.name} suspended`); onDone() }
    catch (x) { toast(x.message, true); setBusy(false) }
  }
  return <Modal title={`Suspend ${school.name}`} onClose={onClose}>
    <div style={{ background: C.redL, color: '#b91c1c', padding: '10px 12px', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>
      While suspended, every request to this school's portal is blocked and users see the message below.
    </div>
    <Field label="Internal reason (audit log only)"><Input value={reason} onChange={setReason} placeholder="e.g. Subscription overdue" /></Field>
    <Field label="Message shown to the school"><Input value={message} onChange={setMessage} /></Field>
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
      <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
      <Btn variant="danger" disabled={busy} onClick={submit}>{busy ? 'Suspending…' : 'Suspend school'}</Btn>
    </div>
  </Modal>
}

/* ── School detail ───────────────────────────────────────────────────────── */
const TABS = ['Summary', 'Students', 'Staff', 'Classes', 'Fees', 'Results', 'Settings']
function SchoolDetail({ id, onBack, toast }) {
  const [tab, setTab] = useState('Summary')
  const [head, setHead] = useState(null)
  const loadHead = useCallback(() => api.detail(id).then((r) => setHead(r.data)).catch((x) => toast(x.message, true)), [id, toast])
  useEffect(() => { loadHead() }, [loadHead])

  const school = head?.school
  const resume = async () => { try { await api.resume(id); toast('Resumed'); loadHead() } catch (x) { toast(x.message, true) } }
  const [suspend, setSuspend] = useState(false)

  return <div>
    <button onClick={onBack} style={{ border: 'none', background: 'transparent', color: C.textMid, cursor: 'pointer', marginBottom: 10 }}>← All schools</button>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
      <div>
        <h1 style={{ fontSize: 22, margin: 0 }}>{school ? school.name : '…'}</h1>
        {school && <div style={{ color: C.textMid, fontSize: 13 }}>{school.domain || '—'} · <Badge color={school.status === 'suspended' ? 'red' : 'green'}>{school.status === 'suspended' ? 'Suspended' : 'Active'}</Badge></div>}
      </div>
      {school && (school.status === 'suspended'
        ? <Btn variant="success" onClick={resume}>Resume school</Btn>
        : <Btn variant="danger" onClick={() => setSuspend(true)}>Suspend school</Btn>)}
    </div>
    <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 18, flexWrap: 'wrap' }}>
      {TABS.map((t) => (
        <button key={t} onClick={() => setTab(t)} style={{
          border: 'none', background: 'transparent', padding: '10px 14px', cursor: 'pointer', fontWeight: 600,
          color: tab === t ? C.accent : C.textMid, borderBottom: tab === t ? `2px solid ${C.accent}` : '2px solid transparent',
        }}>{t}</button>
      ))}
    </div>
    {tab === 'Summary' && <Summary head={head} />}
    {tab === 'Students' && <Students id={id} toast={toast} />}
    {tab === 'Staff' && <Staff id={id} toast={toast} />}
    {tab === 'Classes' && <Classes id={id} toast={toast} />}
    {tab === 'Fees' && <Fees id={id} toast={toast} />}
    {tab === 'Results' && <Results id={id} toast={toast} />}
    {tab === 'Settings' && <Settings id={id} toast={toast} />}
    {suspend && school && <SuspendModal school={{ id, name: school.name }} onClose={() => setSuspend(false)} onDone={() => { setSuspend(false); loadHead() }} toast={toast} />}
  </div>
}

function Summary({ head }) {
  if (!head) return <Spinner />
  const s = head.stats
  return <div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 18 }}>
      <Stat label="Students" value={s.students} />
      <Stat label="Staff" value={s.staff} accent={C.navy} />
      <Stat label="Collected" value={money(s.fees_collected)} accent={C.green} />
      <Stat label="Outstanding" value={money(s.fees_outstanding)} accent={C.amber} />
      <Stat label="Attendance" value={s.attendance_today == null ? '—' : s.attendance_today + '%'} sub={`${s.attendance_marked} marked today`} />
      <Stat label="Results avg" value={s.results?.avg_score == null ? '—' : s.results.avg_score} sub={`${s.results?.graded_students || 0} graded`} accent={C.accentDark} />
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>
      <Card>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Students by class</h3>
        {(head.detail.by_class || []).length === 0 ? <Empty>No classes</Empty> : (head.detail.by_class).map((c) => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${C.border}`, fontSize: 14 }}>
            <span>{c.name}</span><strong>{c.students}</strong>
          </div>
        ))}
      </Card>
      <Card>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Recent payments</h3>
        {(head.detail.recent_payments || []).length === 0 ? <Empty>No payments</Empty> : (head.detail.recent_payments).map((p, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${C.border}`, fontSize: 14 }}>
            <span>{p.student}<span style={{ color: C.textMuted }}> · {p.payment_date}</span></span><strong style={{ color: C.green }}>{money(p.amount)}</strong>
          </div>
        ))}
      </Card>
    </div>
  </div>
}

/* ── Students ─────────────────────────────────────────────────────────────── */
function Students({ id, toast }) {
  const [rows, setRows] = useState(null)
  const [meta, setMeta] = useState({})
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [edit, setEdit] = useState(null)
  const load = useCallback(() => api.students(id, { search, page, per_page: 25 }).then((r) => { setRows(r.data.students); setMeta(r.data.meta) }).catch((x) => toast(x.message, true)), [id, search, page, toast])
  useEffect(() => { load() }, [load])

  const del = async (s) => {
    if (!confirm(`Remove ${s.first_name} ${s.last_name}? This soft-deletes the student.`)) return
    try { await api.deleteStudent(id, s.id); toast('Student removed'); load() } catch (x) { toast(x.message, true) }
  }
  return <div>
    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
      <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Search name or ID…" style={{ ...inputStyle, maxWidth: 280 }} />
    </div>
    {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No students found.</Empty> : (
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <table><thead><tr><th style={th}>Name</th><th style={th}>ID</th><th style={th}>Class</th><th style={th}>Guardian</th><th style={th}>Status</th><th style={{ ...th, textAlign: 'right' }}>Actions</th></tr></thead>
          <tbody>{rows.map((s) => (
            <tr key={s.id}>
              <td style={td}><strong>{s.first_name} {s.last_name}</strong><div style={{ color: C.textMuted, fontSize: 12 }}>{s.email}</div></td>
              <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{s.student_id}</td>
              <td style={td}>{s.class_name}</td>
              <td style={td}>{s.guardian_name || '—'}<div style={{ color: C.textMuted, fontSize: 12 }}>{s.guardian_phone}</div></td>
              <td style={td}><Badge color={Number(s.is_active) ? 'green' : 'gray'}>{Number(s.is_active) ? 'Active' : 'Inactive'}</Badge></td>
              <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                <Btn size="sm" variant="secondary" onClick={() => setEdit(s)} style={{ marginRight: 6 }}>Edit</Btn>
                <Btn size="sm" variant="danger" onClick={() => del(s)}>Delete</Btn>
              </td>
            </tr>
          ))}</tbody></table>
      </Card>
    )}
    {meta.pages > 1 && <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
      <Btn size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Btn>
      <span style={{ fontSize: 13, color: C.textMid }}>Page {meta.page} of {meta.pages} · {meta.total} total</span>
      <Btn size="sm" variant="secondary" disabled={page >= meta.pages} onClick={() => setPage(page + 1)}>Next</Btn>
    </div>}
    {edit && <StudentModal id={id} student={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load() }} toast={toast} />}
  </div>
}
function StudentModal({ id, student, onClose, onDone, toast }) {
  const [f, setF] = useState({
    first_name: student.first_name || '', last_name: student.last_name || '', phone: student.phone || '',
    gender: student.gender || '', guardian_name: student.guardian_name || '', guardian_phone: student.guardian_phone || '',
    guardian_email: student.guardian_email || '', is_active: String(Number(student.is_active)),
  })
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setF((o) => ({ ...o, [k]: v }))
  const save = async () => {
    setBusy(true)
    try { await api.updateStudent(id, student.id, { ...f, is_active: Number(f.is_active) }); toast('Student updated'); onDone() }
    catch (x) { toast(x.message, true); setBusy(false) }
  }
  return <Modal title={`Edit ${student.first_name} ${student.last_name}`} onClose={onClose}>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <Field label="First name"><Input value={f.first_name} onChange={set('first_name')} /></Field>
      <Field label="Last name"><Input value={f.last_name} onChange={set('last_name')} /></Field>
      <Field label="Phone"><Input value={f.phone} onChange={set('phone')} /></Field>
      <Field label="Gender"><Sel value={f.gender} onChange={set('gender')} options={[{ value: '', label: '—' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }]} /></Field>
      <Field label="Guardian name"><Input value={f.guardian_name} onChange={set('guardian_name')} /></Field>
      <Field label="Guardian phone"><Input value={f.guardian_phone} onChange={set('guardian_phone')} /></Field>
      <Field label="Guardian email"><Input value={f.guardian_email} onChange={set('guardian_email')} /></Field>
      <Field label="Status"><Sel value={f.is_active} onChange={set('is_active')} options={[{ value: '1', label: 'Active' }, { value: '0', label: 'Inactive' }]} /></Field>
    </div>
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
      <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
      <Btn disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</Btn>
    </div>
  </Modal>
}

/* ── Staff ────────────────────────────────────────────────────────────────── */
function Staff({ id, toast }) {
  const [rows, setRows] = useState(null)
  const [edit, setEdit] = useState(null)
  const load = useCallback(() => api.staff(id).then((r) => setRows(r.data.staff)).catch((x) => toast(x.message, true)), [id, toast])
  useEffect(() => { load() }, [load])
  const del = async (s) => {
    if (!confirm(`Remove ${s.first_name} ${s.last_name}?`)) return
    try { await api.deleteStaff(id, s.id); toast('Staff removed'); load() } catch (x) { toast(x.message, true) }
  }
  if (!rows) return <Spinner />
  if (rows.length === 0) return <Empty>No staff found.</Empty>
  return <div>
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <table><thead><tr><th style={th}>Name</th><th style={th}>ID</th><th style={th}>Department</th><th style={th}>Designation</th><th style={th}>Status</th><th style={{ ...th, textAlign: 'right' }}>Actions</th></tr></thead>
        <tbody>{rows.map((s) => (
          <tr key={s.id}>
            <td style={td}><strong>{s.first_name} {s.last_name}</strong><div style={{ color: C.textMuted, fontSize: 12 }}>{s.email}</div></td>
            <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{s.staff_id}</td>
            <td style={td}>{s.department || '—'}</td>
            <td style={td}>{s.designation || '—'}</td>
            <td style={td}><Badge color={Number(s.is_active) ? 'green' : 'gray'}>{Number(s.is_active) ? 'Active' : 'Inactive'}</Badge></td>
            <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
              <Btn size="sm" variant="secondary" onClick={() => setEdit(s)} style={{ marginRight: 6 }}>Edit</Btn>
              <Btn size="sm" variant="danger" onClick={() => del(s)}>Delete</Btn>
            </td>
          </tr>
        ))}</tbody></table>
    </Card>
    {edit && <StaffModal id={id} staff={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load() }} toast={toast} />}
  </div>
}
function StaffModal({ id, staff, onClose, onDone, toast }) {
  const [f, setF] = useState({
    first_name: staff.first_name || '', last_name: staff.last_name || '', phone: staff.phone || '', gender: staff.gender || '',
    department: staff.department || '', designation: staff.designation || '', qualification: staff.qualification || '',
    is_active: String(Number(staff.is_active)),
  })
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setF((o) => ({ ...o, [k]: v }))
  const save = async () => {
    setBusy(true)
    try { await api.updateStaff(id, staff.id, { ...f, is_active: Number(f.is_active) }); toast('Staff updated'); onDone() }
    catch (x) { toast(x.message, true); setBusy(false) }
  }
  return <Modal title={`Edit ${staff.first_name} ${staff.last_name}`} onClose={onClose}>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <Field label="First name"><Input value={f.first_name} onChange={set('first_name')} /></Field>
      <Field label="Last name"><Input value={f.last_name} onChange={set('last_name')} /></Field>
      <Field label="Phone"><Input value={f.phone} onChange={set('phone')} /></Field>
      <Field label="Gender"><Sel value={f.gender} onChange={set('gender')} options={[{ value: '', label: '—' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }]} /></Field>
      <Field label="Department"><Input value={f.department} onChange={set('department')} /></Field>
      <Field label="Designation"><Input value={f.designation} onChange={set('designation')} /></Field>
      <Field label="Qualification"><Input value={f.qualification} onChange={set('qualification')} /></Field>
      <Field label="Status"><Sel value={f.is_active} onChange={set('is_active')} options={[{ value: '1', label: 'Active' }, { value: '0', label: 'Inactive' }]} /></Field>
    </div>
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
      <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
      <Btn disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</Btn>
    </div>
  </Modal>
}

/* ── Classes ──────────────────────────────────────────────────────────────── */
function Classes({ id, toast }) {
  const [rows, setRows] = useState(null)
  const [edit, setEdit] = useState(null)
  const load = useCallback(() => api.classes(id).then((r) => setRows(r.data.classes)).catch((x) => toast(x.message, true)), [id, toast])
  useEffect(() => { load() }, [load])
  const del = async (c) => {
    if (!confirm(`Delete class ${c.name}?`)) return
    try { await api.deleteClass(id, c.id); toast('Class deleted'); load() } catch (x) { toast(x.message, true) }
  }
  if (!rows) return <Spinner />
  return <div>
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}><Btn variant="navy" onClick={() => setEdit({})}>+ Add class</Btn></div>
    {rows.length === 0 ? <Empty>No classes yet.</Empty> : (
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <table><thead><tr><th style={th}>Class</th><th style={th}>Level</th><th style={th}>Form</th><th style={th}>Arm</th><th style={th}>Students</th><th style={th}>Capacity</th><th style={{ ...th, textAlign: 'right' }}>Actions</th></tr></thead>
          <tbody>{rows.map((c) => (
            <tr key={c.id}>
              <td style={td}><strong>{c.name}</strong></td>
              <td style={td}>{c.level || '—'}</td><td style={td}>{c.form || '—'}</td><td style={td}>{c.arm || '—'}</td>
              <td style={td}>{c.students}</td><td style={td}>{c.capacity}</td>
              <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                <Btn size="sm" variant="secondary" onClick={() => setEdit(c)} style={{ marginRight: 6 }}>Edit</Btn>
                <Btn size="sm" variant="danger" onClick={() => del(c)}>Delete</Btn>
              </td>
            </tr>
          ))}</tbody></table>
      </Card>
    )}
    {edit && <ClassModal id={id} cls={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load() }} toast={toast} />}
  </div>
}
function ClassModal({ id, cls, onClose, onDone, toast }) {
  const isNew = !cls.id
  const [f, setF] = useState({ name: cls.name || '', level: cls.level || '', form: cls.form || '', arm: cls.arm || '', capacity: cls.capacity || 40 })
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setF((o) => ({ ...o, [k]: v }))
  const save = async () => {
    setBusy(true)
    try {
      if (isNew) await api.createClass(id, f); else await api.updateClass(id, cls.id, f)
      toast(isNew ? 'Class created' : 'Class updated'); onDone()
    } catch (x) { toast(x.message, true); setBusy(false) }
  }
  return <Modal title={isNew ? 'Add class' : `Edit ${cls.name}`} onClose={onClose} width={440}>
    <Field label="Name (e.g. JSS 1A)"><Input value={f.name} onChange={set('name')} /></Field>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
      <Field label="Level"><Input value={f.level} onChange={set('level')} placeholder="JSS" /></Field>
      <Field label="Form"><Input value={f.form} onChange={set('form')} placeholder="1" /></Field>
      <Field label="Arm"><Input value={f.arm} onChange={set('arm')} placeholder="A" /></Field>
    </div>
    <Field label="Capacity"><Input type="number" value={f.capacity} onChange={set('capacity')} /></Field>
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
      <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
      <Btn disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</Btn>
    </div>
  </Modal>
}

/* ── Fees ─────────────────────────────────────────────────────────────────── */
function Fees({ id, toast }) {
  const [rows, setRows] = useState(null)
  const [edit, setEdit] = useState(null)
  const load = useCallback(() => api.fees(id).then((r) => setRows(r.data.fee_structures)).catch((x) => toast(x.message, true)), [id, toast])
  useEffect(() => { load() }, [load])
  const del = async (f) => {
    if (!confirm(`Delete fee “${f.name}”?`)) return
    try { await api.deleteFee(id, f.id); toast('Fee deleted'); load() } catch (x) { toast(x.message, true) }
  }
  if (!rows) return <Spinner />
  return <div>
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}><Btn variant="navy" onClick={() => setEdit({})}>+ Add fee</Btn></div>
    {rows.length === 0 ? <Empty>No fee structures yet.</Empty> : (
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <table><thead><tr><th style={th}>Name</th><th style={th}>Type</th><th style={th}>Class</th><th style={th}>Term</th><th style={{ ...th, textAlign: 'right' }}>Amount</th><th style={{ ...th, textAlign: 'right' }}>Actions</th></tr></thead>
          <tbody>{rows.map((f) => (
            <tr key={f.id}>
              <td style={td}><strong>{f.name}</strong></td>
              <td style={td}>{titleCase(f.fee_type)}</td>
              <td style={td}>{f.class_name || 'All classes'}</td>
              <td style={td}>{f.term_name || '—'}</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{money(f.amount)}</td>
              <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                <Btn size="sm" variant="secondary" onClick={() => setEdit(f)} style={{ marginRight: 6 }}>Edit</Btn>
                <Btn size="sm" variant="danger" onClick={() => del(f)}>Delete</Btn>
              </td>
            </tr>
          ))}</tbody></table>
      </Card>
    )}
    {edit && <FeeModal id={id} fee={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load() }} toast={toast} />}
  </div>
}
function FeeModal({ id, fee, onClose, onDone, toast }) {
  const isNew = !fee.id
  const [f, setF] = useState({ name: fee.name || '', amount: fee.amount || '', fee_type: fee.fee_type || 'tuition' })
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setF((o) => ({ ...o, [k]: v }))
  const save = async () => {
    setBusy(true)
    try {
      const body = { ...f, amount: Number(f.amount) }
      if (isNew) await api.createFee(id, body); else await api.updateFee(id, fee.id, body)
      toast(isNew ? 'Fee created' : 'Fee updated'); onDone()
    } catch (x) { toast(x.message, true); setBusy(false) }
  }
  const types = ['tuition', 'hostel', 'transport', 'exam', 'uniform', 'other'].map((t) => ({ value: t, label: titleCase(t) }))
  return <Modal title={isNew ? 'Add fee' : `Edit ${fee.name}`} onClose={onClose} width={440}>
    <Field label="Name"><Input value={f.name} onChange={set('name')} placeholder="e.g. Tuition — 1st Term" /></Field>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <Field label="Amount (₦)"><Input type="number" value={f.amount} onChange={set('amount')} /></Field>
      <Field label="Type"><Sel value={f.fee_type} onChange={set('fee_type')} options={types} /></Field>
    </div>
    {isNew && <div style={{ fontSize: 12, color: C.textMuted, marginTop: -4, marginBottom: 8 }}>Applied to the current term, all classes.</div>}
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
      <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
      <Btn disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</Btn>
    </div>
  </Modal>
}

/* ── Results (read-only) ──────────────────────────────────────────────────── */
function Results({ id, toast }) {
  const [d, setD] = useState(null)
  useEffect(() => { api.results(id).then((r) => setD(r.data)).catch((x) => toast(x.message, true)) }, [id, toast])
  if (!d) return <Spinner />
  const o = d.overall || {}
  return <div>
    <div style={{ color: C.textMid, fontSize: 13, marginBottom: 12 }}>Term: <strong>{d.term?.name || '—'}</strong></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 18 }}>
      <Stat label="Graded students" value={o.graded || 0} />
      <Stat label="Grade entries" value={o.entries || 0} accent={C.navy} />
      <Stat label="Average score" value={o.avg_score == null ? '—' : o.avg_score} accent={C.accentDark} />
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>
      <Card>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>By class</h3>
        {(d.by_class || []).length === 0 ? <Empty>No results</Empty> : d.by_class.map((c, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${C.border}`, fontSize: 14 }}>
            <span>{c.class} <span style={{ color: C.textMuted }}>· {c.graded} graded</span></span><strong>{c.avg_score ?? '—'}</strong>
          </div>
        ))}
      </Card>
      <Card>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>By subject</h3>
        {(d.by_subject || []).length === 0 ? <Empty>No results</Empty> : d.by_subject.map((s, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${C.border}`, fontSize: 14 }}>
            <span>{s.subject} <span style={{ color: C.textMuted }}>· {s.entries}</span></span><strong>{s.avg_score ?? '—'}</strong>
          </div>
        ))}
      </Card>
    </div>
  </div>
}

/* ── Settings ─────────────────────────────────────────────────────────────── */
function Settings({ id, toast }) {
  const [f, setF] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { api.settings(id).then((r) => setF(r.data.settings || {})).catch((x) => toast(x.message, true)) }, [id, toast])
  if (!f) return <Spinner />
  const set = (k) => (v) => setF((o) => ({ ...o, [k]: v }))
  const save = async () => {
    setBusy(true)
    try {
      await api.saveSettings(id, {
        name: f.name, email: f.email, phone: f.phone, address: f.address, motto: f.motto,
        logo_url: f.logo_url, term_system: f.term_system, active: Number(f.active) ? 1 : 0,
      })
      toast('Settings saved')
    } catch (x) { toast(x.message, true) } finally { setBusy(false) }
  }
  return <Card style={{ maxWidth: 620 }}>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <Field label="School name"><Input value={f.name} onChange={set('name')} /></Field>
      <Field label="Email"><Input value={f.email} onChange={set('email')} /></Field>
      <Field label="Phone"><Input value={f.phone} onChange={set('phone')} /></Field>
      <Field label="Term system"><Sel value={f.term_system || 'term'} onChange={set('term_system')} options={[{ value: 'term', label: 'Term' }, { value: 'semester', label: 'Semester' }]} /></Field>
      <Field label="Logo URL"><Input value={f.logo_url} onChange={set('logo_url')} /></Field>
      <Field label="Active"><Sel value={String(Number(f.active ?? 1))} onChange={set('active')} options={[{ value: '1', label: 'Yes' }, { value: '0', label: 'No' }]} /></Field>
    </div>
    <Field label="Motto"><Input value={f.motto} onChange={set('motto')} /></Field>
    <Field label="Address"><Input value={f.address} onChange={set('address')} /></Field>
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}><Btn disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save settings'}</Btn></div>
  </Card>
}

/* ── Audit ────────────────────────────────────────────────────────────────── */
function Audit() {
  const [rows, setRows] = useState(null)
  useEffect(() => { api.audit({ per_page: 100 }).then((r) => setRows(r.data.audit)).catch(() => setRows([])) }, [])
  if (!rows) return <Spinner />
  return <div>
    <h1 style={{ fontSize: 22, margin: '0 0 16px' }}>Audit log</h1>
    {rows.length === 0 ? <Empty>No activity yet.</Empty> : (
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <table><thead><tr><th style={th}>When</th><th style={th}>User</th><th style={th}>Action</th><th style={th}>Target</th><th style={th}>Detail</th></tr></thead>
          <tbody>{rows.map((a) => (
            <tr key={a.id}>
              <td style={{ ...td, whiteSpace: 'nowrap', color: C.textMid, fontSize: 12 }}>{a.created_at}</td>
              <td style={{ ...td, fontSize: 13 }}>{a.hq_user_email}</td>
              <td style={td}><Badge color={a.action.includes('suspend') ? 'red' : a.action.includes('resume') ? 'green' : 'blue'}>{a.action}</Badge></td>
              <td style={{ ...td, color: C.textMid, fontSize: 12 }}>{a.target_schema || '—'}{a.target_id ? ` #${a.target_id}` : ''}</td>
              <td style={{ ...td, fontSize: 13 }}>{a.summary || '—'}</td>
            </tr>
          ))}</tbody></table>
      </Card>
    )}
  </div>
}

/* ── Shell ────────────────────────────────────────────────────────────────── */
function Shell({ user, onLogout }) {
  const [nav, setNav] = useState('overview')
  const [schoolId, setSchoolId] = useState(null)
  const [toast, setToast] = useState(null)
  const showToast = useCallback((message, error = false) => {
    setToast({ message, error }); setTimeout(() => setToast(null), 3200)
  }, [])
  const open = (id) => { setSchoolId(id); setNav('school') }

  const items = [['overview', 'Overview'], ['schools', 'Schools'], ['audit', 'Audit log']]
  return <div style={{ display: 'flex', minHeight: '100vh' }}>
    <aside style={{ width: 220, background: C.navy, color: '#fff', padding: '20px 14px', position: 'sticky', top: 0, height: '100vh', flexShrink: 0 }}>
      <div style={{ fontSize: 18, fontWeight: 800, padding: '0 8px 18px' }}>LearnersForge <span style={{ color: '#60a5fa' }}>HQ</span></div>
      {items.map(([k, label]) => (
        <button key={k} onClick={() => { setNav(k); setSchoolId(null) }} style={{
          display: 'block', width: '100%', textAlign: 'left', border: 'none', borderRadius: 8, padding: '10px 12px', marginBottom: 4,
          cursor: 'pointer', fontWeight: 600, background: (nav === k || (k === 'schools' && nav === 'school')) ? C.accent : 'transparent',
          color: (nav === k || (k === 'schools' && nav === 'school')) ? '#fff' : '#cbd5e1',
        }}>{label}</button>
      ))}
      <div style={{ position: 'absolute', bottom: 18, left: 14, right: 14 }}>
        <div style={{ fontSize: 12, color: '#94a3b8', padding: '0 8px 8px' }}>{user.name}<br />{user.email}</div>
        <button onClick={onLogout} style={{ width: '100%', border: '1px solid #334155', background: 'transparent', color: '#cbd5e1', borderRadius: 8, padding: '8px', cursor: 'pointer' }}>Sign out</button>
      </div>
    </aside>
    <main style={{ flex: 1, padding: 28, maxWidth: 1200 }}>
      {nav === 'overview' && <Overview onOpen={open} />}
      {nav === 'schools' && <Schools onOpen={open} toast={showToast} />}
      {nav === 'school' && schoolId && <SchoolDetail id={schoolId} onBack={() => { setNav('schools'); setSchoolId(null) }} toast={showToast} />}
      {nav === 'audit' && <Audit />}
    </main>
    {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: toast.error ? C.red : C.navy, color: '#fff', padding: '12px 18px', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,.25)', zIndex: 60, maxWidth: 360 }}>{toast.message}</div>}
  </div>
}

/* ── Root ─────────────────────────────────────────────────────────────────── */
export default function App() {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!token.get()) { setReady(true); return }
    api.me().then((r) => setUser(r.data.user)).catch(() => token.clear()).finally(() => setReady(true))
  }, [])
  const logout = async () => { try { await api.logout() } catch { /* ignore */ } token.clear(); setUser(null) }

  if (!ready) return <Spinner label="" />
  if (!user) return <Login onAuthed={setUser} />
  return <Shell user={user} onLogout={logout} />
}
