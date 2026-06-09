# REQUERIMIENTOS DEL SISTEMA — PAC System

Este documento es la fuente única de verdad para que el sistema funcione correctamente. Cualquier cambio en las fuentes de datos, nombres de hojas, columnas o constantes debe reflejarse aquí y en el código.

---

## 1. Variables Globales del Sistema

Definidas en `src/services/dataService.ts`. Cambiar cualquiera de estas sin actualizar el código rompe el sistema.

| Variable | Valor actual | Tipo | Descripción |
|---|---|---|---|
| `URL_PERSONAL` | `https://docs.google.com/spreadsheets/d/e/2PACX-1vTrKyssGrBF69UdCUULbIQDN2DzHQuB8Dz0Dh8zNy3VWLvrESD1hlKNZ3AMMqwYKufcEd2ZGdVgfHpg/pub?output=xlsx` | `string` | URL pública del Google Sheet de personal (hoja REGISTER) |
| `URL_DATA` | `https://docs.google.com/spreadsheets/d/e/2PACX-1vQCJhNPq2aP810i1ImC_dwin3aw4nombiCFJriN1U56ACjV5y_WLFbdXJHy6To2LMd6URNggBwqjqEz/pub?output=xlsx` | `string` | URL pública del Google Sheet de datos (hojas RECOPILADO y MAIN) |
| `CACHE_KEY` | `"exam_checker_cache_v3"` | `string` | Nombre de la clave en `localStorage` donde se guarda la caché |
| `CACHE_DURATION` | `300000` (5 minutos) | `number` (ms) | Tiempo de vida de la caché. Actualmente ignorado porque `getPendingExams` usa `forceRefresh = true` siempre |

### Constantes lógicas hardcodeadas

Estas no tienen nombre de variable en el código pero controlan el comportamiento del sistema:

| Comportamiento | Valor | Dónde está | Descripción |
|---|---|---|---|
| Puntaje mínimo aprobatorio (base de datos) | `12` | `dataService.ts` línea de filtro | Un registro en RECOPILADO se considera aprobado si `Puntuación >= 12` |
| Puntaje mínimo aprobatorio (visible al usuario) | `16` | Toast en `App.tsx` | El mensaje que ve el colaborador indica que necesita 16 para aprobar |
| Días de tregua desde ingreso | `15` | `dataService.ts` en `getPendingExams` | Un examen solo aplica si `INICIO_TEMA >= FEC_ING + 15 días` |
| Longitud máxima del DNI | `8` | `App.tsx` en el `onChange` del input | El input solo acepta hasta 8 dígitos |
| Auto-búsqueda al completar DNI | `8` | `App.tsx` en `useEffect` | La búsqueda se dispara automáticamente cuando `dni.length === 8` |
| Duración del toast recordatorio | `8000` ms (8 seg) | `App.tsx` en `closeModal` | El toast post-examen se autocierra a los 8 segundos |

---

## 2. Requerimientos de Google Sheets

### 2.1 Configuración de publicación obligatoria

Ambos archivos **deben estar publicados en la web** como Excel (`.xlsx`):

```
Google Sheets → Archivo → Compartir → Publicar en la web
→ Seleccionar: "Libro completo" + formato "Microsoft Excel (.xlsx)"
→ Publicar → Copiar URL generada
```

La URL resultante tiene el formato:
```
https://docs.google.com/spreadsheets/d/e/{ID_PUBLICACION}/pub?output=xlsx
```

> Si el archivo se despublica o se cambia el ID, la app mostrará error de conexión para todos los usuarios.

### 2.2 Acceso

- Las publicaciones deben ser **públicas** (sin restricción de dominio)
- No se requiere autenticación
- Los archivos NO necesitan ser compartidos con ninguna cuenta en particular; la publicación pública es suficiente

---

## 3. Estructura de Tablas Requeridas

### TABLA 1 — `REGISTER`
**Archivo:** `URL_PERSONAL`  
**Nombre exacto de la hoja:** `REGISTER` (sensible a mayúsculas)

Esta tabla contiene el padrón del personal. El sistema filtra y carga solo las filas con `ESTADO = ACTIVO`.

| # | Nombre de columna | Tipo de dato | Obligatorio | Valores válidos | Notas |
|---|---|---|---|---|---|
| 1 | `DNI` | Texto / Número | ✅ Sí | 8 dígitos numéricos | Puede tener ceros iniciales; el sistema los elimina automáticamente |
| 2 | `ESTADO` | Texto | ✅ Sí | `ACTIVO` / `INACTIVO` / cualquier otro valor | Solo filas con `ACTIVO` (en mayúsculas, sin espacios) son procesadas |
| 3 | `APELLIDOS Y NOMBRES` | Texto | ✅ Sí | Texto libre | Se muestra en pantalla tal como está en el Excel |
| 4 | `FEC_ING` | Fecha | ✅ Sí (para la regla de 15 días) | Formato fecha de Excel o ISO `YYYY-MM-DD` | Si está vacío, el colaborador no verá ningún examen pendiente |

**Ejemplo de fila válida:**

| DNI | ESTADO | APELLIDOS Y NOMBRES | FEC_ING |
|---|---|---|---|
| 72345678 | ACTIVO | TORRES QUISPE JUAN | 15/01/2025 |
| 00044326062 | ACTIVO | LAZARO PECHO DICK CIRO | 03/05/2024 |

---

### TABLA 2 — `RECOPILADO`
**Archivo:** `URL_DATA`  
**Nombre exacto de la hoja:** `RECOPILADO` (sensible a mayúsculas)

Registro histórico de todos los exámenes rendidos. El sistema deduplica por `(DNI + TEMA)` y solo conserva registros con `Puntuación >= 12`.

| # | Nombre de columna | Tipo de dato | Obligatorio | Valores válidos | Notas |
|---|---|---|---|---|---|
| 1 | `DNI` | Texto / Número | ✅ Sí | 8 dígitos | Puede tener ceros iniciales |
| 2 | `TEMA` | Texto | ✅ Sí | Debe coincidir exactamente con el `CODIGO` de la tabla MAIN | El sistema lo normaliza a MAYÚSCULAS antes de comparar |
| 3 | `Puntuación` | Texto / Número | ✅ Sí | `"18 / 20"`, `"15"`, `18`, `15.5` | Soporta formato `"nota / total"` o número simple. Usar punto o coma como decimal |
| 4 | `ESTADO` | Texto | ❌ No | Cualquier valor | Columna ignorada por el sistema |

**Formatos de Puntuación aceptados:**

| Valor en Excel | Parseado como |
|---|---|
| `18 / 20` | `18` |
| `20 / 20` | `20` |
| `15` | `15` |
| `14.5` | `14.5` |
| `14,5` | `14.5` |
| `0` | `0` (reprobado, filtrado) |
| vacío / texto sin número | `NaN` → descartado |

**Ejemplo de fila válida:**

| DNI | TEMA | Puntuación | ESTADO |
|---|---|---|---|
| 72345678 | 2026_FEBRERO_EPP | 18 / 20 | ENVIADO |
| 44326062 | 2026_ENERO_IPERC | 16 | COMPLETADO |

---

### TABLA 3 — `MAIN`
**Archivo:** `URL_DATA`  
**Nombre exacto de la hoja:** `MAIN` (sensible a mayúsculas)

Catálogo maestro de todas las evaluaciones disponibles. Define qué exámenes existen, cuándo aplican y qué recursos tienen asociados.

| # | Nombre de columna | Tipo de dato | Obligatorio | Valores válidos | Notas |
|---|---|---|---|---|---|
| 1 | `CODIGO` | Texto | ✅ Sí | Sin espacios iniciales/finales | Clave primaria. El sistema lo normaliza a MAYÚSCULAS. Debe coincidir con el campo `TEMA` en RECOPILADO |
| 2 | `TEMA` | Texto | ✅ Sí | Texto descriptivo | Nombre legible que se muestra en la tarjeta del examen |
| 3 | `MES` | Texto | ✅ Sí (para agrupar) | `"1. enero"`, `"2. febrero"`, etc. | Se muestra como encabezado de grupo. Si está vacío, el examen aparece en grupo `"Sin Mes"` |
| 4 | `AREA` | Texto | ❌ No | `SEGURIDAD`, `OPERACIONES`, etc. | Se muestra en la tarjeta. Si está vacío, el campo no aparece |
| 5 | `INICIO_TEMA` | Fecha | ❌ No | Fecha Excel o `YYYY-MM-DD` | Controla la regla de los 15 días. Si está vacío, el examen aplica para todos sin restricción de fecha |
| 6 | `LINK_EXAMEN` | Texto (URL) | ❌ No | URL válida (Google Forms) | Si está vacío, el botón **Examen** no aparece |
| 7 | `LINK_PRESENTACION` | Texto (URL) | ❌ No | URL Google Drive `/view` | El sistema transforma automáticamente a `/preview` para el embedding. Si está vacío, el botón **Material** no aparece |
| 8 | `LINK_VIDEO` | Texto (URL) | ❌ No | URL AppSheet `gettablefileurl` con `.mp4` | Se reproduce con `<video>` nativo. Si está vacío, el botón **Video** no aparece |
| 9 | `CATEGORIA` | Texto | ❌ No | Cualquier valor | Almacenada pero no usada actualmente en la UI |

**Ejemplo de filas válidas:**

| CODIGO | TEMA | MES | AREA | INICIO_TEMA | LINK_EXAMEN | LINK_PRESENTACION | LINK_VIDEO |
|---|---|---|---|---|---|---|---|
| 2026_FEBRERO_EPP | EPP | 2. febrero | SEGURIDAD | 26/02/2026 | https://forms.gle/... | https://drive.google.com/file/d/.../view | https://www.appsheet.com/... |
| 2026_ENERO_IPERC | IPERC | 1. enero | SEGURIDAD | 15/01/2026 | https://forms.gle/... | https://drive.google.com/file/d/.../view | |

---

## 4. Reglas de Integridad de Datos

### 4.1 Coincidencia RECOPILADO ↔ MAIN

El campo `TEMA` en `RECOPILADO` **debe coincidir exactamente** (tras normalización a MAYÚSCULAS) con el campo `CODIGO` en `MAIN`.

```
RECOPILADO.TEMA  ──►  normalizar a MAYÚSCULAS  ──►  comparar con  ──►  MAIN.CODIGO
```

Si no coinciden, el sistema no podrá marcar ese examen como aprobado y seguirá apareciendo como pendiente aunque el colaborador lo haya rendido.

**Ejemplo de error común:**

| RECOPILADO.TEMA | MAIN.CODIGO | ¿Coincide? |
|---|---|---|
| `2026_FEBRERO_EPP` | `2026_FEBRERO_EPP` | ✅ Sí |
| `2026_febrero_EPP` | `2026_FEBRERO_EPP` | ✅ Sí (el sistema normaliza) |
| `2026_FEBRERO_EPP ` | `2026_FEBRERO_EPP` | ❌ No (espacio al final) |
| `2026_FEB_EPP` | `2026_FEBRERO_EPP` | ❌ No (abreviatura) |

### 4.2 Coincidencia REGISTER ↔ RECOPILADO

El `DNI` en `RECOPILADO` debe coincidir con el `DNI` en `REGISTER` después de eliminar ceros iniciales.

```
REGISTER.DNI     ──►  cleanDni()  ──►  "72345678"
RECOPILADO.DNI   ──►  cleanDni()  ──►  "72345678"
                                        ↑ deben ser iguales
```

### 4.3 Formato de URLs en MAIN

| Columna | URL correcta | URL incorrecta | Consecuencia del error |
|---|---|---|---|
| `LINK_EXAMEN` | `https://forms.gle/ABC123` o URL completa de Forms | URL de Drive o AppSheet | El formulario no se abre correctamente |
| `LINK_PRESENTACION` | `https://drive.google.com/file/d/FILE_ID/view?usp=sharing` | URL sin `/file/d/` | El sistema no puede extraer el FILE_ID y no transforma a `/preview` → muestra error de acceso |
| `LINK_VIDEO` | URL de AppSheet con `.mp4` en el parámetro `fileName` | URL de YouTube o Vimeo | El tag `<video>` no reproducirá el contenido |

---

## 5. Requerimientos del Entorno de Ejecución

### 5.1 Navegadores soportados

| Navegador | Versión mínima | Notas |
|---|---|---|
| Chrome / Edge | 90+ | Recomendado |
| Firefox | 88+ | Totalmente compatible |
| Safari (iOS) | 14+ | Soportado; usar `playsInline` en video (ya configurado) |
| Chrome Mobile (Android) | 90+ | Recomendado para uso en campo |

Requisito técnico crítico: soporte para `CSS clamp()`, `position: fixed`, `localStorage`, `fetch()` y `WebAssembly` (requerido por la librería `xlsx`).

### 5.2 Conectividad

- Requiere conexión a internet activa en cada consulta (no funciona offline)
- Debe poder alcanzar `docs.google.com` y `drive.google.com` sin restricciones de firewall
- Ancho de banda mínimo estimado por consulta: **500 KB – 2 MB** (descarga de los dos Excel)

### 5.3 Entorno de desarrollo

| Herramienta | Versión requerida |
|---|---|
| Node.js | ≥ 18 |
| npm | ≥ 9 |
| Vite | ^8 (instalado vía `package.json`) |

```bash
node --version   # debe mostrar v18.x o superior
npm --version    # debe mostrar 9.x o superior
```

---

## 6. Requerimientos de Deploy (Vercel)

| Parámetro | Valor |
|---|---|
| Framework preset | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |
| Install command | `npm install` |
| Node.js version | 18.x |
| Variables de entorno | Ninguna requerida (las URLs están hardcodeadas en el código) |

> Si en el futuro se migra a variables de entorno Vercel, se agregarían como `VITE_URL_PERSONAL` y `VITE_URL_DATA` en el panel de Vercel y en el código como `import.meta.env.VITE_URL_PERSONAL`.

---

## 7. Checklist de Verificación antes de Deploy

Antes de publicar una nueva versión, verificar:

- [ ] `URL_PERSONAL` apunta a un Google Sheet publicado como `.xlsx` con la hoja `REGISTER`
- [ ] `URL_DATA` apunta a un Google Sheet publicado como `.xlsx` con las hojas `RECOPILADO` y `MAIN`
- [ ] La hoja `REGISTER` tiene las columnas: `DNI`, `ESTADO`, `APELLIDOS Y NOMBRES`, `FEC_ING`
- [ ] La hoja `RECOPILADO` tiene las columnas: `DNI`, `TEMA`, `Puntuación`
- [ ] La hoja `MAIN` tiene las columnas: `CODIGO`, `TEMA`, `MES`, `AREA`, `INICIO_TEMA`, `LINK_EXAMEN`, `LINK_PRESENTACION`, `LINK_VIDEO`
- [ ] Los valores de `RECOPILADO.TEMA` coinciden exactamente con `MAIN.CODIGO` (tras MAYÚSCULAS)
- [ ] Los links de `LINK_PRESENTACION` son URLs de Google Drive con formato `/file/d/FILE_ID/view`
- [ ] Los links de `LINK_VIDEO` son URLs de AppSheet con `.mp4` en el parámetro `fileName`
- [ ] `npm run build` completa sin errores
- [ ] La app responde correctamente con un DNI de prueba en local antes de publicar

---

## 8. Errores Comunes y su Causa

| Error visible en la app | Causa probable |
|---|---|
| `"DNI no encontrado o personal no está activo."` | El DNI no existe en `REGISTER` o su `ESTADO` no es `ACTIVO` |
| `"Error al conectar..."` (rojo) | La URL de Google Sheets no es accesible (archivo despublicado, cuota excedida, sin internet) |
| El examen aparece aunque ya fue rendido | `RECOPILADO.TEMA` no coincide con `MAIN.CODIGO` (revisar espacios, guiones, mayúsculas) |
| Botones Examen / Material / Video no aparecen | Las columnas `LINK_EXAMEN`, `LINK_PRESENTACION` o `LINK_VIDEO` están vacías en `MAIN` |
| Material muestra "Necesitas acceso" | La URL no es de formato `/view` de Drive, o el archivo no es público |
| Video no se reproduce | La URL no contiene `.mp4` o AppSheet bloqueó la petición — aparece botón de nueva pestaña |
| La app muestra datos desactualizados | Revisar que `forceRefresh = true` en `getPendingExams` (ya configurado así por defecto) |
| Examen pendiente aun con nota aprobada | Verificar que la nota en RECOPILADO sea ≥ 12 y que el TEMA coincida exactamente con CODIGO |
