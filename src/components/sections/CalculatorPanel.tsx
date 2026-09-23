'use client'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { COMPANY } from '@/config/company'
import { useApp, useCalc, isValidCalc, CALC_LIMITS, volumeM3, densityKgM3, volumetricWeightAir, type Category, type DeliveryType } from '@/lib/stores'
import { audio } from '@/lib/audio'
import { useFormLock } from '@/hooks/useFormLock'
import { useT } from '@/translations'
import { MagneticButton } from '@/components/ui/MagneticButton'
import { TelegramIcon } from '@/components/ui/Header'
import { StageSection } from './StageSection'

const CATEGORIES: Category[] = ['electronics', 'clothing', 'shoes', 'parts', 'home', 'other']
const DELIVERY: DeliveryType[] = ['auto', 'air', 'rail']

const inputBase =
  'h-12 w-full rounded-lg border bg-graphite/70 px-3 text-[16px] tnum text-bone outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-bone/30 focus:border-orange focus:shadow-[inset_0_0_0_1px_var(--color-orange)]'
const inputOk = 'border-bone/12'
const inputBad = 'border-red-500 shadow-[0_0_0_1px_#ef4444]'
const labelCls = 'hud mb-1.5 block text-[10px] text-bone/55'

const CHEVRON = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8'><path d='M1 1l5 5 5-5' fill='none' stroke='%23f2efe9' stroke-width='1.5'/></svg>")`
const fmt = (v: number, d: number) =>
  v.toLocaleString('ru-RU', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  })

/**
 * §11 CALCULATOR — the primary conversion tool. Right-aligned glass panel (bottom sheet on narrow
 * screens) over the measuring terminal. Honest math only (volume, density, IATA volumetric for air);
 * never prices. Form lock freezes the story while an input has focus; a valid submit pings the 3D.
 */
export function CalculatorPanel() {
  const t = useT()
  const panel = useRef<HTMLDivElement>(null)
  useFormLock(panel)

  const calc = useCalc()
  const set = useCalc((s) => s.set)
  // local strings so partial input ("0.", "") never corrupts the store; the store keeps numbers
  const [str, setStr] = useState(() => ({
    weight: String(calc.weight),
    length: String(calc.length),
    width: String(calc.width),
    height: String(calc.height),
  }))
  const [invalid, setInvalid] = useState<Record<'weight' | 'length' | 'width' | 'height', boolean>>({ weight: false, length: false, width: false, height: false })
  const [toast, setToast] = useState(false)
  const toastTimer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
    },
    [],
  )

  const showInvalid = invalid.weight || invalid.length || invalid.width || invalid.height

  const onNum = useCallback(
    (key: 'weight' | 'length' | 'width' | 'height', raw: string) => {
      const v = raw.replace(',', '.')
      setStr((s) => ({ ...s, [key]: v }))
      const n = key === 'weight' ? parseFloat(v) : parseInt(v, 10)
      // any edit invalidates the shown result; the 3D follows the store only while it is valid
      const patch: Parameters<typeof set>[0] = { calculated: false }
      patch[key] = Number.isFinite(n) ? n : NaN
      set(patch)
      setInvalid((i) => (i[key] ? { ...i, [key]: false } : i))
    },
    [set],
  )

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const s = useCalc.getState()
    const dimOk = (d: number) => Number.isFinite(d) && Number.isInteger(d) && d >= CALC_LIMITS.dimMin && d <= CALC_LIMITS.dimMax
    const bad = {
      weight: !(Number.isFinite(s.weight) && s.weight >= CALC_LIMITS.weightMin && s.weight <= CALC_LIMITS.weightMax),
      length: !dimOk(s.length),
      width: !dimOk(s.width),
      height: !dimOk(s.height),
    }
    setInvalid(bad)
    if (bad.weight || bad.length || bad.width || bad.height || !isValidCalc(s)) {
      set({ calculated: false })
      return
    }
    set({ calculated: true })
    useApp.getState().bumpCamera(1)
    audio.click(880)
  }

  const catIndex = CATEGORIES.indexOf(calc.category)
  const typeIndex = DELIVERY.indexOf(calc.deliveryType)
  const valid = isValidCalc(calc)
  const vol = valid ? volumeM3(calc.length, calc.width, calc.height) : 0
  const dens = valid ? densityKgM3(calc.weight, calc.length, calc.width, calc.height) : 0
  const volW = valid ? volumetricWeightAir(calc.length, calc.width, calc.height) : 0

  // CTA: copy the docs §14.14 template, toast 3 s; the anchor itself opens Telegram in a new tab (in-gesture)
  const onCta = () => {
    const text = t.calculator.template
      .replace('{L}', String(calc.length))
      .replace('{W}', String(calc.width))
      .replace('{H}', String(calc.height))
      .replace('{kg}', fmt(calc.weight, calc.weight % 1 ? 1 : 0))
      .replace('{m3}', fmt(vol, 3))
      .replace('{d}', String(Math.round(dens)))
      .replace('{cat}', t.calculator.categories[catIndex] ?? calc.category)
      .replace('{type}', t.calculator.deliveryTypes[typeIndex] ?? calc.deliveryType)
    try {
      void navigator.clipboard?.writeText(text).catch(() => {})
    } catch {
      /* clipboard unavailable — the user still lands in Telegram */
    }
    setToast(true)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(false), 3000)
    audio.click(1200)
  }

  const numField = (key: 'length' | 'width' | 'height', label: string) => (
    <div>
      <label htmlFor={`calc-${key}`} className={labelCls}>
        {label}
      </label>
      <input
        id={`calc-${key}`}
        type="number"
        inputMode="numeric"
        min={CALC_LIMITS.dimMin}
        max={CALC_LIMITS.dimMax}
        step={1}
        value={str[key]}
        onChange={(e) => onNum(key, e.target.value)}
        aria-invalid={invalid[key] || undefined}
        aria-describedby={showInvalid ? 'calc-error' : undefined}
        className={`${inputBase} ${invalid[key] ? inputBad : inputOk}`}
      />
    </div>
  )

  return (
    <StageSection id="calculator" labelledBy="calc-h2" holdFrom={0.1} holdTo={0.95} fadeIn={0.1}>
      <div className="absolute inset-x-[var(--gutter)] top-[calc(var(--header-h)+8px)] bottom-[calc(12px+var(--safe-b))] flex items-end md:items-center md:justify-end">
        <div
          ref={panel}
          data-lenis-prevent
          className="glass interactive w-full overflow-auto overscroll-contain rounded-2xl p-5 md:w-[min(460px,42vw)] md:p-7"
          style={{ maxHeight: 'calc(100dvh - var(--header-h) - 24px)' }}
        >
          <p className="hud mb-3 text-[10px] text-orange">{COMPANY.route}</p>
          <h2 id="calc-h2" className="font-display text-[clamp(24px,2.4vw,34px)] font-bold uppercase leading-[0.95] tracking-[-0.01em] text-bone">
            {t.calculator.h2}
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-bone/65">{t.calculator.p}</p>

          <form onSubmit={onSubmit} noValidate className="mt-5 space-y-4">
            <div>
              <label htmlFor="calc-weight" className={labelCls}>
                {t.calculator.weight}
              </label>
              <input
                id="calc-weight"
                type="number"
                inputMode="decimal"
                min={CALC_LIMITS.weightMin}
                max={CALC_LIMITS.weightMax}
                step={0.1}
                value={str.weight}
                onChange={(e) => onNum('weight', e.target.value)}
                aria-invalid={invalid.weight || undefined}
                aria-describedby={showInvalid ? 'calc-error' : undefined}
                className={`${inputBase} ${invalid.weight ? inputBad : inputOk}`}
              />
            </div>
            <fieldset>
              <legend className={labelCls}>{t.calculator.dims}</legend>
              <div className="grid grid-cols-3 gap-2">
                {numField('length', t.calculator.length)}
                {numField('width', t.calculator.width)}
                {numField('height', t.calculator.height)}
              </div>
            </fieldset>
            <div>
              <label htmlFor="calc-category" className={labelCls}>
                {t.calculator.category}
              </label>
              <select
                id="calc-category"
                value={calc.category}
                onChange={(e) =>
                  set({
                    category: e.target.value as Category,
                    calculated: false,
                  })
                }
                className={`${inputBase} ${inputOk} appearance-none pr-9`}
                style={{
                  backgroundImage: CHEVRON,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 14px center',
                  backgroundSize: '12px 8px',
                }}
              >
                {CATEGORIES.map((c, i) => (
                  <option key={c} value={c}>
                    {t.calculator.categories[i]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p id="calc-type-label" className={labelCls}>
                {t.calculator.deliveryType}
              </p>
              <div role="radiogroup" aria-labelledby="calc-type-label" className="grid grid-cols-3 gap-1 rounded-full bg-bone/6 p-1">
                {DELIVERY.map((d, i) => {
                  const active = calc.deliveryType === d
                  return (
                    <button
                      key={d}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => {
                        set({ deliveryType: d, calculated: false })
                        audio.click(1600)
                      }}
                      className={`h-10 rounded-full text-[12px] font-semibold uppercase tracking-[0.1em] transition-[background-color,color] duration-300 ${
                        active ? 'bg-orange text-graphite' : 'text-bone/70 hover:text-bone'
                      }`}
                    >
                      {t.calculator.deliveryTypes[i]}
                    </button>
                  )
                })}
              </div>
            </div>
            {showInvalid ? (
              <p id="calc-error" role="alert" className="text-[13px] leading-snug text-red-400">
                {t.calculator.invalid}
              </p>
            ) : null}
            <MagneticButton type="submit" className="w-full">
              {t.calculator.submit}
            </MagneticButton>
          </form>

          {calc.calculated && valid ? (
            <div className="mt-5 border-t border-bone/10 pt-5" aria-live="polite">
              <p className="hud mb-3 text-[10px] text-bone/55">{t.calculator.result}</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <dt className="text-[12px] text-bone/55">{t.calculator.volume}</dt>
                  <dd className="font-display tnum text-[22px] font-bold text-bone">
                    {fmt(vol, 3)} <span className="text-[13px] font-semibold text-bone/55">{t.calculator.m3}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-[12px] text-bone/55">{t.calculator.density}</dt>
                  <dd className="font-display tnum text-[22px] font-bold text-bone">
                    {Math.round(dens)} <span className="text-[13px] font-semibold text-bone/55">{t.calculator.kgm3}</span>
                  </dd>
                </div>
                {calc.deliveryType === 'air' ? (
                  <div className="col-span-2">
                    <dt className="text-[12px] text-bone/55">{t.calculator.volumetric}</dt>
                    <dd className="font-display tnum text-[22px] font-bold text-orange">
                      {fmt(volW, 1)} <span className="text-[13px] font-semibold text-bone/55">{t.calculator.kg}</span>
                    </dd>
                  </div>
                ) : (
                  <p className="col-span-2 text-[13px] leading-snug text-bone/70">{t.calculator.tariffHint}</p>
                )}
              </dl>
              <p className="mt-4 text-[13px] leading-relaxed text-bone/60">{t.calculator.note}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <MagneticButton href={COMPANY.telegramHref} external onClick={onCta}>
                  <TelegramIcon />
                  {t.calculator.cta}
                </MagneticButton>
                <MagneticButton variant="ghost" href={COMPANY.phoneHref}>
                  {t.nav.call}
                </MagneticButton>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {/* clipboard toast */}
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none absolute left-1/2 top-[calc(var(--header-h)+16px)] z-20 -translate-x-1/2 rounded-full bg-bone px-4 py-2 text-[13px] font-semibold text-graphite shadow-[0_10px_30px_rgba(0,0,0,0.4)] transition-[opacity,transform] duration-300 ease-[var(--ease-out-expo)] ${
          toast ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
        }`}
      >
        {toast ? t.calculator.copied : ''}
      </div>
    </StageSection>
  )
}
