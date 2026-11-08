export const PAGE_THEME = `
  :host {
    all: initial; font: 13px/1.4 "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
    color-scheme: light;
    --lt-bg: #f8f9fc; --lt-surface: #ffffff; --lt-sub: #f3f5f9; --lt-border: #e4e8ef;
    --lt-text: #222a39; --lt-muted: #626c7d; --lt-accent: #6258da; --lt-accent-soft: #eeedff;
    --lt-on-accent: #ffffff; --lt-shadow: 0 12px 30px #2734481a;
  }
  @media (prefers-color-scheme: dark) {
    :host {
      color-scheme: dark;
      --lt-bg: #181b24; --lt-surface: #222632; --lt-sub: #292e3b; --lt-border: #353b49;
      --lt-text: #f0f2f8; --lt-muted: #a0a9ba; --lt-accent: #a69cff; --lt-accent-soft: #383351;
      --lt-on-accent: #181b24; --lt-shadow: 0 12px 30px #00000040;
    }
  }
  button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid var(--lt-accent); outline-offset: 2px; }
`;
