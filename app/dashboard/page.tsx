 'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../utils/supabase/client'
import AdminWeatherHazardPanel from '../../components/AdminWeatherHazardPanel'
import MissionBoard, { Mission } from '../../components/MissionBoard'
import ExecutiveAppointments, {
  ExecutiveAppointment,
} from '../../components/ExecutiveAppointments'
import ExecutiveHub from '../../components/ExecutiveHub'
import OperationsControl from '../../components/OperationsControl'
import SopChecklists from '../../components/SopChecklists'
import BackupManager from '../../components/BackupManager'

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [role, setRole] = useState<string>('operator')
  const [callsign, setCallsign] = useState<string | null>(null)
  const [missions, setMissions] = useState<Mission[]>([])
  const [todayAppointments, setTodayAppointments] = useState<ExecutiveAppointment[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [dismissedSosId, setDismissedSosId] = useState<string | null>(null)
  const [archivingSos, setArchivingSos] = useState(false)

  const [showTodayFocus, setShowTodayFocus] = useState(false)
  const [todayEventsCount, setTodayEventsCount] = useState<number>(0)
  const [urgentTasksCount, setUrgentTasksCount] = useState<number>(0)
  const [pendingExpensesSum, setPendingExpensesSum] = useState<number>(0)
  const [pendingUsersCount, setPendingUsersCount] = useState<number>(0)

  const [globalSosConfirm, setGlobalSosConfirm] = useState(false)
  const [sendingGlobalSos, setSendingGlobalSos] = useState(false)
  const [globalSosError, setGlobalSosError] = useState<string | null>(null)
  const [globalSosSent, setGlobalSosSent] = useState<{
    time: string
    coords: string | null
    accuracy: number | null
  } | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedDismissed = window.localStorage.getItem('ops_dismissed_sos_id')
      if (savedDismissed) setDismissedSosId(savedDismissed)
    }
  }, [])

  const extractGpsCoords = (actionText: string): string | null => {
    const atIdx = actionText.indexOf('@ ')
    if (atIdx === -1) return null
    const afterAt = actionText.slice(atIdx + 2)
    const endIdx = afterAt.indexOf(' (')
    const coords = endIdx === -1 ? afterAt.trim() : afterAt.slice(0, endIdx).trim()
    return coords.includes(',') ? coords : null
  }

  const refreshKpiSummary = useCallback(
    async (adminFlag: boolean, currentMissions: Mission[]) => {
      if (!adminFlag) return

      const todayKey = new Date().toDateString()
      const todayMissionsList = currentMissions.filter(
        (m) => new Date(m.start_time).toDateString() === todayKey && m.status !== 'chiusa'
      )

      const [apptsRes, tasksRes, expRes, inactiveRes] = await Promise.all([
        supabase
          .from('executive_appointments')
          .select('*')
          .order('start_time', { ascending: true }),
        supabase.from('action_items').select('priority, status, due_date'),
        supabase.from('expense_logs').select('amount, reimbursement_status'),
        supabase.from('profiles').select('id').eq('is_active', false),
      ])

      const todayApptsList = ((apptsRes.data as ExecutiveAppointment[]) || []).filter(
        (a) => new Date(a.start_time).toDateString() === todayKey && a.status !== 'COMPLETATO'
      )

      setTodayAppointments(todayApptsList)
      setTodayEventsCount(todayMissionsList.length + todayApptsList.length)

      const urgentCount = (tasksRes.data || []).filter((t: any) => {
        if (t.status === 'COMPLETATO') return false
        if (t.priority === 'ALTA') return true
        if (t.due_date && new Date(t.due_date).getTime() < Date.now()) return true
        return false
      }).length
      setUrgentTasksCount(urgentCount)

      const pendingSum = (expRes.data || [])
        .filter((e: any) => e.reimbursement_status === 'DA RENDICONTARE')
        .reduce((acc: number, e: any) => acc + Number(e.amount || 0), 0)
      setPendingExpensesSum(pendingSum)

      setPendingUsersCount((inactiveRes.data || []).length)
    },
    [supabase]
  )

  const refreshAuditLogs = useCallback(async () => {
    const { data: logsData } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(15)

    if (logsData) setLogs(logsData)
  }, [supabase])

  useEffect(() => {
    const loadDashboard = async () => {
      const {
        data: { user: currentUser },
        error,
      } = await supabase.auth.getUser()

      if (error || !currentUser) {
        router.replace('/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, full_name, callsign, is_active')
        .eq('id', currentUser.id)
        .single()

      if (!profile || !profile.is_active) {
        await supabase.auth.signOut()
        router.replace('/login')
        return
      }

      setUser(currentUser)
      setCallsign(profile.callsign || null)

      const userRole = String(profile.role || 'operator').trim()
      setRole(userRole)
      const normalizedRole = userRole.toLowerCase()
      const adminFlag = normalizedRole === 'admin'
      const execFlag = normalizedRole === 'executive'

      let loadedMissions: Mission[] = []
      if (!execFlag) {
        const { data: missionsData } = await supabase
          .from('missions')
          .select('*')
          .order('start_time', { ascending: true })

        loadedMissions = (missionsData as Mission[]) || []
        setMissions(loadedMissions)
      }

      if (adminFlag) {
        await Promise.all([refreshKpiSummary(true, loadedMissions), refreshAuditLogs()])
      }

      setLoading(false)
    }

    loadDashboard()
  }, [supabase, router, refreshAuditLogs, refreshKpiSummary])

  useEffect(() => {
    if (role.toLowerCase() !== 'admin') return
    const interval = setInterval(() => {
      refreshAuditLogs()
      refreshKpiSummary(true, missions)
    }, 15000)
    return () => clearInterval(interval)
  }, [role, missions, refreshAuditLogs, refreshKpiSummary])

  useEffect(() => {
    if (!globalSosConfirm) return
    const timer = setTimeout(() => setGlobalSosConfirm(false), 5000)
    return () => clearTimeout(timer)
  }, [globalSosConfirm])

  const handleControlRoomSync = useCallback(async () => {
    if (role.toLowerCase() !== 'admin') return

    refreshAuditLogs()
    let latestMissions = missions
    const { data: missionsData } = await supabase
      .from('missions')
      .select('*')
      .order('start_time', { ascending: true })
    if (missionsData) {
      latestMissions = missionsData as Mission[]
      setMissions(latestMissions)
    }

    refreshKpiSummary(true, latestMissions)
  }, [role, missions, supabase, refreshAuditLogs, refreshKpiSummary])

  const handleArchiveSosBanner = async (sosLog: any) => {
    const sosKey = String(sosLog.id || sosLog.created_at)
    setDismissedSosId(sosKey)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('ops_dismissed_sos_id', sosKey)
    }

    if (!user) return
    setArchivingSos(true)
    try {
      await supabase.from('audit_logs').insert([
        {
          user_email: user.email || '',
          action: `SOS_ARCHIVIATO_COMANDO: ${String(sosLog.action || '')}`,
          status: 'SOS-ACK',
        },
      ])
      await refreshAuditLogs()
    } finally {
      setArchivingSos(false)
    }
  }

  const handleGlobalSos = () => {
    if (!user) return

    if (!globalSosConfirm) {
      setGlobalSosConfirm(true)
      return
    }

    setGlobalSosConfirm(false)
    setSendingGlobalSos(true)
    setGlobalSosError(null)

    const opTag = callsign
      ? `[${callsign}]`
      : role.toLowerCase() === 'executive'
      ? `[DIREZIONE - ${user.email || 'EXECUTIVE'}]`
      : user.email || 'OPERATORE'
    const adminFlag = role.toLowerCase() === 'admin'

    const dispatchGlobalSos = async (coordsText: string | null, accuracyVal: number | null) => {
      const locationSuffix = coordsText
        ? `@ ${coordsText} (${accuracyVal}m)`
        : '- POSIZIONE GPS NON DISPONIBILE'

      const { error: logErr } = await supabase.from('audit_logs').insert([
        {
          user_email: user.email || '',
          action: `SOS_EMERGENCY ${opTag} (FUORI MISSIONE / ALLERTA GENERALE) ${locationSuffix}`,
          status: 'SOS',
        },
      ])

      if (logErr) {
        setGlobalSosError(
          'Errore trasmissione SOS al server. Contatta immediatamente il Comando via radio o telefono.'
        )
        setSendingGlobalSos(false)
        return
      }

      const nowTime = new Date().toLocaleTimeString('it-IT', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })

      setGlobalSosSent({ time: nowTime, coords: coordsText, accuracy: accuracyVal })
      setSendingGlobalSos(false)

      if (adminFlag) await refreshAuditLogs()
    }

    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      dispatchGlobalSos(null, null)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(6)
        const lng = position.coords.longitude.toFixed(6)
        const accuracy = Math.round(position.coords.accuracy)
        dispatchGlobalSos(`${lat}, ${lng}`, accuracy)
      },
      () => {
        dispatchGlobalSos(null, null)
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 }
    )
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-300 p-6 font-sans text-sm">
        Verifica clearance e caricamento area operativa...
      </div>
    )
  }

  const normalizedRole = role.toLowerCase()
  const isAdmin = normalizedRole === 'admin'
  const isExecutive = normalizedRole === 'executive'
  const canAccessExecutivePanels = isAdmin || isExecutive

  const latestSos = isAdmin ? logs.find((item: any) => item.status === 'SOS') : null

  const isGloballyAcknowledged =
    latestSos &&
    logs.some(
      (item: any) =>
        item.status === 'SOS-ACK' &&
        item.created_at &&
        latestSos.created_at &&
        new Date(item.created_at).getTime() >= new Date(latestSos.created_at).getTime()
    )

  const activeSosBanner =
    latestSos &&
    !isGloballyAcknowledged &&
    String(latestSos.id || latestSos.created_at) !== dismissedSosId
      ? latestSos
      : null

  const activeSosCoords = activeSosBanner
    ? extractGpsCoords(String(activeSosBanner.action || ''))
    : null

  const todayKey = new Date().toDateString()
  const todayActiveMissions = isAdmin
    ? missions.filter(
        (m) => new Date(m.start_time).toDateString() === todayKey && m.status !== 'chiusa'
      )
    : []

  const formatTimeHour = (iso: string) =>
    new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })

  const todayFormattedDate = new Date().toLocaleDateString('it-IT', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  const opsControlProps = {
    userEmail: user.email || '',
    onAuditUpdated: handleControlRoomSync,
  } as Parameters<typeof OperationsControl>[0]

  const sopProps = {
    isAdmin,
    userEmail: user.email || '',
    userId: user.id,
    onAuditUpdated: handleControlRoomSync,
  } as Parameters<typeof SopChecklists>[0]

  const backupProps = {
    isAdmin,
    userEmail: user.email || '',
    onAuditUpdated: handleControlRoomSync,
  } as Parameters<typeof BackupManager>[0]

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-3.5 sm:p-6 md:p-8 font-sans antialiased">
      <div className="max-w-5xl mx-auto space-y-5 sm:space-y-6">
        {isAdmin && activeSosBanner && (
          <div className="bg-red-950/90 border-2 border-red-500 rounded-xl p-4 sm:p-5 shadow-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded bg-red-600 text-white text-xs font-bold uppercase animate-pulse">
                  ALLERTA EMERGENZA SOS
                </span>
                <span className="text-xs sm:text-sm font-mono text-red-200">
                  {activeSosBanner.created_at
                    ? new Date(activeSosBanner.created_at).toLocaleString('it-IT')
                    : ''}
                </span>
              </div>
              <div className="text-sm sm:text-base font-semibold text-white">
                {activeSosBanner.action}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {activeSosCoords && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    activeSosCoords
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[40px] inline-flex items-center bg-white hover:bg-neutral-200 text-red-950 font-bold text-xs sm:text-sm uppercase px-4 py-2 rounded-lg transition"
                >
                  Posizione SOS Maps &nearr;
                </a>
              )}
              <button
                type="button"
                disabled={archivingSos}
                onClick={() => handleArchiveSosBanner(activeSosBanner)}
                className="min-h-[40px] bg-red-900/80 hover:bg-red-800 text-red-100 border border-red-600 text-xs sm:text-sm uppercase px-4 py-2 rounded-lg transition disabled:opacity-50"
              >
                {archivingSos ? 'Archiviazione...' : 'Archivia Allerta'}
              </button>
            </div>
          </div>
        )}

        {/* INTESTAZIONE PRINCIPALE & KPI */}
        <div className="bg-neutral-900 border border-neutral-800 border-t-2 border-t-amber-500 rounded-xl p-4 sm:p-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-4">
            <div>
              <h1 className="text-lg sm:text-2xl font-bold tracking-wide uppercase text-white">
                {isExecutive ? 'Ops Portal • Area Riservata Direzione' : 'Ops Portal • Dashboard'}
              </h1>
              <p className="text-xs sm:text-sm text-neutral-400 mt-1">
                {isExecutive
                  ? 'Agenda Appuntamenti & Rubrica Strategica • Connessione Sicura'
                  : 'Control Room Operativa • Connessione Sicura'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={sendingGlobalSos}
                onClick={handleGlobalSos}
                title="Doppio tocco rapido per inviare un allarme SOS con posizione GPS"
                className={
                  'min-h-[40px] text-xs sm:text-sm uppercase tracking-wider px-4 py-2 rounded-lg transition font-bold border ' +
                  (globalSosConfirm
                    ? 'bg-red-600 hover:bg-red-500 text-white border-red-300 animate-pulse shadow-lg shadow-red-950'
                    : 'bg-red-950/90 hover:bg-red-900 text-red-200 border-red-700') +
                  ' disabled:opacity-50'
                }
              >
                {sendingGlobalSos
                  ? 'INVIO SOS...'
                  : globalSosConfirm
                  ? 'CONFERMA SOS!'
                  : 'SOS EMERGENZA'}
              </button>

              {isAdmin && (
                <button
                  onClick={() => router.push('/team')}
                  className="min-h-[40px] bg-neutral-950 hover:bg-neutral-800 text-amber-300 border border-neutral-700 text-xs sm:text-sm uppercase tracking-wider px-4 py-2 rounded-lg transition font-semibold flex items-center gap-2"
                >
                  <span>Gestione Team</span>
                  {pendingUsersCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-400 text-neutral-950 text-xs font-bold animate-pulse">
                      +{pendingUsersCount}
                    </span>
                  )}
                </button>
              )}
              <button
                onClick={handleSignOut}
                className="min-h-[40px] bg-neutral-950 hover:bg-red-950/60 text-neutral-300 hover:text-red-300 border border-neutral-800 hover:border-red-800 text-xs sm:text-sm uppercase tracking-wider px-4 py-2 rounded-lg transition"
              >
                Disconnetti
              </button>
            </div>
          </div>

          {globalSosError && (
            <div className="mt-4 p-3.5 bg-red-950/70 border border-red-700 text-red-200 text-sm rounded-lg">
              {globalSosError}
            </div>
          )}

          {globalSosSent && (
            <div className="mt-4 p-3.5 bg-red-950/60 border border-red-700 rounded-lg flex flex-wrap items-center justify-between gap-2 text-sm text-red-200">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded bg-red-600 text-white font-bold uppercase text-xs">
                  SOS TRASMESSO ({globalSosSent.time})
                </span>
                <span className="font-mono text-xs sm:text-sm">
                  {globalSosSent.coords
                    ? `Coordinate: ${globalSosSent.coords} (${globalSosSent.accuracy}m)`
                    : 'Posizione GPS non disponibile'}
                </span>
                {globalSosSent.coords && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      globalSosSent.coords
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-red-400 hover:text-white font-semibold"
                  >
                    Vedi su Maps &nearr;
                  </a>
                )}
              </div>
              <button
                type="button"
                onClick={() => setGlobalSosSent(null)}
                className="text-xs uppercase text-red-300 hover:text-white font-semibold"
              >
                Chiudi
              </button>
            </div>
          )}

          <div
            className={
              'grid grid-cols-1 gap-3 sm:gap-4 pt-4 ' +
              (isExecutive ? 'sm:grid-cols-2' : 'sm:grid-cols-3')
            }
          >
            <div className="bg-neutral-950 p-3.5 rounded-lg border border-neutral-800">
              <span className="text-neutral-400 text-xs uppercase tracking-wider block mb-1">
                Account Connesso
              </span>
              <span className="text-neutral-100 text-sm sm:text-base font-semibold break-all">
                {user.email}
              </span>
            </div>
            <div className="bg-neutral-950 p-3.5 rounded-lg border border-neutral-800">
              <span className="text-neutral-400 text-xs uppercase tracking-wider block mb-1">
                Livello Accesso
              </span>
              <span className="text-amber-400 text-sm sm:text-base font-bold uppercase">
                {role}
                {callsign ? ` • ${callsign}` : ''}
              </span>
            </div>
            {!isExecutive && (
              <div className="bg-neutral-950 p-3.5 rounded-lg border border-neutral-800">
                <span className="text-neutral-400 text-xs uppercase tracking-wider block mb-1">
                  Stato Portale
                </span>
                <span className="text-emerald-400 text-sm sm:text-base font-bold">OPERATIVO</span>
              </div>
            )}
          </div>

          {isAdmin && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 pt-3 sm:pt-4">
              <button
                type="button"
                onClick={() => setShowTodayFocus(!showTodayFocus)}
                className={
                  'text-left p-3.5 rounded-lg border transition ' +
                  (showTodayFocus
                    ? 'bg-neutral-800/80 border-amber-500'
                    : 'bg-neutral-950 border-neutral-800 hover:border-amber-500/70')
                }
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-neutral-400 text-xs uppercase tracking-wider">
                    Agenda Oggi (Appunt. + Mov.)
                  </span>
                  <span className="text-xs uppercase text-amber-400 font-bold">
                    {showTodayFocus ? 'Chiudi ▲' : 'Apri ▼'}
                  </span>
                </div>
                <span className="text-white font-bold text-base sm:text-lg">
                  {todayEventsCount} {todayEventsCount === 1 ? 'evento attivo' : 'eventi attivi'}
                </span>
              </button>

              <div className="bg-neutral-950 p-3.5 rounded-lg border border-neutral-800">
                <span className="text-neutral-400 text-xs uppercase tracking-wider block mb-1">
                  Priorit&agrave; &amp; Scadenze Urgenti
                </span>
                <span
                  className={
                    'font-bold text-base sm:text-lg ' +
                    (urgentTasksCount > 0 ? 'text-amber-400' : 'text-emerald-400')
                  }
                >
                  {urgentTasksCount}{' '}
                  {urgentTasksCount === 1 ? 'task urgente' : 'task urgenti'}
                </span>
              </div>

              <div className="bg-neutral-950 p-3.5 rounded-lg border border-neutral-800">
                <span className="text-neutral-400 text-xs uppercase tracking-wider block mb-1">
                  Nota Spese da Rendicontare
                </span>
                <span className="text-neutral-100 font-bold text-base sm:text-lg font-mono">
                  &euro; {pendingExpensesSum.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {isAdmin && showTodayFocus && (
            <div className="mt-4 bg-neutral-950 border border-amber-500/60 rounded-xl p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-3">
                <div>
                  <div className="text-sm sm:text-base font-bold uppercase tracking-wide text-amber-400">
                    Agenda Odierna — {todayFormattedDate}
                  </div>
                  <p className="text-xs sm:text-sm text-neutral-400">
                    Riepilogo rapido degli appuntamenti e movimentazioni programmate per oggi
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTodayFocus(false)}
                  className="min-h-[36px] text-xs uppercase px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border border-neutral-700 font-semibold"
                >
                  Chiudi Vista Rapida
                </button>
              </div>

              {todayEventsCount === 0 ? (
                <div className="text-sm text-neutral-400 py-2">
                  Nessun appuntamento o movimentazione attiva programmata per la giornata odierna.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="space-y-2.5">
                    <div className="text-xs uppercase font-bold tracking-wider text-amber-400">
                      Appuntamenti &amp; Meeting Oggi ({todayAppointments.length})
                    </div>
                    {todayAppointments.length > 0 ? (
                      todayAppointments.map((appt) => (
                        <div
                          key={appt.id}
                          className="p-3 rounded-lg bg-neutral-900 border border-neutral-800 space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold font-mono text-amber-300">
                              {formatTimeHour(appt.start_time)} &rarr; {formatTimeHour(appt.end_time)}
                            </span>
                            <span className="text-xs uppercase px-2 py-0.5 rounded bg-neutral-800 text-amber-300 font-semibold">
                              {appt.status}
                            </span>
                          </div>
                          <div className="font-bold text-base text-white">{appt.title}</div>
                          {(appt.location_type || appt.location_details) && (
                            <div className="text-neutral-300 text-xs sm:text-sm">
                              Luogo: {appt.location_type}
                              {appt.location_details ? ` — ${appt.location_details}` : ''}
                            </div>
                          )}
                          {appt.participants && (
                            <div className="text-neutral-400 text-xs sm:text-sm">
                              Partecipanti: {appt.participants}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="text-neutral-500 text-sm">
                        Nessun meeting in agenda per oggi.
                      </div>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    <div className="text-xs uppercase font-bold tracking-wider text-emerald-400">
                      Movimentazioni &amp; Trasferte Oggi ({todayActiveMissions.length})
                    </div>
                    {todayActiveMissions.length > 0 ? (
                      todayActiveMissions.map((m) => (
                        <div
                          key={m.id}
                          className="p-3 rounded-lg bg-neutral-900 border border-neutral-800 space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold font-mono text-emerald-300">
                              {formatTimeHour(m.start_time)} &rarr; {formatTimeHour(m.end_time)}
                            </span>
                            <span className="text-xs uppercase px-2 py-0.5 rounded bg-neutral-800 text-emerald-300 font-semibold">
                              {m.status}
                            </span>
                          </div>
                          <div className="font-bold text-base text-white uppercase">
                            {m.client_vip}
                          </div>
                          <div className="text-neutral-200 text-xs sm:text-sm">
                            {m.pickup_point} &rarr; {m.dropoff_point}
                          </div>
                          <div className="text-neutral-400 text-xs sm:text-sm">
                            Mezzo: {m.assigned_vehicle}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-neutral-500 text-sm">
                        Nessuna movimentazione programmata per oggi.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 1. AGENDA APPUNTAMENTI & MEETING */}
        {canAccessExecutivePanels && (
          <ExecutiveAppointments
            userEmail={user.email || ''}
            userId={user.id}
            onAuditUpdated={handleControlRoomSync}
          />
        )}

        {/* 2. METEO LOCALE, TRATTE & EARLY WARNING CALAMITA */}
        {isAdmin && (
          <AdminWeatherHazardPanel
            isAdmin={isAdmin}
            userEmail={user.email || ''}
            userId={user.id}
            missions={missions}
            onAuditUpdated={handleControlRoomSync}
          />
        )}

        {/* 3. AGENDA DIREZIONALE, FLOTTA & RISK ASSESSMENT */}
        {!isExecutive && (
          <MissionBoard
            initialMissions={missions}
            isAdmin={isAdmin}
            userEmail={user.email || ''}
            userId={user.id}
            onAuditUpdated={handleControlRoomSync}
          />
        )}

        {/* 4. GATEKEEPING, RUBRICA STRATEGICA & PREFERENZE VIP */}
        {canAccessExecutivePanels && (
          <ExecutiveHub
            userEmail={user.email || ''}
            onAuditUpdated={handleControlRoomSync}
          />
        )}

        {/* 5. DELEGHE, TASK & NOTA SPESE */}
        {isAdmin && <OperationsControl {...opsControlProps} />}

        {/* 6. PROCEDURE OPERATIVE / SOP */}
        {!isExecutive && <SopChecklists {...sopProps} />}

        {/* 7. BACKUP & RIPRISTINO */}
        {isAdmin && <BackupManager {...backupProps} />}

        {/* 8. LOG ATTIVITA' */}
        {isAdmin && (
          <div className="bg-neutral-900 border border-neutral-800 border-t-2 border-t-neutral-500 rounded-xl p-4 sm:p-6 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-3.5 mb-4">
              <h2 className="text-base sm:text-lg font-bold uppercase tracking-wide text-white">
                Audit Log • Ultimi Accessi &amp; Attivit&agrave;
              </h2>
              <span className="text-xs text-neutral-400">Aggiornamento automatico</span>
            </div>
            {logs.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="text-neutral-400 border-b border-neutral-800 uppercase text-xs">
                    <tr>
                      <th className="py-2.5 pr-4">Data / Ora</th>
                      <th className="py-2.5 pr-4">Operatore</th>
                      <th className="py-2.5 pr-4">Evento / Coordinate</th>
                      <th className="py-2.5">Stato</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/70">
                    {logs.map((item: any, idx: number) => {
                      const isSos = item.status === 'SOS'
                      const isSosAck = item.status === 'SOS-ACK'
                      const isCheckIn = item.status === 'CHECK-IN'
                      const gpsCoords = extractGpsCoords(String(item.action || ''))

                      return (
                        <tr
                          key={item.id || idx}
                          className={
                            isSos
                              ? 'bg-red-950/35 text-red-200'
                              : isSosAck
                              ? 'bg-neutral-900/60 text-neutral-400'
                              : isCheckIn
                              ? 'bg-sky-950/20 text-sky-200'
                              : 'text-neutral-200'
                          }
                        >
                          <td className="py-3 pr-4 whitespace-nowrap font-mono text-xs">
                            {item.created_at
                              ? new Date(item.created_at).toLocaleString('it-IT')
                              : '-'}
                          </td>
                          <td className="py-3 pr-4">{item.user_email}</td>
                          <td className="py-3 pr-4">
                            <span>{item.action}</span>
                            {gpsCoords && (
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                  gpsCoords
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={
                                  'ml-2 underline text-xs font-bold ' +
                                  (isSos
                                    ? 'text-red-300 hover:text-white'
                                    : 'text-amber-400 hover:text-amber-200')
                                }
                              >
                                Maps &nearr;
                              </a>
                            )}
                          </td>
                          <td
                            className={
                              'py-3 font-bold uppercase text-xs ' +
                              (isSos
                                ? 'text-red-400'
                                : isSosAck
                                ? 'text-neutral-400'
                                : isCheckIn
                                ? 'text-sky-400'
                                : 'text-emerald-400')
                            }
                          >
                            {item.status}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-neutral-400">Nessun evento registrato nel log.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
