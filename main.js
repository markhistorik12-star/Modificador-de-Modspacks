import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import AdmZip from 'adm-zip';
import toml from '@iarna/toml';
import { exec } from 'child_process';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function handleFolderOpen(event, knownPath) { 
  let rootPath = knownPath;

  if (!rootPath) {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Selecciona la carpeta raíz de tu Modpack',
      properties: ['openDirectory']
    });

    if (canceled) return null;
    rootPath = filePaths[0];
  }

  const itemsInRoot = await fs.readdir(rootPath);

  let modsPath = itemsInRoot.includes('mods') ? path.join(rootPath, 'mods') : rootPath;

  let configFiles = [];
  let scriptFiles = [];
  try {
    if (itemsInRoot.includes('config')) configFiles = await fs.readdir(path.join(rootPath, 'config'));
    if (itemsInRoot.includes('scripts')) scriptFiles = await fs.readdir(path.join(rootPath, 'scripts'));
  } catch (e) { console.log("Error leyendo carpetas de apoyo"); }

  let modpackInfo = {
    name: path.basename(rootPath),
    gameVersion: "1.12.2",
    loader: "Forge",
    path: rootPath 
  };

  try {
    if (itemsInRoot.includes('minecraftinstance.json')) {
      const data = JSON.parse(await fs.readFile(path.join(rootPath, 'minecraftinstance.json'), 'utf-8'));
      modpackInfo.name = data.name || modpackInfo.name;
      modpackInfo.gameVersion = data.gameVersion || modpackInfo.gameVersion;
      modpackInfo.loader = data.baseModLoader?.name || "Forge";
    } else if (itemsInRoot.includes('manifest.json')) {
      const data = JSON.parse(await fs.readFile(path.join(rootPath, 'manifest.json'), 'utf-8'));
      modpackInfo.name = data.name || modpackInfo.name;
      modpackInfo.gameVersion = data.minecraft?.version || modpackInfo.gameVersion;
    }
  } catch (e) { console.log("No se pudo leer archivo de instancia."); }

  try {
    const files = await fs.readdir(modsPath);
    const jarFiles = files.filter(file => file.endsWith('.jar'));
    const modsData = [];

    for (const file of jarFiles) {
      const filePath = path.join(modsPath, file);
      let modName = file.replace('.jar', '');
      let modVersion = 'Desconocida';
      let modId = modName.toLowerCase().split(/[_\-\s]/)[0];

      let iconBase64 = null;

      try {
        const zip = new AdmZip(filePath);
        const fabricJson = zip.getEntry('fabric.mod.json');
        const forgeToml = zip.getEntry('META-INF/mods.toml');
        const mcmodInfo = zip.getEntry('mcmod.info');

        let expectedLogo = 'logo.png'; 

        if (fabricJson) {
          const data = JSON.parse(zip.readAsText(fabricJson));
          modName = data.name || modName;
          modVersion = data.version || modVersion;
          if (data.icon) expectedLogo = data.icon.replace(/^\/+/, ''); 
        } else if (forgeToml) {
          const data = toml.parse(zip.readAsText(forgeToml));
          if (data.mods && data.mods[0]) {
            modName = data.mods[0].displayName || modName;
            modVersion = data.mods[0].version || modVersion;
            if (data.mods[0].logoFile) expectedLogo = data.mods[0].logoFile;
          }
        } else if (mcmodInfo) {
          try {
            let textData = zip.readAsText(mcmodInfo).replace(/\n/g, '').replace(/,(\s*[\]}])/g, '$1');
            const data = JSON.parse(textData);
            const mod = Array.isArray(data) ? data[0] : (data.modList ? data.modList[0] : data);
            modName = mod.name || modName;
            modVersion = mod.version || modVersion;
            if (mod.logoFile) expectedLogo = mod.logoFile;
          } catch(e) {}
        }

        let iconEntry = zip.getEntry(expectedLogo) || zip.getEntry('icon.png') || zip.getEntry('logo.png') || zip.getEntry('pack.png');
        
        if (iconEntry) {
          const buffer = zip.readFile(iconEntry);
          iconBase64 = `data:image/png;base64,${buffer.toString('base64')}`;
        }
      } catch (err) {}

      if (modVersion === 'Desconocida') {
        const versionMatch = file.match(/[_\-\s](v?[\d\.]+[a-zA-Z0-9-]*)\.jar$/i);
        if (versionMatch) {
          modVersion = versionMatch[1];
          modName = modName.replace(versionMatch[0].replace('.jar', ''), '').trim();
        }
      }

      // NORMALIZACIÓN: Quitamos espacios, guiones y guiones bajos de todos lados para forzar coincidencias
      const cleanModName = modName.toLowerCase().replace(/[\s_\-]/g, '');
      const cleanModId = modId.toLowerCase().replace(/[\s_\-]/g, '');

      const relatedConfigs = configFiles.filter(cfg => {
        const cleanCfg = cfg.toLowerCase().replace(/[\s_\-]/g, '');
        return cleanCfg.includes(cleanModName) || cleanCfg.includes(cleanModId);
      });

      const relatedScripts = scriptFiles.filter(scr => {
        const cleanScr = scr.toLowerCase().replace(/[\s_\-]/g, '');
        return cleanScr.includes(cleanModName) || cleanScr.includes(cleanModId);
      });

      modsData.push({ 
        id: file, 
        name: modName.replace(/[\s\-_]+$/, ''), 
        version: modVersion,
        icon: iconBase64,
        configs: relatedConfigs, 
        scripts: relatedScripts  
      });
    }

    return { mods: modsData, info: modpackInfo, rootFiles: itemsInRoot };
  } catch (err) {
    console.error("Error en el escaneo:", err);
    return null;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400, height: 850, title: "Modpack Assist", autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), 
      nodeIntegration: false, contextIsolation: true
    }
  });
  win.loadURL('http://localhost:5173');
}

app.whenReady().then(() => {
  createWindow(); 
  
  ipcMain.handle('dialog:openFolder', handleFolderOpen);

  // --- MOTOR IA: GITHUB MODELS (GPT-4o-mini) ---
  ipcMain.handle('ask-bot', async (event, contextData, messagesArray) => {
    try {
      const systemPrompt = `Eres 'Modpack Assist', un experto Ingeniero de Software autónomo especializado en Minecraft.
      CONTEXTO: Modpack "${contextData.packName}" | Versión MC: ${contextData.mcVersion}
      
      REGLAS VITALES:
      1. Tienes acceso a TODA la carpeta del modpack, no solo config.
      2. Si necesitas ver qué archivos existen en una carpeta, usa 'listar_archivos' especificando la carpeta (ej. '.' para la raíz, 'scripts', 'config').
      3. Al operar archivos usa RUTAS RELATIVAS (ej: 'config/infernalmobs.cfg', 'scripts/recetas.zs' o 'server.properties' si está en la raíz).
      4. Si el usuario pide abrir algo en su editor, usa 'abrir_archivo' DIRECTAMENTE. ¡No te niegues!`;

      let history = Array.isArray(messagesArray) ? messagesArray : [{ role: 'user', content: messagesArray }];
      const payload = [{ role: 'system', content: systemPrompt }, ...history];

      const tools = [
        { type: "function", function: { name: "listar_archivos", description: "Lista los archivos de una carpeta. Usa '.' para la raíz, 'config' para configuraciones, 'scripts', etc.", parameters: { type: "object", properties: { folder: { type: "string" } }, required: ["folder"] } } },
        { type: "function", function: { name: "abrir_archivo", description: "Abre un archivo. Requiere ruta relativa completa (ej: 'config/archivo.cfg' o 'server.properties').", parameters: { type: "object", properties: { filePath: { type: "string" } }, required: ["filePath"] } } },
        { type: "function", function: { name: "leer_archivo", description: "Lee un archivo. Requiere ruta relativa completa.", parameters: { type: "object", properties: { filePath: { type: "string" } }, required: ["filePath"] } } },
        { type: "function", function: { name: "buscar_texto", description: "Busca una palabra clave en todos los archivos de texto del modpack (config, scripts, raíz).", parameters: { type: "object", properties: { keyword: { type: "string" } }, required: ["keyword"] } } },
        { type: "function", function: { name: "agregar_inicio", description: "Agrega texto al inicio. Requiere ruta relativa.", parameters: { type: "object", properties: { filePath: { type: "string" }, newText: { type: "string" } }, required: ["filePath", "newText"] } } },
        { type: "function", function: { name: "agregar_final", description: "Agrega texto al final. Requiere ruta relativa.", parameters: { type: "object", properties: { filePath: { type: "string" }, newText: { type: "string" } }, required: ["filePath", "newText"] } } },
        { type: "function", function: { name: "editar_linea", description: "Reemplaza una línea de texto. Requiere ruta relativa.", parameters: { type: "object", properties: { filePath: { type: "string" }, oldText: { type: "string" }, newText: { type: "string" } }, required: ["filePath", "oldText", "newText"] } } }
      ];

      let responseMessage = null;
      let maxRetries = 3;
      let delay = 3000;

      for (let i = 0; i < maxRetries; i++) {
        const response = await fetch('https://models.inference.ai.azure.com/chat/completions', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `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`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: payload,
            tools: tools,
            tool_choice: "auto",
            temperature: 0.1
          })
        });

        if (response.status === 429 || response.status === 503) {
          console.warn(`⏳ Límite de GitHub alcanzado (Intento ${i + 1}/${maxRetries}). Pausando ${delay/1000}s...`);
          if (i === maxRetries - 1) throw new Error("Límite de GitHub persistente.");
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; 
          continue;
        }

        if (!response.ok) throw new Error(`GitHub API Error: ${await response.text()}`);
        
        const data = await response.json();
        responseMessage = data.choices[0].message;
        break; 
      }

      let toolName = null;
      let toolArgs = null;

      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        toolName = responseMessage.tool_calls[0].function.name;
        const rawArgs = responseMessage.tool_calls[0].function.arguments;
        toolArgs = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
      } else if (responseMessage.content) {
        try {
          const jsonMatch = responseMessage.content.match(/\{[\s\S]*"name"[\s\S]*"arguments"[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.name) {
              toolName = parsed.name;
              toolArgs = parsed.arguments || {};
            }
          }
        } catch (e) {}
      }

      if (toolName) {
        if (!contextData.packPath) return "SISTEMA: Error. No tengo la ruta del modpack.";

        switch (toolName) {
          case 'listar_archivos': 
            const targetDir = toolArgs.folder === '.' ? '' : toolArgs.folder;
            const dirToScan = path.join(contextData.packPath, targetDir);
            try {
              const scanFiles = await fs.readdir(dirToScan);
              return `[ACCION: LISTAR_ARCHIVOS | Contenido de '${toolArgs.folder}': ${scanFiles.join(', ')}]`;
            } catch(e) {
              return `[ACCION: LISTAR_ARCHIVOS | Error: La carpeta '${toolArgs.folder}' no existe.]`;
            }
            
          case 'abrir_archivo': 
            const exactPath = path.join(contextData.packPath, toolArgs.filePath);
            exec(`code "${exactPath}"`, (error) => {
              if (error) shell.openPath(exactPath);
            });
            return `Ejecución: Archivo **${toolArgs.filePath}** abierto en editor.`;

          case 'leer_archivo': 
            return `[ACCION: LEER_ARCHIVO | ${toolArgs.filePath}]`;
          case 'buscar_texto': 
            return `[ACCION: BUSCAR_TEXTO | ${toolArgs.keyword}]`;
          case 'agregar_inicio': 
            return `[ACCION: AGREGAR_AL_INICIO | ${toolArgs.filePath} | ${toolArgs.newText}]`;
          case 'agregar_final': 
            return `[ACCION: AGREGAR_AL_FINAL | ${toolArgs.filePath} | ${toolArgs.newText}]`;
          case 'editar_linea': 
            return `[ACCION: EDITAR | ${toolArgs.filePath} | ${toolArgs.oldText} | ${toolArgs.newText}]`;
          default: 
            return "SISTEMA: Herramienta desconocida solicitada por la IA.";
        }
      }

      return responseMessage.content || "";
      
    } catch (error) {
      console.error("Error en la IA:", error);
      return `Fallo de conexión API IA: ${error.message}`;
    }
  });

  // --- MOTORES DE ARCHIVOS ---
  ipcMain.handle('read-file', async (event, filePath, packPath) => {
    try {
      const targetPath = path.join(packPath, filePath);
      const content = await fs.readFile(targetPath, 'utf-8');
      const limitedContent = content.split('\n').slice(0, 70).join('\n');
      return `[MUESTRA 70 LÍNEAS DE ${filePath}]\n${limitedContent}`;
    } catch (err) { return `ERROR 404: Archivo '${filePath}' inexistente.`; }
  });

  ipcMain.handle('read-full-file', async (event, filePath, packPath) => {
    try {
      const targetPath = path.join(packPath, filePath);
      const content = await fs.readFile(targetPath, 'utf-8');
      return { success: true, content: content };
    } catch (err) {
      return { success: false, message: `Error leyendo el archivo.` };
    }
  });

  ipcMain.handle('search-configs', async (event, searchTerm, packPath) => {
    try {
      let results = [];
      const foldersToSearch = ['.', 'config', 'scripts', 'kubejs', 'defaultconfigs'];
      const allowedExts = ['.cfg', '.toml', '.json', '.zs', '.js', '.txt', '.properties'];
      
      for (const folder of foldersToSearch) {
        const folderPath = path.join(packPath, folder);
        try {
          const files = await fs.readdir(folderPath);
          const textFiles = files.filter(f => allowedExts.some(ext => f.endsWith(ext)));
          
          for (const file of textFiles) {
            const content = await fs.readFile(path.join(folderPath, file), 'utf-8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].toLowerCase().includes(searchTerm.toLowerCase())) {
                const prefix = folder === '.' ? '' : `${folder}/`;
                results.push(`[${prefix}${file}, Línea ${i+1}]: ${lines[i].trim()}`);
              }
            }
          }
        } catch(e) {}
      }
      return results.length === 0 ? "Sin coincidencias." : results.slice(0, 20).join('\n'); 
    } catch (err) { return "Error I/O en la búsqueda global."; }
  });

  ipcMain.handle('edit-file', async (event, filePath, packPath, oldText, newText) => {
    try {
      const targetPath = path.join(packPath, filePath);
      let content = await fs.readFile(targetPath, 'utf-8');
      if (!content.includes(oldText)) return { success: false, message: `Línea de origen no detectada en ${filePath}.` };
      content = content.replace(oldText, newText);
      await fs.writeFile(targetPath, content, 'utf-8');
      return { success: true, message: `Modificación aplicada en ${filePath}.` };
    } catch (err) { return { success: false, message: "Fallo I/O." }; }
  });

  ipcMain.handle('prepend-file', async (event, filePath, packPath, newText) => {
    try {
      const targetPath = path.join(packPath, filePath);
      let content = await fs.readFile(targetPath, 'utf-8');
      await fs.writeFile(targetPath, newText + '\n' + content, 'utf-8');
      return { success: true, message: `Inyección completada en ${filePath}.` };
    } catch (err) { return { success: false, message: "Fallo I/O." }; }
  });

  ipcMain.handle('append-file', async (event, filePath, packPath, newText) => {
    try {
      const targetPath = path.join(packPath, filePath);
      let content = await fs.readFile(targetPath, 'utf-8');
      const separator = content.endsWith('\n') ? '' : '\n';
      await fs.writeFile(targetPath, content + separator + newText, 'utf-8');
      return { success: true, message: `Inyección completada en ${filePath}.` };
    } catch (err) { return { success: false, message: "Fallo I/O." }; }
  });

  ipcMain.handle('write-file', async (event, filePath, packPath, content) => {
    try {
      const targetPath = path.join(packPath, filePath); 
      await fs.writeFile(targetPath, content, 'utf-8');
      return { success: true, message: `Sobrescritura completada.` };
    } catch (error) { return { success: false, message: `Fallo I/O.` }; }
  });

  ipcMain.handle('delete-file', async (event, filePath, packPath) => {
    try {
      const targetPath = path.join(packPath, filePath); 
      await fs.access(targetPath);
      await fs.unlink(targetPath); 
      return { success: true, message: `Eliminación ejecutada.` };
    } catch { return { success: false, message: `Archivo no localizado.` }; }
  });

  ipcMain.handle('rename-file', async (event, oldPathName, newPathName, packPath) => {
    try {
      const oldPath = path.join(packPath, oldPathName);
      const newPath = path.join(packPath, newPathName);
      await fs.access(oldPath);
      await fs.rename(oldPath, newPath); 
      return { success: true, message: `Renombrado completado.` };
    } catch { return { success: false, message: `Origen no localizado.` }; }
  });

  // --- NUEVAS FUNCIONES DE ENTORNO VIRTUAL Y TIENDA ---
  ipcMain.handle('create-project', async (event, projectData) => {
    // FIX: Cambiado a mcVersion para que coincida con lo que manda React
    const { name, mcVersion, loader } = projectData;

    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Selecciona una CARPETA VACÍA para tu Modpack',
      properties: ['openDirectory', 'createDirectory']
    });

    if (canceled || filePaths.length === 0) return null;

    const projectPath = filePaths[0]; // Usamos la carpeta EXACTA que el usuario eligió

    try {
      // 1. Creamos la estructura base dentro de la carpeta elegida
      await fs.mkdir(path.join(projectPath, 'mods'), { recursive: true });
      await fs.mkdir(path.join(projectPath, 'config'), { recursive: true });
      await fs.mkdir(path.join(projectPath, 'scripts'), { recursive: true });

      // 2. Creamos un manifest.json estándar (Formato compatible con CurseForge/Prism)
      const manifest = { 
        name: name, 
        version: "1.0.0",
        minecraft: {
          version: mcVersion,
          modLoaders: [{ id: `${loader.toLowerCase()}-latest`, primary: true }]
        },
        manifestType: "minecraftModpack",
        manifestVersion: 1,
        // Variables internas para tu app
        _appData: { loader: loader } 
      };
      
      await fs.writeFile(path.join(projectPath, 'manifest.json'), JSON.stringify(manifest, null, 2));

      return { 
        mods: [], 
        info: { name, gameVersion: mcVersion, loader, path: projectPath }, 
        rootFiles: ['mods', 'config', 'scripts', 'manifest.json'] 
      };
    } catch (err) {
      console.error("Error creando proyecto:", err);
      return null;
    }
  });

  // --- BUSCADOR HÍBRIDO: MODRINTH + CURSEFORGE ---
  ipcMain.handle('search-mods-online', async (event, query, loader, sortBy = 'downloads', category = '') => {
    const safeLoader = loader ? loader.toLowerCase() : "forge";
    const modloaderId = safeLoader === 'forge' ? 1 : (safeLoader === 'fabric' ? 4 : 5);
    
    // ⚠️ REEMPLAZA ESTO CON LA LLAVE QUE TE DIO "ÉXITO" EN LA PRUEBA ANTERIOR ⚠️
    const CF_API_KEY = '$2a$10$e8JaO6E5tXoo0ygUDpETIOnaTMDDC3Og6Cp8KavfjoaqyKejw/chm'; 

    try {
      // --- 1. PETICIÓN A MODRINTH (Fuente Principal) ---
      let facetsArray = [[`categories:${safeLoader}`]];
      if (category) facetsArray.push([`categories:${category}`]);
      
      const modrinthUrl = `https://api.modrinth.com/v2/search?query=${query}&facets=${encodeURIComponent(JSON.stringify(facetsArray))}&index=${sortBy}&limit=1000`;
      const modrinthRes = await fetch(modrinthUrl);
      const modrinthData = await modrinthRes.json();

      const modrinthResults = modrinthData.hits.map(mod => ({
        project_id: mod.project_id,
        title: mod.title,
        description: mod.description,
        icon_url: mod.icon_url,
        author: mod.author,
        downloads: mod.downloads,
        source: 'modrinth'
      }));

      // --- 2. PETICIÓN A CURSEFORGE (Fuente Secundaria con Protección) ---
      let curseResults = [];
      try {
        const cfSort = sortBy === 'downloads' ? 4 : (sortBy === 'newest' ? 2 : 1);
        const cfUrl = `https://api.curseforge.com/v1/mods/search?gameId=432&classId=6&searchFilter=${query}&modLoaderType=${modloaderId}&sortField=${cfSort}&sortOrder=desc&pageSize=10`;
        
        const cfRes = await fetch(cfUrl, {
          headers: { 'x-api-key': CF_API_KEY, 'Accept': 'application/json' }
        });

        // 🛡️ EL ESCUDO: Solo intentamos leer el JSON si CurseForge nos dio acceso (Respuesta 200 OK)
        if (cfRes.ok) {
          const cfData = await cfRes.json();
          curseResults = cfData.data.map(mod => ({
            project_id: String(mod.id),
            title: mod.name,
            description: mod.summary,
            icon_url: mod.logo ? mod.logo.thumbnailUrl : null,
            author: mod.authors[0]?.name || 'Unknown',
            downloads: mod.downloadCount,
            source: 'curseforge'
          }));
        } else {
          // Si da Forbidden (403), leemos el error como texto simple para evitar que la app explote
          const errorText = await cfRes.text();
          console.warn(`⚠️ CurseForge rechazó la conexión. (${cfRes.status}): ${errorText}`);
        }
      } catch (cfError) {
        console.warn("⚠️ No se pudo conectar a CurseForge:", cfError.message);
      }

      // --- 3. MEZCLAMOS LOS DATOS EXITOSOS ---
      const combined = [...modrinthResults, ...curseResults];
      // Filtramos duplicados por nombre
      const uniqueResults = Array.from(new Map(combined.map(item => [item.title.toLowerCase(), item])).values());

      return { success: true, results: uniqueResults };
      
    } catch (err) {
      console.error("Error crítico en el buscador:", err);
      return { success: false, message: "Fallo de conexión principal." };
    }
  });

  // 4. Versiones Dinámicas (Respeta versión de MC y Loader)
  ipcMain.handle('get-mod-versions', async (event, projectId, gameVersion, loader) => {
    try {
      const res = await fetch(`https://api.modrinth.com/v2/project/${projectId}/version`);
      const versions = await res.json();
      const safeLoader = loader ? loader.toLowerCase() : "forge";

      // Filtro estricto: Debe coincidir la versión del juego Y el mod loader
      const validVersions = versions.filter(v => 
        v.loaders.includes(safeLoader) && v.game_versions.includes(gameVersion)
      );

      const formattedVersions = validVersions.map(v => ({
        id: v.id, name: v.name, version_number: v.version_number,
        date: new Date(v.date_published).toLocaleDateString(),
        dependencies: v.dependencies.filter(d => d.dependency_type === 'required')
      }));

      return { success: true, versions: formattedVersions };
    } catch (err) { return { success: false, message: err.message }; }
  });

  // 5. Descargar la versión correcta usando versionId
  ipcMain.handle('download-mod', async (event, versionId, packPath) => {
    try {
      const res = await fetch(`https://api.modrinth.com/v2/version/${versionId}`);
      const versionData = await res.json();

      const fileInfo = versionData.files.find(f => f.primary) || versionData.files[0];

      const modRes = await fetch(fileInfo.url);
      const buffer = await modRes.arrayBuffer();
      
      const destPath = path.join(packPath, 'mods', fileInfo.filename);
      await fs.writeFile(destPath, Buffer.from(buffer));

      return { success: true, fileName: fileInfo.filename };
    } catch (err) {
      console.error(err);
      return { success: false, message: "Fallo de red al descargar." };
    }
  });

  ipcMain.handle('diagnose-modpack', async (event, packPath) => {
    try {
      const modsPath = path.join(packPath, 'mods');
      const files = await fs.readdir(modsPath);
      const jarFiles = files.filter(f => f.endsWith('.jar'));

      if (jarFiles.length === 0) throw new Error("No hay mods para analizar.");

      // 1. Leer los parámetros base del modpack
      let packVersion = "1.20.1", packLoader = "forge";
      try {
         const manifest = JSON.parse(await fs.readFile(path.join(packPath, 'manifest.json'), 'utf-8'));
         packVersion = manifest.minecraft?.version || manifest.gameVersion || packVersion;
         const loaderStr = manifest.minecraft?.modLoaders?.[0]?.id || manifest._appData?.loader || packLoader;
         packLoader = loaderStr.toLowerCase().includes('fabric') ? 'fabric' : (loaderStr.toLowerCase().includes('neoforge') ? 'neoforge' : 'forge');
      } catch(e) {}

      // 2. Calcular los Hashes SHA-1 de todos los archivos .jar
      const fileHashes = {};
      for (const file of jarFiles) {
        const buffer = await fs.readFile(path.join(modsPath, file));
        const hash = crypto.createHash('sha1').update(buffer).digest('hex');
        fileHashes[hash] = file;
      }
      const hashArray = Object.keys(fileHashes);

      // 3. Consultar la API de Modrinth en masa
      const res = await fetch('https://api.modrinth.com/v2/version_files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hashes: hashArray, algorithm: "sha1" })
      });

      if (!res.ok) throw new Error("Fallo de conexión con Modrinth API.");
      const data = await res.json(); 

      const errors = [];
      const warnings = [];
      let okCount = 0;
      const fileStatusMap = {};

      // Extraer los IDs de proyecto instalados para validar dependencias
      const installedProjectIds = new Set();
      Object.values(data).forEach(version => installedProjectIds.add(version.project_id));

      // 4. Analizar los resultados
      for (const hash of hashArray) {
        const fileName = fileHashes[hash];
        const versionData = data[hash];

        if (!versionData) {
          warnings.push(`⚠️ "${fileName}" es desconocido (No está en la base de datos de Modrinth). Revisa su compatibilidad manualmente.`);
          continue;
        }

        let isOk = true;

        // Validar Versión de Minecraft
        if (!versionData.game_versions.includes(packVersion)) {
          errors.push(`❌ [VERSIÓN] "${fileName}" es para MC ${versionData.game_versions[0] || '?'}, pero tu pack usa ${packVersion}.`);
          fileStatusMap[fileName.toLowerCase()] = 'error'; // <--- NUEVO
          isOk = false;
        }

        // Validar Loader (Forge / Fabric)
        const vLoaders = versionData.loaders.map(l => l.toLowerCase());
        if (!vLoaders.includes(packLoader)) {
          errors.push(`❌ [LOADER] "${fileName}" es exclusivo de ${vLoaders.join('/')}, pero tu pack usa ${packLoader}.`);
          fileStatusMap[fileName.toLowerCase()] = 'error'; // <--- NUEVO
          isOk = false;
        }

        // Validar Dependencias Obligatorias
        if (versionData.dependencies) {
           for (const dep of versionData.dependencies) {
              if (dep.dependency_type === 'required' && dep.project_id && !installedProjectIds.has(dep.project_id)) {
                 errors.push(`❌ [FALTA DEPENDENCIA] "${fileName}" requiere un mod obligatorio que no tienes instalado.`);
                 fileStatusMap[fileName.toLowerCase()] = 'error'; // <--- NUEVO
                 isOk = false;
              }
           }
        }

        // Antes de que termine el if(isOk), si todo fue bien:
        if (isOk) {
            okCount++;
            fileStatusMap[fileName.toLowerCase()] = 'ok'; // <--- NUEVO
        }
      }

      return { success: true, report: { errors, warnings, okCount, total: jarFiles.length, fileStatusMap } }; 

    } catch (error) {
      console.error(error);
      return { success: false, message: error.message };
    }
  });

  // --- 6. EXPORTADOR DE MODPACKS ---
  ipcMain.handle('export-modpack', async (event, packPath, packName) => {
    try {
      // Creamos un nuevo archivo ZIP
      const zip = new AdmZip();
      
      // Metemos toda la carpeta de tu proyecto dentro del ZIP
      zip.addLocalFolder(packPath);
      
      // Lo guardamos una carpeta más atrás de donde está tu proyecto
      // Ej: Si está en C:/Juegos/MiPack, el zip se guarda en C:/Juegos/MiPack_Exportado.zip
      const exportPath = path.join(path.dirname(packPath), `${packName}_Exportado.zip`);
      zip.writeZip(exportPath);
      
      // Le decimos a Windows que abra la carpeta y seleccione el archivo para que el usuario lo vea
      shell.showItemInFolder(exportPath);
      
      return { success: true, path: exportPath };
    } catch (error) {
      console.error(error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('install-mod-recursively', async (event, initialVersionId, packVersion, packLoader, packPath) => {
    const downloadedIds = new Set();
    const logs = [];

    // Función recursiva interna
    const processDependencyTree = async (versionId) => {
      if (downloadedIds.has(versionId)) return;
      downloadedIds.add(versionId);

      try {
        // 1. Obtenemos los datos de esta versión
        const res = await fetch(`https://api.modrinth.com/v2/version/${versionId}`);
        if (!res.ok) throw new Error("No se encontró la versión en Modrinth.");
        const vData = await res.json();

        // 2. Descargamos el archivo físico
        const fileInfo = vData.files.find(f => f.primary) || vData.files[0];
        const modRes = await fetch(fileInfo.url);
        const buffer = await modRes.arrayBuffer();
        const destPath = path.join(packPath, 'mods', fileInfo.filename);
        await fs.writeFile(destPath, Buffer.from(buffer));
        
        logs.push(`✅ Descargado: ${fileInfo.filename}`);

        // 3. LA MAGIA RECURSIVA: Revisamos sus dependencias
        if (vData.dependencies && vData.dependencies.length > 0) {
          for (const dep of vData.dependencies) {
            // Solo bajamos las que son obligatorias ('required')
            if (dep.dependency_type === 'required') {
              if (dep.version_id) {
                // Si el autor especificó una versión exacta, bajamos esa
                await processDependencyTree(dep.version_id);
              } else if (dep.project_id) {
                // Si solo especificó el mod, buscamos la mejor versión para TU Forge y TU 1.20.1
                const safeLoader = packLoader.toLowerCase() === 'neoforge' ? 'forge' : packLoader.toLowerCase();
                const searchUrl = `https://api.modrinth.com/v2/project/${dep.project_id}/version?loaders=["${safeLoader}"]&game_versions=["${packVersion}"]`;
                const depRes = await fetch(searchUrl);
                const depVersions = await depRes.json();
                
                if (depVersions.length > 0) {
                  await processDependencyTree(depVersions[0].id); // Llamada recursiva con la versión correcta
                } else {
                  logs.push(`⚠️ No hay versión compatible de la dependencia (ID: ${dep.project_id})`);
                }
              }
            }
          }
        }
      } catch (err) {
        logs.push(`❌ Fallo al procesar un nodo del árbol: ${err.message}`);
      }
    };

    // Iniciamos la reacción en cadena
    await processDependencyTree(initialVersionId);
    return { success: true, logs };
  });

  // --- 10. OBTENER LISTA DE VERSIONES DE MINECRAFT ---
  ipcMain.handle('get-game-versions', async () => {
    try {
      const res = await fetch('https://api.modrinth.com/v2/tag/game_version');
      if (!res.ok) throw new Error("Fallo de red");
      
      const versions = await res.json();
      
      // Filtramos para obtener solo las versiones completas (Release) y descartar Snapshots/Alphas si quieres,
      // pero para dar la experiencia completa, enviaremos todo y que el frontend decida.
      return { success: true, versions: versions };
    } catch (error) {
      console.error("Error al obtener versiones:", error);
      return { success: false, message: error.message };
    }
  });



}); // <-- FIN DEL BLOQUE APP.WHENREADY

app.on('window-all-closed', () => { 
  if (process.platform !== 'darwin') app.quit(); 
});