export const createDependencyGraph = (mods) => {
  const newNodes = [];
  const newEdges = [];

  const groups = {
    'Librerías / Coremods': []
  };

  mods.forEach(mod => {
    const lowerName = mod.name.toLowerCase();

    if (
      lowerName.includes('core') || lowerName.includes('lib') ||
      lowerName.includes('api') || lowerName.includes('patch') ||
      lowerName.includes('baubles') || lowerName.includes('bookshelf')
    ) {
      groups['Librerías / Coremods'].push(mod);
    } else {
      const configCount = mod.configs.length;
      let groupName = '';

      if (configCount === 0) {
        groupName = 'Contenido (Sin Configs)';
      } else if (configCount === 1) {
        groupName = 'Contenido (1 Config)';
      } else {
        groupName = `Contenido (${configCount} Configs)`;
      }

      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(mod);
    }
  });

  const sortedGroupKeys = Object.keys(groups).sort((a, b) => {
    if (a === 'Librerías / Coremods') return -1;
    if (b === 'Librerías / Coremods') return 1;
    if (a === 'Contenido (Sin Configs)') return -1;
    if (b === 'Contenido (Sin Configs)') return 1;

    const numA = parseInt(a.match(/\d+/)?.[0] || 0);
    const numB = parseInt(b.match(/\d+/)?.[0] || 0);
    return numA - numB;
  });

  let posX = 100;
  let posY = 150;

  sortedGroupKeys.forEach((groupName, groupIndex) => {
    const modsInGroup = groups[groupName];
    if (modsInGroup.length === 0) return;

    const groupId = `group-${groupIndex}`;
    const cols = 4;

    const maxConfigsInGroup = Math.max(...modsInGroup.map(m => m.configs.length), 0);
    const baseModHeight = 100;
    const configSpacing = 35;
    const rowHeight = baseModHeight + (maxConfigsInGroup * configSpacing) + 50;

    const numRows = Math.ceil(modsInGroup.length / cols);
    const groupWidth = Math.min(modsInGroup.length, cols) * 310 + 40;
    const groupHeight = (numRows * rowHeight) + 60;

    newNodes.push({
      id: groupId,
      type: 'group',
      position: { x: posX, y: posY },
      style: { width: groupWidth, height: groupHeight, zIndex: 0 },
      data: { label: groupName }
    });

    modsInGroup.forEach((mod, index) => {
      const modId = `mod-${mod.id}`;

      const relX = (index % cols) * 310 + 20;
      const relY = Math.floor(index / cols) * rowHeight + 60;

      newNodes.push({
        id: modId,
        type: 'mod',
        position: { x: relX, y: relY },
        parentNode: groupId,
        extent: 'parent',
       data: {
         label: mod.name,
         version: mod.version,
         icon: mod.icon,
         hasConfigs: mod.configs.length > 0
       },
       style: { zIndex: 1, borderRadius: 12, boxShadow: '0 6px 14px rgba(0,0,0,.25)', background: '#1a1d24', border: '1px solid #2a2e36' }
     });

     mod.configs.forEach((cfg, cIndex) => {
       const cfgId = `cfg-${mod.id}-${cIndex}`;
       newNodes.push({
         id: cfgId,
         parentNode: modId,
         extent: 'parent',
         style: {
           background: '#00e67a', color: '#0d0f12', fontSize: '10px',
           width: 150, borderRadius: '4px', padding: '4px', border: '1px solid #2a2e36', zIndex: 2
         },
         position: { x: 20, y: 75 + (cIndex * 35) },
          data: { label: `Config: ${cfg}` }
       });
       newEdges.push({
         id: `edge-${modId}-${cfgId}`,
         source: modId, target: cfgId, animated: true,
         type: 'smoothstep',
         style: { stroke: '#00e67a', strokeWidth: 2, zIndex: 1 },
       });
     });
    });

    posX += groupWidth + 100;
  });

  return { newNodes, newEdges };
};
