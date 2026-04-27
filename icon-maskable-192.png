import type { Device, Breaker, PhaseType, PowerSpec } from './supabase';
import { PHASE_VOLTAGE } from './supabase';

// 장비의 소비 전력(W) 계산
// power.watts가 있으면 그것을, 없으면 V × A로 계산
export function deviceWatts(d: Device): number {
  if (!d.power) return 0;
  if (typeof d.power.watts === 'number' && d.power.watts > 0) {
    return d.power.watts;
  }
  if (typeof d.power.amps === 'number' && d.power.amps > 0) {
    const v = d.power.voltage ?? PHASE_VOLTAGE[d.power.phase ?? 'single'];
    return v * d.power.amps;
  }
  return 0;
}

// 장비의 전류(A) 계산
export function deviceAmps(d: Device): number {
  if (!d.power) return 0;
  if (typeof d.power.amps === 'number' && d.power.amps > 0) {
    return d.power.amps;
  }
  if (typeof d.power.watts === 'number' && d.power.watts > 0) {
    const v = d.power.voltage ?? PHASE_VOLTAGE[d.power.phase ?? 'single'];
    return v > 0 ? d.power.watts / v : 0;
  }
  return 0;
}

// 차단기의 최대 허용 전력(W) = V × A
export function breakerCapacityWatts(br: Breaker): number {
  return PHASE_VOLTAGE[br.phase] * br.capacityA;
}

// 차단기마다 부하 계산
// connections에서 이 배전반의 outputPort에 연결된 소비 장비들을 찾아 합산
export type BreakerLoad = {
  breaker: Breaker;
  consumers: Device[];      // 이 차단기에서 공급받는 소비 장비들
  totalWatts: number;       // 총 소비 전력
  totalAmps: number;        // 총 전류
  capacityWatts: number;    // 차단기 허용 전력
  loadPercent: number;      // 사용률 (0~100+)
  overload: boolean;        // 초과 여부 (loadPercent > 100)
  warning: boolean;         // 경고 (loadPercent > 80)
};

export function computeBreakerLoad(
  panelboard: Device,
  breaker: Breaker,
  allDevices: Device[],
  allConnections: Array<{ from_device: string; from_port: string; to_device: string; to_port: string }>,
): BreakerLoad {
  // 이 차단기의 outputPort와 연결된 모든 소비 장비 추적 (BFS)
  const consumers: Device[] = [];
  if (!breaker.outputPort) {
    return {
      breaker,
      consumers: [],
      totalWatts: 0,
      totalAmps: 0,
      capacityWatts: breakerCapacityWatts(breaker),
      loadPercent: 0,
      overload: false,
      warning: false,
    };
  }
  const visited = new Set<string>([panelboard.id]);
  // 시작: 배전반의 outputPort에 연결된 모든 케이블
  const queue: Array<{ deviceId: string; port: string }> = [
    { deviceId: panelboard.id, port: breaker.outputPort },
  ];
  while (queue.length > 0) {
    const { deviceId, port } = queue.shift()!;
    // 이 device:port에서 나가는 연결 (from_device:from_port = deviceId:port)
    const outgoing = allConnections.filter(c => c.from_device === deviceId && c.from_port === port);
    for (const conn of outgoing) {
      const targetDev = allDevices.find(d => d.id === conn.to_device);
      if (!targetDev || visited.has(targetDev.id)) continue;
      visited.add(targetDev.id);
      // 소비 장비면 합산
      if (targetDev.role === 'power_consumer' || (targetDev.power && !targetDev.power.isSupply)) {
        consumers.push(targetDev);
      }
      // 통과 장비면 (다른 배전반 / connector 등) 출력으로 더 따라감
      // — 각 OUT 포트로 propagate
      if (targetDev.role !== 'power_consumer') {
        targetDev.outputs?.forEach(outP => {
          queue.push({ deviceId: targetDev.id, port: outP });
        });
      }
    }
  }

  const totalWatts = consumers.reduce((sum, d) => sum + deviceWatts(d), 0);
  const v = PHASE_VOLTAGE[breaker.phase];
  const totalAmps = v > 0 ? totalWatts / v : 0;
  const capacityWatts = breakerCapacityWatts(breaker);
  const loadPercent = capacityWatts > 0 ? (totalWatts / capacityWatts) * 100 : 0;

  return {
    breaker,
    consumers,
    totalWatts,
    totalAmps,
    capacityWatts,
    loadPercent,
    overload: loadPercent > 100,
    warning: loadPercent > 80 && loadPercent <= 100,
  };
}

export function formatWatts(w: number): string {
  if (w >= 1000) return `${(w / 1000).toFixed(2)} kW`;
  return `${w.toFixed(0)} W`;
}

export function formatAmps(a: number): string {
  return `${a.toFixed(1)} A`;
}
