# Modpack Assist 

> [!NOTE]
> **Work in Progress (Pre-release):** This application is currently under active development. Features and behavior may change in upcoming updates.

**Modpack Assist** is a desktop application built with Electron, React, and Vite designed to create, manage, edit, diagnose, and optimize Minecraft modpacks (**Forge, Fabric, NeoForge, and Quilt**) from a unified visual interface.

## Key Features

* **Visual Ecosystem:** Interactive node graph (ReactFlow) that automatically groups mods into libraries/coremods and content modules, featuring focused search, zoom controls, minimap, internal `.jar` file browsing without extraction, and direct access to mod configs.
* **Global File Explorer & Config Editor:** Modpack file browser with filtered search, an interactive `key=value` editor for configuration files (`.toml`, `.cfg`, `.properties`, etc.), and system default external editor support.
* **Integrated Online Store (Modrinth + CurseForge):** Simultaneous dual-platform search with deduplicated results, local caching, API status and latency indicators, category and sort filters, version selector, and recursive dependency installation (Modrinth).
* **Tweaks Center (KubeJS & Loot Tables):**
  * **Item Tweaks** (`startup_scripts/1_item_tweaks.js`): Modify attack damage, attack speed, armor, toughness, knockback resistance, max durability, stack size, and fire resistance.
  * **Entity Mutator** (`server_scripts/2_entity_tweaks.js`): Set fixed values or multipliers for health, damage, speed, armor, knockback resistance, and follow range (compatible with Minecraft 1.18 through 1.21+).
  * **Spawn Control** (`server_scripts/3_spawn_tweaks.js`): Block spawns, limit spawn probability (%), or replace entities with dimension, Y-level range, and baby-only filters.
  * **Loot Editor:** Visual builder for entities, structure chests, and custom tables (additive mode preserving original drops or full table replacement in `kubejs/data/...`), plus an advanced raw JSON patch mode.
  * **Built-in Utilities:** Auto-completion combining vanilla IDs with IDs scanned from installed `.jar` files, persistent rule tracking to update or delete tweaks without code duplication, and automatic KubeJS detection.
* **Smart Optimizer:** Configurable profiles (`default`, `heavy-modpack`, `server`) across selectable categories (GPU/VRAM, CPU/Maps, CPU/Entities, Engine/Network) with automatic backups and one-click rollback.
* **Performance Monitor:** System hardware detection (CPU, RAM, GPU) and heuristic per-mod impact scoring running off the main thread via `worker_threads`.
* **Script IDE:** Monaco-based code editor with a recursive file tree for KubeJS (`.js`) and CraftTweaker (`.zs`) scripts.
* **Diagnostics & Export:** SHA1 hash verification against Modrinth (Minecraft version, modloader, and missing required dependencies), heuristic pack weight score (1–10), new project wizard, and `.zip` export.

### Tech Stack
* **Frontend:** React 19, Vite 8, ReactFlow, Monaco Editor, Lucide Icons.
* **Desktop & Backend:** Electron 41, Node.js, `adm-zip`, `@iarna/toml`, `systeminformation`, `bottleneck`, `winston`.
* **Quality & Security:** ESLint, Vitest, path traversal sanitization, Electron `contextIsolation` and `sandbox`, and strict HTTPS download domain validation.
