import type { MckDataset } from "../types";

export function calculatePeerComparisonEngine(data: MckDataset) {
  return data.peers.map((peer) => ({
    ...peer,
    specialtyAdvantageVsMck: peer.specialtyExposure - data.peers[0].specialtyExposure,
    multipleGapVsMck: peer.forwardPe - data.market.forwardPe,
  }));
}
