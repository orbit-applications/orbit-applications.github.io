// Where the call server lives (Tailscale Funnel URL). Change only this line if it moves.
window.STR8TECH_CALL = {
  server: 'https://crewbot.tailb88b1c.ts.net',
};

// Shared helper: the server URL is fixed. There is deliberately NO
// ?server= override — a crafted link must never be able to redirect
// the staff PIN, call audio, or typed messages to another site.
window.STR8TECH_CALL.base = function () {
  return (window.STR8TECH_CALL.server || location.origin).replace(/\/+$/, '');
};
window.STR8TECH_CALL.wsUrl = function () {
  return window.STR8TECH_CALL.base().replace(/^http/, 'ws') + '/ws';
};
