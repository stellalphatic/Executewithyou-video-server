'use client';


export interface SystemMetrics {
  fps: number;
  cpuLoad: number; // 0-1 (Estimated based on event loop lag)
  memoryUsage?: number; // MB
  networkRtt?: number; // ms
}

type MetricsCallback = (metrics: SystemMetrics) => void;

export class PerformanceMonitor {
  private isActive = false;
  private lastFrameTime = 0;
  private frameCount = 0;
  private lastCheckTime = 0;
  
  // CPU Estimation
  private lastLoopTime = 0;
  private eventLoopLag = 0;

  private listeners: Set<MetricsCallback> = new Set();

  constructor() {
    this.lastLoopTime = performance.now();
  }

  public start() {
    if (this.isActive) return;
    this.isActive = true;
    this.lastCheckTime = performance.now();
    this.loop();
    this.checkEventLoopLag();
  }

  public stop() {
    this.isActive = false;
  }

  public onMetrics(callback: MetricsCallback) {
    this.listeners.add(callback);
  }

  public offMetrics(callback: MetricsCallback) {
    this.listeners.delete(callback);
  }

  private checkEventLoopLag() {
    if (!this.isActive) return;
    
    const now = performance.now();
    const delta = now - this.lastLoopTime;
    // Expected delta is roughly 0 if using setTimeout(0), but practically small.
    // Large delta means main thread is blocked.
    this.eventLoopLag = Math.max(0, delta - 5); // Subtract nominal overhead
    this.lastLoopTime = now;

    setTimeout(() => this.checkEventLoopLag(), 100);
  }

  private loop = () => {
    if (!this.isActive) return;

    this.frameCount++;
    const now = performance.now();

    // Report every 1 second
    if (now - this.lastCheckTime >= 1000) {
      const fps = this.frameCount;
      
      // Heuristic: If event loop lags > 20ms consistently, CPU is high
      // Normalize lag to 0-1 scale (approx 100ms lag = 100% load concept)
      const cpuLoad = Math.min(1, this.eventLoopLag / 100);

      const metrics: SystemMetrics = {
        fps,
        cpuLoad,
        // @ts-ignore - Chrome only API
        memoryUsage: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : undefined,
        // @ts-ignore - Network Info API
        networkRtt: navigator.connection ? navigator.connection.rtt : undefined
      };

      this.listeners.forEach(cb => cb(metrics));

      // Reset
      this.frameCount = 0;
      this.lastCheckTime = now;
    }

    requestAnimationFrame(this.loop);
  };
}
