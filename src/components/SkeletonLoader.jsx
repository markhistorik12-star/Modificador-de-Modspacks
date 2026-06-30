import React from 'react';

const shimmerStyle = {
  position: 'absolute',
  top: 0,
  left: '-100%',
  width: '100%',
  height: '100%',
  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
  transform: 'skewX(-20deg)'
};

const baseStyle = {
  background: '#1a1d24',
  position: 'relative',
  overflow: 'hidden',
  borderRadius: '4px'
};

const SkeletonLoader = ({
  count = 3,
  variant = 'text',
  width = '100%',
  height = '20px',
  marginBottom = '10px',
  borderRadius = '4px',
  className = '',
  children
}) => {
  if (children) return children;

  const items = Array.from({ length: count }, (_, i) => (
    <div key={i} className={`skeleton-loader ${className}`} style={{
      width,
      height: typeof height === 'number' ? `${height}px` : height,
      marginBottom: typeof marginBottom === 'number' ? `${marginBottom}px` : marginBottom,
      borderRadius,
      ...baseStyle
    }}>
      <div className="skeleton-shimmer" style={shimmerStyle} />
    </div>
  ));

  switch (variant) {
    case 'file-list':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {items.map((item, i) => React.cloneElement(item, {
            style: {
              ...item.props.style,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 8px',
              borderRadius: '6px',
              height: 'auto',
              minHeight: '44px'
            },
            children: [
              <div key="icon" style={{ width: '20px', height: '20px', borderRadius: '3px', ...baseStyle }}>
                <div className="skeleton-shimmer" style={shimmerStyle} />
              </div>,
              <div key="name" style={{ width: '60%', height: '16px', borderRadius: '3px', ...baseStyle }}>
                <div className="skeleton-shimmer" style={shimmerStyle} />
              </div>,
              <div key="btn" style={{ width: '80px', height: '30px', borderRadius: '4px', ...baseStyle }}>
                <div className="skeleton-shimmer" style={shimmerStyle} />
              </div>
            ]
          }))}
        </div>
      );
    case 'mod-card':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {items.map((item, i) => React.cloneElement(item, {
            style: {
              ...item.props.style,
              background: '#1a1d24',
              border: '1px solid #2a2e36',
              borderRadius: '12px',
              padding: '20px',
              display: 'flex',
              gap: '20px',
              alignItems: 'center',
              boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
              height: 'auto',
              minHeight: '120px',
              width: '100%',
              marginBottom: '0'
            },
            children: [
              <div key="icon" style={{ width: '80px', height: '80px', borderRadius: '10px', flexShrink: 0, ...baseStyle }}>
                <div className="skeleton-shimmer" style={shimmerStyle} />
              </div>,
              <div key="content" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ height: '24px', width: '40%', borderRadius: '4px', ...baseStyle }}>
                  <div className="skeleton-shimmer" style={shimmerStyle} />
                </div>,
                <div style={{ height: '16px', width: '80%', borderRadius: '4px', ...baseStyle }}>
                  <div className="skeleton-shimmer" style={shimmerStyle} />
                </div>,
                <div style={{ display: 'flex', gap: '15px', marginTop: '8px' }}>
                  <div style={{ width: '60px', height: '12px', borderRadius: '4px', ...baseStyle }}>
                    <div className="skeleton-shimmer" style={shimmerStyle} />
                  </div>,
                  <div style={{ width: '80px', height: '12px', borderRadius: '4px', ...baseStyle }}>
                    <div className="skeleton-shimmer" style={shimmerStyle} />
                  </div>
                </div>
              </div>
            ]
          }))}
        </div>
      );
    case 'card':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {items.map((item, i) => React.cloneElement(item, {
            style: {
              ...item.props.style,
              background: '#1a1d24',
              border: '1px solid #2a2e36',
              borderRadius: '12px',
              padding: '20px',
              height: 'auto',
              minHeight: '100px',
              width: '100%',
              marginBottom: '0'
            },
            children: [
              <div key="title" style={{ height: '28px', width: '30%', borderRadius: '4px', marginBottom: '16px', ...baseStyle }}>
                <div className="skeleton-shimmer" style={shimmerStyle} />
              </div>,
              <div key="body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ height: '16px', width: '100%', borderRadius: '4px', ...baseStyle }}>
                  <div className="skeleton-shimmer" style={shimmerStyle} />
                </div>,
                <div style={{ height: '16px', width: '70%', borderRadius: '4px', ...baseStyle }}>
                  <div className="skeleton-shimmer" style={shimmerStyle} />
                </div>,
                <div style={{ height: '16px', width: '50%', borderRadius: '4px', ...baseStyle }}>
                  <div className="skeleton-shimmer" style={shimmerStyle} />
                </div>
              </div>
            ]
          }))}
        </div>
      );
    default:
      return <>{items}</>;
  }
};

export default SkeletonLoader;
