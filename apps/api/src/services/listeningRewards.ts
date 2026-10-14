export type ListeningRewardProgress = {
  grants: number;
  grantedCoins: number;
  remainingSeconds: number;
};

export function verifiedListeningSeconds(reportedSeconds: number, elapsedMilliseconds: number) {
  const reported = Math.max(0, Math.min(600, Math.floor(reportedSeconds)));
  // Heartbeats carry whole played seconds. Ceil only the server elapsed time so
  // a request arriving a few milliseconds before the boundary never loses a
  // genuine second; the client-reported value remains the upper bound.
  const available = Math.max(0, Math.min(600, Math.ceil(elapsedMilliseconds / 1000)));
  return Math.min(reported, available);
}

export function advanceListeningReward(
  currentSeconds: number,
  creditedSeconds: number,
  intervalSeconds: number,
  coinAmount: number
): ListeningRewardProgress {
  const interval = Math.max(60, Math.min(86_400, Math.floor(intervalSeconds)));
  const amount = Math.max(1, Math.min(10_000, Math.floor(coinAmount)));
  const accumulated = Math.max(0, Math.floor(currentSeconds)) + Math.max(0, Math.floor(creditedSeconds));
  const grants = Math.floor(accumulated / interval);
  return {
    grants,
    grantedCoins: grants * amount,
    remainingSeconds: accumulated % interval
  };
}
