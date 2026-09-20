# TUJJOR EXPRESS CHIRCHIQ — Immersive 3D Web Experience
## Design Bible v2 — implementation contract

v1 прошёл через трёх независимых критиков (feasibility / story / performance-mobile-a11y) и completeness-проверку.
v2 включает все подтверждённые исправления. Каждое число здесь — канон. Код обязан совпадать с документом
(`scripts/check-camera.mts` проверяет непрерывность камеры на всех границах без cut).

---

## 1. CREATIVE DIRECTION

### 1.1 Концепция — «ONE BOX. ONE LINE.»
Весь сайт — одна непрерывная линия маршрута Китай → Чирчик и одна коробка, которая по ней движется.
Скролл = время в пути. Камера = взгляд экспедитора, который **никогда не теряет груз из виду**
(правило непрерывности груза, §2.0).

Три визуальных регистра:

| Регистр | Где | Ощущение |
|---|---|---|
| **INDUSTRIAL** | Склад, конвейер, контейнер | Тёплый графит, натриевые лампы, картон/сталь/бетон, пыль в лучах |
| **ORBITAL** | Глобус → карта, туннель | Тёмно-синий космос + оранжевая энергия маршрута, техно-HUD |
| **STUDIO** | Узбекистан → финал | Product-свет как у Apple: белый рассеянный, мягкие тени, оранжевый rim |

### 1.2 Палитра
```
Graphite      #0B0C0F   фон (никогда чистый чёрный кроме blackout)
Graphite-2    #15171C   панели
Ink           #1E2129   ТОЛЬКО декоративные линии (никогда текст)
Bone          #F2EFE9   основной текст, белые объекты
Cardboard     #C89A63   картон
Tujjor Orange #FF6A00   ЕДИНСТВЕННЫЙ акцент: луч, маршрут, CTA, свечение (≤ 8% площади кадра)
Orange-glow   #FF8A2A   bloom-цвет
Sky-Ink       #0A1220   фон орбитального регистра
Uz-Sand       #E8DCC4   земля Узбекистана
```
Контраст: текст на оранжевом — всегда Graphite (≈6.8:1). Оранжевый как текст — только на Graphite. Focus ring: 2px Orange, offset 3px.

### 1.3 Типографика
- Display (латиница, 3D + HTML): **Space Grotesk 700**.
- Text (кириллица, HTML): **Inter** 400/600/800. HUD: Inter 600, tracking .14em, uppercase, tabular-nums.
- 3D Text (troika): `/fonts/space-grotesk-700.woff` — только ASCII + `°·` (без `→`);
  `/fonts/inter-cyrillic-800.woff` — только кириллические буквы и пробел (subset без цифр). Всё остальное в 3D — через `<Html>`.
  Латинские 3D-слова: CHINA · WAREHOUSE · IN TRANSIT · UZBEKISTAN · TASHKENT REGION · CHIRCHIQ. Кириллические 3D: ДАЛЕКО · БЫСТРО · ПОД КОНТРОЛЕМ.

### 1.4 Tone of voice / честность
Коротко, уверенно, без «мы лучшие» и без цифр, которых нет. Никаких SLA («за 5 минут»), лет, клиентов, стран.
Все услуги / площадки / типы доставки читаются из `config/company.ts` и подтверждаются клиентом до запуска.
Все числа на экране — вычисленные (расстояние great-circle, объём, плотность), не выдуманные.

---

## 2. STORYBOARD 0% → 100%

`SCROLL_HEIGHT_VH = 1600` (путь 1500lvh). `p = clamp(scrollY / (spacer.offsetHeight − LVH), 0, 1)`,
где LVH = высота layout-viewport (`100lvh`), измеряется probe-элементом, обновляется только на orientationchange или resize с |Δ| > 150px.
Footer — обычный поток после spacer, вне таймлайна.

### 2.0 Правило непрерывности груза
Коробка на экране (или её мини-версия) на каждом кадре истории:
паллета (Hero) → погрузчик → паллета на ленте (Conveyor) → контейнер → **mini-box** как cargo-индикатор на дуге (Globe) →
**cargo comet** — mini-box на 7 u впереди камеры (Tunnel) → mini-box по маршруту до маркера Чирчика (Uzbekistan) →
перегрузка контейнер → фургон в первом кадре Delivery → коробка выезжает из боковой двери → **match-cut** → студийная коробка.

### 00 — CINEMATIC INTRO (по времени, 1.6 s; скролл игнорируется; любой wheel/touch/key/click завершает мгновенно)
| t (s) | Кадр |
|---|---|
| 0.00 | Графитовая темнота (тот же цвет, что финал прелоадера). Свет всего рига = 0. |
| 0.10–0.45 | Оранжевый луч (plane 30×0.02, additive, bloom) проходит слева направо под −12°, освещая пыль. |
| 0.35–1.05 | Свет рига поднимается 0 → 1 (expo.out): коробка проявляется на паллете. Камера z 4.5 → 3.6, fov 32. |
| 0.80–1.35 | Коробка поворачивается на +35° по Y (expo.out). Сетка-пол и первые частицы. |
| 1.05 | HTML: `ИЗ КИТАЯ — В ВАШИ РУКИ` (split-letters stagger). |
| 1.35–1.60 | Риг забирает камеру (λ=5) и перестраивает в Hero t=0. Intro-текст растворяется, Hero-заголовок/CTA появляются. |
Пропуск: `prefers-reduced-motion`, `?motion=off`, повторный заход (`sessionStorage.tj_intro`), внутренние страницы.

### 01 — HERO `p .000–.070` · world A · INDUSTRIAL-dark
- Коробка **на паллете** в точке приёмки (паллета в кадре с t=0, ловит rim-свет). Коробка парит на y=0.9 и «дышит» (sin 0.4Hz ±0.03); t .85–1.00 опускается на паллету (y 0.9 → 0.375, power2.out), дыхание → 0.
- Вокруг: shader-сетка пола, 3–5 тонких оранжевых дуг (alpha .25), частицы 600/150, 3D-пины на сетке, 3 тёмных контейнера вдали (остаются как loading dock).
- Параллакс камеры от курсора ±0.35 u.
- HTML: `Доставляем / Китай / ближе.` · подзаголовок · CTA «Рассчитать доставку» (`scrollToStage('calculator')`) · «Написать в Telegram» · «SCROLL ↓».
- Камера: t0 `pos(0,1.4,4.2) tgt(0,0.9,0) fov34` → t1 `pos(−1.2,2.4,7.5) tgt(0,0.6,0) fov40`.

### 02 — WAREHOUSE `p .070–.170` · world A
- t 0–.12: дуги/пины Hero гаснут, 8 ламп включаются по очереди (flicker 60ms). Открывается склад: 6 рядов стеллажей (instanced), ~600/240 коробок (instanced, 3 размера, 4 оттенка), паллеты, 2/1 погрузчика (один едет), таблички-указатели, пыль в конусах ламп (Particles), spatial text `CHINA` / `WAREHOUSE` (h=3) между рядами.
- Погрузчик подъезжает (t .35), поднимает паллету с коробкой (t .55), везёт к ленте, **ставит паллету на ленту в x=4** (t .95–1.00).
- Floating HUD (`<Html>`, привязаны к точкам): `ГРУЗ ПРИНЯТ` (t .15) · `ПРОВЕРЕН` (t .50). (Два следующих штампа — на конвейере, §03.)
- HTML: «Склад в Китае» + 3 строки.
- Камера: t0 = Hero t1 → t.5 `pos(6,6,14) tgt(3,1,2) fov45` → t1 `pos(3.5,1.8,6) tgt(4,0.8,0) fov40`.

### 03 — CONVEYOR `p .170–.260` · world A
- Лента x 4 → 36 (ролики instanced до x=35.8, лента с UV-scroll от velocity), рамы, весы x=9 (проп), сканер-арка x=14 (scan-shader проходит по коробке), робот-манипулятор x=22 (3 сустава, переставляет соседние коробки), станции-стойки с табличками.
- Паллета с коробкой едет: x = 4 + 30t.
- Станции (`<Html>` + 3D-стойка): `ПРИЁМ ТОВАРА` x=6 · `ПРОВЕРКА` x=14 · `КОНСОЛИДАЦИЯ` x=18 (+ HUD-штамп `КОНСОЛИДИРОВАН`) · `ПОДГОТОВКА` x=22 · `ОТПРАВКА` x=30 (+ штамп `ГОТОВ К ОТПРАВКЕ`).
- Камера: t0 = Warehouse t1 → t.36 `pos(15,3.2,−1.5) tgt(15.5,0.9,0) fov42` (перелёт) → t.66 `pos(23.6,1.05,2.4) tgt(24,0.95,0) fov36` (низкий dolly, DoF) → t1 `pos(33,1.6,3.5) tgt(36,0.9,0) fov38`.

### 04 — CONTAINER `p .260–.320` · world A → BLACKOUT
- Контейнер 40ft x 36..48, ширина 2.4, рифлёные стены (corrugated normal), оранжевый, `TUJJOR EXPRESS`, номер `TJEU 447120 3`, замки, роликовый пол внутри.
- t 0–.45: паллета с коробкой въезжает (x 34 → 39.5). Камера заходит **за** коробку.
- t .45–.80: камера разворачивается к дверям; коробка — силуэт на переднем плане против сужающейся щели; створки закрываются (hinge 0 → −165°).
- Cut в конце стадии (p=.320). Маска: `maskOpacity` — ramp .312→.316, hold 100% .316–.324, dissolve .324–.332 (единый закон для всех cut, §3.4).
- HTML: HUD-строка «Консолидация → контейнер → маршрут» + телефон/Telegram (ни одна стадия не остаётся без CTA).
- Камера: t0 = Conveyor t1 → t.15 `pos(34.5,1.5,1.6) tgt(37,0.9,0) fov38` → t.45 `pos(41.5,1.5,0.6) tgt(39,0.9,0) fov38` → t.80 `pos(41.5,1.5,0.6) tgt(36,1.3,0) fov38` → t1 = t.80. Portrait: `fov` (без отъезда).

### 05 — GLOBE `p .320–.420` · world B · ORBITAL
- **DoorMask** (camera-space, две чёрные плоскости у near-plane, `CameraMasks`) раскрываются t 0–.20 — «двери открылись, но мы уже в космосе».
- Глобус r=8 в локальном origin. Начальный поворот: 30°N/100°E смотрит в камеру (Китай в нижней левой трети, Узбекистан у западного лимба) — мёртвого кадра над Тихим океаном нет.
- Land = точки, семплированные из растеризованного TopoJSON (offscreen canvas 2048×1024, O(1)/точка; 14k / 5k), атмосфера (fresnel), графитовый океан, graticule 15°. Китай — заливка/контур, Узбекистан — заливка + mapPulse.
- Маршрут «дорожной грамматики»: Guangzhou (23.13N,113.26E) → Khorgos (44.2N,80.4E) → Almaty (43.24N,76.9E) → Shymkent (42.3N,69.6E) → Tashkent (41.31N,69.28E) → Chirchiq (41.47N,69.58E); дуга great-circle между вейпоинтами, подъём ≤ 1.08r, routeGlow shader. **Mini-box** (0.25 u, тот же картон) едет по маршруту с trail и `<Html>` `CARGO · IN TRANSIT`. Дуга строится с t .12.
- Подписи: `CHINA` `UZBEKISTAN` `CHIRCHIQ` (Text billboard); `DISTANCE ≈ 4 500 km` (great-circle Guangzhou→Chirchiq = 4 528 km, вычисляется, округляется до 100).
- **Globe → flat map morph** t .65–.85: все геометрии глобуса (точки, tube маршрута, заливки, graticule, индикатор, метки) несут `aPosFlat` и используют общие uniform `uMorph`/`uRotY`; вращение глобуса — только через `uRotY` в шейдере, не через group.rotation. Frame карты: XZ-плоскость y=0, `x = r·lon·π/180`, `z = −r·lat·π/180` (50.3 × 25.1 u). Точка Чирчика на карте **M = (9.71, 0, −5.79)**.
- t .85–1.00: камера сдвигается над M и смотрит строго вниз; у M — оранжевое кольцо-портал r=6 (точки карты в радиусе 6 от M убраны — «дыра»).
- HTML: «Международный маршрут Китай → Узбекистан» · Таможенное оформление · Контроль на каждом этапе · Статус в Telegram · телефон.
- Камера: t0 `pos(0,3,26) tgt(0,0,0) fov40` → t.6 `pos(−14,9,18) tgt(−2,3,0) fov38` → t.85 `pos(0,30,4) tgt(0,0,0) fov50 up(0,0,−1)` → t1 `pos(9.71,30,−5.79) tgt(9.71,−200,−5.79) fov50 up(0,0,−1)`.

### 06 — SPEED TUNNEL `p .420–.490` · world B (child group в M, rotation [−π/2,0,0]: локальный −Z = мировой −Y)
- Непрерывный переход (без cut): камера падает сквозь портал в карте. Туннель: цилиндр r=6, локальный z 0..−150 (мир y 0..−150), shader (radial lines + noise, скорость от velocity), 400/140 light-streaks (instanced), частицы, **cargo comet** — mini-box на 7 u ниже камеры, bobbing ±0.2, оранжевый trail. HUD-числа (Text, статичные после mount, ≤12 объектов, только Ultra/High): координаты, семплированные из реального маршрута, cargo ID `TJ-2381-CN`.
- Слова (Cyrillic Text h=2.4, стены на глубине, камера пролетает сквозь): `ДАЛЕКО` y=−8 (t≈.22) · `БЫСТРО` y=−55 (t≈.49) · `ПОД КОНТРОЛЕМ` y=−100 (t≈.74) — проблема → решение → контроль.
- Post: bloom ×1.6 (fxLive.bloomMul), **RadialBlurEffect** (custom postprocessing Effect, 8 samples, uStrength от |velocity|, только Ultra/High, включён только в туннеле).
- t .90: эмиссивный торцевой диск y=−152 засвечивает кадр; Flash-маска по закону `maskOpacity(p, .490)`; cut в мир C.
- Камера: `pos(9.71, 30 − 175t, −5.79) tgt(9.71, −200, −5.79) up(0,0,−1)`, fov 50→75 (t 0–.3), roll = 2°·sin(3t). Portrait: `fov`. t0 = Globe t1 ✓.

### 07 — UZBEKISTAN `p .490–.580` · world C · STUDIO-warm
- Проекция: **Чирчик = локальный origin**: `x = (lon − 69.58)·cos(41.47°)·S`, `z = −(lat − 41.47)·S`, `S = 1.3`. Центроид страны ≈ (−5.9, 0, 0.1).
- Из вспышки: `<Lightformer>`-блик на том же месте экрана в t 0–.06 (глаз читает «вышли на дневной свет»). Полигон страны (world-atlas 860) экструдирован h=0.6 в песочный материал; соседи — плоские тёмные силуэты; границы — светлые линии. Ташкентская область приподнята +0.25, подсвечена; city-blocks (instanced): Ташкент — крупное пятно, Чирчик — компактное у origin.
- **Mini-box** едет по оранжевой линии маршрута от восточной границы (Шымкент → Ташкент → Чирчик) t 0–.5, прибывает к маркеру (пин + пульс-кольцо + `<Html>` `TUJJOR EXPRESS · CHIRCHIQ`).
- Подписи Text: `TASHKENT REGION` ↓ `CHIRCHIQ`.
- **Nested-scale reveal** t .80–1.00: DeliveryScene (его корневая группа в origin) масштабируется 0.02 → 1.0 (expo.inOut); страна/соседи/область гаснут (opacity 1 → 0, y −2); кольцо маркера растёт и становится площадкой перед офисом. Без overlay.
- HTML: «Прибытие в Узбекистан» · Ташкентская область, Чирчик · телефон · Telegram.
- Камера: t0 `pos(−4,40,16) tgt(−5,0,0) fov45` → t.5 `pos(4,12,8) tgt(0,0,0) fov42` → t.8 `pos(2.5,5,4.5) tgt(0,0.3,0) fov40` → t1 `pos(11,2,13) tgt(15,0.6,8) fov40`.

### 08 — DELIVERY `p .580–.680` · world C (scale 1 = 1 м)
- Двор Tujjor у начала сплайна: **тот же оранжевый контейнер `TJEU 447120 3`** с открытыми дверями, фургон бортом с открытой боковой дверью. t 0–.10: коробка переезжает контейнер → фургон, дверь закрывается, фургон трогается.
- Фургон (процедурный): белый кузов, оранжевый пояс и кант крыши, `TUJJOR EXPRESS` на борту (brandPlate), тёмные стёкла, диски, фары с bloom. Сплайн (CatmullRom): `(18,0,8) → (10,0,9) → (6,0,4) → (2.5,0,0.5)`; фургон едет t .10–.78, останавливается **бортом** у офиса (здание у `(0,0,−3)`, витрина светится, вывеска `TUJJOR EXPRESS`). Стилизованные кварталы (instanced), фонари.
- t .78–.90: боковая сдвижная дверь открывается, коробка выезжает на **H = (2.2, 0.6, 1.4)**, yaw 0 (лицевая грань к +Z).
- t .94–1.00: камера подъезжает к коробке до заполнения кадра лицевой гранью → **MATCH CUT** (p=.680) → студийная коробка в тех же пикселях. Bloom/vignette фиксированы на [.675,.685].
- HTML: «Последняя миля — наша» · Самовывоз в Чирчике или доставка до двери.
- Камера: t0 = Uz t1 → t.25 `pos(13,1.0,12.5) tgt(13,0.8,9) fov40` (trucking) → t.45 `pos(9,0.5,10) tgt(8,0.5,7.5) fov45` (колёса) → t.65 `pos(6,9,8) tgt(5,0.5,3) fov45` (crane) → t.78 `pos(2.5,1.3,7) tgt(2.5,1,0.5) fov40` (на фургон) → t.90 `pos(3.2,1.1,4.2) tgt(2.2,0.8,1.4) fov38` → t1 `pos(2.2,0.6,2.06) tgt(2.2,0.6,1.4) fov36` (H + 0.66 по +Z). Portrait для t1: `fov`.

### 09 — NETWORK `p .680–.760` · world D, x=0 · STUDIO
- Студийная коробка в `(0,0.6,0)`, yaw 0. Камера отъезжает от лицевой грани; вокруг раскрывается сеть: центр `TUJJOR EXPRESS`, слева площадки `1688 · Taobao · Alibaba · Pinduoduo · JD · Poizon` (6 узлов на дуге), далее `China warehouse` → `Uzbekistan` → `Chirchiq` → `Business` / `Customer`. Узлы — диски `MeshStandardMaterial{transparent, opacity .35, roughness .15}` + эмиссивное кольцо (**никакого transmission/clearcoat**), Text-подписи; связи — линии с бегущими точками (routeGlow, медленнее).
- Hover (raycaster layer 1; события включены только на интерактивных стадиях): камера смещается на 0.4 к узлу, узел и линии подсвечиваются, остальное приглушено. Click/tap: `<Html style={{pointerEvents:'auto'}}>`-карточка. Дубль в DOM: NetworkCopy содержит те же узлы как `<button>` (доступно с клавиатуры).
- **Оранжевая линия-пол** (0.03 wide, emissive) от узла-центра до подиума финала (x 0 → 80, y .005) — «ONE LINE» физически в кадре на всех студийных дрейфах.
- HTML: «Для бизнеса и для себя» + CTA «Для бизнеса».
- Камера: t0 `pos(0,0.6,0.66) tgt(0,0.6,0) fov36` (portrait `fov`) → t.3 `pos(0,3,16) tgt(0,0.5,0) fov42` → t1 `pos(12,3.5,12) tgt(14,1,0) fov40`.

### 10 — BOX EXPLODED `p .760–.830` · world D, x=20
- Коробка ×2 на подиуме (ContactShadows `frames=Infinity` `resolution=256`, монтируется только in-range). t 0–.2 поворот 90°. t .2–.55 **exploded view**: крышка-створки вверх, 4 панели наружу, внутри 6 парящих пластин с `<Html>`: `Контроль · Консолидация · Поддержка · Доставка · Прозрачность · Надёжность`. Камера облетает 60°. t .55–.85 сборка. t .85–1 отъезд к следующей станции.
- HTML: «Что внутри каждой доставки» + список (SEO).
- Камера: t0 = Network t1 → t.5 `pos(27,4,10) tgt(20,1.2,0) fov38` → t1 `pos(32,3,10) tgt(36,1,0) fov40`.

### 11 — CALCULATOR `p .830–.900` · world D, x=40 · `holdAfter .3`
- Терминал: слева 3D — коробка, пропорции которой следуют габаритам (L×W×H), «оседание» — весу; над ней мини-иконка категории (примитивы: смартфон, футболка, кроссовок, шестерня, чайник, куб). Справа HTML-панель (`.glass`, `data-lenis-prevent`, `position:sticky`, `max-height: calc(100dvh − header)`, `overflow:auto`, inputs ≥16px, `inputmode="decimal"`).
- Пока в панели фокус — `formLock`: Lenis stop, p заморожен, камера держит позу (`holdAfter`).
- Поля: Вес кг · Габариты см ×3 · Категория · Тип доставки (Авто / Авиа / Ж/Д) · «Рассчитать».
- Результат (честная математика): Объём м³ = L·W·H/1e6 · Плотность кг/м³ · **Объёмный вес (/6000) только при Авиа**; для Авто/ЖД: «Ориентир для тарифа: по весу или по объёму — подтвердим в Telegram». Камера push-in (`bumpCamera`). CTA «Получить точный расчёт» (копирует параметры в буфер → Telegram) · «Позвонить». Цен нет.
- Камера: t0 = Exploded t1 → t.3 `pos(37,2.5,9) tgt(39.5,1,0) fov40` (hold) → t1 `pos(48,2.5,9) tgt(52,1,0) fov40`.

### 12 — TRACKING `p .900–.965` · world D, x=60 · `holdAfter .3`
- 3D-линия маршрута с 7 узлами-станциями (`<Html>`: `Received in China / Принят` … `Ready for pickup / Готов к выдаче`), mini-box на текущей станции; если статус неизвестен — пульс ожидания.
- HTML: поле «Введите трек-номер» → `GET /api/track/[code]` (заглушка, типизированный контракт `TrackingResult`; сейчас `{found:false}` → «Отслеживание подключается. Напишите трек-номер в Telegram»). Кнопка «Показать пример» (бейдж DEMO) прогоняет mini-box по линии.
- Камера: t0 = Calculator t1 → t.3 `pos(57,3,9) tgt(60,0.6,0) fov40` (hold) → t1 `pos(68,3,8.5) tgt(72,0.8,0) fov38`.

### 13 — FINAL `p .965–1.000` · world D, x=80
- Камера останавливается (t .3). Коробка опускается сверху (y 4 → 0.6, expo.out, `thud`), t .35 крышка открывается, изнутри оранжевое свечение (эмиссивное ядро + `lightRig.points[0]` + volumetric cone shader + восходящие частицы), bloom ×1.2.
- HTML: `Китай ближе, / чем кажется.` → `TUJJOR EXPRESS` → «Отправьте свой первый груз» → CTA: Рассчитать · Telegram · Позвонить. Далее footer (обычный поток).
- Камера: t0 = Tracking t1 → t.3 `pos(80,2.2,7.5) tgt(80,0.9,0) fov36` → t1 `pos(80,1.6,5.2) tgt(80,0.9,0) fov34`.

---

## 3. CAMERA CHOREOGRAPHY

1. **Один риг** (`CameraRig`) — единственный владелец камеры. Сцены экспортируют чистую `cameraAt(t, ctx)` в локальном пространстве мира (файл `<Scene>.camera.ts`, без импортов three-компонентов).
2. **Damping** λ=4.5 desktop / 6 mobile; целевая поза мгновенна из прогресса. На mobile `pd = p` (без второго сглаживания — нативный momentum уже плавный).
3. **Границы**: `cameraAt_N(1) === cameraAt_{N+1}(0)` (позиция/цель |Δ| < 1e-3, fov равен) на каждой границе без `cutAtEnd`; проверяется скриптом. Дополнительный crossfade ±0.004 p **кроме** границ с cut.
4. **Cuts** (3): p=.320 blackout, p=.490 flash, p=.680 match-cut. Единый закон маски `maskOpacity(p, cut)`: ramp [c−.008, c−.004], hold 100% [c−.004, c+.004], dissolve [c+.004, c+.012]. Риг телепортируется при пересечении c. Маска остаётся 100%, пока мир назначения не `readyWorlds` (cutGate).
5. **`up`** — часть CameraPose (нужен для взгляда строго вниз: globe t≥.85, tunnel).
6. **Portrait**: `pose.portrait: 'dolly' | 'fov'`. `dolly` — отъезд на `stage.portraitScale` по направлению взгляда (subject distance = дистанция до target), fov +10, target −0.3. `fov` — только fov +10 (закрытые пространства: container, tunnel, delivery t1, network t0 — так match-cut совпадает и в портрете).
7. **Параллакс** только там, где камера «стоит» (STAGES.parallax); 0 на touch и при motionOff.
8. **Reduced motion** (`motionOff`): камера держит `cameraAt(0.5)` каждой стадии и медленно (λ 2.5) переезжает на границе; параллакс 0; все `uTime` заморожены; overlays только fade.
9. **Никогда в пустоту**: у каждого keyframe target на объекте; QA-скриншоты каждые 4% p (26 кадров) + 3 портретных.

---

## 4. ПЕРЕЧЕНЬ 3D-СЦЕН

| # | Компонент | World / local X | p | Ключевые объекты |
|---|---|---|---|---|
| 1 | `HeroScene` | A | .000–.070 | TujjorBox+Pallet, GridFloor, RouteLines, Particles, Pins, far Containers |
| 2 | `WarehouseScene` | A | .070–.170 | Shelves/Boxes (inst), Pallets, Forklift, Lamps+cones, Dust, Signs, Text CHINA/WAREHOUSE, HUD×2 |
| 3 | `ConveyorScene` | A | .170–.260 | Conveyor (rollers inst, belt shader), ScannerArch (scan), SorterRobot, Scale, Stations×5, HUD×2 |
| 4 | `ContainerScene` | A | .260–.320 | Container (corrugated), Doors, roller floor, inner light |
| 5 | `GlobeScene` | B | .320–.420 | Globe points (morph), Atmosphere, Graticule, fills, RouteArc (glow), MiniBox indicator, Labels, Portal ring |
| 6 | `TunnelScene` | B, child at M rot[−π/2,0,0] | .420–.490 | TunnelShell (shader), LightStreaks (inst), Particles, HUD numbers, Words×3, CargoComet, EndCap |
| 7 | `UzbekistanScene` | C | .490–.580 | CountryExtrude, Neighbors, RegionRaise, CityBlocks (inst), RouteLine, MiniBox, Marker, Labels |
| 8 | `DeliveryScene` | C (scale 0.02→1 during Uz t.8–1) | .580–.680 | Yard+Container, Truck, RoadSpline, Buildings (inst), Office, Streetlights, Handoff box |
| 9 | `NetworkScene` | D x=0 | .680–.760 | CenterBox, Nodes×11, Links (glow), floor line, InfoCards |
| 10 | `BoxExplodedScene` | D x=20 | .760–.830 | BigBox (panels), Podium, AdvantagePlates×6 |
| 11 | `CalculatorScene` | D x=40 | .830–.900 | ParamBox (reactive), CategoryIcon×6, TerminalFrame |
| 12 | `TrackingScene` | D x=60 | .900–.965 | RoutePath, StationNodes×7, MiniBox, Pulse |
| 13 | `FinalScene` | D x=80 | .965–1.000 | Box (lid), Podium, InnerGlow (volumetric), RisingParticles |
| — | `InnerPageScene` | E | внутренние страницы | Box idle + particles + grid |
| — | `PageTransitionScene`, `CameraMasks` | camera-space | по событию / p | Box sweep; DoorMask |
| — | `IntroSequence` | A | по времени | Beam, light ramp |

---

## 5. ASSET LIST (всё процедурно, кроме географии и шрифтов)

| Asset | Источник |
|---|---|
| Cardboard map/normal/roughness (3 варианта: бренд / стрелки / plain; 1024² / 512² mobile) | `lib/textures.ts` CanvasTexture |
| Concrete floor, corrugated container normal, brand plates, labels, glow sprite | `lib/textures.ts` |
| World geometry | `world-atlas@2 countries-110m.json` (108 KB) + `topojson-client`; land points через растеризацию |
| 3D fonts | `@fontsource` → `/public/fonts/*.woff` (см. §1.3 ограничения глифов) |
| UI fonts | `@fontsource/inter`, `@fontsource/space-grotesk` (self-hosted) |
| Environment | drei `<Environment frames={1}>` + `<Lightformer>` (studio, без HDR/CDN) |
| Sound | WebAudio-синтез (`lib/audio.ts`): hum, whoosh, click, thud — 0 файлов; только после «Sound ON» |
| Models | Процедурные: box, pallet, shelf, forklift, lamp, conveyor, scanner, robot, container, truck, office, buildings, icons, podium |
| GLB pipeline | `lib/loaders.ts` (DRACO `/draco`, Meshopt, KTX2 `/basis`), `npm run optimize:glb` — готов для будущих ассетов |
| OG image | `app/opengraph-image.tsx` (ImageResponse + Inter woff) |

Материалы: без `transmission` / `MeshTransmissionMaterial` / `clearcoat` / refraction. «Стекло» = прозрачный Standard + эмиссивное кольцо.

---

## 6. SCENE TRANSITION MAP

```
INTRO ─snap─▶ HERO ─▶ WAREHOUSE ─▶ CONVEYOR ─▶ CONTAINER ══ BLACKOUT (.320) ══▶ GLOBE ─(morph, dive)─▶ TUNNEL ══ FLASH (.490) ══▶ UZBEKISTAN ─(nested scale)─▶ DELIVERY ══ MATCH CUT (.680) ══▶ NETWORK ─▶ EXPLODED ─▶ CALCULATOR ─▶ TRACKING ─▶ FINAL ─▶ footer
Inner pages: TransitionLink → LineWipe + Box sweep (camera-space) → route → reveal → InnerPageScene (world E)
```
Маски: `Blackout`, `Flash`, `MatchLine` (по p, закон §3.4), `DoorMask` (camera-space, globe t 0–.2), `Wipe` (по событию).

---

## 7. SCROLL TIMELINE (канон, `src/lib/timeline.ts`)

```ts
hero .000–.070 A · warehouse .070–.170 A · conveyor .170–.260 A · container .260–.320 A (cut)
globe .320–.420 B · tunnel .420–.490 B (cut) · uzbekistan .490–.580 C · delivery .580–.680 C (cut)
network .680–.760 D · exploded .760–.830 D · calculator .830–.900 D (hold .3) · tracking .900–.965 D (hold .3) · final .965–1.000 D
WORLD_OFFSET = { A:0, B:300, C:600, D:900, E:1500 }   STUDIO_X = { network:0, exploded:20, calculator:40, tracking:60, final:80 }
SCROLL_HEIGHT_VH = 1600
```
Каждая стадия: `parallax`, `portraitScale`, `holdAfter?`, `cutAtEnd?`, `hum`. Прогресс: `p` (Lenis) → `pd` (λ=8 desktop, = p на mobile) → stage/t → cameraAt / lights / overlays.
**Form lock**: пока `document.activeElement` внутри панели калькулятора/трекинга или pointer-down на панели — Lenis stop, `p` заморожен, overlay форсирован в 1.

---

## 8. COMPONENT ARCHITECTURE

```
src/app/
  layout.tsx            (server) <html lang="ru"> · <Providers> (client: Lenis, device, sound) · <CanvasMount/> · <Header/> · <Cursor/> · <TransitionOverlay/> · <Preloader/> · {children} · JSON-LD LocalBusiness
  page.tsx              главная: <StoryPage/> — spacer 1600lvh с in-flow sticky-секциями + <Footer/>
  services|business|tracking|contacts/page.tsx   (SEO-страницы поверх мира E, semantic HTML)
  api/track/[code]/route.ts   sitemap.ts · robots.ts · manifest.ts · opengraph-image.tsx
src/components/three/
  CanvasMount.tsx       'use client' · dynamic(() => import('./ExperienceCanvas'), { ssr:false })   ← единственный ssr:false в server-дереве
  ExperienceCanvas.tsx  один <Canvas> (fixed, 100lvh, width 100%, pointer-events none, eventSource=body, eventPrefix="client", raycaster layer 1)
  HomeScenes.tsx        миры A→B→C→D (A сразу, остальные на idle), visible ±1 стадия, compileAsync warm-up, readyWorlds, cutGate
  CameraRig.tsx · Lights.tsx (constant topology) · Effects.tsx (+RadialBlurEffect) · QualityController.tsx · IntroSequence.tsx · CameraMasks.tsx · DebugOverlay.tsx · registry.ts
  models/  TujjorBox (0.60×0.45×0.45, панели, крышка, explode, glow) · Pallet · Shelf · Forklift · IndustrialLamp · Conveyor · ScannerArch · SorterRobot · Container · Truck · Office · Building · CategoryIcons · Podium · MiniBox
  materials/ (в lib/textures.ts) · fx/ Particles · GridFloor · RouteArc · ScanBeam · LightStreaks · VolumetricCone · FloorLine
  scenes/  13 сцен (+ <Scene>.camera.ts с cameraAt + lights) · InnerPageScene · PageTransitionScene · types.ts
src/components/ui/  Header · Logo · MagneticButton · Cursor · SoundToggle · MotionToggle · LangSwitch · Preloader · TransitionOverlay · TransitionLink · Footer · MobileCtaBar · GlassPanel · HUDLabel
src/components/sections/ StoryPage · StageSection · HeroCopy … FinalCTA · CalculatorPanel · TrackingPanel · NetworkCopy
src/hooks/ useLenis · useScrollTo · useStage (useStageFrame/useInRange/useSceneReady) · useStageOverlay · useDevice · useSound · useFormLock
src/lib/ timeline · camera · lights · quality · stores · audio · textures · geo · loaders · math · easing
src/shaders/ (inline GLSL в fx/ и сценах) · src/config/ company · seo · worldB · worldC · src/translations/ ru · uz
```

**Sticky in-flow sections** (a11y + SEO): `StageSection` = `<section id={stage} aria-labelledby>` с `position:absolute; top: start·1500lvh; height: (end−start)·1500lvh + 100lvh`, внутри `position:sticky; top:0; height:100lvh`. Секция закреплена ровно на своём диапазоне p; опасити/travel — CSS-переменные из `pd`; вне диапазона `inert` + `visibility:hidden`. Текст в потоке документа, индексируется, Tab прокручивает документ к секции, а прогресс следует. Skip-links: «К калькулятору», «К отслеживанию», «Контакты».

**Контракт сцены** (`scenes/types.ts`): default component (`<group>` в локальном пространстве) + `cameraAt` + `lights` (LightPreset). Правила: `useStageFrame` (0 работы вне ±1 стадии), `<Html>` монтируется только `useInRange`, Text статичен после mount, всё тяжёлое в `useMemo` на mount, `useSceneReady(id)`; никаких источников света внутри сцены; интерактивные меши — `layers.enable(1)`; ContactShadows `frames=Infinity resolution=256` только in-range.

---

## 9. WEBGL ARCHITECTURE

- **Canvas**: `gl={{ antialias:false, powerPreference:'high-performance', toneMapping: NoToneMapping }}`, `dpr=[1, tier.dpr]`, `resize.debounce 250`, `frameloop 'always'` (→ `'never'` при `visibilitychange`). Context loss: `preventDefault` + remount `<Canvas key>` на restore, текстуры регенерируются (memo per context), intro пропускается, p сохраняется. HTML-слой полностью функционален и с чёрным canvas.
- **События**: `eventSource=document.body`, `eventPrefix='client'`; `raycaster.layers.set(1)`; `setEvents({enabled})` только на network/calculator/tracking/final; `<Html>` кликабельные — `style.pointerEvents='auto'`, `zIndexRange=[40,0]` (под header z-50).
- **Свет (constant topology)**: в корне сцены всегда 1 hemisphere + 1 directional (shadow) + 4 spot + 2 point; никогда не `visible=false`; стадии меняют интенсивности/цвета/позиции через `LightPreset` (интерполяция ±0.012 p на границах без cut; snap на cut). Environment: Lightformers, `frames=1`. Fog: один `FogExp2` на всю сессию (A .035 / B .0005 / C .02 / D .015), `scene.background` = цвет тумана; никогда `null`.
- **Warm-up**: после `readyScenes` мира — временно `visible=true`, камера в `cameraAt(0)` первой стадии, `await gl.compileAsync(scene, camera)`, восстановление, `markWorldReady`. Маска cut держится, пока мир не готов.
- **Post**: `EffectComposer multisampling={ultra/high:4, balanced:2, low:0}`; Bloom mipmap (intensity из LightPreset × fxLive.bloomMul), DoF (Ultra/High; `worldFocusDistance` = дистанция до target), RadialBlur (tunnel, Ultra/High), Noise .35 soft-light, Vignette, ToneMapping ACES, SMAA только Ultra. Без chromatic aberration.
- **Particles**: `Points` + ShaderMaterial, вся анимация в vertex shader (`uTime`), `frustumCulled=false`.
- **Text/HUD**: troika `<Text>` со self-hosted woff (ограничения глифов §1.3); кириллица — `<Html>`.
- **Scroll**: Lenis (`lerp .09`, `syncTouch:false`, `autoRaf:false`) → `scroll` store `{progress, pd, velocity}`; ScrollTrigger только для UI-микроанимаций; камера — чистая функция прогресса. `html{overscroll-behavior:none}`; `viewport-fit=cover, interactive-widget=resizes-visual`.
- **Quality**: стартовый tier — Balanced на любом iOS/Android (High только при сильном GPU + ≥6 ядер + ≥4 GB), Ultra/High на desktop; `PerformanceMonitor bounds=[0.72·refresh, 0.94·refresh] flipflops=2 ms=2000`; пауза во время preloader/intro и 3 с после каждого cut / смены tier; ≤2 понижений за сессию; ≤ start+1; изменения применяются только при |velocity| < 0.5.
- **Preloader**: гейтит fonts (20%) + мир A (сцены `ready` + compileAsync, 60%) + первый кадр (20%); минимум 0.9 с, safety-таймаут 9 с. Миры B/C/D — на idle, каждый со своим warm-up. Intro пропускается при повторном заходе.

---

## 10. PERFORMANCE STRATEGY

| Мера | Реализация |
|---|---|
| Один WebGL-контекст | persistent Canvas в layout; сцены не размонтируются; visible ±1 стадия |
| Draw calls / GPU time | instancing (коробки, стеллажи, ролики, кварталы, streaks); бюджет ≤ 250 calls и **≤ 8 ms GPU на Balanced (Adreno 610 / Mali-G52)** через `?debug=1` |
| Main thread | `useFrame` ранний return вне ±1; `<Html>` только in-range; Text статичен; overlays — style-запись без React; бюджет ≤ 4 ms JS/кадр |
| Shader compile | constant light topology + один fog + `compileAsync` на мир до появления в кадре |
| Geometry/Textures | `useMemo`; процедурные текстуры 1024² (512² mobile), mipmaps, anisotropy по tier |
| Shadows | 1 shadow map (2048/1024/512/off) + ContactShadows 256² |
| Post | bloom mipmap; DoF/RadialBlur/SMAA только Ultra/High; multisampling по tier |
| DPR | adaptive по tier, смена только при покое скролла |
| Code splitting | `CanvasMount` (ssr:false) → сцены чанками по мирам (`world-a…d`), A гейтит прелоадер, B/C/D idle |
| Бюджет загрузки | initial JS ≤ 450 KB gz (three+r3f+drei-core+postprocessing+gsap+lenis), мир A ≤ 120 KB, world-atlas в чанке B; LCP — HTML hero-текст ≤ 2.5 s; первый кадр ≤ 4 s на 4G/mid-range |
| Tab hidden | frameloop never |
| Мониторинг | `?debug=1`: fps, calls, tris, tier, dpr, stage/t |

---

## 11. MOBILE DEGRADATION STRATEGY

| Аспект | Desktop Ultra | Mobile Balanced / Low |
|---|---|---|
| DPR | ≤2 | ≤1.25 / 1 |
| Particles | 100% | 30% / 15% |
| Instanced density | 1.0 | 0.5 / 0.35 |
| Shadows | 2048 | 512 / off |
| DoF / RadialBlur / SMAA | on | off |
| Bloom | full | resolutionScale .5 / off (Low) |
| Multisampling | 4 | 2 / 0 |
| Textures | 1024 | 512 |
| Camera | keyframe | portrait: `dolly ×portraitScale` / `fov` per pose |
| Copy | колонки | bottom-anchored блок, safe-area, ≥16px inputs |
| Cursor | custom | off (`pointer:coarse`) |
| Parallax | mouse | нет (без гироскопа) |
| Scroll | Lenis smooth | native (`syncTouch:false`), `pd = p` |
| CTA | header | header + **MobileCtaBar** (Telegram · Позвонить · Рассчитать) при p .07–.83 |
| Intro | 1.6 s | 1.6 s, прерывается тапом |
| Network | hover | tap = select |
| Warehouse | 600 boxes, 2 forklifts, 8 lamps | 240, 1, 4 (4 spot-источника всегда; остальные лампы — эмиссивные) |
| Tunnel streaks | 400 | 140 |
| Globe points | 14k | 5k |
| Story | полная | полная (13 стадий) |

`prefers-reduced-motion` / `?motion=off` / MotionToggle → §3.8 режим.

---

## 12. COPY (ru канон — `src/translations/ru.ts`; uz — `uz.ts`)
Заголовки и тексты стадий, HUD, станции, преимущества, калькулятор, трекинг, финал, футер, внутренние страницы — в словаре.
Контакты: `+998 93 086 91 09` · `@tujjor_chirchiq` · Чирчик, Ташкентская область. Площадки: 1688 · Taobao · Alibaba · Pinduoduo · JD · Poizon.
SEO-ключи: карго Китай Узбекистан · доставка из Китая в Узбекистан · карго Чирчик · доставка Китай Чирчик · заказать товар из Китая Узбекистан · доставка 1688/Taobao/Pinduoduo Узбекистан. JSON-LD `LocalBusiness` (telephone, address Chirchiq, areaServed Uzbekistan, sameAs t.me).

## 13. Отложено (v2 → v3)
- `app/[lang]/` маршруты с `hreflang` для uz (сейчас клиентский переключатель; ru — индексируемый канон).
- Реальный tracking API (контракт готов: `TrackingResult`).
- Реальные GLB-модели через готовый DRACO/KTX2 pipeline, если понадобятся.

---

## 14. ADDENDUM — completeness pass (whole-requirement specs)

### 14.1 Sound design (`lib/audio.ts`)
- Default **OFF**. `SoundToggle` (header, 44px target) создаёт/resume AudioContext по клику, состояние в `localStorage.tj_sound`; при `motionOff` остаётся off. Автозапуск невозможен (autoplay policy) — intro на первом визите беззвучен, это осознанно.
- Слои: (1) **drone** по миру, crossfade 600 ms на смене `stage.world`: A — 46 Hz saw → LPF 240 Hz; B — 40 Hz sine + shimmer 880/1320 Hz через delay; C/D — filtered-noise «air». Интенсивность = `STAGES.hum`. (2) **velocity-layer** (conveyor/tunnel/delivery): noise → BPF 300→2400 Hz, gain ∝ |v|. (3) **one-shots** (`SOUND_EVENTS`): beam whoosh (intro), lamp tick ×8 (warehouse), scan sweep (box crosses x=14), door thud (container t .80), cut whoosh (3 cuts), calc ping, CTA hover click, node select, box thud (final).
- Master ceiling −14 dBFS; duck до 0 за 250 ms на `visibilitychange`/`blur`, restore на focus. Сцены вызывают только `sfx.play(id)`; аудио-ноды создаёт только `lib/audio.ts`.

### 14.2 UI layers & micro-interactions
- **z-ladder**: canvas 0 · drei Html 1–9 (`zIndexRange=[9,1]`) · sections 10 · MobileCtaBar 15 · story masks 20 · Header 30 (читаем поверх blackout/flash) · Wipe 35 · Preloader 40 · Cursor 50.
- **Cursor** (только `(hover:hover) and (pointer:fine)`): 6px точка (мгновенно) + 32px кольцо (damp λ=14). Состояния: `default` · `open` (кольцо 64px, orange 15%, label OPEN) · `drag` (80px, DRAG) · `explore` (96px, EXPLORE) · `hidden` (над input/textarea → нативный text-cursor). Скрывается на `mouseleave` и после 2 s без движения (fade 200 ms).
- **MagneticButton**: радиус 72px, сдвиг ≤ 10px (кнопка) / 4px (label), возврат 400 ms expo; hover — поверхность +4% + shine sweep; press — scale .97 / 60 ms; focus-visible — 2px Orange, offset 3px.
- **HUDLabel**: скобки рисуются 240 ms (stroke-dashoffset), текст fade через 120 ms, точка пульсирует 1.2 s; выход 160 ms.
- **GlassPanel**: `backdrop-filter: blur(12px)` только desktop-tier; на Balanced/Low — сплошной Graphite-2 92%. Input focus — 1px inset Orange.
- **SCROLL ↓**: скрывается при p > .02; возвращается после 6 s покоя только при p < .02; на coarse pointer — не возвращается после первого touch.

### 14.3 Routing / worlds
- `HomeScenes` и `InnerPageScene` смонтированы всегда; маршрут только переключает `visible` корней. На внутренних страницах риг игнорирует p и держит `INNER_POSE` (E: `pos(1.6,1.1,3.4) tgt(0,0.6,0) fov36`, параллакс .5, авто-дрейф ±4°/12 s).
- Переход: TransitionLink → `transitioning` → Wipe cover 0.45 s → `router.push` → на смене pathname: `lenis.scrollTo(0,{immediate})`, `lenis.resize()` → uncover 0.45 s. **Popstate** (back/forward): камера телепортируется (`snapNext`) к `cameraAt(p)` восстановленного scrollY; intro и preloader не повторяются.

### 14.4 World C — проекция и данные
- `projC(lon, lat) = [ (lon − 69.58)·cos(41.47°)·2.4, 0, −(lat − 41.47)·2.4 ]` — **Чирчик = origin**, страна ≈ 31 × 20 u, центроид ≈ (−11.2, 0, 0.2). Ташкент → (−0.54, 0, +0.38).
- Геометрия: `scripts/gen-geo.mjs` извлекает UZ/KZ/KG/TJ/TM/AF из `countries-50m.json` → `public/geo/central-asia-50m.json` (~25 KB, 584-вершинный Узбекистан). Глобус использует 110m.
- Ташкентская область: в world-atlas нет admin-1 → **стилизованный** ручной полигон (~14 точек, lon 68.6–70.9 / lat 40.7–42.6), явно помечен как стилизация в коде. Точка входа маршрута — Черняевка (69.05E, 41.37N) со стороны Шымкента.
- Камера t0: `pos(−10,40,14) tgt(−11,0,0) fov45` (заменяет §07 t0; остальные keyframes §07 без изменений).

### 14.5 Tier `none` (нет WebGL2 / `saveData` / `prefers-reduced-data` / Canvas throw / `?tier=none`)
Canvas не монтируется, Preloader резолвится сразу, Lenis off; `StoryPage` рендерит те же 13 секций в обычном потоке (`min-height:100lvh`, без spacer) с CSS-фонами по регистру (A — Graphite + SVG-сетка; B — Sky-Ink + пунктирная дуга; C/D — тёплый градиент) и одной inline-SVG оранжевой линией через секции. Все CTA, калькулятор, трекинг, footer — без изменений.

### 14.6 Внутренние страницы (metadata + контент из `translations.pages`)
| Route | title | H1 | Секции |
|---|---|---|---|
| `/services` | Услуги — карго Китай → Узбекистан | Доставка из Китая в Узбекистан | 6 услуг, CTA-row |
| `/business` | Для бизнеса — карго Китай → Чирчик | Карго для бизнеса: Китай → Чирчик | 5 шагов процесса, CTA-row |
| `/tracking` | Отслеживание груза | Отслеживание груза | та же форма + 7 статусов |
| `/contacts` | Контакты | Контакты Tujjor Express Chirchiq | телефон, Telegram, город; адрес/часы/email только если non-null |
`config/company.ts`: `legalName/address/hours/email/foundedYear: null` → элемент UI не рендерится (никогда placeholder). Pre-launch: каждое non-null поле подтверждено клиентом.
API: `GET /api/track/[code]` → `{ found:true, code, status: TrackStatus, history[] } | { found:false }`; `TrackStatus = received|warehouse|consolidated|transit|uzbekistan|chirchiq|ready`.

### 14.7 Interactive exploded box (§10)
При t ∈ [.25,.55] шесть пластин интерактивны (raycaster layer 1). Hover / tap: пластина +0.15 u (damp λ=10), scale 1.06, Orange rim 100%, остальные 40%; соответствующий `<li>` в ExplodedCopy получает `aria-current` + оранжевый маркер; обратная связь: hover/focus `<li>` подсвечивает пластину (клавиатура). Карточка `<Html>` ≤ 90 символов. Пока пластина выбрана — explode-состояние держится (t clamp [.30,.55]); выход из диапазона снимает выбор; второй tap на mobile снимает.

### 14.8 Адаптация — четыре независимые оси
`tier` (GPU) · `layout` = `narrow` при `min(vw,vh) < 768` (bottom-sheet копи, compact header) · `aspect` = `portrait` (vw/vh < 1 → §3.6) / `short` (vh < 500 → копи top-left compact, fov +6, без dolly) · `input` = `coarse` при `(pointer:coarse) and (hover:none)` (курсор off, tap = select, без параллакса). Смена ориентации: ctx пересчитывается, поза догоняется дампингом (никогда snap), p сохраняется.

### 14.9 Camera types (канон = `src/lib/camera.ts`)
```ts
interface CameraPose { position: Vec3; target: Vec3; fov: number; roll?: number; up?: Vec3; focus?: number; portrait?: 'dolly' | 'fov' }
interface CameraCtx  { aspect; isPortrait; isShort; isMobile; isCoarse; offset /* world X, added by the rig */; motionOff }
finalPose = base(pd) ⊕ parallax(pointer × stage.parallax × [0.35u, 0.22u]) ⊕ hoverShift(0.4u к узлу, λ=6) ⊕ eventPush(−1.2u, decay) — все смещения = 0 на cut.
```
Позы в §2 — **локальные** (риг добавляет `WORLD_OFFSET`). Параллакс по STAGES канонический (globe .2, uzbekistan .2, tracking .3 — лёгкий).

### 14.10 Velocity
`v = clamp(lenis.velocity · 60/refresh / (0.5·VH), −1, 1)`, EMA τ=120 ms, → 0 через 150 ms без scroll-событий; на native-scroll то же из Δscroll/Δt. Эффекты: `speed = base + gain·|v|` — tunnel shell/streaks 1.0+2.0·|v|; belt 0.15+1.0·v (со знаком); routeGlow 1.0+0.5·|v|; particles 1.0+0.3·|v|. Ничто не замирает при остановке скролла.

### 14.11 Tunnel words
`ДАЛЕКО`/`БЫСТРО` fontSize 2.0 (≈8 u); `ПОД КОНТРОЛЕМ` две строки (`maxWidth 9`, `lineHeight .95`, fontSize 1.7). Baseline на +0.6 u от оси — камера проходит под словом; `depthWrite=false`; `fillOpacity` 0→1→0 на ±12 u.

### 14.12 Оранжевый — исключения из правила 8%
cut-маски (100% ≤ 0.008 p) · tunnel streaks + bloom (≤ 20%) · Final inner glow (≤ 15%). Контейнер: снаружи Orange; внутри — Graphite-2 сталь, Orange только на уплотнителях дверей и щели света; внутренний свет `#FFB070`.

### 14.13 Tone mapping & HDR
Composer владеет tone mapping: `<ToneMapping mode=ACES_FILMIC/>` последним; на Low (без composer) `gl.toneMapping = ACESFilmic`. Custom ShaderMaterial выводят линейную радиантность. Эмиссивные интенсивности (bloom threshold .85): intro beam 6.0 · route/streaks 3.0 · лампы 2.5 · final glow 4.0 · container slit 3.0 · текст/HUD/CTA ≤ 1.0.

### 14.14 Calculator mapping
Defaults 60×45×45 см, 12 кг, «Другое», «Авто». Диапазоны: габариты 1–300 см (int), вес 0.1–1000 кг (step .1). Invalid → красное кольцо + сообщение, 3D не обновляется. `size_u = clamp(cm × 0.012, 0.25, 2.6)` по оси, damp λ=8; смена категории — scale-pop 200 ms; `density = kg/m³`; оседание = y-scale × (1 − 0.06 × clamp((density − 150)/450, 0, 1)). Push-in только после валидного расчёта. Буфер: «Здравствуйте! Хочу рассчитать доставку: {L}×{W}×{H} см, {kg} кг, объём {m3} м³, плотность {d} кг/м³, категория {cat}, тип {type}.» → открыть `t.me/tujjor_chirchiq` → toast «Текст скопирован — вставьте в чат».
