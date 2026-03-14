import { useState } from 'react';

export interface CardData {
  name: string;
  cardType: string;
  cost: number;
  effects: string[];
  description?: string;
  attack?: number;
  defense?: number;
}

const CARD_TYPES = ['creature', 'spell', 'artifact', 'enchantment', 'trap', 'field'];

const DEFAULT_CARD: CardData = {
  name: '',
  cardType: 'creature',
  cost: 0,
  effects: [],
  description: '',
};

interface CardDesignerProps {
  initialCard?: Partial<CardData>;
  onChange?: (card: CardData) => void;
}

export default function CardDesigner({ initialCard, onChange }: CardDesignerProps) {
  const [card, setCard] = useState<CardData>({ ...DEFAULT_CARD, ...initialCard });

  const update = (patch: Partial<CardData>) => {
    const next = { ...card, ...patch };
    setCard(next);
    onChange?.(next);
  };

  const isCreature = card.cardType === 'creature';

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span style={{ fontSize: 16 }}>🃏</span>
        <span style={{ fontWeight: 700, fontSize: 13 }}>Card Designer</span>
      </div>

      <div style={{ padding: '10px 14px', display: 'flex', gap: 12 }}>
        {/* Form */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Name</span>
            <input
              placeholder="Card name"
              value={card.name}
              onChange={(e) => update({ name: e.target.value })}
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            <span style={labelTextStyle}>Type</span>
            <select
              value={card.cardType}
              onChange={(e) => update({ cardType: e.target.value })}
              style={inputStyle}
            >
              {CARD_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            <span style={labelTextStyle}>Cost</span>
            <input
              type="number"
              min={0}
              max={20}
              value={card.cost}
              onChange={(e) => update({ cost: Number(e.target.value) })}
              aria-label="cost"
              style={{ ...inputStyle, width: 60 }}
            />
          </label>

          {isCreature && (
            <>
              <label style={labelStyle}>
                <span style={labelTextStyle}>ATK</span>
                <input
                  type="number"
                  min={0}
                  value={card.attack ?? 0}
                  onChange={(e) => update({ attack: Number(e.target.value) })}
                  style={{ ...inputStyle, width: 60 }}
                />
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>DEF</span>
                <input
                  type="number"
                  min={0}
                  value={card.defense ?? 0}
                  onChange={(e) => update({ defense: Number(e.target.value) })}
                  style={{ ...inputStyle, width: 60 }}
                />
              </label>
            </>
          )}

          <label style={labelStyle}>
            <span style={labelTextStyle}>Description</span>
            <textarea
              value={card.description ?? ''}
              onChange={(e) => update({ description: e.target.value })}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </label>
        </div>

        {/* Preview */}
        <div style={{ width: 100, flexShrink: 0 }}>
          <div style={{ color: '#a6adc8', fontSize: 10, marginBottom: 6, fontWeight: 600 }}>Preview</div>
          <CardPreview card={card} />
        </div>
      </div>
    </div>
  );
}

function CardPreview({ card }: { card: CardData }) {
  const typeColor = CARD_TYPE_COLORS[card.cardType] ?? '#64748b';
  return (
    <div style={{
      width: 90,
      minHeight: 130,
      background: '#1e1e2e',
      border: `2px solid ${typeColor}`,
      borderRadius: 6,
      padding: 6,
      fontSize: 9,
      color: '#cdd6f4',
      display: 'flex',
      flexDirection: 'column',
      gap: 3,
    }}>
      {/* Cost bubble */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          width: 16, height: 16, borderRadius: '50%',
          background: typeColor + '30', color: typeColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 10,
        }}>{card.cost}</span>
        <span style={{ color: typeColor, fontSize: 8, fontWeight: 600 }}>{card.cardType}</span>
      </div>

      <div style={{ fontWeight: 700, fontSize: 10, color: '#cdd6f4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {card.name || '—'}
      </div>

      <div style={{ flex: 1, background: typeColor + '10', borderRadius: 3, minHeight: 40 }} />

      {card.description && (
        <div style={{ color: '#a6adc8', fontSize: 8, lineHeight: 1.3 }}>
          {card.description.slice(0, 60)}
        </div>
      )}

      {card.cardType === 'creature' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
          <span style={{ color: '#f38ba8', fontWeight: 700 }}>{card.attack ?? 0}</span>
          <span style={{ color: '#89b4fa', fontWeight: 700 }}>{card.defense ?? 0}</span>
        </div>
      )}
    </div>
  );
}

const CARD_TYPE_COLORS: Record<string, string> = {
  creature:    '#a78bfa',
  spell:       '#60a5fa',
  artifact:    '#fbbf24',
  enchantment: '#34d399',
  trap:        '#f38ba8',
  field:       '#fb923c',
};

const panelStyle: React.CSSProperties = {
  background: '#181825',
  borderRadius: 8,
  border: '1px solid #313244',
  overflow: 'hidden',
  fontFamily: 'system-ui, sans-serif',
  color: '#cdd6f4',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 14px',
  borderBottom: '1px solid #313244',
  background: '#1e1e2e',
};

const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 };
const labelTextStyle: React.CSSProperties = { color: '#a6adc8', fontSize: 10 };
const inputStyle: React.CSSProperties = {
  background: '#1e1e2e',
  border: '1px solid #313244',
  borderRadius: 4,
  color: '#cdd6f4',
  fontSize: 12,
  padding: '4px 6px',
  width: '100%',
  boxSizing: 'border-box',
};
