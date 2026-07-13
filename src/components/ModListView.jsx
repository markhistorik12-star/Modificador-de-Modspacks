import { useMemo, useState, memo, useCallback } from 'react';
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow';
import 'reactflow/dist/style.css';
import ModNode from './nodes/ModNode';
import GroupNode from './nodes/GroupNode';

const nodeTypes = { mod: ModNode, group: GroupNode };

const ModListView = memo(function ModListView({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onNodeContextMenu,
  onPaneClick,
  onNodeClick,
  onNodesDelete,
  onNodeDoubleClick,
  graphZoom,
  setGraphZoom,
  searchMods,
  setSearchMods
}) {
  const [rfInstance, setRfInstance] = useState(null);

  const displayNodes = useMemo(() => {
    return nodes.map(node => {
      if (!searchMods) return { ...node, style: { ...node?.style, opacity: 1, pointerEvents: 'all' } };
      const lowerSearch = searchMods.toLowerCase();
      const isMatch =
        (node.data.label && node.data.label.toLowerCase().includes(lowerSearch)) ||
        (node.data.version && node.data.version.toLowerCase().includes(lowerSearch));

      return {
        ...node,
        style: {
          ...node.style,
          opacity: isMatch ? 1 : 0.15,
          transition: 'opacity 0.3s ease',
          pointerEvents: isMatch ? 'all' : 'none'
        }
      };
    });
  }, [nodes, searchMods]);

  const handleSearchKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && searchMods && rfInstance) {
      const matches = nodes.filter(n => n.type === 'mod' &&
        n.data.label.toLowerCase().includes(searchMods.toLowerCase()));
      if (matches.length > 0) {
        const exactMatch = matches.find(n =>
          n.data.label.toLowerCase() === searchMods.toLowerCase()
        );
        const targetNode = exactMatch || matches[0];
        rfInstance.setCenter(targetNode.position.x + 75, targetNode.position.y + 25, {
          zoom: 1.2,
          duration: 800
        });
      }
    }
  }, [searchMods, rfInstance, nodes]);

  const handleZoomIn = useCallback(() => {
    if (rfInstance?.setViewport) {
      const newZoom = Math.min(3, graphZoom + 0.1);
      setGraphZoom(newZoom);
      rfInstance.setViewport({ x: 0, y: 0, zoom: newZoom }, 150);
    }
  }, [rfInstance, graphZoom, setGraphZoom]);

  const handleZoomOut = useCallback(() => {
    if (rfInstance?.setViewport) {
      const newZoom = Math.max(0.2, graphZoom - 0.1);
      setGraphZoom(newZoom);
      rfInstance.setViewport({ x: 0, y: 0, zoom: newZoom }, 150);
    }
  }, [rfInstance, graphZoom, setGraphZoom]);

  const handleFitView = useCallback(() => {
    rfInstance?.fitView?.();
  }, [rfInstance]);

  return (
    <div className="tab-content" style={{ position: 'relative', width: '100%', height: 'calc(100vh - 112px)' }}>
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 50, display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: 8, background: 'rgba(26,29,36,0.9)', border: '1px solid #2a2e36' }}>
        <button onClick={handleZoomIn} title="Zoom in" style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: '#00e5ff', color: '#0d0f12', cursor: 'pointer', transition: 'all 0.15s ease' }} onMouseEnter={e => { e.target.style.transform = 'scale(1.1)'; e.target.style.boxShadow = '0 2px 8px rgba(0, 229, 255, 0.4)'; }} onMouseLeave={e => { e.target.style.transform = ''; e.target.style.boxShadow = ''; }}>+</button>
        <button onClick={handleZoomOut} title="Zoom out" style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: '#00e5ff', color: '#0d0f12', cursor: 'pointer', transition: 'all 0.15s ease' }} onMouseEnter={e => { e.target.style.transform = 'scale(1.1)'; e.target.style.boxShadow = '0 2px 8px rgba(0, 229, 255, 0.4)'; }} onMouseLeave={e => { e.target.style.transform = ''; e.target.style.boxShadow = ''; }}>-</button>
        <button onClick={handleFitView} title="Ajustar Vista" style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: '#00e5ff', color: '#0d0f12', cursor: 'pointer', transition: 'all 0.15s ease' }} onMouseEnter={e => { e.target.style.transform = 'scale(1.05)'; e.target.style.boxShadow = '0 2px 8px rgba(0, 229, 255, 0.4)'; }} onMouseLeave={e => { e.target.style.transform = ''; e.target.style.boxShadow = ''; }}>Fit</button>
        <span style={{ color: '#f8f9fa', fontSize: 12 }}>Zoom</span>
        <input
          type="range" min={0.2} max={2.5} step={0.05}
          value={graphZoom}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            setGraphZoom(v);
            if (rfInstance && typeof rfInstance.setViewport === 'function') {
              rfInstance.setViewport({ x: 0, y: 0, zoom: v }, 0);
            } else if (rfInstance && typeof rfInstance.zoomTo === 'function') {
              try { rfInstance.zoomTo(v); } catch { }
            }
          }}
          style={{ width: 120 }}
        />
      </div>
      {nodes.length > 0 && (
        <div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 10, width: '400px' }}>
          <input
            type="text"
            placeholder="Input de busqueda (Enter para focalizar)..."
            value={searchMods}
           onChange={(e) => setSearchMods(e.target.value)}
           onKeyDown={handleSearchKeyDown}
           style={{
             width: '100%', padding: '12px 20px', borderRadius: '30px', border: '1px solid #00e5ff', background: 'rgba(26, 29, 36, 0.8)',
             color: '#f8f9fa', outline: 'none', fontSize: '14px', boxShadow: '0 4px 15px rgba(0,0,0,0.5)', backdropFilter: 'blur(5px)',
             transition: 'all 0.15s ease'
           }}
           onFocus={e => { e.target.style.boxShadow = '0 4px 20px rgba(0, 229, 255, 0.3), 0 0 0 3px rgba(0, 229, 255, 0.2)'; e.target.style.borderColor = '#00e5ff'; }}
           onBlur={e => { e.target.style.boxShadow = '0 4px 15px rgba(0,0,0,0.5)'; e.target.style.borderColor = '#00e5ff'; }}
          />
        </div>
      )}

      {displayNodes.length > 0 && (
        <ReactFlow
          nodes={displayNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onInit={setRfInstance}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.2}
          maxZoom={2.5}
          onNodeContextMenu={onNodeContextMenu}
          onPaneClick={onPaneClick}
          onNodeClick={onNodeClick}
          onNodesDelete={onNodesDelete}
         onNodeDoubleClick={onNodeDoubleClick}>
         <Background color="#2a2e36" variant="dots" gap={25} size={1} />
         <Controls />
         <MiniMap nodeColor="#00e5ff" maskColor="rgba(26, 29, 36, 0.7)" style={{ background: '#0d0f12' }} />
       </ReactFlow>
      )}
    </div>
  );
});

export default ModListView;
