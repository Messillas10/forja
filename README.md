# Forja

Registro de entrenamiento de fuerza para móvil (PWA): offline, sin servidor y gratis.
Diseño, fórmulas y referencias en [docs/DISENO.md](docs/DISENO.md).

```bash
npm install
npm run dev -- --host   # abre la URL "Network" desde el móvil (misma wifi)
npx vitest run          # tests de fórmulas y progresión
npm run build           # genera dist/ (estático, se puede subir a GitHub Pages)
```

Para instalarla en el móvil: ábrela en Chrome (Android) o Safari (iOS) y elige «Añadir a pantalla de inicio».
La instalación y el modo offline necesitan HTTPS: usa la versión desplegada, no la de la red local.
