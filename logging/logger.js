// Browser-side logger for vr_client.
// Wire up the WebSocket sender once it's open by calling setSender().
// log() both console.logs and forwards the line to image_server for file writing.

let _send = null;

export function setSender(fn) {
  _send = fn;
}

export function log(...args) {
  const line = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  console.log(...args);
  if (_send) _send(line);
}
