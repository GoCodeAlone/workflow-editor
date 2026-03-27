export interface FileTabBarProps {
  files: Array<{ path: string | null; label: string }>;
  activeFile: string | null;
  onSelect: (filePath: string | null) => void;
}

export function FileTabBar({ files, activeFile, onSelect }: FileTabBarProps) {
  return (
    <div
      style={{
        display: 'flex',
        background: '#181825',
        borderBottom: '1px solid #313244',
        overflowX: 'auto',
        flexShrink: 0,
      }}
    >
      {files.map((file) => {
        const isActive = file.path === activeFile;
        return (
          <button
            key={file.path ?? '__main__'}
            className={isActive ? 'yaml-tab yaml-tab-active' : 'yaml-tab'}
            onClick={() => onSelect(file.path)}
            style={{
              background: isActive ? '#1e1e2e' : 'transparent',
              border: 'none',
              borderBottom: isActive ? '2px solid #89b4fa' : '2px solid transparent',
              color: isActive ? '#cdd6f4' : '#6c7086',
              padding: '6px 12px',
              fontSize: 12,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontFamily: 'system-ui, sans-serif',
              flexShrink: 0,
            }}
          >
            {file.label}
          </button>
        );
      })}
    </div>
  );
}
