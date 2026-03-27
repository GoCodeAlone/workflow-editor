import { FileTabBar } from './FileTabBar.tsx';
import { YamlLineRenderer } from './YamlLineRenderer.tsx';

export interface YamlSidePaneProps {
  files: Map<string | null, string>;
  activeFile: string | null;
  onFileSelect: (filePath: string | null) => void;
  highlightRange?: { startLine: number; endLine: number };
  onLineClick?: (filePath: string | null, line: number) => void;
  visible: boolean;
}

function fileLabel(path: string | null): string {
  if (path === null) return 'main';
  return path.split('/').pop() ?? path;
}

export function YamlSidePane({
  files,
  activeFile,
  onFileSelect,
  highlightRange,
  onLineClick,
  visible,
}: YamlSidePaneProps) {
  if (!visible) return null;

  const tabFiles = Array.from(files.keys()).map((path) => ({
    path,
    label: fileLabel(path),
  }));

  const activeContent = files.get(activeFile) ?? '';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#1e1e2e',
        borderLeft: '1px solid #313244',
        overflow: 'hidden',
      }}
    >
      <FileTabBar files={tabFiles} activeFile={activeFile} onSelect={onFileSelect} />
      <YamlLineRenderer
        content={activeContent}
        highlightRange={highlightRange}
        scrollToLine={highlightRange?.startLine}
        onLineClick={onLineClick ? (line) => onLineClick(activeFile, line) : undefined}
      />
    </div>
  );
}
