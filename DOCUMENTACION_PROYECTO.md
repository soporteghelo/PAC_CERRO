# PAC System — Documentación Técnica

Control de Evaluaciones · versión actual en producción (Vercel)

---

## 1. Resumen Ejecutivo

Aplicación web SPA (Single Page Application) sin backend que permite a cada colaborador de la organización consultar sus exámenes de capacitación pendientes ingresando únicamente su DNI. La lógica de negocio corre íntegramente en el navegador del usuario: descarga, procesa y cruza datos desde dos Google Sheets publicados como Excel.

---

## 2. Funcionalidades Actuales

### 2.1 Consulta por DNI

- El usuario ingresa 8 dígitos; la búsqueda se dispara automáticamente al completar el octavo dígito o al presionar **Consultar**.
- Tolerancia a ceros iniciales: `00072345` se procesa idéntico a `72345`.
- Solo retorna resultado si el DNI existe en `REGISTER` con `ESTADO = ACTIVO`.

### 2.2 Cálculo de Exámenes Pendientes (Lógica de Negocio)

El algoritmo realiza un **Anti-Join** en tres pasos:

1. **Universo activo:** todos los temas únicos presentes en la hoja `RECOPILADO` (normalizados en MAYÚSCULAS).
2. **Aprobados del usuario:** temas donde el DNI consultado tiene puntaje ≥ 12, deduplicados por `(DNI + TEMA)`.
3. **Pendientes = Universo − Aprobados** → filtrado adicional por regla temporal.

**Regla temporal de inclusión:**

| Condición | Resultado |
|---|---|
| El examen no tiene `INICIO_TEMA` | Siempre incluir |
| El colaborador no tiene `FEC_ING` | Excluir |
| `INICIO_TEMA ≥ FEC_ING + 15 días` | Incluir |
| `INICIO_TEMA < FEC_ING + 15 días` | Excluir |

> La tregua de 15 días evita que un colaborador recién ingresado vea exámenes anteriores a su llegada.

### 2.3 Tarjetas de Examen con Recursos

Cada examen pendiente se presenta en una tarjeta que muestra:

- **Nombre** del examen
- **Código** identificador (`CODIGO`)
- **Área** temática (`AREA`)
- Botones de acceso rápido (solo aparecen si el link existe en la hoja `MAIN`):

| Botón | Color | Fuente | Comportamiento |
|---|---|---|---|
| **Examen** | Azul | `LINK_EXAMEN` (Google Forms) | Abre iframe a pantalla completa |
| **Material** | Verde | `LINK_PRESENTACION` (Google Drive) | Convierte `/view` → `/preview`, muestra en iframe |
| **Video** | Amarillo | `LINK_VIDEO` (AppSheet `.mp4`) | Usa tag `<video>` nativo (bypasea X-Frame-Options) |

### 2.4 Visor a Pantalla Completa (Modal)

Al hacer clic en cualquier botón se abre un overlay `position: fixed; inset: 0` que ocupa el 100 % de la pantalla. Contiene:
- Barra superior con botón **← Volver**
- Etiqueta del recurso abierto
- Contenido embebido (iframe o video nativo según el tipo de URL)

**Transformación inteligente de URLs:**

- `drive.google.com/file/d/FILE_ID/view` → `drive.google.com/file/d/FILE_ID/preview`  
  (el formato `/preview` es el único que Google permite incrustar sin solicitar login)
- URLs de AppSheet con `.mp4` → elemento `<video controls autoPlay>` en lugar de iframe, porque AppSheet bloquea embedding vía `X-Frame-Options: DENY`
- Si el video falla al cargar (`onError`), se muestra un botón **"Abrir video en nueva pestaña"** como fallback

### 2.5 Recordatorio Post-Examen

Cuando el usuario cierra el visor del **Examen** (no de Material ni de Video), aparece automáticamente un toast flotante centrado en pantalla:

- Se posiciona con un overlay `position: fixed` + flexbox (no usa `transform` para centrar, evitando conflicto con las animaciones de `framer-motion`)
- Animación de entrada/salida tipo _pop_ (escala + opacidad)
- Duración: **8 segundos** (o cierre manual con "Entendido")
- Contenido:
  - "Vuelve a consultar en 5 minutos"
  - Nota mínima aprobatoria: **16**
  - Recordatorio de DNI correcto
  - Recordatorio de fecha correspondiente al mes programado

### 2.6 Agrupación por Mes

Los exámenes pendientes se agrupan por el campo `MES` de la hoja `MAIN` y se ordenan alfabéticamente. Cada grupo muestra un encabezado con ícono de calendario y el nombre del mes.

---

## 3. Arquitectura de Datos

### 3.1 Fuentes (Google Sheets → Excel)

```
URL_PERSONAL  ──►  Hoja REGISTER   (datos de personal)
URL_DATA      ──►  Hoja RECOPILADO (exámenes rendidos)
              ──►  Hoja MAIN       (catálogo de evaluaciones)
```

Ambas URLs apuntan a publicaciones de Google Sheets en formato `.xlsx` (`?output=xlsx`).

### 3.2 Esquema de Tablas

**REGISTER** (`URL_PERSONAL`)

| Campo | Tipo | Procesamiento |
|---|---|---|
| `DNI` | string | `cleanDni()` — elimina ceros iniciales |
| `ESTADO` | string | Filtro: solo `ACTIVO` |
| `APELLIDOS Y NOMBRES` | string | Sin transformación |
| `FEC_ING` | date | `parseDateValue()` → `Date \| null` |

**RECOPILADO** (`URL_DATA`)

| Campo | Tipo | Procesamiento |
|---|---|---|
| `DNI` | string | `cleanDni()` |
| `TEMA` | string | `.toUpperCase().trim()` |
| `Puntuación` | string/number | Parseo de `"18 / 20"` → `18`; filtro ≥ 12 |

**MAIN** (`URL_DATA`)

| Campo | Tipo | Procesamiento |
|---|---|---|
| `CODIGO` | string | `.toUpperCase().trim()` — clave primaria |
| `TEMA` | string | `.toUpperCase().trim()` |
| `MES` | string | Sin transformación |
| `AREA` | string | Sin transformación |
| `INICIO_TEMA` | date | `parseDateValue()` |
| `LINK_EXAMEN` | string | URL Google Forms |
| `LINK_PRESENTACION` | string | URL Google Drive |
| `LINK_VIDEO` | string | URL AppSheet / mp4 |

### 3.3 Caché Local

La primera descarga del turno de consulta se guarda en `localStorage` bajo la clave `exam_checker_cache_v3`. La función `getPendingExams` siempre usa `forceRefresh = true`, por lo que en cada búsqueda se descargan datos frescos de Google Sheets.

---

## 4. Estructura de Archivos

```
src/
├── main.tsx                 Punto de entrada
├── App.tsx                  Componente raíz — estado, handlers, UI completa
│   ├── Estado: dni, loading, error, data, modal, showExamReminder, videoError
│   ├── getModalConfig()     Transforma URLs a formato embebible
│   └── closeModal()         Cierra visor + dispara recordatorio si fue Examen
├── types.ts
│   ├── ExamRecord           { DNI, TEMA, Puntuación, ESTADO }
│   ├── ExamMetadata         { CODIGO, TEMA, MES, AREA, INICIO_TEMA,
│   │                          LINK_EXAMEN, LINK_PRESENTACION, LINK_VIDEO }
│   └── PersonalRecord       { DNI, ESTADO, APELLIDOS Y NOMBRES, FEC_ING }
├── index.css                Estilos — responsive con clamp(), sin frameworks
└── services/
    └── dataService.ts
        ├── cleanDni()       Elimina ceros iniciales
        ├── parseDateValue() Conversión robusta a Date
        ├── fetchData()      Descarga + parsea los 3 sheets
        └── getPendingExams() Algoritmo Anti-Join + filtro temporal
```

---

## 5. Diseño Responsive

La app se adapta a cualquier tamaño de pantalla:

| Pantalla | Comportamiento |
|---|---|
| Móvil ≤ 480 px | Container ocupa 100 % del ancho, sin bordes ni sombra |
| Tablet / Desktop > 480 px | Card centrada con `max-width: 480px`, bordes redondeados y sombra |
| Altura | `min-height: 100dvh` (dynamic viewport height — considera la barra del navegador móvil) |
| Tipografía | `clamp()` en todos los tamaños clave — escala suavemente entre resoluciones |

---

## 6. Dependencias

| Librería | Versión | Uso |
|---|---|---|
| `react` | ^19 | Framework UI |
| `react-dom` | ^19 | Rendering DOM |
| `xlsx` | ^0.18 | Parseo de archivos Excel (Google Sheets export) |
| `framer-motion` | ^12 | Animaciones de entrada/salida |
| `lucide-react` | ^1.8 | Iconografía SVG |
| `typescript` | ~6.0 | Tipado estático |
| `vite` | ^8 | Bundler y dev server |

---

## 7. Riesgos y Limitaciones

### 7.1 Límite de solicitudes HTTP (Google Sheets)

Google Drive no está diseñado como base de datos de tráfico masivo. Si más de ~100 usuarios consultan simultáneamente en el mismo segundo, Google puede retornar `HTTP 429 Too Many Requests` y la app muestra el error rojo de conexión.

**Escenario crítico:** comunicado masivo citando a todos a revisar sus pendientes a la misma hora.

### 7.2 Rendimiento en dispositivos antiguos

El parseo de Excel (`xlsx`) ocurre en el hilo principal del navegador. Si las hojas `RECOPILADO` o `PERSONAL` superan las **50,000 filas** (≈ 10-15 MB), los móviles de gama baja pueden congelarse o mostrar un crash de pestaña.

### 7.3 Fragilidad de encabezados

El sistema depende de nombres exactos de hojas (`REGISTER`, `RECOPILADO`, `MAIN`) y columnas (`CODIGO`, `FEC_ING`, `TEMA`, etc.). Un espacio extra o cambio de nombre en el Excel rompe el procesamiento silenciosamente (retorna `undefined`).

### 7.4 Embedding de recursos externos

- **Google Drive:** solo funciona con el formato `/preview`. Los links `/view` muestran "Necesitas acceso" dentro de un iframe.
- **AppSheet:** bloquea iframes con `X-Frame-Options: DENY`. Se resuelve usando `<video>` nativo, pero si AppSheet cambia su política CORS el video podría dejar de cargar.

---

## 8. Hoja de Ruta (Mejoras Futuras)

### Fase 2 — Proxy Backend (recomendado cuando usuarios > 200)

Agregar un servidor intermediario de bajo costo (Cloudflare Workers, Vercel Edge Functions o similar):

```
Antes:  300 celulares → Google Sheets × 300 peticiones
Después: 300 celulares → Proxy → Google Sheets × 1 petición cada 5 min
```

El proxy procesa el Excel una vez y devuelve JSON liviano. Los cupos de Google Sheets quedan protegidos y la latencia baja drásticamente.

### Mejoras adicionales identificadas

| Mejora | Impacto |
|---|---|
| Validación de encabezados al parsear | Evita caídas silenciosas por cambios en el Excel |
| Web Worker para parseo de XLSX | Libera el hilo principal en dispositivos lentos |
| Service Worker / PWA | Permite consultas offline con los últimos datos cacheados |
| Notificación push de nuevos exámenes | El usuario es avisado proactivamente sin necesidad de consultar |

---

## 9. Comandos de Desarrollo

```bash
npm install        # Instalar dependencias
npm run dev        # Servidor local en http://localhost:5173
npm run build      # Build de producción → /dist
npm run preview    # Previsualizar el build localmente
npm run lint       # Verificar código con ESLint
```

El deploy en Vercel es automático en cada push a `main`. No requiere servidor — los archivos de `/dist` son estáticos.
