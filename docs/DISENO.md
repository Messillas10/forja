# Forja — documento de diseño

App personal de registro de entrenamiento de fuerza, estilo Hevy, centrada en registrar rápido desde el móvil y en progresar las cargas con criterios respaldados por la literatura.

## 1. Decisiones de arquitectura

| Decisión | Elección | Motivo |
|---|---|---|
| Plataforma | PWA (web instalable) | Gratis: sin cuota de Apple (99 $/año) ni de Google Play. Se instala desde el navegador y funciona sin conexión. |
| Stack | Vite + React 19 + TypeScript | Iteración rápida y tipado fuerte en las fórmulas. |
| Datos | IndexedDB con Dexie (local-first) | Sin servidor ni coste. Registrar en el gimnasio sin cobertura funciona igual. |
| Offline | `vite-plugin-pwa` (Workbox) | Guarda en caché toda la app. |
| Rutas | `HashRouter` | Funciona en GitHub Pages sin configurar el servidor. |
| Copias | Exportar e importar JSON | Sustituye a la sincronización en la nube del MVP. |

**Más adelante:** sincronizar con Supabase (tiene plan gratuito) o envolver la app con Capacitor si hace falta publicarla en las tiendas.

## 2. Modelo de datos (`src/types.ts`, `src/db.ts`)

```
exercises         id, name, primary, secondary[], equipment, type, increment?, lowerBody?, custom?
routines          id, name, exercises[{exerciseId, sets, repMin, repMax, targetRpe?, restSec}]
workouts          id, name, startedAt, endedAt?, routineId?, sessionRpe?
workoutExercises  id, workoutId, exerciseId, exerciseOrder, repMin, repMax, targetRpe, restSec
sets              id, workoutId, exerciseId, exerciseOrder, setIndex, kind, weight, reps, rpe, durationSec, done
```

- El entrenamiento activo es el `workout` con `endedAt` vacío. Cada cambio se guarda en IndexedDB en el momento, así que si se cierra la app no se pierde nada.
- Hay cuatro tipos de serie: `normal`, `warmup` (calentamiento, no cuenta en volumen ni en récords), `drop` y `failure`.
- Al terminar, las series sin marcar se descartan, igual que en Hevy.

## 3. Registro rápido (UX)

- Una fila por serie con las columnas **Serie · Anterior · kg · Reps · RPE · ✓**.
- Los campos muestran como texto de ayuda la **sugerencia del día**, o si no hay, la sesión anterior. Si se pulsa ✓ con un campo vacío, se rellena con ese valor: una serie como la prevista se registra con **un solo toque**.
- Al tocar “Anterior” se copia la serie anterior. «+ Añadir serie» duplica la última.
- Al marcar ✓ se inicia el **temporizador de descanso**. Guarda la hora de fin, no una cuenta atrás, así que sigue siendo correcto con la pantalla bloqueada. Vibra al terminar.
- Teclado numérico (`inputMode`) y el contenido del campo se selecciona al enfocarlo.
- Se pueden añadir calentamientos automáticos: barra × 10, 40 % × 5, 60 % × 3 y 80 % × 2.

## 4. Fórmulas y evidencia (`src/lib/formulas.ts`)

### 4.1 1RM estimado
Siete ecuaciones: Epley, Brzycki, Lombardi, Mayhew, O'Conner, Wathan y Lander. La calculadora muestra la **media**, que reduce el sesgo de cada ecuación por separado. La precisión es buena hasta unas 10 repeticiones (LeSuer et al., 1997, *JSCR* 11(4)), y la app avisa si se pasa de ahí.

### 4.2 RPE basado en repeticiones en reserva
- Escala de Zourdos et al. (2016, *JSCR* 30(1)): RPE 10 − RIR.
- Tabla %1RM × reps × RPE de Tuchscherer, recogida en Helms et al. (2016, *Strength Cond J* 38(4)). Está implementada como una sola secuencia: medio punto de RPE equivale a un paso y una repetición a dos.
- **e1RM de una serie** = peso / %(reps, RPE). Si no hay RPE, se asume que se llegó al fallo.

### 4.3 Volumen
- Tonelaje = Σ peso × reps, sin contar calentamientos.
- **Series efectivas por músculo y semana**, con una zona objetivo de 10–20. Fuentes: la relación dosis-respuesta de Schoenfeld, Ogborn y Krieger (2017, *J Sports Sci* 35(11)) y el cómputo fraccional de Pelland et al. (2024): el músculo secundario cuenta 0,5.

### 4.4 Carga interna
- Carga de sesión = RPE de sesión (CR-10) × minutos (Foster et al., 2001, *JSCR* 15(1)).
- **ACWR** con medias móviles exponenciales de 7 y 28 días (Williams et al., 2017, *BJSM*). Se considera estable entre 0,8 y 1,3, y por encima de 1,5 hay un pico de carga. Su capacidad para predecir lesiones está discutida (Impellizzeri et al., 2020, *IJSPP*), así que la app lo presenta solo como indicador de tendencia.

### 4.5 INOL
Reps / (100 − %1RM), de Hristov (2005). Es una heurística de entrenador, no validada experimentalmente, y la app lo indica.

## 5. Progresión de cargas (`src/lib/progression.ts`)

Para cada ejercicio, `suggestNext()` decide en este orden:

1. **Estancamiento.** Si el e1RM ha bajado en 3 sesiones seguidas, propone una **descarga**: −10 % de carga y RPE objetivo −2 (consenso Delphi sobre descargas, Bell et al., 2023).
2. **Autorregulación por RPE**, si la rutina tiene RPE objetivo y se registró RPE. Calcula el e1RM de la mejor serie y la carga para *reps objetivo @ RPE objetivo*, redondeada al incremento disponible. Helms et al. (2018, *Front Physiol* 9:247) encontraron resultados iguales o mejores que con porcentajes fijos.
3. **Doble progresión**, si no hay RPE:
   - todas las series llegan al tope del rango → **+incremento** y se vuelve al mínimo;
   - alguna serie queda por debajo del mínimo → **−5 %**;
   - en otro caso → **mismo peso, +1 rep**.

Incrementos por defecto: mancuerna y kettlebell 2 kg; máquina y polea 2,5 kg; barra 2,5 kg (5 kg en movimientos grandes de tren inferior: sentadilla, peso muerto, prensa, hip thrust).

Los rangos de las plantillas de rutina son fuerza 3–5 @8, hipertrofia 8–12 @8 y aislamiento 12–15 @9. Para hipertrofia sirve un rango amplio de cargas si se entrena cerca del fallo (Schoenfeld et al., 2017, *JSCR* 31(12)).

## 6. Pantallas

| Ruta | Contenido |
|---|---|
| `/` Entrenar | Continuar el entreno en curso, empezar uno vacío y lista de rutinas |
| `/entreno` | Entreno activo: tarjetas de ejercicio, sugerencia, series y descanso |
| `/rutinas/:id` | Editor de rutinas con plantillas fuerza/hipertrofia/aislamiento |
| `/historial`, `/historial/:id` | Sesiones, resumen, récords de e1RM y carga sRPE |
| `/ejercicios`, `/ejercicios/:id` | 88 ejercicios con búsqueda y filtros. Por ejercicio: gráfica de e1RM, récords y calculadora de carga por RPE |
| `/progreso` | Series por músculo frente a la zona 10–20, volumen semanal y ACWR |
| `/entrenador` | Resumen semanal para el entrenador (compartir, descargar o copiar) e importación de rutinas |
| `/importar/:code` | Revisión e importación de rutinas recibidas por enlace |
| `/herramientas` | 1RM (7 fórmulas), %1RM con INOL, calculadora de discos, tabla RPE y copias de seguridad |

## 7. Hoja de ruta

- [x] MVP: registro, rutinas, historial, progresión, estadísticas y PWA offline
- [ ] Superseries (agrupar ejercicios)
- [ ] Notas por ejercicio y por serie
- [x] Registro de peso corporal con media semanal
- [x] Ciclo con el entrenador: resumen semanal → análisis de Claude (`/entrenador`) → rutinas por enlace o QR
- [ ] Medidas corporales, fuerza relativa y DOTS
- [ ] Mesociclos con descarga programada cada 4–6 semanas
- [ ] Gráficas por músculo (tendencia del e1RM medio)
- [ ] Sincronización opcional con Supabase y varios dispositivos
- [ ] Unidades en libras
- [ ] Notificación al terminar el descanso con la app en segundo plano

## 8. Ciclo con el entrenador

1. En la app, **Entrenador → Compartir resumen**. Se genera un texto con las sesiones, los e1RM, las series por músculo, el peso corporal, las rutinas (con los IDs de cada ejercicio) y los comentarios del atleta.
2. En el ordenador, la skill `/entrenador` de Claude Code lo analiza junto con el perfil y los informes anteriores, que están en un espacio privado fuera de este repositorio.
3. Si hay cambios, genera un enlace `#/importar/<código>`: es JSON comprimido con deflate-raw y codificado en base64url (ver `src/lib/routineShare.ts`). Al ir en el fragmento `#`, los datos no pasan por ningún servidor. Al abrirlo, la app muestra las rutinas y se importan con un toque.

## 9. Diseño visual: «hierro y tiza»

Inspirado en el gimnasio: tiza de magnesio, discos de hierro y números estampados.

- **Color** (tokens en `src/index.css`):
  - Tema claro, «tiza»: fondo `#ECEDEA` y texto hierro `#1D2125`.
  - Tema oscuro, «grafito»: fondo `#202326`.
  - Un único acento, **ascua** (`#C8450C`, o `#F26B2A` en oscuro), solo para «actúa ahora»: empezar y descanso.
  - Verde (`#2F7D4F`) para la serie hecha.
  - Los colores de disco IWF solo aparecen en la calculadora de discos.
- **Tipografía:** Archivo variable, incluida en la app para que funcione sin conexión, con dos papeles:
  - títulos anchos (125 %) y gruesos, como estampados;
  - **números** estrechos (72–75 %) y pesados, con cifras tabulares, para que quepan en las columnas y se lean entre series.
- **Elemento memorable:** el objetivo de cada ejercicio en cifras grandes («82,5 kg × 8 reps»). Lo demás es sobrio.
- **Estructura:**
  - listas como filas con separadores;
  - superficies solo donde agrupan (cada ejercicio del entreno);
  - sin mayúsculas en etiquetas;
  - acciones principales al alcance del pulgar.
- **Accesibilidad:**
  - foco visible;
  - respeta `prefers-reduced-motion`;
  - áreas táctiles de 44 px o más;
  - etiquetas `aria` en las filas de series;
  - tema automático, claro u oscuro (Herramientas → Apariencia).
