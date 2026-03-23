import { useCallback } from 'react';
import useWorkflowStore from '../../stores/workflowStore.ts';

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#313244',
  border: '1px solid #45475a',
  borderRadius: 4,
  color: '#cdd6f4',
  padding: '5px 8px',
  fontSize: 12,
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  color: '#a6adc8',
  fontSize: 11,
  display: 'block',
  marginBottom: 4,
};

const sectionStyle: React.CSSProperties = {
  marginBottom: 12,
};

function JsonEditor({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const text = value !== undefined && value !== null
    ? (typeof value === 'string' ? value : JSON.stringify(value, null, 2))
    : '';
  return (
    <textarea
      value={text}
      onChange={(e) => {
        try {
          onChange(JSON.parse(e.target.value));
        } catch {
          onChange(e.target.value);
        }
      }}
      rows={4}
      style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace' }}
      placeholder="{}"
    />
  );
}

function HeadersEditor({
  value,
  onChange,
}: {
  value: Record<string, string> | undefined;
  onChange: (v: Record<string, string>) => void;
}) {
  const headers = value ?? {};
  const entries = Object.entries(headers);

  const updateKey = (oldKey: string, newKey: string) => {
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      next[k === oldKey ? newKey : k] = v;
    }
    onChange(next);
  };

  const updateValue = (key: string, val: string) => {
    onChange({ ...headers, [key]: val });
  };

  const addRow = () => {
    onChange({ ...headers, '': '' });
  };

  const removeRow = (key: string) => {
    const next = { ...headers };
    delete next[key];
    onChange(next);
  };

  return (
    <div>
      {entries.map(([k, v], i) => (
        <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center' }}>
          <input
            value={k}
            onChange={(e) => updateKey(k, e.target.value)}
            placeholder="Header"
            style={{ ...inputStyle, flex: 1 }}
          />
          <input
            value={v}
            onChange={(e) => updateValue(k, e.target.value)}
            placeholder="Value"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={() => removeRow(k)}
            style={{ background: 'none', border: 'none', color: '#f38ba8', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={addRow}
        style={{ background: '#313244', border: '1px solid #45475a', color: '#a6adc8', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}
      >
        + Add Header
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────
// Per-type panel forms
// ──────────────────────────────────────────────

function TriggerPanel({ data, update }: { data: Record<string, unknown>; update: (d: Record<string, unknown>) => void }) {
  const triggerType = (data.triggerType as string) ?? 'http';

  return (
    <>
      <div style={sectionStyle}>
        <span style={labelStyle}>Type</span>
        <select
          value={triggerType}
          onChange={(e) => update({ triggerType: e.target.value })}
          style={inputStyle}
        >
          <option value="http">HTTP</option>
          <option value="pipeline">Pipeline</option>
          <option value="eventbus">Event Bus</option>
          <option value="scheduler">Scheduler</option>
        </select>
      </div>

      {triggerType === 'http' && (
        <>
          <div style={sectionStyle}>
            <span style={labelStyle}>Method</span>
            <select
              value={(data.method as string) ?? 'GET'}
              onChange={(e) => update({ method: e.target.value })}
              style={inputStyle}
            >
              {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div style={sectionStyle}>
            <span style={labelStyle}>Path</span>
            <input
              value={(data.path as string) ?? ''}
              onChange={(e) => update({ path: e.target.value })}
              placeholder="/api/v1/resource"
              style={inputStyle}
            />
          </div>
          <div style={sectionStyle}>
            <span style={labelStyle}>Body (JSON)</span>
            <JsonEditor value={data.body} onChange={(v) => update({ body: v })} />
          </div>
          <div style={sectionStyle}>
            <span style={labelStyle}>Headers</span>
            <HeadersEditor
              value={data.headers as Record<string, string> | undefined}
              onChange={(v) => update({ headers: v })}
            />
          </div>
        </>
      )}

      {triggerType === 'pipeline' && (
        <div style={sectionStyle}>
          <span style={labelStyle}>Pipeline Name</span>
          <input
            value={(data.pipelineName as string) ?? (data.name as string) ?? ''}
            onChange={(e) => update({ pipelineName: e.target.value, name: e.target.value })}
            placeholder="pipeline-name"
            style={inputStyle}
          />
        </div>
      )}

      {triggerType === 'eventbus' && (
        <>
          <div style={sectionStyle}>
            <span style={labelStyle}>Topic</span>
            <input
              value={(data.topic as string) ?? ''}
              onChange={(e) => update({ topic: e.target.value })}
              placeholder="events.topic"
              style={inputStyle}
            />
          </div>
          <div style={sectionStyle}>
            <span style={labelStyle}>Data (JSON)</span>
            <JsonEditor value={data.eventData} onChange={(v) => update({ eventData: v })} />
          </div>
        </>
      )}

      {triggerType === 'scheduler' && (
        <div style={sectionStyle}>
          <span style={labelStyle}>Schedule Name</span>
          <input
            value={(data.scheduleName as string) ?? ''}
            onChange={(e) => update({ scheduleName: e.target.value })}
            placeholder="daily-job"
            style={inputStyle}
          />
        </div>
      )}
    </>
  );
}

function MockPanel({ data, update }: { data: Record<string, unknown>; update: (d: Record<string, unknown>) => void }) {
  return (
    <>
      <div style={sectionStyle}>
        <span style={labelStyle}>Step Type</span>
        <input
          value={(data.stepType as string) ?? ''}
          onChange={(e) => update({ stepType: e.target.value })}
          placeholder="step.db_query"
          style={inputStyle}
        />
      </div>
      <div style={sectionStyle}>
        <span style={labelStyle}>Return Value (JSON)</span>
        <JsonEditor value={data.returnValue} onChange={(v) => update({ returnValue: v })} />
      </div>
    </>
  );
}

function AssertPanel({ data, update }: { data: Record<string, unknown>; update: (d: Record<string, unknown>) => void }) {
  const assertType = (data.assertType as string) ?? 'response';

  return (
    <>
      <div style={sectionStyle}>
        <span style={labelStyle}>Type</span>
        <select
          value={assertType}
          onChange={(e) => update({ assertType: e.target.value })}
          style={inputStyle}
        >
          <option value="step_output">Step Output</option>
          <option value="step_executed">Step Executed</option>
          <option value="response_status">Response Status</option>
          <option value="response_body">Response Body</option>
          <option value="state_field">State Field</option>
          {/* legacy values from impl-nodes */}
          <option value="step">Step</option>
          <option value="response">Response</option>
          <option value="state">State</option>
        </select>
      </div>

      {(assertType === 'step_output' || assertType === 'step') && (
        <>
          <div style={sectionStyle}>
            <span style={labelStyle}>Step Name</span>
            <input
              value={(data.stepName as string) ?? (data.target as string) ?? ''}
              onChange={(e) => update({ stepName: e.target.value, target: e.target.value })}
              placeholder="step-name"
              style={inputStyle}
            />
          </div>
          <div style={sectionStyle}>
            <span style={labelStyle}>Output Key</span>
            <input
              value={(data.outputKey as string) ?? ''}
              onChange={(e) => update({ outputKey: e.target.value })}
              placeholder="result"
              style={inputStyle}
            />
          </div>
          <div style={sectionStyle}>
            <span style={labelStyle}>Expected Value (JSON)</span>
            <JsonEditor value={data.expected} onChange={(v) => update({ expected: v })} />
          </div>
        </>
      )}

      {assertType === 'step_executed' && (
        <>
          <div style={sectionStyle}>
            <span style={labelStyle}>Step Name</span>
            <input
              value={(data.stepName as string) ?? (data.target as string) ?? ''}
              onChange={(e) => update({ stepName: e.target.value, target: e.target.value })}
              placeholder="step-name"
              style={inputStyle}
            />
          </div>
          <div style={sectionStyle}>
            <span style={labelStyle}>Executed</span>
            <select
              value={String(data.executed ?? 'true')}
              onChange={(e) => update({ executed: e.target.value === 'true' })}
              style={inputStyle}
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>
        </>
      )}

      {(assertType === 'response_status' || assertType === 'response') && (
        <div style={sectionStyle}>
          <span style={labelStyle}>Expected Status Code</span>
          <input
            type="number"
            value={String(data.expectedStatus ?? data.expected ?? 200)}
            onChange={(e) => update({ expectedStatus: Number(e.target.value), expected: Number(e.target.value), target: 'status' })}
            style={inputStyle}
          />
        </div>
      )}

      {assertType === 'response_body' && (
        <>
          <div style={sectionStyle}>
            <span style={labelStyle}>Contains Text</span>
            <input
              value={(data.containsText as string) ?? ''}
              onChange={(e) => update({ containsText: e.target.value })}
              placeholder="expected text"
              style={inputStyle}
            />
          </div>
          <div style={sectionStyle}>
            <span style={labelStyle}>JSON Path Match (JSON)</span>
            <JsonEditor value={data.jsonPath} onChange={(v) => update({ jsonPath: v })} />
          </div>
        </>
      )}

      {(assertType === 'state_field' || assertType === 'state') && (
        <>
          <div style={sectionStyle}>
            <span style={labelStyle}>Store</span>
            <input
              value={(data.stateStore as string) ?? ''}
              onChange={(e) => update({ stateStore: e.target.value })}
              placeholder="sessions"
              style={inputStyle}
            />
          </div>
          <div style={sectionStyle}>
            <span style={labelStyle}>Key</span>
            <input
              value={(data.stateKey as string) ?? ''}
              onChange={(e) => update({ stateKey: e.target.value })}
              placeholder="game-1"
              style={inputStyle}
            />
          </div>
          <div style={sectionStyle}>
            <span style={labelStyle}>Field</span>
            <input
              value={(data.stateField as string) ?? ''}
              onChange={(e) => update({ stateField: e.target.value })}
              placeholder="turn"
              style={inputStyle}
            />
          </div>
          <div style={sectionStyle}>
            <span style={labelStyle}>Expected Value (JSON)</span>
            <JsonEditor value={data.expected} onChange={(v) => update({ expected: v })} />
          </div>
        </>
      )}
    </>
  );
}

function StatePanel({ data, update }: { data: Record<string, unknown>; update: (d: Record<string, unknown>) => void }) {
  const isFixture = Boolean(data.fixture);

  return (
    <>
      <div style={sectionStyle}>
        <span style={labelStyle}>Mode</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input
              type="radio"
              checked={!isFixture}
              onChange={() => update({ fixture: undefined })}
            />
            <span style={{ color: '#cdd6f4', fontSize: 12 }}>Inline Data</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input
              type="radio"
              checked={isFixture}
              onChange={() => update({ fixture: '' })}
            />
            <span style={{ color: '#cdd6f4', fontSize: 12 }}>Fixture File</span>
          </label>
        </div>
      </div>

      <div style={sectionStyle}>
        <span style={labelStyle}>Store Name</span>
        <input
          value={(data.store as string) ?? ''}
          onChange={(e) => update({ store: e.target.value })}
          placeholder="sessions"
          style={inputStyle}
        />
      </div>

      {isFixture ? (
        <div style={sectionStyle}>
          <span style={labelStyle}>Fixture File Path</span>
          <input
            value={(data.fixture as string) ?? ''}
            onChange={(e) => update({ fixture: e.target.value })}
            placeholder="fixtures/state.json"
            style={inputStyle}
          />
        </div>
      ) : (
        <div style={sectionStyle}>
          <span style={labelStyle}>Seed Data (JSON)</span>
          <JsonEditor value={data.seedData} onChange={(v) => update({ seedData: v })} />
        </div>
      )}
    </>
  );
}

function PipelineRefPanel({ data, update }: { data: Record<string, unknown>; update: (d: Record<string, unknown>) => void }) {
  return (
    <div style={sectionStyle}>
      <span style={labelStyle}>Pipeline Name</span>
      <input
        value={(data.pipelineName as string) ?? ''}
        onChange={(e) => update({ pipelineName: e.target.value, label: e.target.value || 'Pipeline' })}
        placeholder="pipeline-name"
        style={inputStyle}
      />
    </div>
  );
}

// ──────────────────────────────────────────────
// Main TestPropertyPanel
// ──────────────────────────────────────────────

const NODE_TYPE_LABELS: Record<string, string> = {
  triggerTest: 'Trigger',
  mockTest: 'Mock',
  assertTest: 'Assert',
  stateTest: 'State',
  pipelineRef: 'Pipeline Ref',
};

const NODE_TYPE_COLORS: Record<string, string> = {
  triggerTest: '#3b82f6',
  mockTest: '#f97316',
  assertTest: '#6b7280',
  stateTest: '#a855f7',
  pipelineRef: '#6b7280',
};

export default function TestPropertyPanel() {
  const testNodes = useWorkflowStore((s) => s.testNodes);
  const selectedTestNodeId = useWorkflowStore((s) => s.selectedTestNodeId);
  const setSelectedTestNode = useWorkflowStore((s) => s.setSelectedTestNode);
  const updateTestNodeData = useWorkflowStore((s) => s.updateTestNodeData);

  const node = testNodes.find((n) => n.id === selectedTestNodeId);

  const update = useCallback(
    (patch: Record<string, unknown>) => {
      if (node) updateTestNodeData(node.id, patch);
    },
    [node, updateTestNodeData],
  );

  if (!node) {
    return (
      <div
        style={{
          width: '100%',
          background: '#181825',
          padding: 16,
          color: '#585b70',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          boxSizing: 'border-box',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <span>Select a test node to edit</span>
        <span style={{ fontSize: 11 }}>Click a node on the canvas</span>
      </div>
    );
  }

  const nodeType = node.type ?? '';
  const data = node.data as Record<string, unknown>;
  const color = NODE_TYPE_COLORS[nodeType] ?? '#64748b';
  const typeLabel = NODE_TYPE_LABELS[nodeType] ?? nodeType;

  const updateLabel = (label: string) => updateTestNodeData(node.id, { label });

  return (
    <div
      style={{
        width: '100%',
        background: '#181825',
        overflowY: 'auto',
        height: '100%',
        fontSize: 12,
        color: '#cdd6f4',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #313244',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 14 }}>Properties</span>
        <button
          onClick={() => setSelectedTestNode(null)}
          style={{ background: 'none', border: 'none', color: '#585b70', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}
        >
          ×
        </button>
      </div>

      <div style={{ padding: 16 }}>
        {/* Name */}
        <div style={sectionStyle}>
          <span style={labelStyle}>Name</span>
          <input
            value={(data.label as string) ?? ''}
            onChange={(e) => updateLabel(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Type badge */}
        <div style={{ marginBottom: 16 }}>
          <span
            style={{
              background: `${color}20`,
              color,
              padding: '3px 8px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 500,
            }}
          >
            {typeLabel}
          </span>
        </div>

        {/* Type-specific config */}
        <div style={{ borderTop: '1px solid #313244', paddingTop: 12 }}>
          <span style={{ color: '#a6adc8', fontSize: 11, display: 'block', marginBottom: 10, fontWeight: 600 }}>
            Configuration
          </span>
          {nodeType === 'triggerTest' && <TriggerPanel data={data} update={update} />}
          {nodeType === 'mockTest' && <MockPanel data={data} update={update} />}
          {nodeType === 'assertTest' && <AssertPanel data={data} update={update} />}
          {nodeType === 'stateTest' && <StatePanel data={data} update={update} />}
          {nodeType === 'pipelineRef' && <PipelineRefPanel data={data} update={update} />}
        </div>
      </div>
    </div>
  );
}
