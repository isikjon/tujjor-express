'use client'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { COMPANY } from '@/config/company'
import { useApp, useTracking, TRACK_STATUSES, type TrackingResult } from '@/lib/stores'
import { useFormLock } from '@/hooks/useFormLock'
import { easeInOutCubic } from '@/lib/easing'
import { audio } from '@/lib/audio'
import { useT } from '@/translations'
import { MagneticButton } from '@/components/ui/MagneticButton'
import { TelegramIcon } from '@/components/ui/Header'
import { StageSection } from './StageSection'
import { Eyebrow, H2 } from './Copy'

const DEMO_CODE = 'TJ-2381-CN'
const DEMO_TARGET = 3 // index of 'transit'
const DEMO_MS = 2500
const CODE_RE = /^[A-Z0-9-]{4,40}$/

/** Sample shipment shown by "Показать пример" — always badged DEMO, never presented as a real record. */
function demoResult(): TrackingResult {
  const day = 86_400_000
  const now = Date.now()
  return {
    found: true,
    demo: true,
    code: DEMO_CODE,
    status: 'transit',
    history: [
      { status: 'received', at: new Date(now - 9 * day).toISOString() },
      { status: 'warehouse', at: new Date(now - 8 * day).toISOString() },
      { status: 'consolidated', at: new Date(now - 6 * day).toISOString() },
      { status: 'transit', at: new Date(now - 5 * day).toISOString() },
    ],
  }
}

/**
 * §12 TRACKING stage section — a glass terminal on the left (desktop) / bottom sheet (mobile) over the 3D route.
 * While an input inside has focus the story freezes (useFormLock → holdAfter pose).
 */
export function TrackingPanel() {
  const t = useT()
  const panel = useRef<HTMLDivElement>(null)
  useFormLock(panel)
  return (
    <StageSection id="tracking" labelledBy="tracking-h2" holdFrom={0.1} holdTo={0.95}>
      <div className="absolute inset-x-[var(--gutter)] bottom-[calc(14px+var(--safe-b))] md:inset-x-auto md:bottom-auto md:left-[var(--gutter)] md:top-1/2 md:w-[min(440px,38vw)] md:-translate-y-1/2">
        <div
          ref={panel}
          data-lenis-prevent
          className="glass interactive flex max-h-[64dvh] flex-col gap-4 overflow-auto overscroll-contain rounded-2xl p-5 md:max-h-[calc(100dvh-var(--header-h)-32px)] md:p-6"
        >
          <div className="flex flex-col gap-2">
            <Eyebrow>07 · TRACKING</Eyebrow>
            <H2 id="tracking-h2" className="!text-[clamp(22px,2.2vw,32px)]">
              {t.tracking.h2}
            </H2>
            <p className="max-w-[44ch] text-[13px] leading-relaxed text-bone/65 md:text-[14px]">{t.tracking.p}</p>
          </div>
          <TrackingForm />
        </div>
      </div>
    </StageSection>
  )
}

/**
 * Track-number form + 7-step status list. Used inside the stage panel and standalone on /tracking
 * (standalone = wrapped in its own glass card, no StageSection). State lives in `useTracking` so the
 * 3D scene follows the same position without any prop plumbing.
 */
export function TrackingForm({ standalone = false }: { standalone?: boolean }) {
  const t = useT()
  const code = useTracking((s) => s.code)
  const setCode = useTracking((s) => s.setCode)
  const loading = useTracking((s) => s.loading)
  const result = useTracking((s) => s.result)
  const error = useTracking((s) => s.error)
  // derived integer → re-renders only when the box reaches another station, not on every animation frame
  const current = useTracking((s) => (s.position < 0 ? -1 : Math.min(TRACK_STATUSES.length - 1, Math.max(0, Math.round(s.position)))))
  const [invalid, setInvalid] = useState(false)
  const raf = useRef(0)
  const uid = useId()
  const inputId = `${uid}-code`
  const hintId = `${uid}-hint`

  const stopDemo = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current)
    raf.current = 0
  }, [])
  useEffect(() => stopDemo, [stopDemo])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const clean = code.trim().toUpperCase()
    if (!CODE_RE.test(clean)) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    stopDemo()
    const trk = useTracking.getState()
    trk.setCode(clean)
    trk.setLoading(true)
    audio.click(2000)
    try {
      const res = await fetch('/api/track/' + encodeURIComponent(clean), { cache: 'no-store' })
      if (!res.ok && res.status !== 400) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as TrackingResult
      const s = useTracking.getState()
      s.setResult(json)
      s.setPosition(json.found && json.status ? TRACK_STATUSES.indexOf(json.status) : -1)
    } catch {
      const s = useTracking.getState()
      s.setResult(null, 'error')
      s.setPosition(-1)
    }
  }

  /** DEMO: sample result + the mini-box rides 0 → 3 over ~2.5 s (rAF, eased); reduced motion jumps straight there. */
  const demo = () => {
    stopDemo()
    setInvalid(false)
    const trk = useTracking.getState()
    trk.setCode(DEMO_CODE)
    trk.setResult(demoResult())
    audio.click(2400)
    if (useApp.getState().motionOff) {
      trk.setPosition(DEMO_TARGET)
      return
    }
    trk.setPosition(0)
    const t0 = performance.now()
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / DEMO_MS)
      useTracking.getState().setPosition(easeInOutCubic(k) * DEMO_TARGET)
      raf.current = k < 1 ? requestAnimationFrame(tick) : 0
    }
    raf.current = requestAnimationFrame(tick)
  }

  const statusesRu = t.tracking.statusesRu
  const telegram = (
    <a href={COMPANY.telegramHref} target="_blank" rel="noopener noreferrer" data-cursor="open" className="inline-flex items-center gap-1 whitespace-nowrap text-orange underline-offset-4 hover:underline">
      <TelegramIcon className="h-3 w-3" /> {COMPANY.telegram}
    </a>
  )
  const demoBadge = <span className="rounded-full border border-orange/40 bg-orange/15 px-1.5 py-[2px] text-[9px] font-semibold tracking-[0.14em] text-orange">{t.tracking.demoBadge}</span>

  const body = (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <label htmlFor={inputId} className="sr-only">
          {t.tracking.codeLabel}
        </label>
        <input
          id={inputId}
          name="code"
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value)
            if (invalid) setInvalid(false)
          }}
          placeholder={t.tracking.placeholder}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="search"
          maxLength={40}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? hintId : undefined}
          className={`font-display h-12 w-full rounded-xl border bg-graphite/70 px-4 text-[16px] font-bold uppercase tracking-[0.1em] text-bone outline-none transition-[border-color,box-shadow] duration-300 placeholder:font-sans placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-bone/35 focus:border-orange/60 focus:shadow-[inset_0_0_0_1px_rgba(255,106,0,.55)] ${
            invalid ? 'border-red-500/70 shadow-[inset_0_0_0_1px_rgba(239,68,68,.6)]' : 'border-bone/12'
          }`}
        />
        {invalid ? (
          <p id={hintId} role="alert" className="text-[12px] text-red-400">
            {t.tracking.invalid}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <MagneticButton variant="primary" type="submit" disabled={loading} aria-busy={loading || undefined} className="disabled:cursor-wait disabled:opacity-70">
            {loading ? (
              <>
                <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-graphite" />
                {t.tracking.loading}
              </>
            ) : (
              t.tracking.submit
            )}
          </MagneticButton>
          <MagneticButton variant="ghost" type="button" onClick={demo} cursor="explore">
            {t.tracking.demo}
            {demoBadge}
          </MagneticButton>
        </div>
      </form>

      {/* result / hints */}
      {result?.found ? (
        <div className="flex flex-col gap-1.5" role="status">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-bone/10 bg-graphite/50 px-3 py-2.5">
            <span className="hud text-[9px] text-bone/50">{t.tracking.codeLabel}</span>
            <span className="font-display tnum text-[13px] font-bold tracking-[0.08em] text-bone">{result.code}</span>
            {result.demo ? demoBadge : null}
            {result.status ? <span className="hud ml-auto text-[10px] text-orange">{t.tracking.statuses[result.status]}</span> : null}
          </div>
          {result.demo ? <p className="text-[12px] text-bone/50">{t.tracking.demoNote}</p> : null}
        </div>
      ) : result && !result.found ? (
        <p role="status" className="text-[13px] leading-relaxed text-bone/70">
          {t.tracking.notFound} {telegram}
        </p>
      ) : error ? (
        <p role="alert" className="text-[13px] leading-relaxed text-bone/70">
          {t.tracking.error} {telegram}
        </p>
      ) : null}

      {/* 7 stations — vertical list on wide screens, a compact horizontal rail on narrow ones */}
      <ol
        aria-label={t.tracking.stepsLabel}
        className="relative flex items-start justify-between gap-1 pt-1 before:absolute before:left-[8px] before:right-[8px] before:top-[9px] before:h-px before:bg-bone/12 md:flex-col md:items-stretch md:gap-0 md:pt-0 md:before:bottom-3 md:before:left-[5px] md:before:right-auto md:before:top-3 md:before:h-auto md:before:w-px"
      >
        {TRACK_STATUSES.map((s, i) => {
          const state = current < 0 ? 'future' : i < current ? 'done' : i === current ? 'current' : 'future'
          const dot =
            state === 'current'
              ? 'bg-orange shadow-[0_0_0_3px_rgba(255,106,0,.18),0_0_12px_rgba(255,106,0,.8)] scale-110'
              : state === 'done'
                ? 'bg-bone'
                : 'bg-bone/20'
          const text = state === 'current' ? 'text-orange' : state === 'done' ? 'text-bone' : 'text-bone/40'
          return (
            <li
              key={s}
              data-state={state}
              aria-current={state === 'current' ? 'step' : undefined}
              className="relative flex flex-col items-center gap-1.5 md:flex-row md:items-center md:gap-3 md:py-[5px]"
            >
              <span aria-hidden className={`relative z-[1] h-[11px] w-[11px] shrink-0 rounded-full transition-[background-color,box-shadow,transform] duration-500 ${dot}`} />
              <span className={`hud text-[9px] md:hidden ${text}`}>{String(i + 1).padStart(2, '0')}</span>
              <span className={`flex flex-col leading-tight max-md:sr-only ${text}`}>
                <span className="hud text-[10px]">{t.tracking.statuses[s]}</span>
                <span className={`text-[12px] ${state === 'future' ? 'text-bone/35' : 'text-bone/55'}`}>{statusesRu[i]}</span>
              </span>
            </li>
          )
        })}
      </ol>
      {/* narrow layout: name of the current step under the rail */}
      <p aria-hidden className="-mt-2 flex items-baseline gap-2 md:hidden">
        <span className={`hud text-[10px] ${current < 0 ? 'text-bone/40' : 'text-orange'}`}>{current < 0 ? '—' : t.tracking.statuses[TRACK_STATUSES[current]]}</span>
        {current >= 0 ? <span className="text-[12px] text-bone/55">{statusesRu[current]}</span> : null}
      </p>
    </div>
  )

  if (!standalone) return body
  return <div className="glass rounded-2xl p-6 md:p-8">{body}</div>
}
