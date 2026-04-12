# 📘 PAC System v1.0 - Control de Evaluaciones

Este documento detalla las características técnicas de la aplicación "Control de Evaluaciones" (PAC System), así como una evaluación crítica sobre los puntos de vulnerabilidad, posibles caídas y limitaciones de la arquitectura elegida.

---

## 🚀 1. Características del Proyecto

### Funcionalidades Core
*   **Consulta por DNI Simplificada:** Los usuarios solo necesitan colocar su DNI. El sistema tiene tolerancia a ceros a la izquierda (ej. `00123456` es procesado como `123456`); asegurando similitud con la base de datos limpia.
*   **Arquitectura Serverless (Sin Backend):** La aplicación no posee un servidor de base de datos tradicional. Actúa como un motor de lógica en el Frontend (React) que consume e interpreta archivos de Excel publicados y hosteados en la nube pública de Google Drive.
*   **Lógica de Negocios Avanzada (Match de Power Query):**
    1.  Cruza el universo total de *Temas Activos* en la organización.
    2.  Realiza el cruce con los exámenes que el usuario ya aprobó (nota >= 12).
    3.  Aplica reglas de negocio de Inclusión: Se determina qué exámenes corresponden al usuario dependiendo de la fecha en que se implementó el tema (`INICIO_TEMA` / `FECHACAP`) y la fecha de su ingreso a la compañía (`FEC_ING` + 15 días de tregua).
*   **Interfaz de Usuario (UX/UI):** Diseñada de forma profesional, fluida, animada (Framer Motion) y con iconografía estandarizada (Lucide React). Se pensó para embeberse como *Iframe* responsivo dentro del portal web de la empresa.

### Optimización y Rendimiento
*   **Caché en Navegador (LocalStorage):** Cuenta con un sistema interno en el navegador del trabajador. Cuando alguien consulta su DNI, la base de datos de Google se descarga **una sola vez**. Ese gran paquete de datos permanece guardado temporalmente en la memoria del navegador durante **5 minutos**.
*   Si la misma persona o alguien que comparte la misma PC realiza otra búsqueda en los siguientes 5 minutos, la respuesta es *instantánea* y no consume ancho de banda.

---

## ⚠️ 2. Riesgos Críticos y Motivos de Caída del Sistema

Al carecer de un servidor backend tradicional y usar Google Sheets de forma directa, el sistema tiene vulnerabilidades inherentes a su modelo de bajo costo.

### A. Límite de Solicitudes (HTTP 429 Too Many Requests)
*   **¿Qué es?** Google Drive (y Sheets) NO está diseñado para ser una base de datos abierta al público masivo.
*   **El Escenario de Caída:** Si la organización lanza un comunicado masivo diciendo: *"Todos deben revisar sus exámenes hoy a las 10:00 am"*, y 300 trabajadores entran **al mismo segundo** a colocar su DNI por celular/PC, Google Sheets bloqueará el acceso temporalmente por exceso de tráfico para proteger sus servidores.
*   **El Resultado visual:** La pantalla de carga nunca terminará, y eventualmente aparecerá el mensaje rojo: `"Error al conectar con los datos. Por favor, intente más tarde."`.

### B. Rendimiento del Navegador (Out of Memory - Tab Crash)
*   La lógica y el peso del Excel recaen sobre el celular o la computadora del trabajador.
*   **El Riesgo:** Si en un año, tus tablas `RECOPILADO` o `PERSONAL` sobrepasan las **50,000 mil filas** y pesan más de 10 MB - 15 MB, los navegadores de los celulares más antiguos podrían congelarse o crashear porque no tienen la RAM suficiente para procesar librerías pesadas como `XLSX` en primer plano.

### C. Fragilidad de la Estructura (Human Error)
*   La aplicación lee nombres estrictos de encabezados (`FEC_ING`, `TEMA`, `CODIGO`, etc) y hojas de cálculo específicas (`REGISTER`, `RECOPILADO`, `MAIN`). 
*   **El Riesgo:** Si el administrador del Excel de Power BI comete el error de renombrar la hoja de `MAIN` a `MAIN_2`, cambiar el color de una columna que termina rompiendo el formato o añade un espacio en el encabezado (ej. `CODIGO `), la aplicación del frontend generará un volcado *Undefined* y dejará de funcionar en el acto hasta que se actualice el código fuente.

---

## 🛡️ 3. Posibles Soluciones a Futuro (Mitigaciones)

Si el aplicativo pasa a tener uso a nivel corporativo intensivo, la arquitectura actual debería migrar de *Fase 1* a *Fase 2*:

**Fase 2 (Proxy - Cloudflare Workers o Backend Simple):**
1. En lugar de que los 300 celulares descarguen el Excel directamente del Drive 300 veces.
2. Se coloca un servidor intermediario de bajísimo costo.
3. El intermediario descarga el Google Sheet 1 vez cada 5 minutos, procesa el JSON crudo.
4. Los 300 celulares le preguntan al intermediario. El intermediario aguantará millones de peticiones porque devuelve simples textos (JSON) y las cuotas de Google Sheets permanecen completamente protegidas e ilesas.
