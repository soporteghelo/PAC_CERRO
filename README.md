# PAC System — Control de Evaluaciones

Aplicación web para que el personal de CERRO consulte sus exámenes de capacitación pendientes ingresando su DNI.

---

## ¿Para qué sirve?

Cada colaborador ingresa su DNI de 8 dígitos y el sistema le muestra en segundos qué evaluaciones aún le faltan rendir, organizadas por mes. Desde la misma pantalla puede acceder al examen, revisar el material de estudio y ver el video de la capacitación.

---

## Cómo usar la app

### 1. Consultar pendientes

1. Abre la app en el navegador
2. Escribe tu DNI (8 dígitos) — la búsqueda se lanza automáticamente al completar el octavo dígito
3. También puedes presionar **Consultar**

El sistema muestra:
- Tu nombre completo y estado (ACTIVO)
- La cantidad de exámenes pendientes
- Las evaluaciones agrupadas por mes de programación

### 2. Exámenes pendientes — tarjetas

Cada evaluación pendiente muestra:

| Elemento | Descripción |
|---|---|
| Nombre del examen | Título de la capacitación |
| Código | Identificador único (ej. `2026_FEBRERO_EPP`) |
| Área | Categoría de la capacitación (ej. `SEGURIDAD`) |
| **Examen** (azul) | Abre el formulario para rendir la evaluación |
| **Material** (verde) | Abre el material de estudio (Google Drive) |
| **Video** (amarillo) | Reproduce el video de la capacitación |

> Los botones de Examen, Material y Video solo aparecen si ese recurso existe para la evaluación.

### 3. Abrir un recurso

Al hacer clic en cualquier botón (Examen, Material o Video) se abre un visor a pantalla completa con el contenido. Usa el botón **← Volver** para regresar a la lista.

### 4. Después de rendir el examen

Al cerrar el visor del examen aparece un aviso recordatorio con:
- **Vuelve a consultar en 5 minutos** para verificar que el examen desapareció
- La nota mínima aprobatoria es **16**
- Asegúrate de ingresar tu DNI correctamente en el formulario
- La fecha del examen debe coincidir con el mes programado de tu capacitación

El aviso desaparece solo a los **8 segundos** o puedes cerrarlo con **Entendido**.

---

## Reglas del sistema

### ¿Qué exámenes aparecen como pendientes?

Un examen aparece en tu lista cuando se cumplen **todas** estas condiciones:

1. El examen existe en el catálogo de capacitaciones (hoja `MAIN`)
2. **No tienes un puntaje aprobatorio** registrado en `RECOPILADO` (puntaje ≥ 16 para aprobar un examen en el formulario; el sistema filtra registros con puntaje ≥ 12 como aprobados en la base de datos)
3. La **fecha de inicio** del examen es igual o posterior a tu **fecha de ingreso + 15 días**

> Si ingresaste a la empresa hace menos de 15 días de la fecha programada del examen, ese examen no aparecerá todavía.

### ¿Cuándo desaparece un examen de la lista?

Cuando tu DNI queda registrado en `RECOPILADO` con:
- El código del examen correcto
- Puntaje ≥ 12 (aprobatorio según el sistema)

Los datos se actualizan desde Google Sheets en cada consulta.

---

## Fuentes de datos

La app lee en tiempo real dos archivos de Google Sheets publicados como Excel:

### Archivo PERSONAL — hoja `REGISTER`

Contiene el padrón de colaboradores activos.

| Columna | Descripción |
|---|---|
| `DNI` | Número de documento (se limpian ceros iniciales) |
| `ESTADO` | Solo se procesan filas con valor `ACTIVO` |
| `APELLIDOS Y NOMBRES` | Nombre completo que aparece en pantalla |
| `FEC_ING` | Fecha de ingreso a la empresa |

### Archivo DATA — hoja `RECOPILADO`

Registros de exámenes rendidos.

| Columna | Descripción |
|---|---|
| `DNI` | Documento del evaluado |
| `TEMA` | Código del examen (normalizado en MAYÚSCULAS) |
| `Puntuación` | Puntaje obtenido (soporta formatos `"18 / 20"` o `"15"`) |

Procesamiento aplicado: se eliminan duplicados por `(DNI + TEMA)` y solo se conservan registros con puntaje ≥ 12.

### Archivo DATA — hoja `MAIN`

Catálogo de todas las evaluaciones disponibles.

| Columna | Descripción |
|---|---|
| `CODIGO` | Identificador único del examen (clave primaria) |
| `TEMA` | Nombre descriptivo de la capacitación |
| `MES` | Mes de programación (usado para agrupar en pantalla) |
| `AREA` | Área temática (`SEGURIDAD`, `OPERACIONES`, etc.) |
| `INICIO_TEMA` | Fecha de inicio del examen |
| `LINK_EXAMEN` | URL del formulario de evaluación |
| `LINK_PRESENTACION` | URL del material en Google Drive |
| `LINK_VIDEO` | URL del video en AppSheet/Drive |

---

## Comportamiento de los recursos multimedia

| Tipo | Formato | Cómo se muestra |
|---|---|---|
| **Examen** | Google Forms | Iframe (el formulario se incrusta directamente) |
| **Material** | Google Drive (`/view`) | Se convierte a `/preview` para permitir embedding |
| **Video** | AppSheet `.mp4` | Tag `<video>` nativo (bypasea restricciones de iframe) |

Si el video no puede cargarse en la vista embebida, aparece el botón **"Abrir video en nueva pestaña"**.

---

## Estructura del proyecto

```
PAC_CERRO/
├── src/
│   ├── main.tsx               Punto de entrada React
│   ├── App.tsx                Componente principal — toda la UI y estado
│   ├── types.ts               Interfaces TypeScript (ExamRecord, ExamMetadata, PersonalRecord)
│   ├── index.css              Estilos globales + componentes
│   └── services/
│       └── dataService.ts     Descarga, parsea y procesa los datos de Google Sheets
├── public/
├── index.html
├── vite.config.ts
└── package.json
```

### Flujo de datos resumido

```
Google Sheets (2 archivos .xlsx)
        ↓  fetch + XLSX.read()
  dataService.ts
  ├── REGISTER  → PersonalRecord[]   (solo ACTIVO)
  ├── RECOPILADO → ExamRecord[]      (aprobados, deduplicados)
  └── MAIN      → ExamMetadata[]     (catálogo completo)
        ↓
  getPendingExams(dni)
  ├── Busca persona por DNI
  ├── Calcula temas aprobados (Set)
  ├── Anti-join: todos los temas − aprobados = pendientes
  └── Filtra por regla temporal (INICIO_TEMA ≥ FEC_ING + 15 días)
        ↓
  App.tsx → renderiza tarjetas por mes
```

---

## Tecnologías

| Tecnología | Uso |
|---|---|
| React 19 + TypeScript | Framework y tipado |
| Vite 8 | Bundler y dev server |
| `xlsx` | Parseo de archivos Excel desde Google Sheets |
| `framer-motion` | Animaciones de entrada/salida |
| `lucide-react` | Iconografía SVG |
| CSS puro | Estilos — sin frameworks externos |

---

## Ejecutar en local

```bash
# Instalar dependencias
npm install

# Servidor de desarrollo (http://localhost:5173)
npm run dev

# Build de producción
npm run build

# Previsualizar build
npm run preview
```

---

## Deploy

El proyecto está configurado para desplegarse en **Vercel**. Cada push a `main` genera un deploy automático. El build genera archivos estáticos en `/dist` — no requiere servidor backend.

---

## Notas para el administrador

- **Actualizar el catálogo de exámenes**: editar la hoja `MAIN` del Google Sheet de datos
- **Registrar un resultado**: el sistema lee `RECOPILADO` en tiempo real; basta con que el registro aparezca en esa hoja con puntaje ≥ 12
- **Agregar personal**: agregar la fila en la hoja `REGISTER` con `ESTADO = ACTIVO`
- **Los datos se recargan en cada consulta** — no hay caché persistente entre búsquedas
- **Nota mínima aprobatoria visible al usuario: 16** (el filtro interno de la base de datos es ≥ 12)
