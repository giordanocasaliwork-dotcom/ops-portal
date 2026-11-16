import { createClient } from '@/utils/supabase/server'
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

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-8 font-mono">
      <div className="max-w-4xl mx-auto bg-neutral-900 border border-neutral-800 rounded-lg p-6">
        <h1 className="text-xl font-bold tracking-widest uppercase mb-2">Ops Portal • Dashboard</h1>
        <p className="text-xs text-neutral-400 mb-6">Area Operativa Riservata • Connessione Sicura</p>
        
        <div className="border-t border-neutral-800 pt-4 space-y-2 text-sm">
          <p><span className="text-neutral-500">UID Operatore:</span> {user.id}</p>
          <p><span className="text-neutral-500">Email:</span> {user.email}</p>
          <p><span className="text-neutral-500">Ruolo:</span> <span className="uppercase text-emerald-400 font-bold">{profile?.role || 'operator'}</span></p>
        </div>
      </div>
    </div>
  )
}
