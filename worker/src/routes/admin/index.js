import { Hono } from 'hono';
import { shellStyles, gateMarkup, shellMarkup } from './shell.js';
import * as dashboard from './screens/dashboard.js';
import * as driverVerification from './screens/driverVerification.js';
import * as clientApp from './client/app.js';

export const admin = new Hono();

function renderPage() {
  const screensHtml = [dashboard.markup(), driverVerification.markup()].join('\n');

  const scriptBody = [
    clientApp.script(),
    dashboard.script(),
    driverVerification.script(),
  ].join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Genesis Admin</title>
<style>${shellStyles()}</style>
</head>
<body>
${gateMarkup()}
${shellMarkup(screensHtml)}

<script>
(function () {
${scriptBody}
})();
</script>
</body>
</html>`;
}

admin.get('/', (c) => c.html(renderPage()));
