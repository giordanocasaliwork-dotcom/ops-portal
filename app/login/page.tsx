'use client'

import { useState } from 'react'
import { createClient } from '../../utils/supabase/client'

export default function LoginPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) throw authError

      // Registrazione Audit Log (Successo)
      await supabase.from('audit_logs').insert([
        { user_email: email, action: 'LOGIN', status: 'SUCCESS' }
      ])

      window.location.href = '/dashboard'

    } catch (err: any) {
      setError(err.message || 'Credenziali non valide o accesso non autorizzato.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col justify-center items-center p-6 font-mono">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-lg p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-bold tracking-widest uppercase text-neutral-200">Ops Portal</h1>
          <p className="text-xs text-neutral-500 mt-1">Secure Restricted Access • GDPR Compliant</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-950/50 border border-red-800 text-red-300 text-xs rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs uppercase text-neutral-400 mb-1">Identificativo Operatore (Email)</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-sm text-neutral-200 focus:outline-none focus:border-neutral-600 font-mono"
              placeholder="operator@domain.com"
            />
          </div>

          <div>
            <label className="block text-xs uppercase text-neutral-400 mb-1">Chiave di Accesso (Password)</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-sm text-neutral-200 focus:outline-none focus:border-neutral-600 font-mono"
              placeholder="••••••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-neutral-200 hover:bg-white text-neutral-950 font-mono text-xs uppercase tracking-wider py-2.5 rounded transition font-semibold disabled:opacity-50"
          >
            {loading ? 'Verifica in corso...' : 'Autenticazione'}
          </button>
        </form>

        <div className="mt-8 text-center border-t border-neutral-800/60 pt-4">
          <span className="text-[10px] uppercase text-neutral-600">Accesso riservato esclusivamente al personale autorizzato.</span>
        </div>
      </div>
    </div>
  )
}
