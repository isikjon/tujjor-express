# TUJJOR EXPRESS CHIRCHIQ — Immersive 3D Web Experience
## Design Bible v1 (creative direction → storyboard → architecture)

Этот документ — контракт для реализации. Каждая сцена, камера, оверлей и переход
реализуются строго по этому файлу. Все числа (диапазоны прогресса, смещения миров,
позиции камеры на границах) являются каноническими.

---

## 1. CREATIVE DIRECTION

### 1.1 Концепция — «ONE BOX. ONE LINE.»
Весь сайт — это одна непрерывная линия маршрута Китай → Чирчик, и одна коробка,
которая по ней движется. Скролл = время в пути. Камера = взгляд сопровождающего
экспедитора, который никогда не теряет груз из виду.

Три визуальных «регистра», сменяющие друг друга по мере путешествия:

| Регистр | Где | Ощущение |
|---|---|---|
| **INDUSTRIAL** | Склад, конвейер, контейнер | Тёплый графит, натриевые лампы, реальные материалы (картон, сталь, бетон), пыль в лучах |
| **ORBITAL** | Глобус, туннель | Холодный тёмно-синий космос + оранжевая энергия маршрута, техно-HUD, координаты |
| **STUDIO** | Узбекистан → финал | Чистый «product» свет как у Apple: белый рассеянный, мягкие тени, оранжевый rim |

### 1.2 Палитра
```
Graphite      #0B0C0F   фон всего сайта (никогда чистый чёрный кроме blackout)
Graphite-2    #15171C   поверхности, панели
Ink           #1E2129   сетка, второстепенные линии
Bone          #F2EFE9   основной текст, белые объекты
Cardboard     #C89A63   картон (albedo), + вариации #B9885A/#D6AC78
Tujjor Orange #FF6A00   ЕДИНСТВЕННЫЙ акцент: луч, маршрут, CTA, свечение
Orange-glow   #FF8A2A   bloom-цвет
Sky-Ink       #0A1220   фон орбитального регистра
Uz-Sand       #E8DCC4   стилизованная земля Узбекистана
```
Оранжевый — **акцент, а не фон**. Правило: не более ~8% площади кадра в любой момент.

### 1.3 Типографика
- Display (латиница, 3D + HTML): **Space Grotesk 700** — CHINA / WAREHOUSE / IN TRANSIT / UZBEKISTAN / CHIRCHIQ.
- Text (кириллица, HTML): **Inter** 400/600/800 — заголовки и весь SEO-текст.
- HUD/цифры: Inter + `font-variant-numeric: tabular-nums`, tracking +0.12em, uppercase.
- Spatial typography (троика/drei Text) — только латиница (Space Grotesk latin woff) и кириллица для 3 слов туннеля (Inter cyrillic woff).

### 1.4 Tone of voice
Коротко. Уверенно. Без «мы лучшие». Заголовки — глаголы и направления:
«ДОСТАВЛЯЕМ КИТАЙ БЛИЖЕ.», «КИТАЙ → ЧИРЧИК», «Груз принят», «В пути», «У вас».

### 1.5 Что НЕ делаем
- Нет киберпанка, неоновых сеток на весь экран, глитчей.
- Нет фейковых цифр (лет, клиентов, доставок). Доверие через процесс, прозрачность, контакты.
- Нет «секция закончилась → следующая секция». Есть один мир и одна камера.

---

## 2. STORYBOARD 0% → 100%

Общая высота скролла главной: **1400vh** (1300vh пути). `p ∈ [0,1]` — глобальный прогресс.
Оверлеи (HTML) появляются внутри диапазонов, canvas — фиксированный, персистентный.

### 00 — CINEMATIC INTRO (по времени, не по скроллу; 1.6 s; скролл заблокирован)
| t (s) | Кадр |
|---|---|
| 0.00 | Полная темнота. Преложадер уже растворился в этот же чёрный. |
| 0.10 | Тонкий оранжевый луч (плоскость 0.02×30 с emissive + bloom) проносится слева направо под углом −12°, освещая на миг пыль (particles). |
| 0.35 | Из темноты проявляется коробка: rim-light справа, key-light с луча. Камера на z=4.5, fov 32, медленный push-in до z=3.6. |
| 0.80 | Коробка поворачивается на +35° по Y (ease out expo). Позади разгорается сетка-пол и первые частицы. |
| 1.05 | Текст `ИЗ КИТАЯ — В ВАШИ РУКИ` (HTML, split-letters stagger). |
| 1.35 | Камера «перестраивается» в Hero-позу (см. 01) — резкое начало, плавное окончание (power4.out). Текст intro растворяется, появляется Hero-заголовок и CTA. |
| 1.60 | Скролл разблокирован. |
`prefers-reduced-motion` → intro пропускается, hero появляется fade-in 0.3 s.

### 01 — HERO `p 0.000–0.070` · world A · регистр INDUSTRIAL-dark
- Коробка в центре, парит на высоте 0.9 над полом с координатной сеткой (shader-grid, затухает к горизонту, fog).
- Вокруг: тонкие «логистические» линии-дуги (3–5 штук, оранжевые, alpha 0.25), плывущие точки-частицы (600 / 150 mobile), 3D-маркеры-пины на сетке, вдалеке силуэты 3 контейнеров (тёмные, с оранжевым кантом).
- Курсор → камера-параллакс ±0.35 units / ±3°. Коробка слегка «дышит» (sin 0.4Hz, ±0.03).
- HTML: `ДОСТАВЛЯЕМ / КИТАЙ / БЛИЖЕ.` (3 строки, 9–12vw), подзаголовок «Карго Китай → Узбекистан → Чирчик. Заказы с 1688, Taobao, Pinduoduo, Poizon.», CTA «Рассчитать доставку» (primary) + «Написать в Telegram» (ghost). Внизу: «SCROLL ↓ START JOURNEY» + мини-маршрут.
- Камера: t=0 `pos(0,1.4,4.2) target(0,0.9,0) fov 34` → t=1 `pos(-1.2,2.4,7.5) target(0,0.8,0) fov 40` (медленный pull-out + подъём, крановый жест).

### 02 — WAREHOUSE `p 0.070–0.170` · world A · INDUSTRIAL
- Камера продолжает отдаляться и «свет включается»: 8 индустриальных ламп по очереди (flicker 60ms → on), открывая огромный склад: 6 рядов стеллажей (instanced), сотни коробок (instanced, 3 размера, вариации картона), паллеты, 2 погрузчика (один едет по проходу), указатели-таблички, пыль в лучах ламп (particles в конусах).
- Наша коробка — на паллете в зоне приёмки (origin). Погрузчик подъезжает, поднимает паллету, везёт к конвейеру (t 0.55–0.95).
- Floating HUD (drei Html, привязаны к точкам сцены, появляются последовательно): `ГРУЗ ПРИНЯТ` (t .15) → `ПРОВЕРЕН` (t .40) → `КОНСОЛИДИРОВАН` (t .65) → `ГОТОВ К ОТПРАВКЕ` (t .90). Каждый — рамка-скобка, оранжевая точка, timestamp-подобный код `#TJ-…`.
- Spatial typography: `CHINA` / `WAREHOUSE` — гигантские буквы (h=3) стоят между стеллажами, камера проходит мимо.
- HTML (слева, узкая колонка): «Склад в Китае. Принимаем, проверяем, консолидируем.» + 3 строки-услуги.
- Камера: t=0 = конец Hero → t=0.5 `pos(6,6,14) target(3,1,2) fov 45` (crane up, показываем масштаб) → t=1 `pos(3.5,1.8,6) target(6,0.8,0) fov 40` (спуск к конвейеру, где погрузчик ставит коробку).

### 03 — CONVEYOR `p 0.170–0.270` · world A · INDUSTRIAL
- Конвейер длиной 30 units вдоль +X (x 4 → 34), ролики instanced, лента с бегущими полосами (shader UV-scroll привязан к скорости скролла), рамы, сканер-арка на x=14 (оранжевый лазерный веер — scan shader проходит по коробке), сортировочный робот-манипулятор на x=22 (3 сустава, процедурная IK-подобная анимация — переставляет соседние коробки), весы на x=9.
- Коробка едет: x = 4 + 30·t. Камера — сбоку, trucking shot параллельно ленте на расстоянии 3.2; при t .30–.42 камера облетает вперёд (перелёт через ленту), t .60–.72 камера опускается к уровню ленты (низкая точка, коробка крупно, DoF).
- Услуги появляются как «станции» вдоль конвейера (Html + 3D-стойка с табличкой): `ПРИЁМ ТОВАРА` x=6 · `ПРОВЕРКА` x=12 · `КОНСОЛИДАЦИЯ` x=18 · `ПОДГОТОВКА` x=24 · `ОТПРАВКА` x=30.
- Камера: t=0 = конец Warehouse → keyframes выше → t=1 `pos(33,1.6,3.5) target(35,0.9,0) fov 38` (смотрим на открытый контейнер).

### 04 — CONTAINER `p 0.270–0.330` · world A · INDUSTRIAL → BLACKOUT
- Контейнер (40ft, рифлёные стенки — normal-map процедурно, оранжевый, надпись TUJJOR EXPRESS, номер TJEU 4471 20-ish, замки) стоит открытым у конца ленты x=36..48.
- t 0–0.45: коробка съезжает внутрь (x 34→39), камера следует за ней ВНУТРЬ контейнера (свет становится узким и оранжевым, эхо-пыль).
- t 0.45–0.80: камера оборачивается к дверям (target на двери), двери закрываются (2 створки, hinge rotation 0→−165°). Лучи света сужаются в щель.
- t 0.80–0.90: щель закрывается → **BLACKOUT** (HTML overlay #000, 100%).
- t 0.90–1.00: «двери открываются снова» — но уже в мире B: overlay растворяется, из тьмы створки (те же пропорции, силуэт) раскрываются, а за ними — глобус. (Реализация: в мире B есть свой `DoorMask` — две плоскости, повторяющие створки, которые открываются от камеры.)
- CUT камеры на p=0.324 (мир A → мир B) под 100% blackout.
- HTML: «Консолидация → контейнер → маршрут» тонкая строка HUD.

### 05 — GLOBE `p 0.330–0.440` · world B · ORBITAL
- Тёмный глобус (r=8): land = точки (world-atlas 110m → sampling внутри полигонов, ~14k точек, 5k mobile), тонкая атмосфера (fresnel shader), графитовый океан, graticule-сетка 15°.
- Китай — заливка полигона оранжевым (alpha .35) + контур; Узбекистан — заливка + пульс (mapPulse shader).
- Дуга Guangzhou(23.1N,113.3E) → Chirchiq(41.47N,69.58E): TubeGeometry по great-circle с подъёмом до 1.35r, routeGlow shader (бегущая энергия), по ней движется cargo-indicator (сфера + trail-частицы + Html-метка `CARGO · IN TRANSIT`).
- Подписи в 3D: `CHINA`, `UZBEKISTAN`, `CHIRCHIQ` (Text, billboard), координаты рядом с точками, `DISTANCE ≈ 4 100 km` — расчёт great-circle реально в коде (не выдумка).
- Частицы: орбитальная пыль (1500 / 400).
- t 0.00–0.20: двери-маска раскрываются, камера над Тихим океаном, глобус вращается к Китаю. t 0.20–0.70: дуга строится, индикатор летит, камера orbit’ом сопровождает. t 0.70–1.00: **globe → flat map morph**: вершины точек интерполируют из сферы в equirectangular-плоскость (shader uniform `uMorph`), камера поднимается в top-down, дуга становится плоской кривой.
- HTML: «Международный маршрут. Китай → Узбекистан.» + 3 факта-процесса (без цифр-лжи): «Таможенное оформление · Контроль на каждом этапе · Статус в Telegram».
- Камера: t=0 `pos(B+0,3,26) target(B,0,0) fov 40` → t=.6 `pos(B-14,9,18) target(B-2,3,0) fov 38` → t=1 `pos(B+0,30,4) target(B,0,0) fov 50` (top-down на карту).

### 06 — SPEED TUNNEL `p 0.440–0.520` · world B (subgroup TUNNEL, z-корридор) · ORBITAL
- Камера «падает» в точку маршрута на карте и влетает в туннель: цилиндр r=6, длина 140, внутренняя поверхность — shader (radial lines + noise, скорость от velocity скролла), 400 light-streaks (instanced planes, растянутые по Z, оранжево-белые), частицы, плывущие HUD-числа (координаты, cargo ID `TJ-2381-CN`, `43.2°N 87.6°E`…) как Text-объекты, пролетающие мимо.
- Три слова, каждое — стена-текст (Cyrillic Text, h=2.4) на z-глубине: `БЫСТРО` (t .15) · `ДАЛЕКО` (t .45) · `ПОД КОНТРОЛЕМ` (t .75). Камера пролетает СКВОЗЬ буквы.
- Post: bloom вверх до 1.6, лёгкий radial blur через shader-плоскость перед камерой (не chromatic).
- t 0.92–1.00: белая-оранжевая вспышка (overlay) → CUT в мир C.
- Камера: движение только по Z: `pos(T, 0, 60 − 130·t) target(T,0,−200)`, fov 60→75, лёгкий roll ±2°.

### 07 — UZBEKISTAN `p 0.520–0.620` · world C · STUDIO-warm
- Из вспышки — камера высоко над стилизованной 3D-картой Узбекистана: полигон страны (world-atlas) экструдирован (h=0.6) в песочный материал, соседние страны — плоские тёмные силуэты, границы — тонкие светлые линии.
- Ташкентская область — приподнята ещё на 0.25 и подсвечена; на ней — стилизованные city-blocks (instanced кубы, Ташкент — крупное пятно, Чирчик — компактное пятно на северо-восток).
- Маршрут (оранжевая линия) входит с востока (от границы), идёт через область и заканчивается в Чирчике маркером (пин + пульсирующее кольцо + Html `TUJJOR EXPRESS · CHIRCHIQ`).
- Подписи: `TASHKENT REGION` → стрелка ↓ → `CHIRCHIQ` (Text).
- t 0–0.5: камера опускается с высоты 40 до 12, вращаясь к северо-востоку. t 0.5–1: приближение к Чирчику до масштаба «квартал»; дорога становится видимой, начинают появляться здания вокруг офиса.
- HTML: «Прибытие. Ташкентская область, Чирчик.» + адресный блок (телефон, Telegram) — первая «мягкая» точка конверсии после маршрута.
- Камера: t=0 `pos(C+0,40,18) target(C,0,0) fov 45` → t=1 `pos(C+9,4,7) target(C+10,0,2) fov 40` (входим в город).

### 08 — DELIVERY `p 0.620–0.720` · world C · STUDIO-warm
- Фирменный фургон Tujjor Express (процедурный: белый кузов, оранжевый пояс и крыша-кант, `TUJJOR EXPRESS` на борту, тёмные стёкла, колёса с дисками, фары с bloom): едет по дороге (CatmullRom spline, 60 units) через стилизованные кварталы Чирчика к офису.
- Камера: t 0–.25 сбоку на уровне кузова (trucking), t .25–.45 опускается к колёсам (низкий ракурс, колёса вращаются, лёгкий motion-dust), t .45–.65 поднимается сверху (crane, видим маршрут), t .65–.85 переходит вперёд машины (фургон едет на камеру, фары), t .85–1 фургон останавливается у офиса (здание с оранжевой вывеской `TUJJOR EXPRESS`, витрина светится), задняя дверь открывается, коробка выезжает на «руки» (просто плавно выходит вперёд и поднимается к камере).
- t 0.94–1.00: камера push-in в коробку, пока её лицевая грань не заполнит кадр (**match cut** на коробку) → CUT в мир D на p=0.720, где студийная коробка в той же экранной рамке медленно отъезжает.
- HTML: «Последняя миля — наша.» + «Самовывоз в Чирчике или доставка до двери» (без цен).

### 09 — NETWORK `p 0.720–0.800` · world D (x=D+0) · STUDIO
- Камера отъезжает от коробки; вокруг неё в 3D раскрывается сеть: центральный узел `TUJJOR EXPRESS` (коробка + кольцо), слева — площадки `1688 · Taobao · Alibaba · Pinduoduo · JD · Poizon` (6 узлов на дуге), далее слои `China warehouse` → `Uzbekistan` → `Chirchiq` → `Business` / `Customer` справа. Узлы — стеклянные диски с Text; связи — линии с бегущими точками (routeGlow shader, медленнее).
- Hover узла: камера смещается на 0.4 к нему, узел и его линии подсвечиваются, остальное приглушается. Click: Html-карточка с описанием (для площадок — «что заказываем», для Business — «оптовые партии, консолидация, документы»).
- HTML: «Для бизнеса и для себя.» + короткий текст + CTA «Для бизнеса».
- Камера: t=0 `pos(D+0,0.6,2.2) target(D,0.6,0) fov 36` (после match-cut) → t=.3 `pos(D+0,3,16) target(D,0.5,0) fov 42` → t=1 `pos(D+6,4,15) target(D+3,0.5,0) fov 42` (лёгкий дрейф вправо, переходя к следующей позиции).

### 10 — BOX EXPLODED `p 0.800–0.870` · world D (x=D+40) · STUDIO
- Большая коробка (масштаб 2×) в центре на «подиуме» (ContactShadows). t 0–.2: вращается на 90°. t .2–.55: **exploded view** — крышка поднимается вверх, 4 боковые панели разъезжаются наружу, внутри проявляются «слои»: 6 преимуществ как парящие пластины с иконками: `Контроль · Консолидация · Поддержка · Доставка · Прозрачность · Надёжность` (Html-метки привязаны к пластинам). Камера медленно облетает (orbit 60°). t .55–.85: пластины гаснут, коробка собирается обратно. t .85–1: собранная коробка, камера отъезжает к следующей станции.
- HTML: «Что внутри каждой доставки.» + список 6 пунктов (SEO-текст).
- Камера: t=0 `pos(D+40−8,3,12) target(D+40,1,0) fov 40` → t=.5 `pos(D+40+7,4,10) target(D+40,1.2,0) fov 38` → t=1 `pos(D+40+16,3,10) target(D+40+20,1,0) fov 40`.

### 11 — CALCULATOR `p 0.870–0.930` · world D (x=D+80) · STUDIO
- «Логистический терминал»: слева в 3D — коробка, размеры которой (w,h,d) и потёртость реагируют на ввод (вес → масштаб/оседание, габариты → пропорции), над ней — маленькая 3D-иконка категории (телефон / кроссовок / одежда / электроника / запчасти / «другое» — примитивы). Справа HTML-панель (glass): Вес (kg), Габариты (см, 3 поля), Категория, Тип доставки (авто/авиа/жд-ориентировочно — без цен), кнопка «Рассчитать».
- Результат: камера push-in 12%, на панели: «Объёмный вес: X кг · Расчётный вес: Y кг» (это честная математика: L×W×H/6000 — стандартная формула) + «Точная стоимость зависит от категории и тарифа — получите расчёт в Telegram за 5 минут» → CTA «Получить точный расчёт» (Telegram, текст запроса копируется в буфер) + «Позвонить».
- Камера: t=0 `pos(D+80−6,2.5,9) target(D+80−1,1,0) fov 40` → t=1 `pos(D+80+8,2.5,9) target(D+80+10,1,0) fov 40` (медленный дрейф; push-in по событию расчёта: −1.2 по направлению взгляда).

### 12 — TRACKING `p 0.930–0.965` · world D (x=D+120) · STUDIO
- 3D-линия маршрута (7 станций как узлы на изогнутом пути): `Received in China → Warehouse → Consolidated → In transit → Uzbekistan → Chirchiq → Ready for pickup`. Мини-коробка стоит на текущей станции (или пульсирует «ожидание» если статус неизвестен).
- HTML: поле «Введите трек-номер» + кнопка. API `/api/track/[code]` — заглушка: возвращает `{ found:false }` (UI: «Отслеживание подключается. Напишите трек-номер в Telegram — ответим со статусом.»). Кнопка «Показать пример» (явно помечена DEMO) — прогоняет коробку по линии, чтобы визуализация жила.
- Камера: t=0 `pos(D+120−4,3,9) target(D+120,0.6,0) fov 40` → t=1 `pos(D+120+8,3.5,9) target(D+120+12,0.6,0) fov 40`.

### 13 — FINAL `p 0.965–1.000` · world D (x=D+160) · STUDIO → glow
- Камера останавливается. Коробка медленно опускается сверху (y 4 → 0.6, ease out) на подиум. t .35: крышка открывается, изнутри — оранжевое свечение (point light + volumetric cone shader + particles вверх). Bloom до 1.2.
- HTML (центр): `КИТАЙ БЛИЖЕ, / ЧЕМ КАЖЕТСЯ.` → `TUJJOR EXPRESS` → «Отправьте свой первый груз» → CTA: «Рассчитать доставку» · «Telegram» · «Позвонить».
- Ниже (после конца scroll-пути, обычный документ): минималистичный footer — контакты, площадки, навигация, © 2026.
- Камера: t=0 `pos(D+160,2.2,7.5) target(D+160,0.9,0) fov 36` → t=1 `pos(D+160,1.6,5.2) target(D+160,0.9,0) fov 34` (лёгкий push-in), затем фиксация.

---

## 3. CAMERA CHOREOGRAPHY — принципы

1. **Один риг.** `CameraRig` — единственный владелец `camera.position/quaternion/fov`. Сцены не трогают камеру, они экспортируют `cameraAt(t, ctx)`.
2. **Damping, не lerp по скроллу.** Целевая поза считается из прогресса мгновенно, а реальная камера догоняет её через `damp3` (λ=4.5 desktop / 6 mobile). Ощущение веса, нет дрожания при рывках скролла.
3. **Границы стадий.** На границе `cameraAt_N(1) == cameraAt_{N+1}(0)` (гарантируется контрактом ниже). Дополнительно риг делает crossfade ±0.004 p между соседними стадиями.
4. **Cuts.** Три монтажных склейки: `p=0.324` (blackout), `p=0.520` (flash), `p=0.720` (match-cut на коробку). На cut риг сбрасывает damping (телепорт), overlay гарантирует 100% покрытие.
5. **Словарь движений** (по стадиям): Hero — push-in→pull-out (крановый). Warehouse — crane up + descend. Conveyor — truck shot + fly-over + low dolly. Container — follow + pan 180°. Globe — orbit + rise to top-down. Tunnel — fly-through. Uzbekistan — descend spiral. Delivery — trucking / low / crane / front / push-in. Network — pull-back + hover-drift. Exploded — orbit 60°. Calculator — lateral drift + event push-in. Tracking — lateral. Final — push-in, стоп.
6. **Параллакс от курсора** — только там, где камера «стоит»: Hero (1.0), Network (0.5), Exploded (0.4), Calculator (0.3), Final (0.5). В движении — 0.
7. **Aspect-адаптация.** `ctx.isPortrait` → камера отодвигается на ×1.35 по направлению взгляда, fov +10, target опускается на 0.3 (текст внизу).
8. **Никогда в пустоту.** У каждого keyframe target — на объекте. Проверка visual QA по 26 скриншотам (каждые ~4% p).

---

## 4. ПЕРЕЧЕНЬ 3D-СЦЕН (компоненты)

| # | Компонент | World / offset | Диапазон p | Ключевые объекты |
|---|---|---|---|---|
| 1 | `HeroScene` | A / x=0 | .000–.070 | TujjorBox, GridFloor, RouteLines, Particles, Pins, far Containers |
| 2 | `WarehouseScene` | A / x=0 | .070–.170 | Shelves(inst), Boxes(inst), Pallets, Forklift×2, Lamps+cones, Dust, Signs, Text CHINA/WAREHOUSE, HUD×4 |
| 3 | `ConveyorScene` | A / x=0 | .170–.270 | Conveyor(rollers inst, belt shader), ScannerArch(scan shader), SorterRobot, Scale, Stations×5 |
| 4 | `ContainerScene` | A / x=0 | .270–.330 | Container(corrugated normal), Doors(hinged), inner light, Blackout hook |
| 5 | `GlobeScene` | B / x=300 | .330–.440 | Globe points(morph), Atmosphere, Graticule, China/UZ fills, RouteArc(glow), CargoIndicator, Labels, DoorMask |
| 6 | `TunnelScene` | B / x=300, z-corridor at x=300+? (T = x 300, group at z −20..−160) | .440–.520 | TunnelShell(shader), LightStreaks(inst), Particles, HUD numbers, Words×3, Flash hook |
| 7 | `UzbekistanScene` | C / x=600 | .520–.620 | CountryExtrude, Neighbors, RegionRaise, CityBlocks(inst), RouteLine, ChirchiqMarker, Labels |
| 8 | `DeliveryScene` | C / x=600 | .620–.720 | Truck, RoadSpline, Buildings(inst), Office, Streetlights, BoxHandoff |
| 9 | `NetworkScene` | D / x=900 | .720–.800 | CenterBox, Nodes×11, Links(glow), HoverCamera hook, InfoCards |
| 10 | `BoxExplodedScene` | D / x=940 | .800–.870 | BigBox(panels separable), Podium, AdvantagePlates×6 |
| 11 | `CalculatorScene` | D / x=980 | .870–.930 | ParamBox(reactive), CategoryIcon×6, TerminalFrame |
| 12 | `TrackingScene` | D / x=1020 | .930–.965 | RoutePath, StationNodes×7, MiniBox, Pulse |
| 13 | `FinalScene` | D / x=1060 | .965–1.000 | Box(lid opens), Podium, InnerGlow(volumetric), RisingParticles |
| — | `InnerPageScene` | E / x=1500 | внутренние страницы | Box idle + particles + grid (лёгкая) |
| — | `PageTransitionScene` | camera-space | по событию | Box sweep + orange line |
| — | `IntroSequence` | A | по времени | Beam, box reveal |

Мир E используется на `/services`, `/business`, `/tracking`, `/contacts` (та же persistent canvas).

---

## 5. ASSET LIST (всё процедурно, кроме географии и шрифтов)

| Asset | Источник | Примечание |
|---|---|---|
| Cardboard albedo 1024² | CanvasTexture: kraft base, fiber noise, print `TUJJOR EXPRESS`, arrows «this way up», barcode, tape strips | 4 вариации оттенка через uniform tint |
| Cardboard roughness/normal 512² | из того же шума (height → normal) | |
| Concrete floor 1024² | noise + плиты + grid | repeat 40× |
| Corrugated container normal 512² | синус-профиль → normal | |
| Metal / paint materials | MeshStandard/Physical, без текстур | |
| World geometry | `world-atlas@2` `countries-110m.json` (TopoJSON, ~110 KB) + `topojson-client` | China=156, Uzbekistan=860; соседи для контекста |
| 3D fonts | `@fontsource/space-grotesk` latin-700 .woff, `@fontsource/inter` cyrillic-800 .woff → `/public/fonts` | troika Text |
| UI fonts | `@fontsource/inter` (cyrillic+latin) `@fontsource/space-grotesk` | self-hosted, без сетевых запросов |
| Environment | drei `<Environment>` + `<Lightformer>` (procedural studio) | без HDR-файлов, без CDN |
| Sound | WebAudio-синтез: hum (osc+LPF), whoosh (noise+BPF sweep), click (env) | 0 файлов |
| Models (box, truck, container, shelves, pallets, forklift, conveyor, robot, office, buildings, icons) | Процедурные из примитивов, собранные в компоненты | Готов pipeline для GLB: DRACO/Meshopt/KTX2 loaders в `lib/loaders.ts`, `npm run optimize:glb` (gltf-transform) |
| OG image | `opengraph-image.tsx` (ImageResponse + Inter woff) | 1200×630 |

---

## 6. SCENE TRANSITION MAP

```
INTRO (time) ──snap──▶ HERO ──continuous camera──▶ WAREHOUSE ──continuous──▶ CONVEYOR ──continuous──▶ CONTAINER
                                                                                                          │ doors close
                                                                                                          ▼
                                                                                                    BLACKOUT (p .320–.328)  [CUT A→B]
                                                                                                          │ doors open (DoorMask)
                                                                                                          ▼
   UZBEKISTAN ◀── FLASH (p .516–.522) [CUT B→C] ◀── TUNNEL ◀── dive into route point ◀── GLOBE→MAP morph
       │ continuous descend
       ▼
   DELIVERY ── box fills frame ── MATCH CUT (p .720) [C→D] ──▶ NETWORK ──lateral dolly──▶ EXPLODED ──▶ CALCULATOR ──▶ TRACKING ──▶ FINAL ──▶ footer (DOM)

Inner pages: any route change → PageTransition (box sweep across camera + orange line wipe, 0.9 s) → InnerPageScene (world E)
```
Overlay-слои переходов (HTML, поверх canvas): `Blackout`, `Flash`, `LineWipe`. Все управляются одним `TransitionOverlay` по прогрессу/событию.

---

## 7. SCROLL TIMELINE (канон)

```ts
export const STAGES = [
  { id:'hero',       start:0.000, end:0.070, world:'A', parallax:1.0 },
  { id:'warehouse',  start:0.070, end:0.170, world:'A', parallax:0   },
  { id:'conveyor',   start:0.170, end:0.270, world:'A', parallax:0   },
  { id:'container',  start:0.270, end:0.330, world:'A', parallax:0, cutAtEnd:true  }, // blackout
  { id:'globe',      start:0.330, end:0.440, world:'B', parallax:0.2 },
  { id:'tunnel',     start:0.440, end:0.520, world:'B', parallax:0, cutAtEnd:true  }, // flash
  { id:'uzbekistan', start:0.520, end:0.620, world:'C', parallax:0.2 },
  { id:'delivery',   start:0.620, end:0.720, world:'C', parallax:0, cutAtEnd:true  }, // match cut
  { id:'network',    start:0.720, end:0.800, world:'D', parallax:0.5 },
  { id:'exploded',   start:0.800, end:0.870, world:'D', parallax:0.4 },
  { id:'calculator', start:0.870, end:0.930, world:'D', parallax:0.3 },
  { id:'tracking',   start:0.930, end:0.965, world:'D', parallax:0.3 },
  { id:'final',      start:0.965, end:1.000, world:'D', parallax:0.5 },
]
export const WORLD_OFFSET = { A:0, B:300, C:600, D:900, E:1500 }  // x
export const SCROLL_HEIGHT_VH = 1400
```
Интерполяция: `p` → damped `pd` (λ=8) → stage/local t → `cameraAt` → damped camera. Оверлеи используют `pd`. Сцены используют `pd` для позиций объектов и `velocity` (Lenis) для скорости лент/частиц.

---

## 8. COMPONENT ARCHITECTURE

```
src/
  app/
    layout.tsx                 <html lang="ru"> · fonts · <Providers> · <ExperienceCanvas/> · <Header/> · <Cursor/> · <SoundToggle/> · <TransitionOverlay/> · {children} 
    page.tsx                   Главная: <HomeExperience/> (scroll spacer 1400vh + <Sections/> overlays + <Footer/>)
    services/page.tsx  business/page.tsx  tracking/page.tsx  contacts/page.tsx   (SEO-страницы поверх мира E)
    api/track/[code]/route.ts  заглушка, типизированный контракт статусов
    sitemap.ts  robots.ts  manifest.ts  opengraph-image.tsx
  components/
    three/
      ExperienceCanvas.tsx     единственный <Canvas> (fixed, z-0), gl setup, <QualityController/>, <Effects/>, <StudioEnvironment/>, <CameraRig/>, <SceneRouter/>
      SceneRouter.tsx          главная → <HomeScenes/>; иначе → <InnerPageScene/>; + <PageTransitionScene/>
      HomeScenes.tsx           монтирует 13 сцен в группах миров, управляет visible по диапазону (±1 стадия)
      CameraRig.tsx            прогресс → поза → damping → parallax → cuts
      Effects.tsx              EffectComposer по tier
      StudioEnvironment.tsx    Lightformers + fog per world (цвет тумана интерполируется по стадии)
      IntroSequence.tsx        time-based intro state machine
      models/   TujjorBox · Container · Truck · Shelf · Pallet · Forklift · Conveyor · SorterRobot · ScannerArch · IndustrialLamp · Office · Building · CategoryIcons · Podium
      materials/ cardboard.ts (texture gen) · concrete.ts · corrugated.ts
      fx/       Particles · RouteArc · GridFloor · ScanBeam · LightStreaks · Dust · VolumetricCone · DoorMask
      scenes/   13 сцен + InnerPageScene + PageTransitionScene (каждая экспортирует default component + cameraAt)
    ui/         Header · Nav · MagneticButton · Cursor · SoundToggle · Preloader · TransitionOverlay · TransitionLink · Footer · LangSwitch · HUDLabel · GlassPanel
    sections/   HeroCopy · WarehouseCopy · ConveyorCopy · ContainerCopy · GlobeCopy · TunnelCopy · UzbekistanCopy · DeliveryCopy · NetworkCopy · ExplodedCopy · CalculatorPanel · TrackingPanel · FinalCTA
  hooks/        useScroll (Lenis+store) · useStage · useStageOverlay · useQuality · useReducedMotion · usePointerType · useSound · useParallax
  lib/          timeline.ts · camera.ts · easing.ts · geo.ts · quality.ts · stores.ts (zustand) · audio.ts · textures.ts · loaders.ts · math.ts
  shaders/      routeGlow · particles · tunnel · scan · mapPulse · atmosphere · grid · belt · volumetric
  config/       company.ts · seo.ts · quality.ts
  translations/ ru.ts · uz.ts · index.ts (client switch, ru default)
```

Контракт сцены:
```ts
export interface SceneProps { stage: StageDef }          // сцена сама читает pd из scroll store в useFrame
export const cameraAt: (t: number, ctx: CameraCtx) => CameraPose
export default function XScene(props: SceneProps): JSX.Element  // корневая <group position=[offset,0,0]>
```
Правила: сцена не трогает камеру, не создаёт EffectComposer, не подписывается на React-state в useFrame (только refs/store.getState()), не импортирует другие сцены. Всё тяжёлое — `useMemo`. Instancing для повторяющегося.

---

## 9. WEBGL ARCHITECTURE

- **Один persistent `<Canvas>`** в `layout.tsx` (fixed, 100vw×100dvh, pointer-events: none по умолчанию; интерактивные сцены включают через `eventSource`/`pointer-events:auto` на своих группах — `events` R3F с `Canvas eventSource={document.body}`).
- **Renderer**: `antialias` off при postfx (MSAA заменяет SMAA в composer), `powerPreference:'high-performance'`, `toneMapping: ACESFilmic`, `outputColorSpace: SRGB`, `dpr` из QualityController.
- **Scene graph**: `<group>` на мир → сцены. `visible=false` вне диапазона ±1 стадии (традиционный culling целиком).
- **Lighting**: per-world: A — 1 directional (shadow 2048/1024/512/off) + spot-лампы (без теней, 8 шт, distance-limited) + hemisphere; B — только emissive + 1 point; C/D — Lightformers env + 1 directional shadow + ContactShadows на подиумах; оранжевый rim — `<Lightformer color=orange>` сбоку.
- **Fog**: `scene.fog = FogExp2`, density и цвет интерполируются по стадии (A тёмно-графит .035, B нет, C тёплый .02, D нейтральный .015).
- **Postprocessing** (`@react-three/postprocessing`): `Bloom(mipmap, luminanceThreshold .85, intensity per stage)`, `DepthOfField` (только Ultra/High, focusDistance на коробке через uniform от рига), `Noise(.035)`, `Vignette(.35)`, `ToneMapping`. Без chromatic aberration. SMAA на Ultra.
- **Particles**: `Points` + custom ShaderMaterial, атрибуты seed/size/speed; анимация в вершинном шейдере по `uTime` (0 CPU-работы).
- **Text 3D**: drei `<Text>` (troika SDF) с self-hosted woff; `<Html>` для кириллических HUD.
- **Scroll**: Lenis (smooth, `lerp .09`, `syncTouch:false`) → `ScrollTrigger.update` на каждый scroll → zustand transient store `{progress, velocity}`; GSAP используется для intro-tween’ов, page transitions, UI-микроанимаций; **ScrollTrigger не используется для камеры** (камера — чистая функция прогресса).
- **Quality tiers** (`lib/quality.ts`): стартовый tier по эвристикам (isMobile, dpr, hardwareConcurrency, deviceMemory, `WEBGL_debug_renderer_info`), затем `PerformanceMonitor` (drei) — при `fps<48` понижаем, при `>58` через 4 с повышаем (не выше стартового+1). Tier задаёт: dpr max, shadows size, particles density, DoF on/off, SMAA, instanced counts множитель `density`.
- **Loaders**: `lib/loaders.ts` — GLTFLoader + DRACO (`/draco/`), Meshopt, KTX2 (`/basis/`) — готовы для будущих GLB (decoders копируются из three/examples в public при `postinstall`).
- **Preloader**: `Preloader` показывает CHINA ━━ UZBEKISTAN с коробкой; прогресс = (fonts ready 20%) + (scenes mounted 60%: каждая сцена репортит `ready` в store после генерации текстур/геометрии) + (first frame 20%). Мин. длительность 0.9 s, затем intro.

---

## 10. PERFORMANCE STRATEGY

| Мера | Реализация |
|---|---|
| Один WebGL-контекст | Persistent Canvas в layout, сцены не размонтируются |
| Draw calls | Instancing: коробки склада (≈600), стеллажи, ролики, city-blocks, streaks, узлы; целевой бюджет ≤ 250 draw calls в любом кадре |
| Geometry | Всё `useMemo`; BufferGeometry merge для статичных стеллажей; LOD для склада (дальние ряды → инстансы без деталей) |
| Culling | `visible=false` для сцен вне ±1 стадии; frustum culling по умолчанию; `frustumCulled=false` только для particles |
| Текстуры | Процедурные 512–1024, mipmaps, anisotropy 4; на Low — 256/512 |
| Shadows | 1 shadow map на мир, размер по tier; ContactShadows (render-once, `frames=1`) |
| Postfx | Bloom mipmap (дёшево), DoF только Ultra/High, Noise/Vignette почти бесплатны |
| DPR | Adaptive: Ultra ≤2, High ≤1.5, Balanced ≤1.25, Low 1; PerformanceMonitor регресс |
| JS | Нет React re-render на скролл: transient zustand + refs; overlays обновляют `style` напрямую |
| Code splitting | `next/dynamic(ssr:false)` для ExperienceCanvas и каждой сцены (chunks), prefetch в preloader |
| Tab hidden | `frameloop` → `never` при `visibilitychange` |
| Мониторинг | `?debug=1` показывает r3f-perf-подобный оверлей (fps, calls, tris, tier) |
| Бюджет | Первый кадр ≤ 2.5 s на 4G-условиях (JS ≈ 550 KB gz с three); LCP — HTML hero-текст, не canvas |

---

## 11. MOBILE DEGRADATION STRATEGY

| Аспект | Desktop Ultra | Mobile (Balanced/Low) |
|---|---|---|
| DPR | ≤2 | ≤1.5 / 1 |
| Particles | 100% | 30% / 15% |
| Instanced density | 1.0 | 0.5 / 0.35 |
| Shadows | 2048 | 512 / off |
| DoF | on | off |
| Bloom | full res | resolutionScale 0.5 |
| SMAA | on | off (MSAA off) |
| Fog | full | full (дешёвый) |
| Textures | 1024 | 512 |
| Camera | по keyframe | portrait: ×1.35 дистанция, fov +10, target −0.3 |
| Copy placement | left/right колонки | bottom sheet-style блок, safe-area |
| Cursor | custom | off (pointer: coarse) |
| Parallax | mouse | gyroscope off (privacy), лёгкий авто-дрейф |
| Lenis | smooth | native scroll (syncTouch off), прогресс через scroll event |
| Intro | full | сокращён до 1.1 s |
| Network hover | hover | tap = select |
| Warehouse | 600 boxes, 2 forklifts, 8 lamps | 240 boxes, 1 forklift, 4 lamps |
| Tunnel streaks | 400 | 140 |
| Globe points | 14k | 5k |
| Story | полная | полная (все 13 стадий сохранены) |

Автоматический выбор: `quality.ts` → tier без UI-настроек; при `prefers-reduced-motion` → Balanced + без intro, без auto-дрейфа, переходы 150 ms.

---

## 12. COPY (ru, канон для сцен и SEO)
- Hero H1: «Доставляем Китай ближе.» · sub: «Карго из Китая в Узбекистан. Приём на складе в Китае, консолидация, доставка в Чирчик. Заказы с 1688, Taobao, Alibaba, Pinduoduo, JD, Poizon.»
- Warehouse H2: «Склад в Китае» · «Принимаем товар, проверяем, консолидируем и готовим к отправке.»
- Conveyor H2: «Каждая посылка проходит пять станций» · список услуг.
- Container H2: «Консолидация и отправка» 
- Globe H2: «Международный маршрут Китай → Узбекистан» · «Таможенное оформление · Контроль на каждом этапе · Статус в Telegram»
- Tunnel: БЫСТРО / ДАЛЕКО / ПОД КОНТРОЛЕМ
- Uzbekistan H2: «Прибытие в Узбекистан» · «Ташкентская область, Чирчик» + телефон/Telegram
- Delivery H2: «Последняя миля — наша» · «Самовывоз в Чирчике или доставка до двери.»
- Network H2: «Для бизнеса и для себя» · «Коммерческие партии, консолидация нескольких поставщиков, документы. Или одна посылка с Taobao — одинаково внимательно.»
- Exploded H2: «Что внутри каждой доставки» · Контроль · Консолидация · Поддержка · Доставка · Прозрачность · Надёжность
- Calculator H2: «Рассчитать доставку» · «Точную стоимость подтвердим в Telegram.»
- Tracking H2: «Отслеживание груза»
- Final: «КИТАЙ БЛИЖЕ, ЧЕМ КАЖЕТСЯ.» · «TUJJOR EXPRESS» · «Отправьте свой первый груз»
- Контакты: +998 93 086 91 09 · @tujjor_chirchiq · Чирчик, Ташкентская область
