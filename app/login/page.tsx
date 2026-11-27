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
  const [showPassword, setShowPassword] = useState(false)
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
          { user_email: email, action: 'LOGIN_BLOCKED (PENDING_APPROVAL)', status: 'DENIED' },
        ])
        await supabase.auth.signOut()
        setError("Account in attesa di autorizzazione. Contatta il Comando per l'attivazione.")
        return
      }

      await supabase.from('audit_logs').insert([
        { user_email: email, action: 'LOGIN', status: 'SUCCESS' },
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
          { user_email: email, action: 'ACCESS_REQUEST_SUBMITTED', status: 'PENDING' },
        ])
        await supabase.auth.signOut()
      }

      setFullName('')
      setPassword('')
      setMode('login')
      setNotice(
        "Richiesta registrata. L'accesso restera bloccato fino all'approvazione dell'amministratore."
      )
    } catch (err: any) {
      setError(err.message || 'Impossibile completare la richiesta di registrazione.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col justify-center items-center p-4 sm:p-6 font-sans antialiased">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 border-t-2 border-t-amber-500 rounded-xl p-5 sm:p-8 shadow-2xl">
        <div className="mb-6 text-center space-y-2">
          <span className="inline-block px-2.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/40 text-xs font-bold uppercase tracking-wider">
            Area Riservata
          </span>
          <h1 className="text-xl sm:text-2xl font-bold tracking-wide uppercase text-white">
            Ops Portal
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400">
            Secure Restricted Access &bull; GDPR Compliant
          </p>
        </div>

        <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-neutral-950 border border-neutral-800 rounded-xl mb-6">
          <button
            type="button"
            onClick={() => {
              setMode('login')
              setError(null)
            }}
            className={`min-h-[40px] py-2 text-xs sm:text-sm uppercase tracking-wider rounded-lg transition font-bold ${
              mode === 'login'
                ? 'bg-amber-400 text-neutral-950'
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
            className={`min-h-[40px] py-2 text-xs sm:text-sm uppercase tracking-wider rounded-lg transition font-bold ${
              mode === 'register'
                ? 'bg-amber-400 text-neutral-950'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Richiedi Accesso
          </button>
        </div>

        {error && (
          <div className="mb-5 p-3.5 bg-red-950/60 border border-red-800 text-red-200 text-sm rounded-xl leading-relaxed">
            {error}
          </div>
        )}

        {notice && (
          <div className="mb-5 p-3.5 bg-emerald-950/60 border border-emerald-800 text-emerald-200 text-sm rounded-xl leading-relaxed">
            {notice}
          </div>
        )}

        <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-xs uppercase tracking-wider text-neutral-300 mb-1.5 font-semibold">
                Nome e Cognome / Nominativo *
              </label>
              <input
                type="text"
                required
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-700 focus:border-amber-400 focus:outline-none rounded-lg p-3 text-base sm:text-sm text-white placeholder-neutral-500"
                placeholder="Mario Rossi"
              />
            </div>
          )}

          <div>
            <label className="block text-xs uppercase tracking-wider text-neutral-300 mb-1.5 font-semibold">
              Identificativo Operatore (Email) *
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-700 focus:border-amber-400 focus:outline-none rounded-lg p-3 text-base sm:text-sm text-white placeholder-neutral-500"
              placeholder="operator@domain.com"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-neutral-300 mb-1.5 font-semibold">
              Chiave di Accesso (Password) *
            </label>
            <div className="relative flex items-center">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-700 focus:border-amber-400 focus:outline-none rounded-lg p-3 pr-20 text-base sm:text-sm text-white placeholder-neutral-500"
                placeholder="Minimo 8 caratteri"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 px-2.5 py-1.5 text-xs font-semibold uppercase text-neutral-400 hover:text-amber-300 rounded transition"
              >
                {showPassword ? 'Nascondi' : 'Mostra'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[46px] mt-2 bg-amber-400 hover:bg-amber-300 text-neutral-950 text-sm uppercase tracking-wider py-3 rounded-xl transition font-bold shadow-lg disabled:opacity-50"
          >
            {loading
              ? 'Elaborazione...'
              : mode === 'login'
              ? 'Autenticazione'
              : 'Invia Richiesta di Abilitazione'}
          </button>
        </form>

        <div className="mt-7 text-center border-t border-neutral-800 pt-4">
          <span className="text-xs uppercase tracking-wide text-neutral-400">
            Accesso riservato esclusivamente al personale autorizzato.
          </span>
        </div>
      </div>
    </div>
  )
}
