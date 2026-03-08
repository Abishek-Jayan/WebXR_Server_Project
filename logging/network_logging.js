import { log } from './logger.js';

export function print_network_log(pc) {
// Network metrics polling: jitter, packet loss, dropped frames
const prevInboundStats = {};

setInterval(async () => {
  if (pc.connectionState !== 'connected') return;
  const stats = await pc.getStats();
  stats.forEach(report => {
    if (report.type !== 'inbound-rtp' || report.kind !== 'video') return;
    const id = report.ssrc;
    const prev = prevInboundStats[id] || {};

    const jitterMs = ((report.jitter || 0) * 1000).toFixed(1);

    const packetsLost = report.packetsLost || 0;
    const packetsReceived = report.packetsReceived || 0;
    const totalPackets = packetsLost + packetsReceived;
    const lossRateTotal = totalPackets > 0
      ? ((packetsLost / totalPackets) * 100).toFixed(2)
      : '0.00';

    const dtLost = packetsLost - (prev.packetsLost || 0);
    const dtRecv = packetsReceived - (prev.packetsReceived || 0);
    const dtTotal = dtLost + dtRecv;
    const lossRateInterval = dtTotal > 0
      ? ((dtLost / dtTotal) * 100).toFixed(2)
      : '0.00';

    const framesDropped = report.framesDropped || 0;
    const framesReceived = report.framesReceived || 0;
    const dropRateTotal = framesReceived > 0
      ? ((framesDropped / framesReceived) * 100).toFixed(2)
      : '0.00';

    const dtDropped = framesDropped - (prev.framesDropped || 0);
    const dtFramesRecv = framesReceived - (prev.framesReceived || 0);
    const dropRateInterval = dtFramesRecv > 0
      ? ((dtDropped / dtFramesRecv) * 100).toFixed(2)
      : '0.00';

    log(
      `[VR-NET ssrc=${id}] ` +
      `jitter=${jitterMs}ms | ` +
      `pktLoss(cumul)=${lossRateTotal}% pktLoss(2s)=${lossRateInterval}% [lost=${dtLost} recv=${dtRecv}] | ` +
      `frameDrop(cumul)=${dropRateTotal}% frameDrop(2s)=${dropRateInterval}% [dropped=${dtDropped} recv=${dtFramesRecv}]`
    );

    prevInboundStats[id] = { packetsLost, packetsReceived, framesDropped, framesReceived };
  });
}, 2000);
}

export function print_video_fps(video) {
  let frameCount = 0;
  let lastTime = performance.now();

  function onFrame(now) {
    frameCount++;
    const elapsed = now - lastTime;
    if (elapsed >= 2000) {
      const fps = (frameCount / elapsed * 1000).toFixed(1);
      log(`[VIDEO-FPS] ${fps} fps`);
      frameCount = 0;
      lastTime = now;
    }
    video.requestVideoFrameCallback(onFrame);
  }

  video.requestVideoFrameCallback(onFrame);
}

export function start_receiver_stats(pc) {
  let decodeMs = 0;
  let networkMs = 0;
  let jitterBufferMs = 0;
  const prev = {};

  setInterval(async () => {
    if (pc.connectionState !== 'connected') return;
    const stats = await pc.getStats();
    stats.forEach(report => {
      if (report.type === 'inbound-rtp' && report.kind === 'video') {
        const p = prev.inbound || {};
        const dtDecode = (report.totalDecodeTime || 0) - (p.totalDecodeTime || 0);
        const dtFrames = (report.framesDecoded || 0) - (p.framesDecoded || 0);
        if (dtFrames > 0) decodeMs = (dtDecode / dtFrames) * 1000;
        const dtJitter = (report.jitterBufferDelay || 0) - (p.jitterBufferDelay || 0);
        const dtEmitted = (report.jitterBufferEmittedCount || 0) - (p.jitterBufferEmittedCount || 0);
        if (dtEmitted > 0) jitterBufferMs = (dtJitter / dtEmitted) * 1000;
        prev.inbound = {
          totalDecodeTime: report.totalDecodeTime,
          framesDecoded: report.framesDecoded,
          jitterBufferDelay: report.jitterBufferDelay,
          jitterBufferEmittedCount: report.jitterBufferEmittedCount,
        };
      }
      if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.currentRoundTripTime) {
        networkMs = (report.currentRoundTripTime / 2) * 1000;
      }
    });
  }, 2000);

  return {
    getDecodeMs: () => decodeMs,
    getNetworkMs: () => networkMs,
    getJitterBufferMs: () => jitterBufferMs,
  };
}