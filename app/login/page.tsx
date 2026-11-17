 'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../utils/supabase/client'

export default function LoginPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setNotice(null)

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) throw authError

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_active')
        .eq('id', authData.user.id)
        .single()

      if (!profile || !profile.is_active) {
        await supabase.from('audit_logs').insert([
          { user_email: email, action: 'LOGIN_BLOCKED (PENDING_APPROVAL)', status: 'DENIED' }
        ])
        await supabase.auth.signOut()
        setError('Account in attesa di autorizzazione. Contatta il Comando per l\'attivazione.')
        return
      }

      await supabase.from('audit_logs').insert([
        { user_email: email, action: 'LOGIN', status: 'SUCCESS' }
      ])

      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Credenziali non valide o accesso non autorizzato.')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setNotice(null)

    try {
      if (password.length < 8) {
        throw new Error('La chiave di accesso deve contenere almeno 8 caratteri.')
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
        },
      })

      if (signUpError) throw signUpError

      if (data.session) {
        await supabase.from('audit_logs').insert([
          { user_email: email, action: 'ACCESS_REQUEST_SUBMITTED', status: 'PENDING' }
        ])
        await supabase.auth.signOut()
      }

      setFullName('')
      setPassword('')
      setMode('login')
      setNotice('Richiesta registrata. L\'accesso restera bloccato fino all\'approvazione dell\'amministratore.')
    } catch (err: any) {
      setError(err.message || 'Impossibile completare la richiesta di registrazione.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col justify-center items-center p-6 font-mono">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-lg p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold tracking-widest uppercase text-neutral-200">Ops Portal</h1>
          <p className="text-xs text-neutral-500 mt-1">Secure Restricted Access • GDPR Compliant</p>
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 bg-neutral-950 border border-neutral-800 rounded mb-6">
          <button
            type="button"
            onClick={() => {
              setMode('login')
              setError(null)
            }}
            className={`py-1.5 text-xs uppercase tracking-wider rounded transition font-semibold ${
              mode === 'login'
                ? 'bg-neutral-200 text-neutral-950'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Accesso
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register')
              setError(null)
              setNotice(null)
            }}
            className={`py-1.5 text-xs uppercase tracking-wider rounded transition font-semibold ${
              mode === 'register'
                ? 'bg-neutral-200 text-neutral-950'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Richiedi Accesso
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-950/50 border border-red-800 text-red-300 text-xs rounded">
            {error}
          </div>
        )}

        {notice && (
          <div className="mb-4 p-3 bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-xs rounded">
            {notice}
          </div>
        )}

        <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-xs uppercase text-neutral-400 mb-1">
                Nome e Cognome / Nominativo *
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-sm text-neutral-200 focus:outline-none focus:border-neutral-600 font-mono"
                placeholder="Mario Rossi"
              />
            </div>
          )}

          <div>
            <label className="block text-xs uppercase text-neutral-400 mb-1">
              Identificativo Operatore (Email) *
            </label>
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
            <label className="block text-xs uppercase text-neutral-400 mb-1">
              Chiave di Accesso (Password) *
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-sm text-neutral-200 focus:outline-none focus:border-neutral-600 font-mono"
              placeholder="Minimo 8 caratteri"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-neutral-200 hover:bg-white text-neutral-950 font-mono text-xs uppercase tracking-wider py-2.5 rounded transition font-semibold disabled:opacity-50"
          >
            {loading
              ? 'Elaborazione...'
              : mode === 'login'
              ? 'Autenticazione'
              : 'Invia Richiesta di Abilitazione'}
          </button>
        </form>

        <div className="mt-8 text-center border-t border-neutral-800/60 pt-4">
          <span className="text-[10px] uppercase text-neutral-600">
            Accesso riservato esclusivamente al personale autorizzato.
          </span>
        </div>
      </div>
    </div>
  )
}
