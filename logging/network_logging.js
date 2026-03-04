function print_network_log(pc) {
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

    console.log(
      `[VR-NET ssrc=${id}] ` +
      `jitter=${jitterMs}ms | ` +
      `pktLoss(cumul)=${lossRateTotal}% pktLoss(2s)=${lossRateInterval}% [lost=${dtLost} recv=${dtRecv}] | ` +
      `frameDrop(cumul)=${dropRateTotal}% frameDrop(2s)=${dropRateInterval}% [dropped=${dtDropped} recv=${dtFramesRecv}]`
    );

    prevInboundStats[id] = { packetsLost, packetsReceived, framesDropped, framesReceived };
  });
}, 2000);
}

export default print_network_log