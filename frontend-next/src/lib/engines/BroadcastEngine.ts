'use client';


import { Scene, SceneItem } from '../../types/layout';

const VS_SOURCE = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
uniform vec2 u_resolution;
uniform vec4 u_rect; 
uniform vec4 u_crop; 
out vec2 v_texCoord;
void main() {
    vec2 pixelPos = vec2(u_rect.x + a_position.x * u_rect.z, u_rect.y + a_position.y * u_rect.w);
    vec2 zeroToOne = pixelPos / u_resolution;
    vec2 zeroToTwo = zeroToOne * 2.0;
    vec2 clipSpace = zeroToTwo - 1.0;
    gl_Position = vec4(clipSpace.x, -clipSpace.y, 0, 1);
    v_texCoord = vec2(u_crop.x + a_texCoord.x * u_crop.z, u_crop.y + a_texCoord.y * u_crop.w);
}`;

const FS_SOURCE = `#version 300 es
precision mediump float;
uniform sampler2D u_image;
in vec2 v_texCoord;
out vec4 outColor;
void main() {
    outColor = texture(u_image, v_texCoord);
}
`;

export class BroadcastEngine {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private overlayCanvas: HTMLCanvasElement;
  private overlayCtx: CanvasRenderingContext2D | null = null;
  private overlayTexture: WebGLTexture | null = null;
  private overlayDirty = true; 
  
  private shadowContainer: HTMLDivElement;

  private program: WebGLProgram | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private textures: Map<string, WebGLTexture> = new Map();
  
  private width = 1920;
  private height = 1080;
  private fps = 30;
  private worker: Worker | null = null;
  private activeScene: Scene | null = null;
  private videoSources: Map<string, HTMLVideoElement> = new Map();
  private clonedStreams: Map<string, MediaStream> = new Map(); // Store clones for cleanup
  private sourceStreamIds: Map<string, string> = new Map(); // Track original stream IDs

  constructor(width = 1920, height = 1080) {
    this.width = width;
    this.height = height;
    
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.width = this.width;
    this.overlayCanvas.height = this.height;
    this.overlayCtx = this.overlayCanvas.getContext('2d', { willReadFrequently: true });

    // FIX: Container must be visible and large enough to prevent browser deprioritization
    // zIndex is positive but opacity is practically zero to hide it visually while keeping it "rendered"
    this.shadowContainer = document.createElement('div');
    Object.assign(this.shadowContainer.style, {
        position: 'fixed',
        bottom: '0',
        right: '0',
        width: '32px', 
        height: '32px',
        overflow: 'hidden',
        opacity: '0.001', 
        pointerEvents: 'none',
        zIndex: '9999', // Keep it technically "on top" to avoid occlusion culling, though invisible
        visibility: 'visible' 
    });
    document.body.appendChild(this.shadowContainer);

    const blob = new Blob([`
      let interval;
      self.onmessage = function(e) {
        if (e.data === 'start') {
          interval = setInterval(() => postMessage('tick'), 1000 / 30);
        } else if (e.data === 'stop') {
          clearInterval(interval);
        }
      };
    `], { type: 'application/javascript' });
    this.worker = new Worker(URL.createObjectURL(blob));
    this.worker.onmessage = () => this.renderFrame();

    this.initWebGL();
  }

  private initWebGL() {
    // Removed desynchronized: true to ensure reliable frame capture
    const gl = this.canvas.getContext('webgl2', { 
        alpha: false, 
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true // CRITICAL for MediaRecorder
    });

    if (!gl) {
        console.error('[BroadcastEngine] WebGL2 not supported.');
        return;
    }
    this.gl = gl;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const createShader = (type: number, source: string) => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        return shader;
    };

    const vs = createShader(gl.VERTEX_SHADER, VS_SOURCE);
    const fs = createShader(gl.FRAGMENT_SHADER, FS_SOURCE);
    if (!vs || !fs) return;

    this.program = gl.createProgram();
    if (!this.program) return;
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    const positions = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);
    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    
    const posLoc = gl.getAttribLocation(this.program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const texCoords = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);
    this.texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

    const texLoc = gl.getAttribLocation(this.program, 'a_texCoord');
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

    this.overlayTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.overlayTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  public addSource(id: string, stream: MediaStream) {
    // Optimization: If ID exists and original stream ID matches, skip re-adding
    // This prevents thrashing when parent components re-render but stream is same
    if (this.videoSources.has(id) && this.sourceStreamIds.get(id) === stream.id) {
        return;
    }

    if (this.videoSources.has(id)) {
        this.removeSource(id);
    }
    
    this.sourceStreamIds.set(id, stream.id);

    const clonedStream = stream.clone();
    this.clonedStreams.set(id, clonedStream);

    const video = document.createElement('video');
    video.width = 1280;
    video.height = 720;
    video.style.position = 'absolute';
    video.style.opacity = '0'; 
    video.style.pointerEvents = 'none';
    
    // Assign to DOM immediately
    this.shadowContainer.appendChild(video);
    
    // Track it immediately so play callback knows it's valid
    this.videoSources.set(id, video);
    
    const playVideo = () => {
        // If this specific video element was removed or replaced, stop
        if (this.videoSources.get(id) !== video) return;

        video.play().catch(e => {
            // Ignore AbortError which happens if video is paused/removed quickly
            if (e.name === 'AbortError') return;
            
            console.warn(`[BroadcastEngine] Autoplay failed for ${id}, retrying...`, e);
            if (this.videoSources.get(id) === video) {
                setTimeout(playVideo, 1000);
            }
        });
    };
    
    video.srcObject = clonedStream;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    
    // Attempt to play
    playVideo();
    video.onloadedmetadata = playVideo;
    
    this.createTexture(id);
    this.overlayDirty = true;
  }

  private createTexture(id: string) {
      if (!this.gl) return;
      const tex = this.gl.createTexture();
      this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
      this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, 1, 1, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
      if (tex) this.textures.set(id, tex);
  }

  public removeSource(id: string) {
    const video = this.videoSources.get(id);
    if (video) {
        // Removing srcObject triggers 'abort' on fetching which is the error we saw
        // We do this to clean up memory
        video.pause();
        video.srcObject = null;
        video.load(); // Resets media element
        video.remove();
        this.videoSources.delete(id);
        this.sourceStreamIds.delete(id);
    }
    
    const clone = this.clonedStreams.get(id);
    if (clone) {
        clone.getTracks().forEach(t => t.stop());
        this.clonedStreams.delete(id);
    }

    const tex = this.textures.get(id);
    if (tex && this.gl) {
        this.gl.deleteTexture(tex);
        this.textures.delete(id);
    }
    this.overlayDirty = true;
  }

  public setScene(scene: Scene) {
    // Force update scene
    this.activeScene = scene;
    this.overlayDirty = true;
  }

  public startRendering() {
    this.worker?.postMessage('start');
  }

  public stopRendering() {
    this.worker?.postMessage('stop');
    this.videoSources.forEach((_, id) => this.removeSource(id));
    
    if (document.body.contains(this.shadowContainer)) {
        document.body.removeChild(this.shadowContainer);
    }
  }

  public getStream(): MediaStream {
    return this.canvas.captureStream(this.fps);
  }

  /**
   * Ensures all video elements have enough data to render a frame.
   * Crucial for MediaRecorder to avoid starting with black frames.
   */
  public async waitForReady(timeoutMs = 3000): Promise<void> {
      return new Promise<void>(resolve => {
          const start = performance.now();
          const check = () => {
              const videos = Array.from(this.videoSources.values());
              if (videos.length === 0) {
                  resolve(); 
                  return;
              }
              const allReady = videos.every(v => v.readyState >= 2 && v.videoWidth > 0);
              if (allReady) {
                  resolve();
                  return;
              }
              if (performance.now() - start > timeoutMs) {
                  console.warn('[BroadcastEngine] waitForReady timeout, proceeding anyway');
                  resolve();
                  return;
              }
              requestAnimationFrame(check);
          };
          check();
      });
  }

  public renderFrame() {
      if (!this.gl || !this.program) return;
      const gl = this.gl;

      gl.viewport(0, 0, this.width, this.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(this.program);
      gl.bindVertexArray(this.vao);

      const uRes = gl.getUniformLocation(this.program, 'u_resolution');
      const uRect = gl.getUniformLocation(this.program, 'u_rect');
      const uCrop = gl.getUniformLocation(this.program, 'u_crop');
      const uImage = gl.getUniformLocation(this.program, 'u_image');

      gl.uniform2f(uRes, this.width, this.height);
      gl.uniform1i(uImage, 0);

      // --- Overlay Redraw (CPU) ---
      if (this.overlayDirty && this.overlayCtx) {
          this.overlayCtx.clearRect(0, 0, this.width, this.height);
      }

      if (this.activeScene) {
          const items = [...this.activeScene.items].sort((a, b) => a.zIndex - b.zIndex);

          // --- 1. Video Layer (GPU) ---
          items.forEach(item => {
              const video = this.videoSources.get(item.sourceId);
              const texture = this.textures.get(item.sourceId);

              const x = (item.x / 100) * this.width;
              const y = (item.y / 100) * this.height;
              const w = (item.width / 100) * this.width;
              const h = (item.height / 100) * this.height;

              if (video && texture) {
                  gl.activeTexture(gl.TEXTURE0);
                  gl.bindTexture(gl.TEXTURE_2D, texture);

                  // FIX: Always upload texture if ready.
                  // Removing `currentTime` optimization which causes issues with live streams/canvas streams
                  if (video.readyState >= 2) {
                       gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
                  }

                  // Render Quad
                  gl.activeTexture(gl.TEXTURE0);
                  gl.bindTexture(gl.TEXTURE_2D, texture);
                  
                  let tx = 0, ty = 0, tw = 1, th = 1;
                  if (item.fit === 'cover' && video.videoWidth && video.videoHeight) {
                      const srcRatio = video.videoWidth / video.videoHeight;
                      const dstRatio = w / h;
                      const zoom = item.zoom || 1;
                      let visibleW = 1, visibleH = 1;
                      if (srcRatio > dstRatio) visibleW = dstRatio / srcRatio;
                      else visibleH = srcRatio / dstRatio;
                      visibleW /= zoom; visibleH /= zoom;
                      const panX = (item.panX ?? 50) / 100;
                      const panY = (item.panY ?? 50) / 100;
                      tx = Math.max(0, Math.min(1 - visibleW, panX - (visibleW / 2)));
                      ty = Math.max(0, Math.min(1 - visibleH, panY - (visibleH / 2)));
                      tw = visibleW; th = visibleH;
                  }

                  gl.uniform4f(uRect, x, y, w, h);
                  gl.uniform4f(uCrop, tx, ty, tw, th);
                  gl.drawArrays(gl.TRIANGLES, 0, 6);
              }

              // --- 2. Overlay Layer (CPU Draw) ---
              if (this.overlayDirty && this.overlayCtx) {
                  this.renderOverlayItem(this.overlayCtx, item, x, y, w, h);
              }
          });
          
          if (this.overlayDirty && this.overlayCtx && this.activeScene.overlays) {
              this.activeScene.overlays.forEach(overlay => {
                  // Additional overlays
              });
          }
      }

      // --- 3. Composite Overlay (GPU) ---
      if (this.overlayCtx && this.overlayTexture) {
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, this.overlayTexture);
          
          if (this.overlayDirty) {
              gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.overlayCanvas);
              this.overlayDirty = false;
          }
          
          gl.uniform4f(uRect, 0, 0, this.width, this.height);
          gl.uniform4f(uCrop, 0, 0, 1, 1);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
  }

  private renderOverlayItem(ctx: CanvasRenderingContext2D, item: SceneItem, x: number, y: number, w: number, h: number) {
      const label = item.sourceId === 'local' ? 'You' : item.sourceId; 
      ctx.fillStyle = '#4f46e5';
      const labelPadding = 8;
      ctx.font = 'bold 12px Inter, sans-serif';
      const textMetrics = ctx.measureText(label);
      const labelW = textMetrics.width + (labelPadding * 2);
      const labelH = 24;
      const lx = x + 12;
      const ly = y + h - 12 - labelH;

      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(lx, ly, labelW, labelH, 4);
      else ctx.rect(lx, ly, labelW, labelH);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, lx + labelPadding, ly + (labelH/2));

      if (item.border) {
          ctx.strokeStyle = item.border.color;
          ctx.lineWidth = item.border.width;
          const r = item.borderRadius || 0;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(x + 1, y + 1, w - 2, h - 2, r);
          else ctx.rect(x + 1, y + 1, w - 2, h - 2);
          ctx.stroke();
      }
  }
}
