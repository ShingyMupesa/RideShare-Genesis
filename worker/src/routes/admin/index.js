import { Hono } from 'hono';
import { shellStyles, externalHeadTags, gateMarkup, shellMarkup } from './shell.js';
import * as dashboard from './screens/dashboard.js';
import * as driverVerification from './screens/driverVerification.js';
import * as disputes from './screens/disputes.js';
import * as liveMap from './screens/liveMap.js';
import * as config from './screens/config.js';
import * as monetisation from './screens/monetisation.js';
import * as adSlots from './screens/adSlots.js';
import * as insurancePartners from './screens/insurancePartners.js';
import * as clientApp from './client/app.js';

export const admin = new Hono();

function renderPage() {
  const screensHtml = [
    dashboard.markup(),
    driverVerification.markup(),
    disputes.markup(),
    liveMap.markup(),
    monetisation.markup(),
    adSlots.markup(),
    insurancePartners.markup(),
    config.markup(),
  ].join('\n');

  const scriptBody = [
    clientApp.script(),
    dashboard.script(),
    driverVerification.script(),
    disputes.script(),
    liveMap.script(),
    monetisation.script(),
    adSlots.script(),
    insurancePartners.script(),
    config.script(),
  ].join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Genesis Admin</title>
<style>${shellStyles()}</style>
${externalHeadTags()}
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
