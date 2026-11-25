# Modpack Assist

Una herramienta de escritorio moderna construida para gestionar, editar, diagnosticar y optimizar ecosistemas de mods de Minecraft de forma visual e intuitiva.

## Caracteristicas principales
* Ecosistema visual: mapeo de dependencias mediante grafos interactivos.
* Gestion integrada: busqueda, descarga e instalacion de mods (con dependencias) desde CurseForge y Modrinth.
* Centro de Tweaks: inyeccion de scripts KubeJS para modificar items, entidades, spawns y loot tables desde la interfaz.
* Optimizacion inteligente: perfiles de configuracion, recomendaciones segun hardware, deteccion de cuellos de botella, backup y rollback.
* Asistente de proyectos: creacion de modpacks para Forge, Fabric, NeoForge y Quilt.
* Diagnostico de conflictos: analisis de compatibilidad (version, loader, dependencias) y peso del modpack.

## Tecnologias
* Frontend: React 19, Vite 8, React Flow, Monaco Editor, lucide-react.
* Desktop / backend: Electron 41, Node.js, adm-zip, @iarna/toml, systeminformation, bottleneck, winston.
* Integraciones: CurseForge API v1, Modrinth API v2.
* Tests: Vitest.

## Instalacion y ejecucion local

Requisitos: [Node.js](https://nodejs.org/).

```
git clone https://github.com/markhistorik12-star/Modificador-de-Modspacks.git
npm install
npm run start
```

Crea un archivo `.env` con:
```
CURSEFORGE_API_KEY=tu_clave
LOG_LEVEL=info        # opcional
LOG_TO_FILE=false     # opcional
```

Otros comandos: `npm run test`, `npm run lint`, `npm run build:exe` (genera `release/win-unpacked/Modpack Assist.exe`).

Es mi primer proyecto, es normal que tenga errores o que el codigo tenga algunos bugs. Normalmente ire haciendole actualizaciones para seguir mejorandolo, cualquier recomendacion u observacion sera bienvenida, gracias y buenos dias, buenas tardes y buenas noches.
