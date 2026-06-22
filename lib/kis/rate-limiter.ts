// KIS API 초당 20건 제한 대응 — 요청 사이 최소 70ms 간격 (≈14건/초)
// 체인 방식: 각 요청이 이전 요청 완료 후 70ms 대기 후 진행
let gate = Promise.resolve();

export function acquireRateLimit(): Promise<void> {
  const next = gate.then(() => new Promise<void>((r) => setTimeout(r, 70)));
  gate = next.then(() => {}, () => {});
  return next;
}
