# UDN Sport — Control de Asistencia (Módulo 1)

App PWA (funciona como app nativa), 100% offline, con sincronización a
Google Sheets. Costo: **$0** (stack completamente gratuito).

---

## 1. Qué contiene esta carpeta

```
udn-sport-app/
├── index.html              → la app en sí
├── manifest.json           → hace que se pueda "instalar" en el celular
├── sw.js                   → funcionamiento offline (Service Worker)
├── css/styles.css          → estilos con los colores del club
├── js/
│   ├── lib/dexie.min.js    → base de datos local (ya incluida, no requiere internet)
│   ├── data/db.js          → esquema de la base de datos local
│   ├── data/sheets.js      → comunicación con Google Sheets
│   ├── features/attendance.js  → toda la lógica de asistencia
│   ├── features/config.js  → pantalla de configuración
│   └── app.js               → navegación entre pantallas
├── icons/                  → ícono de la app (tu logo, ya procesado en los tamaños que pide un PWA)
└── server/Codigo.gs        → script que va DENTRO de Google Sheets (paso 3)
```

---

## 2. Publicar la app (elige una opción gratuita)

**Opción recomendada: GitHub Pages**

1. Crea un repositorio en GitHub (puede ser privado o público) y sube todo
   el contenido de esta carpeta `udn-sport-app/` a la raíz del repositorio.
2. En el repositorio: `Settings → Pages → Deploy from branch → main → /(root)`.
3. En un par de minutos tendrás una URL tipo
   `https://tu-usuario.github.io/udn-sport-app/`.
4. Abre esa URL desde el celular del entrenador (Chrome en Android o
   Safari en iPhone) y usa la opción **"Agregar a pantalla de inicio"** /
   **"Instalar app"**. Quedará como un ícono más, funcionando offline.

Netlify o Vercel (arrastrar y soltar la carpeta) funcionan igual de bien
si prefieres esa opción.

---

## 3. Conectar la app con Google Sheets (gratis, sin backend propio)

1. Crea una hoja de cálculo nueva en Google Sheets, por ejemplo
   **"UDN Sport - Datos"**.
2. Dentro del Sheet: `Extensiones → Apps Script`.
3. Borra el contenido de `Código.gs` que aparece por defecto y pega todo
   el contenido del archivo `server/Codigo.gs` de este proyecto.
4. Guarda el proyecto (ícono de disquete).
5. Arriba a la derecha: **Implementar → Nueva implementación**.
   - Tipo: **Aplicación web**.
   - Ejecutar como: **Yo (tu correo)**.
   - Quién tiene acceso: **Cualquier usuario**.
6. Copia la **URL de la aplicación web** que te entrega (empieza con
   `https://script.google.com/macros/s/.../exec`).
7. La primera vez que el script se ejecute (al abrir la app y sincronizar)
   creará automáticamente 3 pestañas en tu Sheet si no existen:
   - **Jugadores** → el roster oficial (la llenas tú manualmente con
     Nombre, Categoría, Activo).
   - **Asistencia** → se llena sola con cada sincronización desde la app.
   - **Jugadores_Pendientes** → alertas de jugadores nuevos agregados
     desde el celular, para que el administrador los revise y los pase
     al roster oficial.

### Configurar la app con esa URL

1. Abre la app en el celular.
2. Toca el ícono de engranaje (⚙) en el menú principal.
3. Pega la URL del paso 6 y toca **"Guardar enlace"**.
4. Toca **"Actualizar jugadores desde Sheets"** para bajar el roster por
   primera vez. A partir de ahí, aunque no haya internet, el roster queda
   guardado en el celular.

> Nota: si actualizas jugadores directamente en la pestaña "Jugadores" del
> Sheet, cualquier entrenador puede volver a tocar "Actualizar jugadores"
> cuando tenga señal para traer los cambios más recientes.

---

## 4. Cómo funciona el día a día

1. El entrenador abre la app (funciona sin internet).
2. Menú → **Control de asistencia → Nuevo registro**.
3. Indica si registra como Entrenador o Coordinador, y su nombre.
4. Completa tipo de evento, fecha, hora y lugar.
5. Marca **P / A / J** (Presente / Ausente / Justificado) por cada
   jugador, con nota libre opcional. Puede agregar un deportista que no
   esté en la lista (queda marcado como "NUEVO").
6. Guarda. La lista queda en el celular con estado **"Pendiente"**.
7. Cuando haya wifi o datos: **Listas guardadas → Sincronizar** (una por
   una o todas juntas). El estado cambia a **"Sincronizado"** y los datos
   quedan en la pestaña "Asistencia" del Sheet.
8. Si más tarde falta corregir algo (llegó un jugador tarde, un error de
   tipeo), se abre esa misma lista guardada — **no se pierde lo ya
   registrado** — se corrige y se vuelve a sincronizar.

---

## 5. Actualizar la app en el futuro

Si cambias el código, sube los archivos nuevos a GitHub Pages (o donde la
hospedes) y **sube en 1 el número `CACHE_VERSION`** dentro de `sw.js`
(por ejemplo de `'udn-sport-v1'` a `'udn-sport-v2'`). Así los celulares
detectan la versión nueva y la descargan.

---

## 6. Próxima etapa

El módulo **"Gestión de partidos"** (equipos, titulares/suplentes,
cronómetro, pausas, goles, tarjetas) queda visible en el menú como
placeholder, listo para desarrollarse en la siguiente fase.
