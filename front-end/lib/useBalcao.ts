'use client'
import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { API_URL } from "@/lib/api";
import { clearSession } from "@/lib/session";
import { playAlert } from "@/lib/sound";
import type { ActiveSession, Call } from "@/lib/types";
import { listCalls } from "@/services/calls";
import { listSessions } from "@/services/sessions";

const startOfToday = () => new Date(new Date().setHours(0, 0, 0, 0));

// Estado do balcão: carga inicial pela API e atualizações em tempo real pelo Socket.IO.
// Eventos podem se perder numa queda; por isso tudo é recarregado a cada (re)conexão.
export function useBalcao(token: string, soundOn: boolean) {
  const [calls, setCalls] = useState<Call[]>([])
  const [sessions, setSessions] = useState<ActiveSession[]>([])
  const [doneToday, setDoneToday] = useState(0)
  const [live, setLive] = useState(false)
  const [stale, setStale] = useState(false) // a última carga falhou: os dados na tela podem estar velhos
  const [now, setNow] = useState(0)
  const offset = useRef(0) // serverTime - relógio local
  const sound = useRef(soundOn)
  const events = useRef(0) // conta eventos recebidos: uma carga em voo que os atravessou pode estar velha

  useEffect(() => { sound.current = soundOn }, [soundOn])

  // Nunca lança: em falha marca os dados como velhos e o efeito abaixo tenta de novo
  const load = useCallback(async () => {
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const seen = events.current
        const [open, done, active] = await Promise.all([
          listCalls(token, 'OPEN'),
          listCalls(token, 'DONE', startOfToday()),
          listSessions(token),
        ])
        // Chegou evento durante a carga: o retrato pode ser anterior a ele (ressuscitaria um card); busca de novo
        if (events.current !== seen && attempt < 2) continue
        offset.current = Date.parse(open.serverTime) - Date.now()
        setCalls(open.calls)
        setDoneToday(done.calls.length)
        setSessions(active)
        break
      }
      setStale(false)
    } catch {
      setStale(true)
    }
  }, [token])

  useEffect(() => {
    const socket = io(new URL(API_URL).origin, { auth: { token } })

    socket.on('connect', () => { setLive(true); void load() })
    socket.on('disconnect', () => setLive(false))
    // Token recusado (usuário desativado, JWT vencido): volta ao login
    socket.on('connect_error', (err) => { setLive(false); if (err.message === 'Não autorizado') clearSession() })

    socket.on('call:created', (call: Call) => {
      events.current++
      setCalls((list) => (list.some((c) => c.id === call.id) ? list : [...list, call]))
      if (sound.current) playAlert()
    })
    socket.on('call:done', ({ id }: { id: string }) => {
      events.current++
      setCalls((list) => list.filter((c) => c.id !== id))
      void load() // o contador de concluídos vem da API (evita divergir do servidor)
    })
    socket.on('session:opened', (session: ActiveSession) => {
      events.current++
      setSessions((list) => (list.some((s) => s.id === session.id) ? list : [...list, session]))
    })
    socket.on('session:extended', ({ id, expires_at }: { id: string; expires_at: string }) => {
      events.current++
      setSessions((list) => list.map((s) => (s.id === id ? { ...s, expires_at } : s)))
    })
    // Encerrar o atendimento cancela os chamados abertos dele: o card some junto
    socket.on('session:closed', ({ id }: { id: string }) => {
      events.current++
      setSessions((list) => list.filter((s) => s.id !== id))
      setCalls((list) => list.filter((c) => c.session_id !== id))
    })

    return () => { socket.disconnect() }
  }, [token, load])

  // Carga que falhou: tenta de novo a cada 5 s
  useEffect(() => {
    if (!stale) return
    const timer = setTimeout(() => void load(), 5000)
    return () => clearTimeout(timer)
  }, [stale, load])

  // Relógio corrigido pelo do servidor, a cada segundo (cronômetros e vencimentos)
  useEffect(() => {
    const tick = () => setNow(Date.now() + offset.current)
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [])

  return { calls, sessions, doneToday, live, stale, now, reload: load }
}
