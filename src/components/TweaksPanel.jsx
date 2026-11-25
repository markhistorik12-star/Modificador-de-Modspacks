import { useState, useMemo, memo } from 'react';
import { Trash2, Edit3, Plus, AlertTriangle, CheckCircle, Code2 } from 'lucide-react';

const AutocompleteInput = memo(function AutocompleteInput({ value, onChange, availableIds, placeholder, color = '#f8f9fa' }) {
  const [showDropdown, setShowDropdown] = useState(false);
  const suggestions = useMemo(() => {
    const list = Array.isArray(availableIds) ? availableIds : [];
    if (!value) return list.slice(0, 40);
    const lower = value.toLowerCase();
    return list.filter(id => id.toLowerCase().includes(lower)).slice(0, 50);
  }, [value, availableIds]);

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => { onChange(e.target.value.toLowerCase()); setShowDropdown(true); }}
        onBlur={() => setTimeout(() => setShowDropdown(false), 180)}
        onFocus={() => setShowDropdown(true)}
        className="input input-mono"
        style={{ marginTop: '6px', color, width: '100%', boxSizing: 'border-box' }}
      />
      {showDropdown && suggestions.length > 0 && (
        <ul style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: '#1a1d24', border: '1px solid #00e5ff',
          borderRadius: '8px', zIndex: 80, maxHeight: '220px',
          overflowY: 'auto', padding: 0, margin: '4px 0 0 0',
          listStyle: 'none', boxShadow: '0 8px 28px rgba(0,0,0,0.65)'
        }}>
          {suggestions.map((s) => (
            <li
              key={s}
              onMouseDown={(e) => { e.preventDefault(); onChange(s); setShowDropdown(false); }}
              style={{
                padding: '9px 14px', cursor: 'pointer', color: '#f8f9fa',
                borderBottom: '1px solid #2a2e36', fontSize: '12px', fontFamily: 'var(--font-mono)'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#262b33'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

const CATEGORY_LABELS = [
  { id: 'gpu_vram', label: 'GPU / VRAM', desc: 'Sodium, Embeddium, Oculus, Iris (niebla, iluminacion suave, shaders)' },
  { id: 'cpu_maps', label: 'CPU / Minimapas', desc: 'Xaero Minimap, World Map y JourneyMap (frecuencia y cuevas)' },
  { id: 'cpu_entities', label: 'CPU / Entidades', desc: 'EntityCulling, Alexs Mobs, Ice and Fire, PhysicsMod' },
  { id: 'engine_system', label: 'Motor / Red', desc: 'BetterFPSDist, ParticleCulling, Connectivity, Farsight, Forge Client' },
];

const cardStyle = {
  background: '#1a1d24',
  padding: '22px',
  borderRadius: '12px',
  border: '1px solid #2a2e36',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};

const fieldInputStyle = (color = '#f8f9fa') => ({
  width: '100%',
  padding: '10px 12px',
  marginTop: '6px',
  borderRadius: '8px',
  border: '1px solid #2a2e36',
  background: '#0d0f12',
  color,
  outline: 'none',
  boxSizing: 'border-box',
});

export default function TweaksPanel({
  packInfo,
  modCatalog,
  tweaks,
  optimization,
  onSearchKubeJSInStore,
  onOpenIde,
}) {
  const itemList = Object.values(tweaks.savedTweaks?.items || {});
  const entityList = Object.values(tweaks.savedTweaks?.entities || {});
  const spawnList = Object.values(tweaks.savedTweaks?.spawns || {});
  const lootList = Object.values(tweaks.savedTweaks?.loots || {});

  const itemIds = modCatalog?.items?.length ? modCatalog.items : [];
  const entityIds = modCatalog?.entities?.length ? modCatalog.entities : [];
  const chestIds = modCatalog?.chests?.length ? modCatalog.chests : [];

  const updateDrop = (idx, field, val) => {
    const next = tweaks.lootCenter.drops.map((d, i) => (i === idx ? { ...d, [field]: val } : d));
    tweaks.setLootCenter({ ...tweaks.lootCenter, drops: next });
  };

  const addDropRow = () => {
    tweaks.setLootCenter({
      ...tweaks.lootCenter,
      drops: [...tweaks.lootCenter.drops, { itemId: '', min: 1, max: 1, chance: 50 }],
    });
  };

  const removeDropRow = (idx) => {
    if (tweaks.lootCenter.drops.length <= 1) return;
    tweaks.setLootCenter({
      ...tweaks.lootCenter,
      drops: tweaks.lootCenter.drops.filter((_, i) => i !== idx),
    });
  };

  const navItems = [
    { id: 'items', label: 'Ajuste de Items', count: itemList.length, accent: '#f5c2e7' },
    { id: 'entities', label: 'Mutador Genetico', count: entityList.length, accent: '#00e67a' },
    { id: 'spawn', label: 'Control de Spawns', count: spawnList.length, accent: '#00e5ff' },
    { id: 'loot', label: 'Editor de Loot', count: lootList.length, accent: '#ffc42e' },
    { id: 'optimizer', label: 'Optimizador', count: optimization.hasBackup ? optimization.optimizerResults.length : 0, accent: '#ff4d6a' },
  ];

  return (
    <div className="tab-content" style={{ display: 'flex', height: 'calc(100vh - 112px)', width: '100%' }}>
      <div className="tweak-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <h3>Modulos de Balance</h3>
        {navItems.map(nav => {
          const active = tweaks.activeTweakTab === nav.id;
          return (
            <button
              key={nav.id}
              onClick={() => tweaks.setActiveTweakTab(nav.id)}
              className={`tweak-nav-item ${active ? 'active' : ''}`}
              style={{
                color: active ? '#f8f9fa' : '#9ca3af',
                borderLeftColor: active ? nav.accent : 'transparent',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>{nav.label}</span>
              {nav.count > 0 && (
                <span style={{
                  background: nav.accent,
                  color: '#0d0f12',
                  borderRadius: '10px',
                  padding: '1px 7px',
                  fontSize: '11px',
                  fontWeight: 'bold',
                }}>{nav.count}</span>
              )}
            </button>
          );
        })}

        <div style={{ marginTop: 'auto', padding: '12px 10px', borderTop: '1px solid #2a2e36' }}>
          <button
            onClick={onOpenIde}
            style={{
              width: '100%', padding: '9px 10px', borderRadius: '8px',
              border: '1px solid #2a2e36', background: '#0d0f12', color: '#00e5ff',
              cursor: 'pointer', fontSize: '12px', fontWeight: 'bold',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
            }}
          >
            <Code2 size={14} /> Ver Scripts en IDE
          </button>
        </div>
      </div>

      <div style={{ flex: 1, padding: '32px 40px 90px 40px', overflowY: 'auto' }}>
        {/* Estado del modpack / KubeJS */}
        {!packInfo ? (
          <div style={{
            maxWidth: '760px', marginBottom: '20px', padding: '14px 18px', borderRadius: '10px',
            background: 'rgba(255, 196, 46, 0.1)', border: '1px solid #ffc42e',
            color: '#ffc42e', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '10px'
          }}>
            <AlertTriangle size={18} />
            <span>Carga o crea un modpack desde la barra superior antes de aplicar ajustes de balance.</span>
          </div>
        ) : tweaks.activeTweakTab !== 'optimizer' && !modCatalog?.hasKubeJS ? (
          <div style={{
            maxWidth: '760px', marginBottom: '20px', padding: '14px 18px', borderRadius: '10px',
            background: 'rgba(255, 196, 46, 0.1)', border: '1px solid #ffc42e',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#f8f9fa', fontSize: '13px' }}>
              <AlertTriangle size={18} color="#ffc42e" />
              <span>
                <b>KubeJS no detectado en mods/:</b> los scripts y tablas de loot se guardaran en <code style={{ color: '#00e5ff' }}>kubejs/</code>, pero necesitas instalar KubeJS para que Minecraft los ejecute.
              </span>
            </div>
            <button
              onClick={onSearchKubeJSInStore}
              style={{
                background: '#ffc42e', color: '#0d0f12', border: 'none',
                padding: '7px 14px', borderRadius: '6px', fontWeight: 'bold',
                fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap'
              }}
            >
              Buscar KubeJS en Tienda
            </button>
          </div>
        ) : packInfo && tweaks.activeTweakTab !== 'optimizer' ? (
          <div style={{
            maxWidth: '760px', marginBottom: '20px', padding: '10px 16px', borderRadius: '10px',
            background: 'rgba(0, 230, 122, 0.08)', border: '1px solid rgba(0, 230, 122, 0.35)',
            color: '#00e67a', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px'
          }}>
            <CheckCircle size={15} />
            <span>KubeJS detectado en el modpack ({itemIds.length} items y {entityIds.length} entidades disponibles para autocompletar).</span>
          </div>
        ) : null}

        {/* 1. AJUSTE DE ITEMS */}
        {tweaks.activeTweakTab === 'items' && (
          <div style={{ maxWidth: '760px' }}>
            <h2 style={{ color: '#f8f9fa', marginTop: 0 }}>Modificador de Armas, Herramientas y Armaduras</h2>
            <p style={{ color: '#9ca3af', marginBottom: '20px', fontSize: '14px' }}>
              Sobrescribe las estadisticas base de cualquier objeto mediante <code style={{ color: '#f5c2e7' }}>kubejs/startup_scripts/1_item_tweaks.js</code>. Si ajustas un objeto que ya existia en la lista, se actualiza sin duplicar codigo.
            </p>

            <div style={cardStyle}>
              <div>
                <label style={{ color: '#f8f9fa', fontSize: '13px', fontWeight: 'bold' }}>ID del Objeto (mod:item)</label>
                <AutocompleteInput
                  placeholder="Ej: minecraft:diamond_sword"
                  value={tweaks.itemTweakData.itemId}
                  availableIds={itemIds}
                  color="#f5c2e7"
                  onChange={(val) => tweaks.setItemTweakData({ ...tweaks.itemTweakData, itemId: val })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: '12px' }}>Dano de Ataque</label>
                  <input type="number" step="0.5" min="0" placeholder="Ej: 12" value={tweaks.itemTweakData.damage} onChange={e => tweaks.setItemTweakData({ ...tweaks.itemTweakData, damage: e.target.value })} style={fieldInputStyle('#ff4d6a')} />
                </div>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: '12px' }}>Velocidad de Ataque</label>
                  <input type="number" step="0.1" placeholder="Ej: -2.4" value={tweaks.itemTweakData.attackSpeed} onChange={e => tweaks.setItemTweakData({ ...tweaks.itemTweakData, attackSpeed: e.target.value })} style={fieldInputStyle('#00e5ff')} />
                </div>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: '12px' }}>Durabilidad Maxima</label>
                  <input type="number" min="1" placeholder="Ej: 2000" value={tweaks.itemTweakData.maxDamage} onChange={e => tweaks.setItemTweakData({ ...tweaks.itemTweakData, maxDamage: e.target.value })} style={fieldInputStyle('#00e67a')} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: '12px' }}>Armadura</label>
                  <input type="number" step="0.5" min="0" placeholder="Ej: 8" value={tweaks.itemTweakData.armor} onChange={e => tweaks.setItemTweakData({ ...tweaks.itemTweakData, armor: e.target.value })} style={fieldInputStyle('#00e5ff')} />
                </div>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: '12px' }}>Dureza (Toughness)</label>
                  <input type="number" step="0.5" min="0" placeholder="Ej: 3" value={tweaks.itemTweakData.toughness} onChange={e => tweaks.setItemTweakData({ ...tweaks.itemTweakData, toughness: e.target.value })} style={fieldInputStyle('#ffc42e')} />
                </div>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: '12px' }}>Resist. Empuje (0-1)</label>
                  <input type="number" step="0.05" min="0" max="10" placeholder="Ej: 0.2" value={tweaks.itemTweakData.knockbackResistance} onChange={e => tweaks.setItemTweakData({ ...tweaks.itemTweakData, knockbackResistance: e.target.value })} style={fieldInputStyle('#f8f9fa')} />
                </div>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: '12px' }}>Max Stack (1-64)</label>
                  <input type="number" min="1" max="64" placeholder="Ej: 64" value={tweaks.itemTweakData.maxStackSize} onChange={e => tweaks.setItemTweakData({ ...tweaks.itemTweakData, maxStackSize: e.target.value })} style={fieldInputStyle('#f8f9fa')} />
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f8f9fa', fontSize: '13px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={Boolean(tweaks.itemTweakData.fireResistant)}
                  onChange={e => tweaks.setItemTweakData({ ...tweaks.itemTweakData, fireResistant: e.target.checked })}
                />
                Hacer inmune al fuego y a la lava (como la Netherita)
              </label>

              <button onClick={tweaks.handleItemTweak} style={{ background: '#f5c2e7', color: '#0d0f12', border: 'none', padding: '13px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                Guardar Ajuste de Objeto
              </button>
            </div>

            {itemList.length > 0 && (
              <div style={{ marginTop: '24px' }}>
                <h4 style={{ color: '#f8f9fa', marginBottom: '10px' }}>Objetos Balanceados ({itemList.length})</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {itemList.map(entry => (
                    <div key={entry.itemId} style={{ background: '#1a1d24', border: '1px solid #2a2e36', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <code style={{ color: '#f5c2e7', fontWeight: 'bold' }}>{entry.itemId}</code>
                      <span style={{ color: '#9ca3af', fontSize: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {entry.damage !== null && <span>Dano: {entry.damage}</span>}
                        {entry.attackSpeed !== null && <span>Vel: {entry.attackSpeed}</span>}
                        {entry.armor !== null && <span>Armadura: {entry.armor}</span>}
                        {entry.toughness !== null && <span>Dureza: {entry.toughness}</span>}
                        {entry.knockbackResistance !== null && <span>Empuje: {entry.knockbackResistance}</span>}
                        {entry.maxDamage !== null && <span>Durabilidad: {entry.maxDamage}</span>}
                        {entry.maxStackSize !== null && <span>Stack: {entry.maxStackSize}</span>}
                        {entry.fireResistant && <span>Ignifugo</span>}
                      </span>
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                        <button onClick={() => tweaks.handleEditItemTweak(entry)} title="Editar" style={{ background: '#262b33', border: '1px solid #2a2e36', color: '#00e5ff', padding: '5px 9px', borderRadius: '6px', cursor: 'pointer' }}><Edit3 size={13} /></button>
                        <button onClick={() => tweaks.handleDeleteTweak('items', entry.itemId)} title="Eliminar" style={{ background: '#262b33', border: '1px solid #2a2e36', color: '#ff4d6a', padding: '5px 9px', borderRadius: '6px', cursor: 'pointer' }}><Trash2 size={13} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. MUTADOR GENETICO */}
        {tweaks.activeTweakTab === 'entities' && (
          <div style={{ maxWidth: '760px' }}>
            <h2 style={{ color: '#f8f9fa', marginTop: 0 }}>Mutador Genetico de Entidades y Jefes</h2>
            <p style={{ color: '#9ca3af', marginBottom: '20px', fontSize: '14px' }}>
              Ajusta atributos de mobs y jefes en <code style={{ color: '#00e67a' }}>kubejs/server_scripts/2_entity_tweaks.js</code> con proteccion anti-curacion al recargar chunks y soporte para valores fijos o multiplicadores.
            </p>

            <div style={cardStyle}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ color: '#f8f9fa', fontSize: '13px', fontWeight: 'bold' }}>ID de la Entidad (mod:entidad)</label>
                  <AutocompleteInput
                    placeholder="Ej: minecraft:zombie"
                    value={tweaks.entityTweakData.entityId}
                    availableIds={entityIds}
                    color="#00e67a"
                    onChange={(val) => tweaks.setEntityTweakData({ ...tweaks.entityTweakData, entityId: val })}
                  />
                </div>
                <div>
                  <label style={{ color: '#f8f9fa', fontSize: '13px', fontWeight: 'bold' }}>Modo de Calculo</label>
                  <select
                    value={tweaks.entityTweakData.mode}
                    onChange={e => tweaks.setEntityTweakData({ ...tweaks.entityTweakData, mode: e.target.value })}
                    style={fieldInputStyle('#00e5ff')}
                  >
                    <option value="set">Valor Fijo Exacto</option>
                    <option value="multiply">Multiplicador (ej: 2 = x2)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: '12px' }}>{tweaks.entityTweakData.mode === 'multiply' ? 'Vida Maxima (x)' : 'Vida Maxima (HP)'}</label>
                  <input type="number" step="0.1" placeholder={tweaks.entityTweakData.mode === 'multiply' ? 'Ej: 2.0' : 'Ej: 100'} value={tweaks.entityTweakData.health} onChange={e => tweaks.setEntityTweakData({ ...tweaks.entityTweakData, health: e.target.value })} style={fieldInputStyle('#00e67a')} />
                </div>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: '12px' }}>{tweaks.entityTweakData.mode === 'multiply' ? 'Dano de Ataque (x)' : 'Dano de Ataque'}</label>
                  <input type="number" step="0.1" placeholder={tweaks.entityTweakData.mode === 'multiply' ? 'Ej: 1.5' : 'Ej: 12'} value={tweaks.entityTweakData.damage} onChange={e => tweaks.setEntityTweakData({ ...tweaks.entityTweakData, damage: e.target.value })} style={fieldInputStyle('#ff4d6a')} />
                </div>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: '12px' }}>{tweaks.entityTweakData.mode === 'multiply' ? 'Velocidad (x)' : 'Velocidad (Base 0.23)'}</label>
                  <input type="number" step="0.02" placeholder={tweaks.entityTweakData.mode === 'multiply' ? 'Ej: 1.2' : 'Ej: 0.30'} value={tweaks.entityTweakData.speed} onChange={e => tweaks.setEntityTweakData({ ...tweaks.entityTweakData, speed: e.target.value })} style={fieldInputStyle('#00e5ff')} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: '12px' }}>Puntos de Armadura</label>
                  <input type="number" step="0.5" placeholder="Ej: 10" value={tweaks.entityTweakData.armor} onChange={e => tweaks.setEntityTweakData({ ...tweaks.entityTweakData, armor: e.target.value })} style={fieldInputStyle('#f8f9fa')} />
                </div>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: '12px' }}>Resist. Empuje (0-1)</label>
                  <input type="number" step="0.1" placeholder="Ej: 0.5" value={tweaks.entityTweakData.knockbackResistance} onChange={e => tweaks.setEntityTweakData({ ...tweaks.entityTweakData, knockbackResistance: e.target.value })} style={fieldInputStyle('#ffc42e')} />
                </div>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: '12px' }}>Rango Vision (Bloques)</label>
                  <input type="number" step="1" placeholder="Ej: 40" value={tweaks.entityTweakData.followRange} onChange={e => tweaks.setEntityTweakData({ ...tweaks.entityTweakData, followRange: e.target.value })} style={fieldInputStyle('#f8f9fa')} />
                </div>
              </div>

              <button onClick={tweaks.handleEntityTweak} style={{ background: '#00e67a', color: '#0d0f12', border: 'none', padding: '13px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                Guardar Mutacion de Entidad
              </button>
            </div>

            {entityList.length > 0 && (
              <div style={{ marginTop: '24px' }}>
                <h4 style={{ color: '#f8f9fa', marginBottom: '10px' }}>Entidades Modificadas ({entityList.length})</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {entityList.map(entry => {
                    const pfx = entry.mode === 'multiply' ? 'x' : '';
                    return (
                      <div key={entry.entityId} style={{ background: '#1a1d24', border: '1px solid #2a2e36', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <code style={{ color: '#00e67a', fontWeight: 'bold' }}>{entry.entityId}</code>
                        <span style={{ color: '#9ca3af', fontSize: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                          {entry.health !== null && <span>HP: {pfx}{entry.health}</span>}
                          {entry.damage !== null && <span>Dano: {pfx}{entry.damage}</span>}
                          {entry.speed !== null && <span>Vel: {pfx}{entry.speed}</span>}
                          {entry.armor !== null && <span>Arm: {pfx}{entry.armor}</span>}
                          {entry.knockbackResistance !== null && <span>Empuje: {pfx}{entry.knockbackResistance}</span>}
                          {entry.followRange !== null && <span>Rango: {pfx}{entry.followRange}</span>}
                        </span>
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                          <button onClick={() => tweaks.handleEditEntityTweak(entry)} title="Editar" style={{ background: '#262b33', border: '1px solid #2a2e36', color: '#00e5ff', padding: '5px 9px', borderRadius: '6px', cursor: 'pointer' }}><Edit3 size={13} /></button>
                          <button onClick={() => tweaks.handleDeleteTweak('entities', entry.entityId)} title="Eliminar" style={{ background: '#262b33', border: '1px solid #2a2e36', color: '#ff4d6a', padding: '5px 9px', borderRadius: '6px', cursor: 'pointer' }}><Trash2 size={13} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. CONTROL DE SPAWNS */}
        {tweaks.activeTweakTab === 'spawn' && (
          <div style={{ maxWidth: '760px' }}>
            <h2 style={{ color: '#f8f9fa', marginTop: 0 }}>Control de Aparicion (Spawns)</h2>
            <p style={{ color: '#9ca3af', marginBottom: '20px', fontSize: '14px' }}>
              Bloquea mobs molestos, reduce su frecuencia de aparicion o reemplazalos por otra entidad segun dimension y altura Y en <code style={{ color: '#00e5ff' }}>kubejs/server_scripts/3_spawn_tweaks.js</code>.
            </p>

            <div style={cardStyle}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ color: '#f8f9fa', fontSize: '13px', fontWeight: 'bold' }}>Entidad a Controlar (mod:entidad)</label>
                  <AutocompleteInput
                    placeholder="Ej: minecraft:phantom"
                    value={tweaks.spawnCenter.entityId}
                    availableIds={entityIds}
                    color="#00e5ff"
                    onChange={(val) => tweaks.setSpawnCenter({ ...tweaks.spawnCenter, entityId: val })}
                  />
                </div>
                <div>
                  <label style={{ color: '#f8f9fa', fontSize: '13px', fontWeight: 'bold' }}>Accion</label>
                  <select
                    value={tweaks.spawnCenter.action}
                    onChange={e => tweaks.setSpawnCenter({ ...tweaks.spawnCenter, action: e.target.value })}
                    style={fieldInputStyle('#00e5ff')}
                  >
                    <option value="block">Bloquear aparicion (0%)</option>
                    <option value="chance">Limitar probabilidad de spawn (%)</option>
                    <option value="replace">Reemplazar por otra entidad</option>
                  </select>
                </div>
              </div>

              {(tweaks.spawnCenter.action === 'chance' || tweaks.spawnCenter.action === 'replace') && (
                <div style={{ display: 'grid', gridTemplateColumns: tweaks.spawnCenter.action === 'replace' ? '1fr 2fr' : '1fr', gap: '12px' }}>
                  <div>
                    <label style={{ color: '#9ca3af', fontSize: '12px' }}>
                      {tweaks.spawnCenter.action === 'chance' ? 'Probabilidad permitida (%)' : 'Probabilidad de reemplazo (%)'}
                    </label>
                    <input type="number" min="0" max="100" value={tweaks.spawnCenter.chance} onChange={e => tweaks.setSpawnCenter({ ...tweaks.spawnCenter, chance: e.target.value })} style={fieldInputStyle('#ffc42e')} />
                  </div>
                  {tweaks.spawnCenter.action === 'replace' && (
                    <div>
                      <label style={{ color: '#9ca3af', fontSize: '12px' }}>Entidad de Reemplazo (mod:entidad)</label>
                      <AutocompleteInput
                        placeholder="Ej: minecraft:husk"
                        value={tweaks.spawnCenter.replaceWith}
                        availableIds={entityIds}
                        color="#00e67a"
                        onChange={(val) => tweaks.setSpawnCenter({ ...tweaks.spawnCenter, replaceWith: val })}
                      />
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: '12px' }}>Dimension</label>
                  <select
                    value={tweaks.spawnCenter.dimension}
                    onChange={e => tweaks.setSpawnCenter({ ...tweaks.spawnCenter, dimension: e.target.value })}
                    style={fieldInputStyle('#f8f9fa')}
                  >
                    <option value="all">Todas las dimensiones</option>
                    <option value="minecraft:overworld">Overworld (minecraft:overworld)</option>
                    <option value="minecraft:the_nether">Nether (minecraft:the_nether)</option>
                    <option value="minecraft:the_end">The End (minecraft:the_end)</option>
                    <option value="custom">Otra dimension (mod)...</option>
                  </select>
                </div>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: '12px' }}>Altura Y Min (opc.)</label>
                  <input type="number" placeholder="Ej: -64" value={tweaks.spawnCenter.minY} onChange={e => tweaks.setSpawnCenter({ ...tweaks.spawnCenter, minY: e.target.value })} style={fieldInputStyle('#f8f9fa')} />
                </div>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: '12px' }}>Altura Y Max (opc.)</label>
                  <input type="number" placeholder="Ej: 62" value={tweaks.spawnCenter.maxY} onChange={e => tweaks.setSpawnCenter({ ...tweaks.spawnCenter, maxY: e.target.value })} style={fieldInputStyle('#f8f9fa')} />
                </div>
              </div>

              {tweaks.spawnCenter.dimension === 'custom' && (
                <div>
                  <label style={{ color: '#9ca3af', fontSize: '12px' }}>ID de Dimension Personalizada (mod:dimension)</label>
                  <input placeholder="Ej: twilightforest:twilight_forest" value={tweaks.spawnCenter.customDimension} onChange={e => tweaks.setSpawnCenter({ ...tweaks.spawnCenter, customDimension: e.target.value.toLowerCase() })} style={fieldInputStyle('#00e5ff')} />
                </div>
              )}

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f8f9fa', fontSize: '13px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={Boolean(tweaks.spawnCenter.onlyBaby)}
                  onChange={e => tweaks.setSpawnCenter({ ...tweaks.spawnCenter, onlyBaby: e.target.checked })}
                />
                Aplicar unicamente a variantes bebe (ej. bloquear baby zombies)
              </label>

              <button onClick={tweaks.handleSpawnControl} style={{ background: '#00e5ff', color: '#0d0f12', border: 'none', padding: '13px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                Guardar Regla de Spawn
              </button>
            </div>

            {spawnList.length > 0 && (
              <div style={{ marginTop: '24px' }}>
                <h4 style={{ color: '#f8f9fa', marginBottom: '10px' }}>Reglas de Spawn Activas ({spawnList.length})</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {spawnList.map(rule => (
                    <div key={rule.id} style={{ background: '#1a1d24', border: '1px solid #2a2e36', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <code style={{ color: '#00e5ff', fontWeight: 'bold' }}>{rule.entityId}</code>
                      <span style={{ color: '#9ca3af', fontSize: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <span>
                          {rule.action === 'block' ? 'Bloqueado' : rule.action === 'chance' ? `Permitido ${rule.chance}%` : `Reemplazar por ${rule.replaceWith} (${rule.chance}%)`}
                        </span>
                        <span>Dim: {rule.dimension === 'all' ? 'Todas' : rule.dimension}</span>
                        {(rule.minY !== null || rule.maxY !== null) && <span>Y: [{rule.minY ?? '-inf'} .. {rule.maxY ?? '+inf'}]</span>}
                        {rule.onlyBaby && <span>Solo bebes</span>}
                      </span>
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                        <button onClick={() => tweaks.handleEditSpawnRule(rule)} title="Editar" style={{ background: '#262b33', border: '1px solid #2a2e36', color: '#00e5ff', padding: '5px 9px', borderRadius: '6px', cursor: 'pointer' }}><Edit3 size={13} /></button>
                        <button onClick={() => tweaks.handleDeleteTweak('spawns', rule.id)} title="Eliminar" style={{ background: '#262b33', border: '1px solid #2a2e36', color: '#ff4d6a', padding: '5px 9px', borderRadius: '6px', cursor: 'pointer' }}><Trash2 size={13} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 4. EDITOR DE LOOT */}
        {tweaks.activeTweakTab === 'loot' && (
          <div style={{ maxWidth: '760px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <h2 style={{ color: '#f8f9fa', margin: 0 }}>Editor de Botin (Loot Tables y Drops)</h2>
              <div style={{ display: 'flex', gap: '6px', background: '#1a1d24', padding: '4px', borderRadius: '8px', border: '1px solid #2a2e36' }}>
                <button
                  onClick={() => tweaks.setLootCenter({ ...tweaks.lootCenter, editorMode: 'builder' })}
                  style={{
                    padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold',
                    background: tweaks.lootCenter.editorMode === 'builder' ? '#ffc42e' : 'transparent',
                    color: tweaks.lootCenter.editorMode === 'builder' ? '#0d0f12' : '#9ca3af'
                  }}
                >
                  Constructor Visual
                </button>
                <button
                  onClick={() => tweaks.setLootCenter({ ...tweaks.lootCenter, editorMode: 'raw' })}
                  style={{
                    padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold',
                    background: tweaks.lootCenter.editorMode === 'raw' ? '#ffc42e' : 'transparent',
                    color: tweaks.lootCenter.editorMode === 'raw' ? '#0d0f12' : '#9ca3af'
                  }}
                >
                  JSON Avanzado
                </button>
              </div>
            </div>
            <p style={{ color: '#9ca3af', marginTop: '8px', marginBottom: '20px', fontSize: '14px' }}>
              Agrega o reemplaza recompensas de jefes, mobs y cofres de estructuras directamente en <code style={{ color: '#ffc42e' }}>kubejs/</code> (compatible con 1.20 y 1.21+).
            </p>

            {tweaks.lootCenter.editorMode === 'builder' ? (
              <div style={cardStyle}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ color: '#f8f9fa', fontSize: '13px', fontWeight: 'bold' }}>Tipo de Objetivo</label>
                    <select
                      value={tweaks.lootCenter.targetType}
                      onChange={e => {
                        const t = e.target.value;
                        const defaultTarget = t === 'entity' ? 'minecraft:zombie' : t === 'chest' ? 'minecraft:chests/simple_dungeon' : 'minecraft/loot_tables/entities/zombie.json';
                        tweaks.setLootCenter({ ...tweaks.lootCenter, targetType: t, targetId: defaultTarget });
                      }}
                      style={fieldInputStyle('#ffc42e')}
                    >
                      <option value="entity">Entidad / Jefe (mod:entidad)</option>
                      <option value="chest">Cofre de Estructura (mod:chests/...)</option>
                      <option value="custom">Ruta de tabla personalizada</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ color: '#f8f9fa', fontSize: '13px', fontWeight: 'bold' }}>Comportamiento</label>
                    <select
                      value={tweaks.lootCenter.mode}
                      onChange={e => tweaks.setLootCenter({ ...tweaks.lootCenter, mode: e.target.value })}
                      style={fieldInputStyle('#00e5ff')}
                    >
                      <option value="add">Agregar sin borrar el botin original</option>
                      <option value="replace">Reemplazar toda la tabla de botin</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ color: '#f8f9fa', fontSize: '13px', fontWeight: 'bold' }}>
                    {tweaks.lootCenter.targetType === 'entity' ? 'Entidad Objetivo (mod:entidad)' : tweaks.lootCenter.targetType === 'chest' ? 'Tabla de Cofre (mod:chests/...)' : 'Ruta en kubejs/data/'}
                  </label>
                  <AutocompleteInput
                    placeholder={tweaks.lootCenter.targetType === 'chest' ? 'Ej: minecraft:chests/simple_dungeon' : 'Ej: minecraft:warden'}
                    value={tweaks.lootCenter.targetId}
                    availableIds={tweaks.lootCenter.targetType === 'entity' ? entityIds : tweaks.lootCenter.targetType === 'chest' ? chestIds : []}
                    color="#ffc42e"
                    onChange={(val) => tweaks.setLootCenter({ ...tweaks.lootCenter, targetId: val })}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ color: '#f8f9fa', fontSize: '13px', fontWeight: 'bold' }}>Objetos a Soltar (Drops)</label>
                    <button onClick={addDropRow} style={{ background: '#262b33', color: '#00e5ff', border: '1px solid #2a2e36', borderRadius: '6px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Plus size={13} /> Agregar Objeto
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {tweaks.lootCenter.drops.map((drop, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2.5fr 0.8fr 0.8fr 1fr auto', gap: '8px', alignItems: 'end', background: '#0d0f12', padding: '10px', borderRadius: '8px', border: '1px solid #2a2e36' }}>
                        <div>
                          <label style={{ color: '#9ca3af', fontSize: '11px' }}>Objeto (mod:item)</label>
                          <AutocompleteInput
                            placeholder="minecraft:diamond"
                            value={drop.itemId}
                            availableIds={itemIds}
                            color="#00e67a"
                            onChange={(val) => updateDrop(idx, 'itemId', val)}
                          />
                        </div>
                        <div>
                          <label style={{ color: '#9ca3af', fontSize: '11px' }}>Min</label>
                          <input type="number" min="1" max="640" value={drop.min} onChange={e => updateDrop(idx, 'min', e.target.value)} style={fieldInputStyle('#f8f9fa')} />
                        </div>
                        <div>
                          <label style={{ color: '#9ca3af', fontSize: '11px' }}>Max</label>
                          <input type="number" min="1" max="640" value={drop.max} onChange={e => updateDrop(idx, 'max', e.target.value)} style={fieldInputStyle('#f8f9fa')} />
                        </div>
                        <div>
                          <label style={{ color: '#9ca3af', fontSize: '11px' }}>Prob. (%)</label>
                          <input type="number" min="0.1" max="100" step="0.5" value={drop.chance} onChange={e => updateDrop(idx, 'chance', e.target.value)} style={fieldInputStyle('#ffc42e')} />
                        </div>
                        <button
                          onClick={() => removeDropRow(idx)}
                          disabled={tweaks.lootCenter.drops.length <= 1}
                          title="Quitar fila"
                          style={{ background: '#1a1d24', border: '1px solid #2a2e36', color: '#ff4d6a', padding: '10px', borderRadius: '8px', cursor: tweaks.lootCenter.drops.length <= 1 ? 'not-allowed' : 'pointer', opacity: tweaks.lootCenter.drops.length <= 1 ? 0.4 : 1 }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <button onClick={tweaks.handleLootPatch} style={{ background: '#ffc42e', color: '#0d0f12', border: 'none', padding: '13px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                  Guardar Cambios de Botin
                </button>
              </div>
            ) : (
              <div style={cardStyle}>
                <div>
                  <label style={{ color: '#f8f9fa', fontSize: '12px' }}>Ruta de tabla (se normaliza automaticamente dentro de kubejs/data/...)</label>
                  <input placeholder="data/minecraft/loot_tables/entities/zombie.json" value={tweaks.lootCenter.lootPath} onChange={e => tweaks.setLootCenter({ ...tweaks.lootCenter, lootPath: e.target.value })} style={fieldInputStyle('#f8f9fa')} />
                </div>
                <div>
                  <label style={{ color: '#f8f9fa', fontSize: '12px' }}>Objeto JSON de la tabla o parche</label>
                  <textarea rows={9} value={tweaks.lootCenter.patch} onChange={e => tweaks.setLootCenter({ ...tweaks.lootCenter, patch: e.target.value })} style={{ ...fieldInputStyle('#f8f9fa'), resize: 'vertical', fontFamily: 'var(--font-mono)' }} />
                </div>
                <button onClick={tweaks.handleLootPatch} style={{ background: '#ffc42e', color: '#0d0f12', border: 'none', padding: '13px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                  Aplicar JSON en kubejs/data
                </button>
              </div>
            )}

            {lootList.length > 0 && (
              <div style={{ marginTop: '24px' }}>
                <h4 style={{ color: '#f8f9fa', marginBottom: '10px' }}>Reglas de Loot Activas ({lootList.length})</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {lootList.map(rule => (
                    <div key={rule.id} style={{ background: '#1a1d24', border: '1px solid #2a2e36', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <code style={{ color: '#ffc42e', fontWeight: 'bold' }}>{rule.targetId}</code>
                      <span style={{ color: '#9ca3af', fontSize: '12px' }}>
                        {rule.mode === 'add' ? 'Adicional' : rule.mode === 'replace' ? 'Reemplazo total' : 'JSON'}
                        {rule.drops?.length ? ` (${rule.drops.map(d => `${d.min}-${d.max} ${d.itemId} @${d.chance}%`).join(', ')})` : ''}
                      </span>
                      <div style={{ marginLeft: 'auto' }}>
                        <button onClick={() => tweaks.handleDeleteTweak('loots', rule.id)} title="Eliminar" style={{ background: '#262b33', border: '1px solid #2a2e36', color: '#ff4d6a', padding: '5px 9px', borderRadius: '6px', cursor: 'pointer' }}><Trash2 size={13} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 5. OPTIMIZADOR */}
        {tweaks.activeTweakTab === 'optimizer' && (
          <div style={{ maxWidth: '760px' }}>
            <h2 style={{ color: '#ff4d6a', marginTop: 0 }}>Optimizador Inteligente de Configuraciones</h2>
            <p style={{ color: '#9ca3af', marginBottom: '20px', fontSize: '14px' }}>
              Ajusta automaticamente archivos <code style={{ color: '#f8f9fa' }}>.toml</code>, <code style={{ color: '#f8f9fa' }}>.json</code> y <code style={{ color: '#f8f9fa' }}>.properties</code> de tu carpeta <code style={{ color: '#00e5ff' }}>config/</code> creando respaldo previo para poder revertir en cualquier momento.
            </p>

            {optimization.optimizerStep === 'idle' && (
              <div style={cardStyle}>
                <div>
                  <label style={{ color: '#f8f9fa', fontSize: '13px', fontWeight: 'bold' }}>Perfil de Optimizacion</label>
                  <select
                    value={optimization.selectedProfile}
                    onChange={e => optimization.setSelectedProfile(e.target.value)}
                    style={fieldInputStyle('#00e5ff')}
                  >
                    {optimization.availableProfiles.map(p => (
                      <option key={p.id} value={p.id}>{p.name} - {p.description}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ color: '#f8f9fa', fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>Categorias a Aplicar</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {CATEGORY_LABELS.map(cat => {
                      const checked = optimization.selectedCategories.includes(cat.id);
                      return (
                        <label
                          key={cat.id}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: '10px',
                            padding: '12px', borderRadius: '8px', cursor: 'pointer',
                            background: '#0d0f12',
                            border: checked ? '1px solid #ff4d6a' : '1px solid #2a2e36'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => optimization.toggleCategory(cat.id)}
                            style={{ marginTop: '3px' }}
                          />
                          <div>
                            <div style={{ color: '#f8f9fa', fontWeight: 'bold', fontSize: '13px' }}>{cat.label}</div>
                            <div style={{ color: '#9ca3af', fontSize: '11px', marginTop: '2px' }}>{cat.desc}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <button
                  onClick={optimization.handleOptimizationStart}
                  style={{
                    background: '#ff4d6a', color: '#0d0f12', border: 'none',
                    padding: '14px', borderRadius: '8px', fontWeight: 'bold',
                    fontSize: '15px', cursor: 'pointer'
                  }}
                >
                  Optimizar Configuraciones Seleccionadas
                </button>
              </div>
            )}

            {optimization.optimizerStep === 'running' && (
              <div style={{ ...cardStyle, textAlign: 'center', padding: '40px' }}>
                <h3 style={{ color: '#f8f9fa', margin: 0 }}>Optimizando...</h3>
                <p style={{ color: '#9ca3af', margin: 0 }}>{optimization.optimizerMessage}</p>
              </div>
            )}

            {optimization.optimizerStep === 'done' && optimization.hasBackup && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ ...cardStyle, border: '1px solid #00e67a' }}>
                  <h3 style={{ color: '#00e67a', margin: 0 }}>Optimizacion Activa</h3>
                  <p style={{ color: '#9ca3af', margin: 0 }}>{optimization.optimizerMessage || 'Hay un respaldo activo de configuraciones optimizadas.'}</p>
                </div>
                {optimization.optimizerResults.length > 0 && (
                  <div style={cardStyle}>
                    <h4 style={{ color: '#f8f9fa', margin: 0 }}>Archivos Ajustados</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {optimization.optimizerResults.map((r, i) => (
                        <div key={i} style={{ padding: '10px 14px', borderRadius: '8px', background: '#0d0f12', borderLeft: '4px solid #00e67a', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ color: '#00e67a', fontWeight: 'bold', fontSize: '12px' }}>[OK]</span>
                          <span style={{ color: '#f8f9fa', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>{r.file}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  onClick={optimization.handleOptimizationRollback}
                  style={{
                    background: '#ffc42e', color: '#0d0f12', border: 'none',
                    padding: '14px', borderRadius: '8px', fontWeight: 'bold',
                    fontSize: '14px', cursor: 'pointer'
                  }}
                >
                  Restaurar Respaldo Original (Rollback)
                </button>
              </div>
            )}

            {optimization.optimizerStep === 'done' && !optimization.hasBackup && (
              <div style={{ ...cardStyle, border: '1px solid #ffc42e', textAlign: 'center' }}>
                <h3 style={{ color: '#ffc42e', margin: 0 }}>Sin archivos coincidentes para modificar</h3>
                <p style={{ color: '#9ca3af', margin: 0 }}>
                  Ningun archivo actual de <code style={{ color: '#f8f9fa' }}>config/</code> requirio cambios con las categorias elegidas (ejecuta Minecraft al menos una vez para que los mods generen sus configs).
                </p>
                <button
                  onClick={() => { optimization.setOptimizerStep('idle'); optimization.setOptimizerResults([]); }}
                  style={{ background: '#262b33', color: '#f8f9fa', border: '1px solid #2a2e36', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', alignSelf: 'center' }}
                >
                  Volver a Opciones
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
