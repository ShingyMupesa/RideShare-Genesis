const FACTOR_LABELS = {
  proximity: 'Proximity',
  timing: 'Timing',
  price: 'Price fit',
  preferences: 'Preferences',
  reliability: 'Reliability',
};

export default function DecisionDnaCard({ decisionDna }) {
  if (!decisionDna) return null;
  const { factors, narrative } = decisionDna;

  return (
    <div>
      <p className="eyebrow">Decision DNA · why this match</p>
      <p style={{ marginTop: 4 }}>{narrative}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
        {Object.entries(factors || {}).map(([key, factor]) => (
          <div key={key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 4 }}>
              <span>
                <strong>{FACTOR_LABELS[key] || key}</strong>{' '}
                <span className="muted">(weight {Math.round(factor.weight * 100)}%)</span>
              </span>
              <span>{Math.round(factor.score * 100)}/100</span>
            </div>
            <div className="factor-bar-track">
              <div className="factor-bar-fill" style={{ width: `${Math.round(factor.score * 100)}%` }} />
            </div>
            <p className="muted" style={{ marginTop: 2 }}>
              {factor.detail}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
