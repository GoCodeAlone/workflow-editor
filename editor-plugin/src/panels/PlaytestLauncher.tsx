import { useState } from 'react';
import useWorkflowStore from '../../../src/stores/workflowStore.ts';
import { gameToYaml } from '../compiler/gameToYaml.ts';

interface PlaytestLauncherProps {
  /** Game server base URL (e.g. http://localhost:9090) */
  serverUrl: string;
  /** Called with the game ID after a successful launch */
  onLaunch?: (gameId: string) => void;
}

type LaunchState =
  | { status: 'idle' }
  | { status: 'compiling' }
  | { status: 'launching' }
  | { status: 'running'; gameId: string }
  | { status: 'error'; message: string }
  | { status: 'empty' };

export default function PlaytestLauncher({ serverUrl, onLaunch }: PlaytestLauncherProps) {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const [state, setState] = useState<LaunchState>({ status: 'idle' });

  const handleLaunch = async () => {
    if (nodes.length === 0) {
      setState({ status: 'empty' });
      return;
    }

    setState({ status: 'compiling' });
    const { yaml, warnings } = gameToYaml({ nodes, edges });

    if (warnings.length > 0) {
      console.warn('[PlaytestLauncher] compiler warnings:', warnings);
    }

    setState({ status: 'launching' });
    try {
      const res = await fetch(`${serverUrl}/api/game/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/yaml' },
        body: yaml,
      });

      if (!res.ok) {
        setState({ status: 'error', message: `Launch failed: server returned ${res.status}` });
        return;
      }

      const data = await res.json() as { gameId: string };
      setState({ status: 'running', gameId: data.gameId });
      window.open(`${serverUrl}/play/${data.gameId}`, '_blank');
      onLaunch?.(data.gameId);
    } catch (err) {
      setState({ status: 'error', message: `Launch failed: ${(err as Error).message}` });
    }
  };

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span style={{ fontSize: 16 }}>🎮</span>
        <span style={{ fontWeight: 700, fontSize: 13 }}>Playtest</span>
      </div>

      <div style={{ padding: '10px 14px' }}>
        <button
          onClick={handleLaunch}
          disabled={state.status === 'compiling' || state.status === 'launching'}
          style={buttonStyle(state.status === 'compiling' || state.status === 'launching')}
          aria-label="Launch playtest"
        >
          {state.status === 'compiling'
            ? 'Compiling...'
            : state.status === 'launching'
              ? 'Launching...'
              : '▶ Playtest'}
        </button>

        {state.status === 'empty' && (
          <p style={msgStyle('#f59e0b')}>No game nodes on canvas to compile.</p>
        )}

        {state.status === 'error' && (
          <p style={msgStyle('#f38ba8')}>{state.message}</p>
        )}

        {state.status === 'running' && (
          <div style={{ marginTop: 10 }}>
            <p style={msgStyle('#a6e3a1')}>Game started</p>
            <div style={gameIdStyle}>
              <span style={{ color: '#585b70', fontSize: 10 }}>Game ID</span>
              <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#cdd6f4' }}>
                {state.gameId}
              </span>
            </div>
          </div>
        )}

        {state.status === 'idle' && (
          <p style={{ color: '#585b70', fontSize: 11, marginTop: 8 }}>
            Compiles the visual graph to YAML and launches a game session on the server.
          </p>
        )}
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: '#181825',
  borderRadius: 8,
  border: '1px solid #313244',
  overflow: 'hidden',
  fontFamily: 'system-ui, sans-serif',
  color: '#cdd6f4',
  minWidth: 200,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 14px',
  borderBottom: '1px solid #313244',
  background: '#1e1e2e',
};

function buttonStyle(disabled: boolean): React.CSSProperties {
  return {
    background: disabled ? '#313244' : '#a78bfa',
    color: disabled ? '#585b70' : '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '7px 16px',
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    width: '100%',
  };
}

function msgStyle(color: string): React.CSSProperties {
  return { color, fontSize: 12, margin: '8px 0 0' };
}

const gameIdStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  background: '#1e1e2e',
  border: '1px solid #313244',
  borderRadius: 4,
  padding: '6px 8px',
  marginTop: 4,
};
