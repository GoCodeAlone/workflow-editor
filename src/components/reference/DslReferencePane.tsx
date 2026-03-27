import { useEffect, useRef, useState } from 'react';
import { YamlLineRenderer } from '../yaml/YamlLineRenderer.tsx';

export interface DSLSection {
  id: string;
  title: string;
  description: string;
  requiredFields: Array<{ name: string; type: string; description: string }>;
  optionalFields: Array<{ name: string; type: string; description: string }>;
  example: string;
  relationships: string[];
  parent?: string | null;
}

export interface DslReferencePaneProps {
  visible: boolean;
  sections: DSLSection[];
  activeSection?: string;
  onClose: () => void;
}

function FieldTable({ fields, label }: { fields: DSLSection['requiredFields']; label: string }) {
  if (fields.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#a6adc8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
        {label}
      </div>
      {fields.map((f) => (
        <div key={f.name} style={{ display: 'flex', gap: 8, marginBottom: 4, fontSize: 12 }}>
          <code style={{ color: '#89b4fa', fontFamily: 'monospace', minWidth: 100, flexShrink: 0 }}>{f.name}</code>
          <span style={{ color: '#6c7086', fontStyle: 'italic', minWidth: 60, flexShrink: 0 }}>{f.type}</span>
          <span style={{ color: '#cdd6f4' }}>{f.description}</span>
        </div>
      ))}
    </div>
  );
}

function SectionEntry({
  section,
  isActive,
  sectionRef,
}: {
  section: DSLSection;
  isActive: boolean;
  sectionRef: (el: HTMLDivElement | null) => void;
}) {
  const [expanded, setExpanded] = useState(isActive);

  useEffect(() => {
    if (isActive) setExpanded(true);
  }, [isActive]);

  return (
    <div
      ref={sectionRef}
      data-section-id={section.id}
      style={{
        borderBottom: '1px solid #313244',
        background: isActive ? '#1e2030' : 'transparent',
      }}
    >
      <button
        onClick={() => setExpanded((e) => !e)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: isActive ? '#89b4fa' : '#cdd6f4',
          fontSize: 13,
          fontWeight: isActive ? 700 : 500,
          textAlign: 'left',
        }}
      >
        <span style={{ color: '#45475a', fontSize: 10, width: 12 }}>{expanded ? '▼' : '▶'}</span>
        {section.parent && (
          <span style={{ color: '#6c7086', fontSize: 11 }}>{section.parent} › </span>
        )}
        {section.title}
      </button>

      {expanded && (
        <div style={{ padding: '0 12px 12px 32px' }}>
          <p style={{ fontSize: 12, color: '#a6adc8', lineHeight: 1.5, marginBottom: 12 }}>
            {section.description}
          </p>

          <FieldTable fields={section.requiredFields} label="Required Fields" />
          <FieldTable fields={section.optionalFields} label="Optional Fields" />

          {section.example && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#a6adc8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                Example
              </div>
              <div style={{ border: '1px solid #313244', borderRadius: 4, overflow: 'hidden', maxHeight: 200 }}>
                <YamlLineRenderer content={section.example} />
              </div>
            </div>
          )}

          {section.relationships.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#a6adc8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                Relationships
              </div>
              <ul style={{ margin: 0, paddingLeft: 16, listStyle: 'disc' }}>
                {section.relationships.map((r, i) => (
                  <li key={i} style={{ fontSize: 12, color: '#a6adc8', marginBottom: 4 }}>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DslReferencePane({ visible, sections, activeSection, onClose }: DslReferencePaneProps) {
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!activeSection) return;
    const el = sectionRefs.current[activeSection];
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeSection]);

  if (!visible) return null;

  if (sections.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          background: '#1e1e2e',
          borderLeft: '1px solid #313244',
        }}
      >
        <PaneHeader onClose={onClose} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#585b70', fontSize: 13 }}>
          No reference available
        </div>
      </div>
    );
  }

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
      <PaneHeader onClose={onClose} />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sections.map((section) => (
          <SectionEntry
            key={section.id}
            section={section}
            isActive={section.id === activeSection}
            sectionRef={(el) => { sectionRefs.current[section.id] = el; }}
          />
        ))}
      </div>
    </div>
  );
}

function PaneHeader({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        borderBottom: '1px solid #313244',
        background: '#181825',
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 700, color: '#a6adc8', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>📖</span> DSL Reference
      </span>
      <button
        onClick={onClose}
        aria-label="Close DSL Reference"
        style={{
          background: 'none',
          border: 'none',
          color: '#585b70',
          cursor: 'pointer',
          fontSize: 14,
          padding: '2px 4px',
          lineHeight: 1,
        }}
      >
        ✕
      </button>
    </div>
  );
}
