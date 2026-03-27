import { useRef, useEffect } from 'react';

export interface YamlLineRendererProps {
  content: string;
  highlightRange?: { startLine: number; endLine: number };
  onLineClick?: (line: number) => void;
  scrollToLine?: number;
}

function renderYamlLine(line: string): React.ReactNode {
  if (line.trimStart().startsWith('#')) {
    return <span style={{ color: '#6c7086' }}>{line}</span>;
  }
  const keyMatch = line.match(/^(\s*)([\w.-]+)(:)(.*)/);
  if (keyMatch) {
    const [, indent, key, colon, rest] = keyMatch;
    return (
      <>
        <span>{indent}</span>
        <span style={{ color: '#89b4fa', fontWeight: 600 }}>{key}</span>
        <span style={{ color: '#a6adc8' }}>{colon}</span>
        <span style={{ color: '#a6e3a1' }}>{rest}</span>
      </>
    );
  }
  if (line.trimStart().startsWith('-')) {
    return <span style={{ color: '#cba6f7' }}>{line}</span>;
  }
  return <span style={{ color: '#cdd6f4' }}>{line}</span>;
}

export function YamlLineRenderer({
  content,
  highlightRange,
  onLineClick,
  scrollToLine,
}: YamlLineRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lines = content.split('\n');

  useEffect(() => {
    if (!scrollToLine || !containerRef.current) return;
    const lineEl = containerRef.current.querySelector(`[data-line="${scrollToLine}"]`);
    if (lineEl && typeof (lineEl as Element & { scrollIntoView?: unknown }).scrollIntoView === 'function') {
      (lineEl as Element).scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [scrollToLine]);

  return (
    <div
      ref={containerRef}
      style={{
        overflow: 'auto',
        flex: 1,
        background: '#1e1e2e',
        padding: '8px 0',
      }}
    >
      <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: 12, lineHeight: '20px' }}>
        {lines.map((line, i) => {
          const lineNum = i + 1;
          const isHighlighted =
            highlightRange != null &&
            lineNum >= highlightRange.startLine &&
            lineNum <= highlightRange.endLine;
          return (
            <div
              key={i}
              data-line={lineNum}
              className={isHighlighted ? 'yaml-line yaml-line-highlighted' : 'yaml-line'}
              onClick={() => onLineClick?.(lineNum)}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                background: isHighlighted ? '#313244' : 'transparent',
                cursor: onLineClick ? 'pointer' : 'default',
                padding: '0 8px',
              }}
            >
              <span
                style={{
                  color: '#45475a',
                  width: 36,
                  textAlign: 'right',
                  paddingRight: 12,
                  userSelect: 'none',
                  flexShrink: 0,
                  fontSize: 11,
                }}
              >
                {lineNum}
              </span>
              <code style={{ color: '#cdd6f4' }}>{renderYamlLine(line)}</code>
            </div>
          );
        })}
      </pre>
    </div>
  );
}
