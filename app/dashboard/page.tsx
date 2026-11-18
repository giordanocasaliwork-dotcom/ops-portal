 'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../utils/supabase/client'
import MissionBoard, { Mission } from '../../components/MissionBoard'

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [role, setRole] = useState<string>('operator')
  const [missions, setMissions] = useState<Mission[]>([])
  const [logs, setLogs] = useState<any[]>([])

  useEffect(() => {
    const loadDashboard = async () => {
      const { data: { user: currentUser }, error } = await supabase.auth.getUser()

      if (error || !currentUser) {
        router.replace('/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, full_name, is_active')
        .eq('id', currentUser.id)
        .single()

      if (!profile || !profile.is_active) {
        await supabase.auth.signOut()
        router.replace('/login')
        return
      }

      setUser(currentUser)

      const userRole = String(profile.role || 'operator').trim()
      setRole(userRole)
      const adminFlag = userRole.toLowerCase() === 'admin'

      const { data: missionsData } = await supabase
        .from('missions')
        .select('*')
        .order('start_time', { ascending: true })

      setMissions((missionsData as Mission[]) || [])

      if (adminFlag) {
        const { data: logsData } = await supabase
          .from('audit_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10)

        setLogs(logsData || [])
      }

      setLoading(false)
    }

    loadDashboard()
  }, [supabase, router])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-400 p-8 font-mono text-xs">
        Verifica clearance e caricamento area operativa...
      </div>
    )
  }

  const isAdmin = role.toLowerCase() === 'admin'

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6 md:p-8 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-4">
            <div>
              <h1 className="text-xl font-bold tracking-widest uppercase text-neutral-100">Ops Portal • Dashboard</h1>
              <p className="text-xs text-neutral-400 mt-1">Area Operativa Riservata • Connessione Sicura</p>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <button
                  onClick={() => router.push('/team')}
                  className="bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-700 text-xs uppercase tracking-wider px-4 py-2 rounded transition font-semibold"
                >
                  Gestione Team
                </button>
              )}
              <button
                onClick={handleSignOut}
                className="bg-neutral-950 hover:bg-red-950/60 text-neutral-300 hover:text-red-300 border border-neutral-700 hover:border-red-800 text-xs uppercase tracking-wider px-4 py-2 rounded transition"
              >
                Disconnetti
              </button>
            </div>
          </div>

          <div className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <p><span className="text-neutral-500">UID:</span> {user.id}</p>
            <p><span className="text-neutral-500">Operatore:</span> {user.email}</p>
            <p>
              <span className="text-neutral-500">Ruolo:</span>{' '}
              <span className="uppercase text-emerald-400 font-bold">{role}</span>
            </p>
          </div>
        </div>

        <MissionBoard
          initialMissions={missions}
          isAdmin={isAdmin}
          userEmail={user.email || ''}
          userId={user.id}
        />

        {isAdmin && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 shadow-xl">
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-200 mb-4">
              Audit Log • Ultimi Accessi e Azioni
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-neutral-800 text-neutral-500 uppercase">
                  <tr>
                    <th className="py-2 pr-4">Data / Ora</th>
                    <th className="py-2 pr-4">Operatore</th>
                    <th className="py-2 pr-4">Azione</th>
                    <th className="py-2">Stato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {logs && logs.length > 0 ? (
                    logs.map((log: any, idx: number) => {
                      const gpsMatch = String(log.action || '').match(/@\s*(-?\d+\.\d+),\s*(-?\d+\.\d+)/)

                      return (
                        <tr key={log.id || idx}>
                          <td className="py-2 pr-4 text-neutral-400">
                            {log.created_at ? new Date(log.created_at).toLocaleString('it-IT') : '-'}
                          </td>
                          <td className="py-2 pr-4 text-neutral-200">{log.user_email}</td>
                          <td className="py-2 pr-4 text-neutral-300">
                            <span>{log.action}</span>
                            {gpsMatch && (
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${gpsMatch[1]},${gpsMatch[2]}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-2 inline-block text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-sky-950/70 hover:bg-sky-900 text-sky-300 border border-sky-700 transition"
                              >
                                Maps ↗
                              </a>
                            )}
                          </td>
                          <td
                            className={`py-2 font-semibold ${
                              log.status === 'DENIED'
                                ? 'text-red-400'
                                : log.status === 'PENDING'
                                ? 'text-amber-400'
                                : log.status === 'CHECK-IN'
                                ? 'text-sky-400'
                                : 'text-emerald-400'
                            }`}
                          >
                            {log.status}
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-4 text-neutral-500">
                        Nessun evento registrato.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
