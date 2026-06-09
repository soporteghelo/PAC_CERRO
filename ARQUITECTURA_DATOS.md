# ARQUITECTURA DE DATOS — PAC_CERRO

## Resumen

Aplicación React + TypeScript que consulta exámenes pendientes por DNI.  
Fuente: dos Google Sheets exportados como `.xlsx` (sin base de datos propia).

---

## Fuentes de Datos (Google Sheets)

### Hoja `REGISTER` — `URL_PERSONAL`

| Campo | Tipo raw | Procesamiento | Resultado |
|---|---|---|---|
| `DNI` | string | `cleanDni()` — quita ceros iniciales | `"00072345"` → `"72345"` |
| `ESTADO` | string | Filtro: solo `"ACTIVO"` pasa | `"ACTIVO"` \| `"INACTIVO"` |
| `APELLIDOS Y NOMBRES` | string | Sin transformación | Nombre completo |
| `FEC_ING` | date/string | `parseDateValue()` | `Date \| null` |

### Hoja `RECOPILADO` — `URL_DATA`

| Campo | Tipo raw | Procesamiento | Resultado |
|---|---|---|---|
| `DNI` | string | `cleanDni()` | string sin ceros |
| `TEMA` | string | `.toUpperCase()` | string normalizado |
| `Puntuación` | `"18 / 20"` o número | `split("/")[0]` + `parseFloat` | number |
| `ESTADO` | string | Ignorado | — |

Filtros aplicados al procesar:
- `Puntuación >= 12` (aprobado)
- `TEMA` no vacío
- Deduplicación por `(DNI + TEMA)`

### Hoja `MAIN` — `URL_DATA`

| Campo | Tipo raw | Procesamiento | Resultado |
|---|---|---|---|
| `CODIGO` | string | `.toUpperCase()` — clave primaria | string |
| `TEMA` | string | `.toUpperCase()` | string |
| `MES` | string | Sin transformación | `"Enero"`, `"Febrero"`… |
| `AREA` | string | Sin transformación | `"Matemática"`, etc. |
| `CATEGORIA` | string | Sin transformación | string (opcional) |
| `INICIO_TEMA` | date/string | `parseDateValue()` | `Date \| null` |

---

## Interfaces TypeScript (`src/types.ts`)

```
┌─────────────────────────────────────────────────────────┐
│                     PersonalRecord                      │
├──────────────────────────┬──────────────────────────────┤
│ DNI                      │ string  (limpio, sin ceros)  │
│ ESTADO                   │ string  ("ACTIVO")           │
│ APELLIDOS Y NOMBRES      │ string                       │
│ FEC_ING                  │ Date | string | null         │
└──────────────────────────┴──────────────────────────────┘
        ↑
        │  DNI (clave de unión)
        ↓
┌─────────────────────────────────────────────────────────┐
│                      ExamRecord                         │
├──────────────────────────┬──────────────────────────────┤
│ DNI                      │ string  (limpio, sin ceros)  │
│ TEMA                     │ string  (MAYÚSCULAS)         │
│ Puntuación               │ number  (>= 12 = aprobado)  │
│ ESTADO                   │ string  (opcional, ignorado) │
└──────────────────────────┴──────────────────────────────┘
        ↑
        │  TEMA (clave de unión)
        ↓
┌─────────────────────────────────────────────────────────┐
│                     ExamMetadata                        │
├──────────────────────────┬──────────────────────────────┤
│ CODIGO                   │ string  (PK, MAYÚSCULAS)    │
│ TEMA                     │ string  (MAYÚSCULAS)         │
│ MES                      │ string  (para agrupar en UI)│
│ AREA                     │ string  (mostrado en card)  │
│ CATEGORIA                │ string  (opcional)           │
│ INICIO_TEMA              │ Date | string | null         │
└──────────────────────────┴──────────────────────────────┘
```

---

## Interfaz Interna de Caché (`CacheData`)

Solo existe en `dataService.ts`, serializada en `localStorage`.

| Campo | Tipo | Descripción |
|---|---|---|
| `timestamp` | number | Momento de creación (`Date.now()`) |
| `personal` | `PersonalRecord[]` | Personal activo procesado |
| `recopilado` | `ExamRecord[]` | Exámenes aprobados deduplicados |
| `masterList` | `ExamMetadata[]` | Catálogo completo de exámenes |
| `activeThemes` | `string[]` | TEMA únicos de `masterList` |

**Clave localStorage:** `exam_checker_cache_v3`  
**TTL:** 5 minutos — pero `getPendingExams` siempre usa `forceRefresh=true`

---

## Relaciones entre Tablas

```
REGISTER (URL_PERSONAL)          MAIN (URL_DATA)
    │ DNI                            │ CODIGO / TEMA
    │                                │
    │        RECOPILADO (URL_DATA)   │
    │            │ DNI ──────────────┘ (via TEMA)
    └────────────┘ (DNI)

Relación principal:
  PersonalRecord.DNI  1──N  ExamRecord.DNI
  ExamMetadata.TEMA   1──N  ExamRecord.TEMA
```

---

## Flujo de Datos Completo

```
┌──────────────────────────────────────────────────────────────┐
│  Google Sheets (2 archivos .xlsx)                            │
│   URL_PERSONAL          URL_DATA                             │
│   └─ REGISTER           ├─ RECOPILADO                        │
│                         └─ MAIN                              │
└──────────────────────────────────────────────────────────────┘
                  │  fetch() + XLSX.read()
                  ▼
┌──────────────────────────────────────────────────────────────┐
│  fetchData()  [dataService.ts]                               │
│                                                              │
│  REGISTER ──► filtrar ACTIVO ──► PersonalRecord[]            │
│                                                              │
│  RECOPILADO ► normalizar TEMA  ──►                           │
│             ► parsear Puntuación ►                           │
│             ► filtrar (>= 12)   ►                            │
│             ► deduplicar (DNI+TEMA) ► ExamRecord[]           │
│             ► extraer TEMA únicos ──► activeThemes[]         │
│                                                              │
│  MAIN ──────► normalizar CODIGO/TEMA ─► ExamMetadata[]       │
│             ► parsear INICIO_TEMA                            │
│                                                              │
│  ──► CacheData (localStorage, 5 min)                         │
└──────────────────────────────────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────────────────┐
│  getPendingExams(dni)  [dataService.ts]                      │
│                                                              │
│  1. cleanDni(input)                                          │
│  2. Busca PersonalRecord por DNI                             │
│     └─ no encontrado ──► { error: "DNI no encontrado..." }   │
│  3. passedThemes = Set(ExamRecord[DNI].TEMA)                 │
│  4. pendingThemes = activeThemes − passedThemes  (anti-join) │
│  5. Para cada tema pendiente:                                │
│     ├─ Busca ExamMetadata por CODIGO                         │
│     └─ Criterio de inclusión temporal:                       │
│        ├─ sin INICIO_TEMA ──────────────────► incluir        │
│        ├─ sin FEC_ING ──────────────────────► excluir        │
│        └─ INICIO_TEMA >= FEC_ING + 15 días ─► incluir        │
│  6. Retorna { person: PersonalRecord, pending: ExamMetadata[] }│
└──────────────────────────────────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────────────────┐
│  App.tsx  [React UI]                                         │
│                                                              │
│  Estado:                                                     │
│  ├─ dni           string   (input del usuario, máx 8 díg.)  │
│  ├─ loading       boolean  (fetch en curso)                  │
│  ├─ error         string | null                              │
│  └─ data          { person, pending } | null                 │
│                                                              │
│  Renderizado condicional:                                    │
│  ├─ data=null, error=null ──► Empty state                    │
│  ├─ loading=true ───────────► Spinner                        │
│  ├─ error ──────────────────► Alerta roja                    │
│  ├─ pending.length = 0 ─────► "Todo completado"             │
│  └─ pending.length > 0 ─────► Grid agrupado por MES         │
│       └─ Por cada ExamMetadata muestra:                      │
│          ├─ TEMA                                             │
│          ├─ CODIGO  (tag)                                    │
│          └─ AREA    (ícono BookOpen)                         │
└──────────────────────────────────────────────────────────────┘
```

---

## Lógica de Inclusión (Regla de Negocio Central)

Dado un examen pendiente con `INICIO_TEMA` y una persona con `FEC_ING`:

| Condición | Resultado |
|---|---|
| `INICIO_TEMA` es null | **Incluir** (examen sin fecha = siempre aplica) |
| `FEC_ING` es null | **Excluir** (no se puede calcular) |
| `INICIO_TEMA >= FEC_ING + 15 días` | **Incluir** |
| `INICIO_TEMA < FEC_ING + 15 días` | **Excluir** |

---

## Mapa de Archivos y Dependencias

```
src/
├── main.tsx
│   └── monta <App />
│
├── types.ts
│   ├── export ExamRecord
│   ├── export ExamMetadata
│   └── export PersonalRecord
│       ↑ importado por App.tsx y dataService.ts
│
├── services/
│   └── dataService.ts
│       ├── import xlsx
│       ├── import types.ts
│       ├── (privado) CacheData
│       ├── (privado) parseDateValue()
│       ├── (privado) fetchData(forceRefresh)
│       ├── export  cleanDni()
│       └── export  getPendingExams()
│           ↑ importado por App.tsx
│
├── App.tsx
│   ├── import dataService.ts  → getPendingExams, cleanDni
│   ├── import types.ts        → PersonalRecord, ExamMetadata
│   ├── import lucide-react    → íconos
│   ├── import framer-motion   → animaciones
│   └── import index.css
│
└── index.css
    └── estilos globales + clases de componentes
```

---

## Constantes Clave

| Constante | Valor | Dónde |
|---|---|---|
| `URL_PERSONAL` | URL Google Sheets export | `dataService.ts` |
| `URL_DATA` | URL Google Sheets export | `dataService.ts` |
| `CACHE_KEY` | `"exam_checker_cache_v3"` | `dataService.ts` |
| `CACHE_DURATION` | `300 000 ms` (5 min) | `dataService.ts` |
| Días mínimos desde ingreso | `15` (hardcoded) | `getPendingExams` |
| Puntaje mínimo aprobatorio | `12` (hardcoded) | `fetchData` |
| Máx. dígitos DNI | `8` (hardcoded) | `App.tsx` |
