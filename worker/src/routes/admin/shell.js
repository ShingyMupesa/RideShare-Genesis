// Shared CSS, sidebar-nav/topbar chrome, and the login gate markup for the
// admin panel. Colors are the existing Genesis dark palette (unchanged) —
// only the sidebar/topbar/screen layout classes are new, added so later
// phases can slot in more screens as sibling nav items.

export function shellStyles() {
  return `
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 880px; margin: 40px auto; padding: 0 20px; background: #0f0f17; color: #eceaf5; }
  h1 { font-size: 1.4rem; margin-bottom: 4px; }
  .muted { color: #9490ab; font-size: 0.85rem; }
  .gate { max-width: 360px; margin: 80px auto; text-align: center; }
  .gate input { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid #3a3750; background: #1a1826; color: #eceaf5; margin: 12px 0; font-size: 0.95rem; }
  .gate button, .refresh { padding: 10px 18px; border-radius: 8px; border: none; background: #7c6fef; color: white; font-weight: 600; cursor: pointer; font-size: 0.9rem; }
  @media (hover: hover) and (pointer: fine) {
    .gate button:hover, .refresh:hover { background: #8f83ff; }
  }
  .error { color: #ff8080; font-size: 0.85rem; min-height: 1.2em; }
  .toggle-row { display: flex; align-items: center; gap: 12px; margin: 10px 0 18px; flex-wrap: wrap; }
  .toggle-switch { position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; }
  .toggle-switch input { opacity: 0; width: 0; height: 0; }
  .toggle-slider { position: absolute; inset: 0; background: #3a3750; border-radius: 999px; cursor: pointer; transition: background 0.15s; }
  .toggle-slider:before { content: ""; position: absolute; height: 18px; width: 18px; left: 3px; top: 3px; background: #cfcadf; border-radius: 50%; transition: transform 0.15s; }
  .toggle-switch input:checked + .toggle-slider { background: #1f9d55; }
  .toggle-switch input:checked + .toggle-slider:before { transform: translateX(20px); background: #fff; }
  .toggle-switch input:disabled + .toggle-slider { opacity: 0.5; cursor: default; }
  .reviewer-input { padding: 6px 10px; border-radius: 6px; border: 1px solid #3a3750; background: #1a1826; color: #eceaf5; font-size: 0.82rem; }
  .btn-tiny { padding: 5px 10px; border-radius: 6px; border: none; font-weight: 600; font-size: 0.78rem; cursor: pointer; margin-right: 6px; }
  .btn-approve { background: #1f9d55; color: white; }
  .btn-reject { background: #d64545; color: white; }
  @media (hover: hover) and (pointer: fine) {
    .btn-approve:hover { background: #24b862; }
    .btn-reject:hover { background: #e35a5a; }
  }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; margin: 24px 0; }
  .stat { background: #1a1826; border: 1px solid #2c2940; border-radius: 10px; padding: 16px 18px; }
  .stat .val { font-size: 1.8rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .stat .lbl { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: #9490ab; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 0.88rem; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #2c2940; font-variant-numeric: tabular-nums; }
  th { color: #9490ab; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.03em; }
  section { margin-top: 32px; }
  #app { display: none; }

  /* Sidebar-with-sections + topbar shell (new chrome; later phases add more
     nav items here as siblings). Palette matches the tokens above exactly. */
  .layout { display: flex; align-items: flex-start; gap: 0; margin: 0 -20px; }
  .sidebar { width: 190px; flex-shrink: 0; padding: 4px 0 24px; border-right: 1px solid #2c2940; }
  .sidebar-brand { font-size: 0.95rem; font-weight: 700; padding: 0 16px 16px; }
  .sb-section { padding: 14px 16px 6px; font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #9490ab; }
  .sb-item { display: block; padding: 8px 16px; margin: 1px 8px; border-radius: 8px; cursor: pointer; color: #cfcadf; font-size: 0.85rem; user-select: none; }
  @media (hover: hover) and (pointer: fine) {
    .sb-item:hover { background: #1a1826; color: #eceaf5; }
  }
  .sb-item.active { background: rgba(124, 111, 239, 0.18); color: #c3bcff; font-weight: 600; }
  .main { flex: 1; min-width: 0; padding: 0 20px; }
  .topbar { display: flex; justify-content: space-between; align-items: baseline; }
  .screen { display: none; }
  .screen.active { display: block; }
  @media (max-width: 640px) {
    .layout { flex-direction: column; margin: 0; }
    .sidebar { width: 100%; border-right: none; border-bottom: 1px solid #2c2940; padding: 4px 0 10px; }
    .main { padding: 0; }
  }
`;
}

export function gateMarkup() {
  return `
  <div class="gate" id="gate">
    <h1>Genesis Admin</h1>
    <p class="muted">Enter the admin token to view live results.</p>
    <input type="password" id="tokenInput" placeholder="Admin token" autocomplete="off">
    <div><button id="loginBtn">View dashboard</button></div>
    <p class="error" id="gateError"></p>
  </div>`;
}

// screensHtml: already-concatenated markup() output of each screen, each
// wrapped in its own <div class="screen" id="screen-...">.
export function shellMarkup(screensHtml) {
  return `
  <div id="app" class="layout">
    <nav class="sidebar">
      <div class="sidebar-brand">Genesis Admin</div>
      <div class="sb-section">Overview</div>
      <div class="sb-item active" data-screen="dashboard">Dashboard</div>
      <div class="sb-section">Operations</div>
      <div class="sb-item" data-screen="driverVerification">Driver Verification</div>
      <div class="sb-item" data-screen="disputes">Disputes</div>
    </nav>
    <div class="main">
      <div class="topbar">
        <h1 id="pageTitle">Dashboard</h1>
        <button class="refresh" id="refreshBtn">Refresh</button>
      </div>
      <p class="muted" id="generatedAt"></p>
      <p class="muted" id="autoRefreshNote" style="margin-top:-8px;">Auto-refreshing every 7s</p>
      ${screensHtml}
    </div>
  </div>`;
}
