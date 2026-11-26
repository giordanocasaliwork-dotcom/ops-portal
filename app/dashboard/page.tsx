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
      <div className="min-h-screen bg-neutral-950 text-neutral-400 p-8 font-mono text-xs">
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

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6 md:p-8 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">
        {isAdmin && activeSosBanner && (
          <div className="bg-red-950/90 border-2 border-red-500 rounded-lg p-4 shadow-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-red-600 text-white text-[11px] font-bold uppercase animate-pulse">
                  ALLERTA EMERGENZA SOS
                </span>
                <span className="text-xs text-red-200">
                  {activeSosBanner.created_at
                    ? new Date(activeSosBanner.created_at).toLocaleString('it-IT')
                    : ''}
                </span>
              </div>
              <div className="text-xs font-semibold text-white">{activeSosBanner.action}</div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {activeSosCoords && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    activeSosCoords
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-white hover:bg-neutral-200 text-red-950 font-bold text-xs uppercase px-3 py-1.5 rounded transition"
                >
                  Posizione SOS Maps &nearr;
                </a>
              )}
              <button
                type="button"
                disabled={archivingSos}
                onClick={() => handleArchiveSosBanner(activeSosBanner)}
                className="bg-red-900/80 hover:bg-red-800 text-red-100 border border-red-600 text-xs uppercase px-3 py-1.5 rounded transition disabled:opacity-50"
              >
                {archivingSos ? 'Archiviazione...' : 'Archivia Allerta'}
              </button>
            </div>
          </div>
        )}

        <div className="bg-neutral-900 border-2 border-yellow-500/70 rounded-lg p-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-yellow-500/30 pb-4">
            <div>
              <h1 className="text-xl font-bold tracking-widest uppercase text-neutral-100">
                {isExecutive ? 'Ops Portal • Area Riservata Direzione' : 'Ops Portal • Dashboard'}
              </h1>
              <p className="text-xs text-neutral-400 mt-1">
                {isExecutive
                  ? 'Agenda Appuntamenti & Rubrica Strategica • Connessione Sicura'
                  : 'Area Operativa Riservata • Connessione Sicura'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={sendingGlobalSos}
                onClick={handleGlobalSos}
                title="Doppio tocco rapido per inviare un allarme SOS con posizione GPS"
                className={
                  'text-xs uppercase tracking-wider px-4 py-2 rounded transition font-bold border ' +
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
                  className="bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-700 text-xs uppercase tracking-wider px-4 py-2 rounded transition font-semibold flex items-center gap-2"
                >
                  <span>Gestione Team</span>
                  {pendingUsersCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-yellow-400 text-neutral-950 text-[10px] font-bold animate-pulse">
                      +{pendingUsersCount}
                    </span>
                  )}
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

          {globalSosError && (
            <div className="mt-4 p-3 bg-red-950/70 border border-red-700 text-red-200 text-xs rounded">
              {globalSosError}
            </div>
          )}

          {globalSosSent && (
            <div className="mt-4 p-3 bg-red-950/60 border border-red-700 rounded flex flex-wrap items-center justify-between gap-2 text-xs text-red-200">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-red-600 text-white font-bold uppercase text-[10px]">
                  SOS TRASMESSO ({globalSosSent.time})
                </span>
                <span>
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
                className="text-[11px] uppercase text-red-300 hover:text-white"
              >
                Chiudi
              </button>
            </div>
          )}

          <div
            className={
              'grid grid-cols-1 gap-4 pt-4 text-xs ' +
              (isExecutive ? 'sm:grid-cols-2' : 'sm:grid-cols-3')
            }
          >
            <div className="bg-neutral-950 p-3 rounded border border-neutral-800">
              <span className="text-neutral-500 block mb-1">ACCOUNT CONNESSO</span>
              <span className="text-neutral-200 font-semibold">{user.email}</span>
            </div>
            <div className="bg-neutral-950 p-3 rounded border border-neutral-800">
              <span className="text-neutral-500 block mb-1">LIVELLO ACCESSO</span>
              <span className="text-emerald-400 font-semibold uppercase">
                {role}
                {callsign ? ` • ${callsign}` : ''}
              </span>
            </div>
            {!isExecutive && (
              <div className="bg-neutral-950 p-3 rounded border border-neutral-800">
                <span className="text-neutral-500 block mb-1">STATO PORTALE</span>
                <span className="text-emerald-400 font-semibold">OPERATIVO</span>
              </div>
            )}
          </div>

          {isAdmin && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 text-xs">
              <button
                type="button"
                onClick={() => setShowTodayFocus(!showTodayFocus)}
                className={
                  'text-left p-3 rounded border transition ' +
                  (showTodayFocus
                    ? 'bg-sky-950/60 border-sky-500'
                    : 'bg-neutral-950 border-sky-900/70 hover:border-sky-600')
                }
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-neutral-500 uppercase">AGENDA OGGI (APPUNT. + MOV.)</span>
                  <span className="text-[10px] uppercase text-sky-400 font-bold">
                    {showTodayFocus ? 'Chiudi ▲' : 'Dettagli ▼'}
                  </span>
                </div>
                <span className="text-sky-300 font-bold text-sm">
                  {todayEventsCount} {todayEventsCount === 1 ? 'evento attivo' : 'eventi attivi'}
                </span>
              </button>

              <div className="bg-neutral-950 p-3 rounded border border-amber-900/70">
                <span className="text-neutral-500 block mb-1 uppercase">
                  PRIORIT&Agrave; &amp; SCADENZE URGENTI
                </span>
                <span
                  className={
                    'font-bold text-sm ' +
                    (urgentTasksCount > 0 ? 'text-amber-300' : 'text-emerald-400')
                  }
                >
                  {urgentTasksCount}{' '}
                  {urgentTasksCount === 1 ? 'task urgente' : 'task urgenti'}
                </span>
              </div>

              <div className="bg-neutral-950 p-3 rounded border border-emerald-900/70">
                <span className="text-neutral-500 block mb-1 uppercase">
                  NOTA SPESE DA RENDICONTARE
                </span>
                <span className="text-emerald-300 font-bold text-sm">
                  &euro; {pendingExpensesSum.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {isAdmin && showTodayFocus && (
            <div className="mt-4 bg-neutral-950 border border-sky-700/80 rounded-lg p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-900/60 pb-2.5">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-sky-300">
                    Agenda Odierna — {todayFormattedDate}
                  </div>
                  <p className="text-[11px] text-neutral-400">
                    Riepilogo rapido degli appuntamenti e movimentazioni programmate per oggi
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTodayFocus(false)}
                  className="text-[11px] uppercase px-2.5 py-1 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-700"
                >
                  Chiudi Vista Rapida
                </button>
              </div>

              {todayEventsCount === 0 ? (
                <div className="text-xs text-neutral-400 py-2">
                  Nessun appuntamento o movimentazione attiva programmata per la giornata odierna.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-2">
                    <div className="text-[11px] uppercase font-bold text-amber-300">
                      Appuntamenti &amp; Meeting Oggi ({todayAppointments.length})
                    </div>
                    {todayAppointments.length > 0 ? (
                      todayAppointments.map((appt) => {
                        const apptFields = appt as unknown as Record<string, string | null | undefined>
                        const locationVal =
                          apptFields.location ||
                          apptFields.location_or_link ||
                          apptFields.venue ||
                          apptFields.place
                        const participantsVal =
                          apptFields.participants ||
                          apptFields.attendees ||
                          apptFields.counterpart

                        return (
                          <div
                            key={appt.id}
                            className="p-2.5 rounded bg-neutral-900 border border-neutral-800 space-y-1"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-amber-200">
                                {formatTimeHour(appt.start_time)} &rarr; {formatTimeHour(appt.end_time)}
                              </span>
                              <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-amber-950/70 text-amber-300 border border-amber-800">
                                {appt.status}
                              </span>
                            </div>
                            <div className="font-semibold text-neutral-100">{appt.title}</div>
                            {locationVal && (
                              <div className="text-neutral-400 text-[11px]">Luogo: {locationVal}</div>
                            )}
                            {participantsVal && (
                              <div className="text-neutral-400 text-[11px]">
                                Partecipanti: {participantsVal}
                              </div>
                            )}
                          </div>
                        )
                      })
                    ) : (
                      <div className="text-neutral-500 text-[11px]">
                        Nessun meeting in agenda per oggi.
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="text-[11px] uppercase font-bold text-emerald-300">
                      Movimentazioni &amp; Trasferte Oggi ({todayActiveMissions.length})
                    </div>
                    {todayActiveMissions.length > 0 ? (
                      todayActiveMissions.map((m) => (
                        <div
                          key={m.id}
                          className="p-2.5 rounded bg-neutral-900 border border-neutral-800 space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-emerald-200">
                              {formatTimeHour(m.start_time)} &rarr; {formatTimeHour(m.end_time)}
                            </span>
                            <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-800">
                              {m.status}
                            </span>
                          </div>
                          <div className="font-semibold text-neutral-100 uppercase">
                            {m.client_vip}
                          </div>
                          <div className="text-neutral-300 text-[11px]">
                            {m.pickup_point} &rarr; {m.dropoff_point}
                          </div>
                          <div className="text-neutral-400 text-[11px]">
                            Mezzo: {m.assigned_vehicle}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-neutral-500 text-[11px]">
                        Nessuna movimentazione programmata per oggi.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 1. AGENDA APPUNTAMENTI & MEETING (Visibile a Admin ed Executive) */}
        {canAccessExecutivePanels && (
          <ExecutiveAppointments
            isAdmin={isAdmin}
            userEmail={user.email || ''}
            userId={user.id}
            onAuditUpdated={handleControlRoomSync}
          />
        )}

        {/* 2. METEO LOCALE, TRATTE & EARLY WARNING CALAMITA (Solo Admin) */}
        {isAdmin && (
          <AdminWeatherHazardPanel
            isAdmin={isAdmin}
            userEmail={user.email || ''}
            userId={user.id}
            missions={missions}
            onAuditUpdated={handleControlRoomSync}
          />
        )}

        {/* 3. AGENDA DIREZIONALE, FLOTTA & RISK ASSESSMENT (Nascosto all'Executive) */}
        {!isExecutive && (
          <MissionBoard
            initialMissions={missions}
            isAdmin={isAdmin}
            userEmail={user.email || ''}
            userId={user.id}
            onAuditUpdated={handleControlRoomSync}
          />
        )}

        {/* 4. GATEKEEPING, RUBRICA STRATEGICA & PREFERENZE VIP (Visibile a Admin ed Executive) */}
        {canAccessExecutivePanels && (
          <ExecutiveHub
            isAdmin={isAdmin}
            userEmail={user.email || ''}
            userId={user.id}
            onAuditUpdated={handleControlRoomSync}
          />
        )}

        {/* 5. DELEGHE, TASK & NOTA SPESE (Solo Admin) */}
        {isAdmin && (
          <OperationsControl
            isAdmin={isAdmin}
            userEmail={user.email || ''}
            userId={user.id}
            onAuditUpdated={handleControlRoomSync}
          />
        )}

        {/* 6. PROCEDURE OPERATIVE / SOP (Nascosto all'Executive) */}
        {!isExecutive && (
          <SopChecklists
            isAdmin={isAdmin}
            userEmail={user.email || ''}
            userId={user.id}
            onAuditUpdated={handleControlRoomSync}
          />
        )}

        {/* 7. BACKUP & RIPRISTINO (Solo Admin) */}
        {isAdmin && (
          <BackupManager
            isAdmin={isAdmin}
            userEmail={user.email || ''}
            onAuditUpdated={handleControlRoomSync}
          />
        )}

        {/* 8. LOG ATTIVITA' (Solo Admin) */}
        {isAdmin && (
          <div className="bg-neutral-900 border-2 border-yellow-500/70 rounded-lg p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-yellow-500/30 pb-3 mb-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-100">
                Log Attivit&agrave; di Sistema, Check-in &amp; Allerte (Solo Admin)
              </h2>
              <span className="text-[11px] text-neutral-500">Aggiornamento automatico</span>
            </div>
            {logs.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-neutral-500 border-b border-neutral-800 uppercase">
                    <tr>
                      <th className="py-2 pr-4">Data / Ora</th>
                      <th className="py-2 pr-4">Operatore</th>
                      <th className="py-2 pr-4">Evento / Coordinate</th>
                      <th className="py-2">Stato</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60">
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
                              : 'text-neutral-300'
                          }
                        >
                          <td className="py-2 pr-4 whitespace-nowrap">
                            {item.created_at
                              ? new Date(item.created_at).toLocaleString('it-IT')
                              : '-'}
                          </td>
                          <td className="py-2 pr-4">{item.user_email}</td>
                          <td className="py-2 pr-4">
                            <span>{item.action}</span>
                            {gpsCoords && (
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                  gpsCoords
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={
                                  'ml-2 underline text-[11px] font-semibold ' +
                                  (isSos
                                    ? 'text-red-300 hover:text-white'
                                    : 'text-sky-400 hover:text-sky-200')
                                }
                              >
                                Maps &nearr;
                              </a>
                            )}
                          </td>
                          <td
                            className={
                              'py-2 font-bold ' +
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
              <p className="text-xs text-neutral-500">Nessun evento registrato nel log.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
