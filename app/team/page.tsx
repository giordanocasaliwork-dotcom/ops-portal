'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../utils/supabase/client'

type Profile = {
  id: string
  email: string
  full_name: string | null
  role: 'admin' | 'operator'
  is_active: boolean
  created_at: string
}

export default function TeamManagementPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [profiles, setProfiles] = useState<Profile[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const fetchProfiles = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data) {
      setProfiles(data as Profile[])
    }
  }, [supabase])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      setCurrentUserId(user.id)
      setCurrentUserEmail(user.email ?? 'unknown')

      const { data: myProfile } = await supabase
        .from('profiles')
        .select('role, is_active')
        .eq('id', user.id)
        .single()

      const isAdmin = String(myProfile?.role || '').trim().toLowerCase() === 'admin'

      if (!myProfile || !isAdmin || !myProfile.is_active) {
        router.replace('/dashboard')
        return
      }

      await fetchProfiles()
      setLoading(false)
    }

    init()
  }, [supabase, router, fetchProfiles])

  const handleUpdateUser = async (
    target: Profile,
    updates: Partial<Pick<Profile, 'role' | 'is_active'>>
  ) => {
    if (target.id === currentUserId) return
    setUpdatingId(target.id)

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', target.id)

    if (!error) {
      await supabase.from('audit_logs').insert({
        user_email: currentUserEmail,
        action: `TEAM_UPDATE: ${target.email} -> ${JSON.stringify(updates)}`,
        status: 'SUCCESS',
      })
      await fetchProfiles()
    } else {
      alert(`Errore aggiornamento permessi: ${error.message}`)
    }

    setUpdatingId(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-400 p-8 font-mono text-xs">
        Verifica clearance amministrativa in corso...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6 md:p-8 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-widest uppercase text-neutral-100">
              Ops Portal • Gestione Team & Permessi
            </h1>
            <p className="text-xs text-neutral-400 mt-1">
              Abilitazione operatori, assegnazione ruoli RBAC e controllo accessi
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs px-3 py-1.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800">
              Account censiti: {profiles.length}
            </span>
            <button
              onClick={() => router.push('/dashboard')}
              className="text-xs uppercase tracking-wider px-4 py-2 rounded bg-neutral-950 hover:bg-neutral-800 text-neutral-200 border border-neutral-700 transition"
            >
              ← Dashboard
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900 shadow-xl">
          <table className="w-full text-left text-xs text-neutral-300">
            <thead className="bg-neutral-950 uppercase text-neutral-500 border-b border-neutral-800">
              <tr>
                <th className="px-4 py-3">Operatore</th>
                <th className="px-4 py-3">Ruolo</th>
                <th className="px-4 py-3">Stato Accesso</th>
                <th className="px-4 py-3 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {profiles.map((member) => {
                const isSelf = member.id === currentUserId
                const isBusy = updatingId === member.id

                return (
                  <tr key={member.id} className="hover:bg-neutral-800/40">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-neutral-100">
                        {member.full_name || 'Operatore senza nome'}
                        {isSelf && (
                          <span className="ml-2 text-[10px] px-2 py-0.5 rounded bg-neutral-800 text-neutral-300">
                            TU
                          </span>
                        )}
                      </div>
                      <div className="text-neutral-400 mt-0.5">{member.email}</div>
                    </td>

                    <td className="px-4 py-3">
                      <select
                        disabled={isSelf || isBusy}
                        value={member.role}
                        onChange={(e) =>
                          handleUpdateUser(member, {
                            role: e.target.value as 'admin' | 'operator',
                          })
                        }
                        className="bg-neutral-950 border border-neutral-700 rounded px-2.5 py-1 text-xs text-neutral-100 disabled:opacity-50"
                      >
                        <option value="operator">OPERATOR</option>
                        <option value="admin">ADMIN</option>
                      </select>
                    </td>

                    <td className="px-4 py-3">
                      {member.is_active ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-950/70 text-emerald-400 border border-emerald-800">
                          ATTIVO
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-semibold bg-amber-950/70 text-amber-400 border border-amber-800">
                          IN ATTESA
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right">
                      {!isSelf && (
                        <button
                          disabled={isBusy}
                          onClick={() =>
                            handleUpdateUser(member, { is_active: !member.is_active })
                          }
                          className={`px-3 py-1.5 rounded text-xs uppercase tracking-wider font-semibold transition ${
                            member.is_active
                              ? 'bg-red-950/70 text-red-400 border border-red-800 hover:bg-red-900/50'
                              : 'bg-emerald-600 text-neutral-950 hover:bg-emerald-500'
                          } disabled:opacity-50`}
                        >
                          {member.is_active ? 'Revoca Accesso' : 'Approva & Attiva'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
