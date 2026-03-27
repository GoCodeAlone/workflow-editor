import { useMemo } from 'react';

export interface BreadcrumbBarProps {
  /** Root config file path (null if unknown) */
  rootFile: string | null;
  /** Current file being viewed (null = root file) */
  currentFile: string | null;
  /** Current section within the file (pipeline name, etc.) */
  currentSection?: string;
  /** Called when user clicks a breadcrumb segment */
  onNavigate: (filePath: string, section: string | null) => void;
}

export function BreadcrumbBar({ rootFile, currentFile, currentSection, onNavigate }: BreadcrumbBarProps) {
  const segments = useMemo(() => {
    const result: Array<{ label: string; filePath: string | null; clickable: boolean; isDir: boolean }> = [];

    // Root segment
    result.push({
      label: rootFile ? rootFile.split('/').pop()! : '?',
      filePath: rootFile,
      clickable: rootFile !== null,
      isDir: false,
    });

    if (currentFile && currentFile !== rootFile) {
      // Split path into directories + filename
      const parts = currentFile.split('/');
      let pathSoFar = '';
      for (let i = 0; i < parts.length - 1; i++) {
        pathSoFar += (pathSoFar ? '/' : '') + parts[i];
        result.push({ label: parts[i], filePath: pathSoFar, clickable: false, isDir: true });
      }
      // Filename
      result.push({ label: parts[parts.length - 1], filePath: currentFile, clickable: true, isDir: false });
    }

    if (currentSection) {
      result.push({ label: currentSection, filePath: currentFile, clickable: false, isDir: false });
    }

    return result;
  }, [rootFile, currentFile, currentSection]);

  return (
    <div className="breadcrumb-bar" style={{
      display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px',
      fontSize: 12, color: '#94a3b8', backgroundColor: '#16161e', borderBottom: '1px solid #2a2a3a',
    }}>
      <span style={{ fontSize: 14 }}>📁</span>
      {segments.map((seg, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {i > 0 && <span style={{ color: '#475569' }}>›</span>}
          <span
            onClick={seg.clickable ? () => onNavigate(seg.filePath!, null) : undefined}
            style={{
              cursor: seg.clickable ? 'pointer' : 'default',
              color: seg.clickable ? '#60a5fa' : (seg.isDir ? '#64748b' : '#94a3b8'),
            }}
          >
            {seg.label}
          </span>
        </span>
      ))}
    </div>
  );
}
