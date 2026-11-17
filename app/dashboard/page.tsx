import { createClient } from '../../utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'admin'

  const { data: logs } = isAdmin
    ? await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10)
    : { data: null }

  async function signOut() {
    'use server'
    const supabaseServer = createClient()
    await supabaseServer.auth.signOut()
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6 md:p-8 font-mono">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-4">
            <div>
              <h1 className="text-xl font-bold tracking-widest uppercase text-neutral-100">Ops Portal • Dashboard</h1>
              <p className="text-xs text-neutral-400 mt-1">Area Operativa Riservata • Connessione Sicura</p>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="bg-neutral-950 hover:bg-red-950/60 text-neutral-300 hover:text-red-300 border border-neutral-700 hover:border-red-800 text-xs uppercase tracking-wider px-4 py-2 rounded transition"
              >
                Disconnetti
              </button>
            </form>
          </div>

          <div className="pt-4 space-y-2 text-sm">
            <p><span className="text-neutral-500">UID Operatore:</span> {user.id}</p>
            <p><span className="text-neutral-500">Email:</span> {user.email}</p>
            <p>
              <span className="text-neutral-500">Ruolo:</span>{' '}
              <span className="uppercase text-emerald-400 font-bold">{profile?.role || 'operator'}</span>
            </p>
          </div>
        </div>

        {isAdmin && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 shadow-xl">
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-200 mb-4">
              Audit Log • Ultimi Accessi
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
                    logs.map((log: any, idx: number) => (
                      <tr key={log.id || idx}>
                        <td className="py-2 pr-4 text-neutral-400">
                          {log.created_at ? new Date(log.created_at).toLocaleString('it-IT') : '-'}
                        </td>
                        <td className="py-2 pr-4 text-neutral-200">{log.user_email}</td>
                        <td className="py-2 pr-4 text-neutral-300">{log.action}</td>
                        <td className="py-2 text-emerald-400 font-semibold">{log.status}</td>
                      </tr>
                    ))
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
