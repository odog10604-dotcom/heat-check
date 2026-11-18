// Plain (non-module) script. If the game has not started a few seconds after load, show a readable message
// instead of a dead screen: very old browser, blocked scripts, or a broken deploy.
setTimeout(function () {
  if (window.__hcReady) return;
  var b = document.getElementById('boot-error');
  if (b) b.hidden = false;
}, 6000);
