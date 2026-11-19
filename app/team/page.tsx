 'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../utils/supabase/client'

interface TeamProfile {
  id: string
  email: string
  full_name: string | null
  callsign: string | null
  role: string
  is_active: boolean
  created_at?: string
}

export default function TeamPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminId, setAdminId] = useState('')
  const [members, setMembers] = useState<TeamProfile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [callsignDrafts, setCallsignDrafts] = useState<{ [id: string]: string }>({})
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadMembers = useCallback(async () => {
    const { data, error: listErr } = await supabase
      .from('profiles')
      .select('id, email, full_name, callsign, role, is_active, created_at')
      .order('is_active', { ascending: true })
      .order('email', { ascending: true })

    if (listErr) {
      setError('Errore caricamento elenco personale.')
      return
    }

    if (data) {
      setMembers(data)
      const drafts: { [id: string]: string } = {}
      data.forEach((m) => {
        drafts[m.id] = m.callsign || ''
      })
      setCallsignDrafts(drafts)
    }
  }, [supabase])

  useEffect(() => {
    const initTeam = async () => {
      const { data: { user }, error: authErr } = await supabase.auth.getUser()
      if (authErr || !user) {
        router.replace('/login')
        return
      }

      const { data: myProfile } = await supabase
        .from('profiles')
        .select('role, is_active')
        .eq('id', user.id)
        .single()

      if (!myProfile || !myProfile.is_active || String(myProfile.role).toLowerCase() !== 'admin') {
        router.replace('/dashboard')
        return
      }

      setAdminEmail(user.email || '')
      setAdminId(user.id)
      await loadMembers()
      setLoading(false)
    }

    initTeam()
  }, [supabase, router, loadMembers])

  useEffect(() => {
    if (!deleteConfirmId) return
    const timer = setTimeout(() => {
      setDeleteConfirmId(null)
    }, 5000)
    return () => clearTimeout(timer)
  }, [deleteConfirmId])

  const handleToggleActive = async (member: TeamProfile) => {
    if (member.id === adminId) {
      setError('Non puoi disattivare il tuo stesso account amministratore.')
      return
    }

    setError(null)
    const nextState = !member.is_active

    const { error: updErr } = await supabase
      .from('profiles')
      .update({ is_active: nextState })
      .eq('id', member.id)

    if (updErr) {
      setError('Impossibile aggiornare lo stato di abilitazione.')
      return
    }

    await supabase.from('audit_logs').insert([
      {
        user_email: adminEmail,
        action: `TEAM_ACCESS_${nextState ? 'APPROVED' : 'SUSPENDED'}: ${member.email}`,
        status: 'SUCCESS',
      },
    ])

    await loadMembers()
  }

  const handleRoleChange = async (member: TeamProfile, newRole: string) => {
    if (member.id === adminId) {
      setError('Non puoi modificare il ruolo del tuo stesso account.')
      return
    }

    setError(null)

    const { error: updErr } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', member.id)

    if (updErr) {
      setError('Impossibile aggiornare il ruolo utente.')
      return
    }

    await supabase.from('audit_logs').insert([
      {
        user_email: adminEmail,
        action: `TEAM_ROLE_UPDATE: ${member.email} -> ${newRole.toUpperCase()}`,
        status: 'SUCCESS',
      },
    ])

    await loadMembers()
  }

  const handleSaveCallsign = async (member: TeamProfile) => {
    setError(null)
    const cleanCallsign = (callsignDrafts[member.id] || '').trim().toUpperCase() || null

    const { error: updErr } = await supabase
      .from('profiles')
      .update({ callsign: cleanCallsign })
      .eq('id', member.id)

    if (updErr) {
      setError('Errore salvataggio callsign.')
      return
    }

    await supabase.from('audit_logs').insert([
      {
        user_email: adminEmail,
        action: `TEAM_CALLSIGN_UPDATE: ${member.email} -> ${cleanCallsign || 'NESSUNO'}`,
        status: 'SUCCESS',
      },
    ])

    await loadMembers()
  }

  const handleDeleteUser = async (member: TeamProfile) => {
    if (member.id === adminId) {
      setError('Non puoi eliminare il tuo stesso account amministratore.')
      return
    }

    if (deleteConfirmId !== member.id) {
      setDeleteConfirmId(member.id)
      return
    }

    setDeleteConfirmId(null)
    setDeletingId(member.id)
    setError(null)

    try {
      const { error: rpcErr } = await supabase.rpc('delete_portal_user', {
        target_user_id: member.id,
      })

      if (rpcErr) throw rpcErr

      await supabase.from('audit_logs').insert([
        {
          user_email: adminEmail,
          action: `TEAM_USER_DELETED: ${member.email}`,
          status: 'SUCCESS',
        },
      ])

      await loadMembers()
    } catch (err: any) {
      setError(err.message || 'Impossibile eliminare definitivamente il profilo.')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-400 p-8 font-mono text-xs">
        Verifica clearance amministratore...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6 md:p-8 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-4">
            <div>
              <h1 className="text-lg font-bold uppercase tracking-widest text-neutral-100">
                Gestione Team, Clearance &amp; Ruoli
              </h1>
              <p className="text-xs text-neutral-400 mt-1">
                Approvazione registrazioni, assegnazione Callsign, ruoli e rimozione profili
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="bg-neutral-950 hover:bg-neutral-800 text-neutral-200 border border-neutral-700 text-xs uppercase tracking-wider px-4 py-2 rounded transition"
            >
              &larr; Torna alla Dashboard
            </button>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-950/60 border border-red-800 text-red-300 text-xs rounded">
              {error}
            </div>
          )}

          <div className="mt-5 space-y-3">
            {members.map((member) => {
              const isMe = member.id === adminId
              const roleLower = String(member.role || 'operator').toLowerCase()
              const isConfirmingDelete = deleteConfirmId === member.id
              const isDeleting = deletingId === member.id

              return (
                <div
                  key={member.id}
                  className={
                    'bg-neutral-950 border rounded-lg p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 text-xs ' +
                    (!member.is_active ? 'border-amber-700/80' : 'border-neutral-800')
                  }
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={
                          'px-2 py-0.5 rounded border text-[10px] font-bold uppercase ' +
                          (member.is_active
                            ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700'
                            : 'bg-amber-950/80 text-amber-300 border-amber-700')
                        }
                      >
                        {member.is_active ? 'ATTIVO' : 'IN ATTESA APPROVAZIONE'}
                      </span>

                      <span
                        className={
                          'px-2 py-0.5 rounded border text-[10px] font-bold uppercase ' +
                          (roleLower === 'admin'
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                            : roleLower === 'executive'
                            ? 'bg-amber-950 text-amber-300 border-amber-700'
                            : 'bg-neutral-900 text-neutral-300 border-neutral-700')
                        }
                      >
                        {roleLower === 'executive' ? 'EXECUTIVE • DIREZIONE' : roleLower}
                      </span>

                      <span className="text-sm font-bold text-neutral-100">
                        {member.full_name || member.email}
                      </span>
                    </div>

                    <div className="text-neutral-400">
                      Email: <span className="text-neutral-200">{member.email}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 self-start lg:self-center">
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={callsignDrafts[member.id] ?? ''}
                        onChange={(e) =>
                          setCallsignDrafts((prev) => ({
                            ...prev,
                            [member.id]: e.target.value.toUpperCase(),
                          }))
                        }
                        placeholder="Callsign"
                        className="w-24 bg-neutral-900 border border-neutral-800 rounded px-2 py-1.5 text-xs text-neutral-200 uppercase"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveCallsign(member)}
                        className="bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-700 text-[11px] uppercase px-2 py-1.5 rounded"
                      >
                        Salva
                      </button>
                    </div>

                    <select
                      aria-label="Ruolo utente"
                      disabled={isMe}
                      value={roleLower}
                      onChange={(e) => handleRoleChange(member, e.target.value)}
                      className="bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs rounded px-2.5 py-1.5 disabled:opacity-50"
                    >
                      <option value="operator">Operator (Campo)</option>
                      <option value="executive">Executive (Direzione)</option>
                      <option value="admin">Admin (Regia Completa)</option>
                    </select>

                    {!isMe && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(member)}
                          className={
                            'text-xs uppercase font-bold px-3 py-1.5 rounded border transition ' +
                            (member.is_active
                              ? 'bg-neutral-900 hover:bg-amber-950/70 text-amber-300 border-amber-800/80'
                              : 'bg-emerald-500 hover:bg-emerald-400 text-neutral-950 border-emerald-400')
                          }
                        >
                          {member.is_active ? 'Sospendi' : 'Approva Accesso'}
                        </button>

                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => handleDeleteUser(member)}
                          title="Doppio clic rapido per eliminare definitivamente il profilo"
                          className={
                            'text-xs uppercase font-bold px-3 py-1.5 rounded border transition ' +
                            (isConfirmingDelete
                              ? 'bg-red-600 hover:bg-red-500 text-white border-red-400 animate-pulse'
                              : 'bg-neutral-900 hover:bg-red-950/70 text-red-400 border-red-900/80') +
                            ' disabled:opacity-50'
                          }
                        >
                          {isDeleting
                            ? 'Eliminazione...'
                            : isConfirmingDelete
                            ? 'Conferma Elimina?'
                            : 'Elimina'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
