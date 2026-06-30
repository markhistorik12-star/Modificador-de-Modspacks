import { useState, useMemo, useCallback } from 'react';

export function useModSearch(nodes, rfInstance) {
  const [searchMods, setSearchMods] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

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
        const exactMatch = matches.find(n => n.data.label.toLowerCase() === searchMods.toLowerCase());
        const targetNode = exactMatch || matches[0];
        rfInstance.setCenter(targetNode.position.x + 75, targetNode.position.y + 25, { zoom: 1.2, duration: 800 });
      }
    }
  }, [searchMods, rfInstance, nodes]);

  return { searchMods, setSearchMods, searchTerm, setSearchTerm, displayNodes, handleSearchKeyDown };
}