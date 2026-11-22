 'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../utils/supabase/client'
import MissionBoard, { Mission } from '../../components/MissionBoard'
import ExecutiveAppointments from '../../components/ExecutiveAppointments'
import ExecutiveHub from '../../components/ExecutiveHub'
import OperationsControl from '../../components/OperationsControl'
import SopChecklists from '../../components/SopChecklists'

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [role, setRole] = useState<string>('operator')
  const [callsign, setCallsign] = useState<string | null>(null)
  const [missions, setMissions] = useState<Mission[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [dismissedSosId, setDismissedSosId] = useState<string | null>(null)
  const [archivingSos, setArchivingSos] = useState(false)

  // KPI situazionali in tempo reale
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
      if (savedDismissed) {
        setDismissedSosId(savedDismissed)
      }
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
    async (adminFlag: boolean, execFlag: boolean, currentMissions: Mission[]) => {
      if (!adminFlag && !execFlag) return

      const todayKey = new Date().toDateString()
      const todayMissionsCount = execFlag
        ? 0
        : currentMissions.filter(
            (m) => new Date(m.start_time).toDateString() === todayKey && m.status !== 'chiusa'
          ).length

      const [apptsRes, tasksRes, expRes] = await Promise.all([
        supabase.from('executive_appointments').select('start_time, status'),
        supabase.from('action_items').select('priority, status, due_date'),
        supabase.from('expense_logs').select('amount, reimbursement_status'),
      ])

      const todayApptsCount = (apptsRes.data || []).filter(
        (a: any) =>
          new Date(a.start_time).toDateString() === todayKey && a.status !== 'COMPLETATO'
      ).length

      setTodayEventsCount(todayMissionsCount + todayApptsCount)

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

      if (adminFlag) {
        const { data: inactiveProfiles } = await supabase
          .from('profiles')
          .select('id')
          .eq('is_active', false)
        setPendingUsersCount((inactiveProfiles || []).length)
      }
    },
    [supabase]
  )

  const refreshAuditLogs = useCallback(async () => {
    const { data: logsData } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(15)

    if (logsData) {
      setLogs(logsData)
    }
  }, [supabase])

  useEffect(() => {
    const loadDashboard = async () => {
      const { data: { user: currentUser }, error } = await supabase.auth.getUser()

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

      await refreshKpiSummary(adminFlag, execFlag, loadedMissions)

      if (adminFlag) {
        await refreshAuditLogs()
      }

      setLoading(false)
    }

    loadDashboard()
  }, [supabase, router, refreshAuditLogs, refreshKpiSummary])

  useEffect(() => {
    const norm = role.toLowerCase()
    if (norm !== 'admin' && norm !== 'executive') return
    const interval = setInterval(() => {
      if (norm === 'admin') refreshAuditLogs()
      refreshKpiSummary(norm === 'admin', norm === 'executive', missions)
    }, 15000)
    return () => clearInterval(interval)
  }, [role, missions, refreshAuditLogs, refreshKpiSummary])

  useEffect(() => {
    if (!globalSosConfirm) return
    const timer = setTimeout(() => {
      setGlobalSosConfirm(false)
    }, 5000)
    return () => clearTimeout(timer)
  }, [globalSosConfirm])

  const handleControlRoomSync = useCallback(() => {
    const norm = role.toLowerCase()
    const adminFlag = norm === 'admin'
    const execFlag = norm === 'executive'
    if (adminFlag) refreshAuditLogs()
    refreshKpiSummary(adminFlag, execFlag, missions)
  }, [role, missions, refreshAuditLogs, refreshKpiSummary])

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
        setGlobalSosError('Errore trasmissione SOS al server. Contatta immediatamente il Comando via radio o telefono.')
        setSendingGlobalSos(false)
        return
      }

      const nowTime = new Date().toLocaleTimeString('it-IT', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })

      setGlobalSosSent({
        time: nowTime,
        coords: coordsText,
        accuracy: accuracyVal,
      })
      setSendingGlobalSos(false)

      if (adminFlag) {
        await refreshAuditLogs()
      }
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
              <div className="text-xs font-semibold text-white">
                {activeSosBanner.action}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {activeSosCoords && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activeSosCoords)}`}
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

        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-4">
            <div>
              <h1 className="text-xl font-bold tracking-widest uppercase text-neutral-100">
                {isExecutive ? 'Ops Portal • Executive Control Room' : 'Ops Portal • Dashboard'}
              </h1>
              <p className="text-xs text-neutral-400 mt-1">
                {isExecutive
                  ? 'Area Riservata Direzione • Connessione Sicura'
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
                    <span className="px-1.5 py-0.5 rounded bg-amber-400 text-neutral-950 text-[10px] font-bold animate-pulse">
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
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(globalSosSent.coords)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-red-400 hover:text-white font-semibold"
                  >
                    Apri su Maps &nearr;
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

          <div className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <p><span className="text-neutral-500">UID:</span> {user.id}</p>
            <p>
              <span className="text-neutral-500">Utente:</span>{' '}
              {callsign ? `[${callsign}] ` : ''}{user.email}
            </p>
            <p>
              <span className="text-neutral-500">Profilo:</span>{' '}
              <span
                className={
                  'uppercase font-bold ' +
                  (isExecutive ? 'text-amber-300' : 'text-emerald-400')
                }
              >
                {isExecutive ? 'EXECUTIVE • DIREZIONE' : role}
              </span>
            </p>
          </div>
        </div>

        {canAccessExecutivePanels && (
          <div className={`grid grid-cols-1 sm:grid-cols-2 ${isAdmin ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-3 text-xs`}>
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase text-neutral-500 font-bold">Agenda Oggi</div>
                <div className="text-neutral-300 mt-0.5">Eventi &amp; Movimenti</div>
              </div>
              <div className="text-xl font-bold text-amber-300">{todayEventsCount}</div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase text-neutral-500 font-bold">Priorita &amp; Scadenze</div>
                <div className="text-neutral-300 mt-0.5">Deleghe Alta / Scadute</div>
              </div>
              <div className={`text-xl font-bold ${urgentTasksCount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {urgentTasksCount}
              </div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase text-neutral-500 font-bold">Nota Spese</div>
                <div className="text-neutral-300 mt-0.5">Da Rendicontare</div>
              </div>
              <div className="text-lg font-bold text-sky-300">
                &euro; {pendingExpensesSum.toFixed(2)}
              </div>
            </div>

            {isAdmin && (
              <button
                type="button"
                onClick={() => router.push('/team')}
                className={
                  'bg-neutral-900 border rounded-lg p-4 flex items-center justify-between text-left transition ' +
                  (pendingUsersCount > 0
                    ? 'border-amber-600/80 hover:bg-amber-950/20'
                    : 'border-neutral-800 hover:border-neutral-700')
                }
              >
                <div>
                  <div className="text-[10px] uppercase text-neutral-500 font-bold">Clearance Team</div>
                  <div className="text-neutral-300 mt-0.5">Richieste in Sospeso</div>
                </div>
                <div className={`text-xl font-bold ${pendingUsersCount > 0 ? 'text-amber-300 animate-pulse' : 'text-neutral-400'}`}>
                  {pendingUsersCount}
                </div>
              </button>
            )}
          </div>
        )}

        {canAccessExecutivePanels && (
          <ExecutiveAppointments
            userEmail={user.email || ''}
            userId={user.id}
            onAuditUpdated={handleControlRoomSync}
          />
        )}

        {!isExecutive && (
          <MissionBoard
            initialMissions={missions}
            isAdmin={isAdmin}
            userEmail={user.email || ''}
            userId={user.id}
            onAuditUpdated={isAdmin ? handleControlRoomSync : undefined}
          />
        )}

        {canAccessExecutivePanels && (
          <ExecutiveHub
            userEmail={user.email || ''}
            onAuditUpdated={handleControlRoomSync}
          />
        )}

        {canAccessExecutivePanels && (
          <OperationsControl
            userEmail={user.email || ''}
            onAuditUpdated={handleControlRoomSync}
          />
        )}

        {canAccessExecutivePanels && (
          <SopChecklists
            userEmail={user.email || ''}
            onAuditUpdated={handleControlRoomSync}
          />
        )}

        {isAdmin && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 shadow-xl">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-200">
                Audit Log • Ultimi Accessi e Azioni
              </h2>
              <button
                type="button"
                onClick={refreshAuditLogs}
                className="text-[11px] uppercase px-2.5 py-1 rounded bg-neutral-950 hover:bg-neutral-800 text-neutral-300 border border-neutral-700 transition"
              >
                Aggiorna Log
              </button>
            </div>
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
                      const actionStr = String(log.action || '')
                      const coords = extractGpsCoords(actionStr)
                      const isSosRow = log.status === 'SOS'

                      return (
                        <tr key={log.id || idx} className={isSosRow ? 'bg-red-950/35' : ''}>
                          <td className="py-2 pr-4 text-neutral-400">
                            {log.created_at ? new Date(log.created_at).toLocaleString('it-IT') : '-'}
                          </td>
                          <td className="py-2 pr-4 text-neutral-200">{log.user_email}</td>
                          <td className="py-2 pr-4 text-neutral-300">
                            <span className={isSosRow ? 'text-red-200 font-semibold' : ''}>
                              {actionStr}
                            </span>
                            {coords && (
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coords)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={
                                  'ml-2 inline-block text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border transition ' +
                                  (isSosRow
                                    ? 'bg-red-900/80 hover:bg-red-800 text-white border-red-500'
                                    : 'bg-sky-950/70 hover:bg-sky-900 text-sky-300 border-sky-700')
                                }
                              >
                                Maps &nearr;
                              </a>
                            )}
                          </td>
                          <td
                            className={`py-2 font-semibold ${
                              isSosRow
                                ? 'text-red-400 font-bold'
                                : log.status === 'SOS-ACK'
                                ? 'text-amber-300'
                                : log.status === 'DENIED'
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
