// Where the call server lives (Tailscale Funnel URL). Change only this line if it moves.
window.STR8TECH_CALL = {
  server: 'https://nashs-macbook.tailb88b1c.ts.net:10000',
};

// Shared helper: ?server=http://localhost:3000 overrides the URL (for testing).
window.STR8TECH_CALL.base = function () {
  var q = new URLSearchParams(location.search).get('server');
  return (q || window.STR8TECH_CALL.server || location.origin).replace(/\/$/, '');
};
window.STR8TECH_CALL.wsUrl = function () {
  return window.STR8TECH_CALL.base().replace(/^http/, 'ws') + '/ws';
};
