export function renderErrorPage() {
  return `<!doctype html>
<html lang="pt-PT">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Não foi possível abrir o Assista-me</title>
    <style>
      :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f7f9; color: #172033; }
      main { width: min(90vw, 30rem); text-align: center; }
      h1 { margin: 0 0 .75rem; font-size: 1.5rem; }
      p { margin: 0; color: #5d6678; line-height: 1.6; }
      nav { display: flex; justify-content: center; gap: .75rem; margin-top: 1.5rem; }
      a, button { border: 1px solid #cbd1dc; border-radius: .375rem; padding: .65rem 1rem; font: inherit; font-weight: 600; cursor: pointer; }
      button { border-color: #d97706; background: #d97706; color: #fff; }
      a { background: transparent; color: inherit; text-decoration: none; }
      @media (prefers-color-scheme: dark) { body { background: #111827; color: #f3f4f6; } p { color: #aeb7c7; } a { border-color: #4b5563; } }
    </style>
  </head>
  <body>
    <main>
      <h1>Não foi possível abrir esta página</h1>
      <p>Ocorreu um erro inesperado. Pode tentar novamente sem perder os seus dados.</p>
      <nav><button type="button" onclick="location.reload()">Tentar novamente</button><a href="/">Ir para o início</a></nav>
    </main>
  </body>
</html>`;
}