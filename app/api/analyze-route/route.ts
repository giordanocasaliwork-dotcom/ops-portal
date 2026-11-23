import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

interface AnalyzeRouteBody {
  mission_id: string
  client_vip: string
  pickup_point: string
  dropoff_point: string
  start_time: string
  end_time: string
  assigned_vehicle?: string
  notes?: string | null
}

type ThreatLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Token di autenticazione mancante.' }, { status: 401 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: 'Configurazione Supabase mancante sul server.' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    })

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Sessione non valida o scaduta.' }, { status: 401 })
    }

    let apiKey = process.env.GEMINI_API_KEY || ''
    if (!apiKey) {
      const { data: rpcKey, error: rpcErr } = await supabase.rpc('get_gemini_api_key')
      if (rpcErr || !rpcKey || String(rpcKey).startsWith('INCOLLA_QUI')) {
        return NextResponse.json(
          {
            error:
              'GEMINI_API_KEY non configurata su Supabase (tabella app_secrets). Esegui prima lo Step 1 SQL.',
          },
          { status: 500 }
        )
      }
      apiKey = String(rpcKey).trim()
    }

    const body = (await request.json()) as AnalyzeRouteBody
    if (!body.mission_id || !body.pickup_point || !body.dropoff_point) {
      return NextResponse.json(
        { error: 'Dati percorso incompleti (mission_id, partenza o arrivo mancanti).' },
        { status: 400 }
      )
    }

    const startFormatted = body.start_time
      ? new Date(body.start_time).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })
      : 'Non specificato'
    const endFormatted = body.end_time
      ? new Date(body.end_time).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })
      : 'Non specificato'

    const prompt = `Sei un analista senior di Travel Risk Management, Executive Protection e Sicurezza Operativa.
Esegui una valutazione tattica in tempo reale (verificando tramite ricerca web eventuali allerte meteo, traffico straordinario, cantieri critici, incidenti, scioperi o criticita di ordine pubblico odierne) per la seguente movimentazione:

- Soggetto / Missione: ${body.client_vip}
- Punto di Partenza (Pick-up): ${body.pickup_point}
- Punto di Arrivo (Drop-off): ${body.dropoff_point}
- Finestra Oraria: ${startFormatted} -> ${endFormatted}
- Assetto / Mezzo: ${body.assigned_vehicle || 'Non specificato'}
- Note Operative: ${body.notes || 'Nessuna'}

Restituisci EXCLUSIVAMENTE un oggetto JSON valido (nessun testo prima o dopo, nessun blocco markdown) con questa esatta struttura:
{
  "threat_level": "LOW" | "MODERATE" | "HIGH" | "CRITICAL",
  "choke_points": "Testo strutturato in 3 sotto-blocchi chiari:\n1) SITUAZIONE PARTENZA (${body.pickup_point}): analisi viabilita, ZTL, accessi e criticita attuali.\n2) CHOKE POINTS ITINERARIO PRINCIPALE (PERCORSO A): elenco dettagliato dei nodi critici, svincoli, valichi/gallerie, barriere autostradali e punti di rallentamento lungo la tratta.\n3) SITUAZIONE ARRIVO (${body.dropoff_point}): analisi contesto locale, viabilita in avvicinamento e criticita.",
  "safe_havens": "Elenco di 4-6 presidi strategici reali (Stazioni Carabinieri, Sottosezioni Polizia Stradale, Commissariati, aree sicure presidiate) posizionati presso partenza, snodi intermedi lungo l'itinerario e arrivo. IMPORTANTE: scrivi UN SOLO PRESIDIO PER RIGA con indirizzo/localita precisa (es. Sottosezione Polizia Stradale Firenze Nord - A1), senza elenchi puntati o numeri all'inizio della riga, cosi ogni riga generera un link diretto a Google Maps.",
  "medical_facilities": "Elenco di 3-5 strutture ospedaliere reali con Pronto Soccorso / DEA di I o II livello lungo il corridoio e in prossimita di partenza e arrivo. IMPORTANTE: scrivi UNA SOLA STRUTTURA PER RIGA con citta/indirizzo (es. Ospedale Maggiore Carlo Alberto Pizzardi Bologna), senza elenchi puntati o numeri.",
  "evacuation_route": "PIANO B (ITINERARIO ALTERNATIVO & ESFILTRAZIONE): descrivi una rotta alternativa completa e concreta (es. direttrice autostradale secondaria, superstrada E45/A15/statali principali) indicando esattamente a quale svincolo deviare in caso di blocco o emergenza sul Percorso A, piu le vie di esfiltrazione rapida dall'area di destinazione.",
  "emergency_contacts": "Numeri e riferimenti operativi pertinenti alla tratta (NUE 112, CCISS Viaggiare Informati 1518, Polizia Stradale compartimenti interessati, Centrale Operativa)."
}`

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
        apiKey
      )}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          tools: [{ google_search: {} }],
          generationConfig: {
            temperature: 0.2,
          },
        }),
      }
    )

    if (!geminiResponse.ok) {
      const errDetail = await geminiResponse.text()
      return NextResponse.json(
        { error: `Errore chiamata Gemini API (${geminiResponse.status}): ${errDetail}` },
        { status: 502 }
      )
    }

    const geminiJson = await geminiResponse.json()
    const rawText: string =
      geminiJson?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text || '')
        .join('\n') || ''

    if (!rawText.trim()) {
      return NextResponse.json(
        { error: 'Risposta vuota ricevuta dal motore AI.' },
        { status: 502 }
      )
    }

    const cleanedJsonStr = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()

    const firstBrace = cleanedJsonStr.indexOf('{')
    const lastBrace = cleanedJsonStr.lastIndexOf('}')
    if (firstBrace === -1 || lastBrace === -1) {
      return NextResponse.json(
        { error: 'Formato analisi AI non valido. Riprova.' },
        { status: 502 }
      )
    }

    const parsed = JSON.parse(cleanedJsonStr.slice(firstBrace, lastBrace + 1))

    const allowedLevels: ThreatLevel[] = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL']
    const rawLevel = String(parsed.threat_level || 'MODERATE').toUpperCase() as ThreatLevel
    const threatLevel: ThreatLevel = allowedLevels.includes(rawLevel) ? rawLevel : 'MODERATE'

    const assessmentPayload = {
      mission_id: body.mission_id,
      threat_level: threatLevel,
      choke_points: String(parsed.choke_points || '').trim() || null,
      safe_havens: String(parsed.safe_havens || '').trim() || null,
      medical_facilities: String(parsed.medical_facilities || '').trim() || null,
      evacuation_route: String(parsed.evacuation_route || '').trim() || null,
      emergency_contacts:
        String(parsed.emergency_contacts || '').trim() || 'NUE 112 - CCISS 1518',
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    }

    const { data: savedRow, error: upsertErr } = await supabase
      .from('mission_risk_assessments')
      .upsert(assessmentPayload, { onConflict: 'mission_id' })
      .select()
      .single()

    if (upsertErr) {
      return NextResponse.json(
        { error: `Analisi generata ma errore salvataggio su DB: ${upsertErr.message}` },
        { status: 500 }
      )
    }

    await supabase.from('audit_logs').insert([
      {
        user_email: user.email || '',
        action: `AI_ROUTE_RISK_ANALYSIS (${body.client_vip}: ${body.pickup_point} -> ${body.dropoff_point}) -> ${threatLevel}`,
        status: 'SUCCESS',
      },
    ])

    return NextResponse.json({ assessment: savedRow })
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Errore imprevisto durante analisi AI del percorso.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
