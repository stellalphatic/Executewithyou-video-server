'use client';


const VS_SOURCE = `attribute vec2 a_position;attribute vec2 a_texCoord;varying vec2 v_texCoord;void main(){gl_Position=vec4(a_position,0,1);v_texCoord=vec2(a_texCoord.x,1.0-a_texCoord.y);}`;
const FS_SOURCE = `precision mediump float;varying vec2 v_texCoord;uniform sampler2D u_frame;uniform sampler2D u_mask;uniform sampler2D u_bg;uniform int u_effect;uniform int u_useGreenScreen;uniform vec2 u_resolution;uniform float u_blurStrength;uniform float u_keyThreshold;uniform float u_keySmoothness;uniform vec3 u_keyColor;uniform float u_brightness;uniform float u_contrast;uniform float u_saturation;vec3 adjustColor(vec3 color,float b,float c,float s){color+=b;color=(color-0.5)*c+0.5;vec3 gray=vec3(dot(color,vec3(0.299,0.587,0.114)));return mix(gray,color,s);}vec4 blur(sampler2D image,vec2 uv,vec2 res,float strength){vec4 color=vec4(0.0);float total=0.0;float stride=max(1.0,strength);for(float x=-2.0;x<=2.0;x++){for(float y=-2.0;y<=2.0;y++){vec2 offset=vec2(x,y)*stride/res;color+=texture2D(image,uv+offset);total+=1.0;}}return color/total;}void main(){vec4 texColor=texture2D(u_frame,v_texCoord);vec3 color=texColor.rgb;color=adjustColor(color,u_brightness,u_contrast,u_saturation);float alpha=1.0;if(u_effect>0){if(u_useGreenScreen==1){float diff=length(color-u_keyColor);alpha=smoothstep(u_keyThreshold,u_keyThreshold+u_keySmoothness,diff);if(diff<u_keyThreshold+u_keySmoothness*2.0){color=mix(vec3(dot(color,vec3(0.299,0.587,0.114))),color,0.5);}}else{float maskVal=texture2D(u_mask,v_texCoord).r;alpha=smoothstep(0.1,0.6,maskVal);}}if(u_effect==0){gl_FragColor=vec4(color,1.0);}else if(u_effect==1){vec4 blurred=blur(u_frame,v_texCoord,u_resolution,u_blurStrength);vec3 bg=adjustColor(blurred.rgb,u_brightness,u_contrast,u_saturation);gl_FragColor=vec4(mix(bg,color,alpha),1.0);}else if(u_effect==2){vec4 bgTex=texture2D(u_bg,v_texCoord);gl_FragColor=vec4(mix(bgTex.rgb,color,alpha),1.0);}}`;

export class VideoProcessor {
    private segmenter: any;
    private canvas: HTMLCanvasElement;
    private gl: WebGL2RenderingContext | null = null;
    private ctx2d: CanvasRenderingContext2D | null = null;
    private program: WebGLProgram | null = null;
    private frameTexture: WebGLTexture | null = null;
    private maskTexture: WebGLTexture | null = null;
    private bgTexture: WebGLTexture | null = null;
    private positionBuffer: WebGLBuffer | null = null;
    private texCoordBuffer: WebGLBuffer | null = null;
    private activeEffect: 'none' | 'blur' | 'image' = 'none';
    private useGreenScreen: boolean = false;
    private blurStrength: number = 2.0;
    private brightness: number = 0.0;
    private contrast: number = 1.0;
    private saturation: number = 1.0;
    private keyThreshold: number = 0.4;
    private keySmoothness: number = 0.1;
    private keyColor: number[] = [0.0, 1.0, 0.0];
    private backgroundImage: HTMLImageElement | null = null;
    private sourceVideo: HTMLVideoElement | null = null;
    private shadowContainer: HTMLDivElement | null = null;
    private processingStream: MediaStream | null = null;
    private activeStreamId: string | null = null; 
    private isSegmenterReady: boolean = false;
    private isWebGLSupported: boolean = false;
    private frameCount: number = 0;
    private segmentationSkipRatio: number = 2;
    private worker: Worker | null = null;
    private isDestroyed: boolean = false;

    constructor() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = 1280;
        this.canvas.height = 720;
    }
    
    async init() {
         if (this.isDestroyed) return;
         
         const gl = this.canvas.getContext('webgl2', { alpha: false, desynchronized: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
         if (gl) { this.gl = gl; this.isWebGLSupported = true; this.initShaders(); this.initBuffers(); this.initTextures(); } 
         else { 
             this.ctx2d = this.canvas.getContext('2d'); 
             this.isWebGLSupported = false; 
         }
         
         // Setup Hidden Container for Source Video
         this.shadowContainer = document.createElement('div');
         Object.assign(this.shadowContainer.style, {
             position: 'fixed',
             bottom: '0',
             right: '0',
             width: '1px',
             height: '1px',
             overflow: 'hidden',
             opacity: '0.001',
             pointerEvents: 'none',
             zIndex: '-9999',
             visibility: 'visible'
         });
         document.body.appendChild(this.shadowContainer);

         if (!window.SelfieSegmentation) return;
         try { 
             this.segmenter = new window.SelfieSegmentation({ locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}` }); 
             this.segmenter.setOptions({ modelSelection: 1, selfieMode: false }); 
             await this.segmenter.initialize(); 
             this.isSegmenterReady = true; 
         } catch (e) { 
             console.error("[VideoProcessor] AI Model Failed:", e); 
         }

         const blob = new Blob([`
            let interval;
            self.onmessage = function(e) {
                if(e.data==='start'){
                    interval = setInterval(()=>postMessage('tick'), 1000/60);
                } else {
                    clearInterval(interval);
                }
            }
         `], {type: 'application/javascript'});
         this.worker = new Worker(URL.createObjectURL(blob));
         this.worker.onmessage = () => this.processFrame();
    }

    private initShaders() { if(!this.gl) return; const gl=this.gl; const createShader=(t:number,s:string)=>{const sh=gl.createShader(t);if(!sh)return null;gl.shaderSource(sh,s);gl.compileShader(sh);return sh;}; const vs=createShader(gl.VERTEX_SHADER,VS_SOURCE); const fs=createShader(gl.FRAGMENT_SHADER,FS_SOURCE); if(!vs||!fs)return; const p=gl.createProgram(); if(!p)return; gl.attachShader(p,vs); gl.attachShader(p,fs); gl.linkProgram(p); this.program=p; gl.useProgram(p); }
    private initBuffers() { if(!this.gl) return; const gl=this.gl; const p=new Float32Array([-1,-1,1,-1,-1,1,1,1]); this.positionBuffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,this.positionBuffer); gl.bufferData(gl.ARRAY_BUFFER,p,gl.STATIC_DRAW); const t=new Float32Array([0,0,1,0,0,1,1,1]); this.texCoordBuffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,this.texCoordBuffer); gl.bufferData(gl.ARRAY_BUFFER,t,gl.STATIC_DRAW); }
    private initTextures() { if(!this.gl) return; const gl=this.gl; const ct=()=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);return t;}; this.frameTexture=ct(); this.maskTexture=ct(); this.bgTexture=ct(); }
    
    setVisualConfig(c: any) { 
        this.activeEffect=c.backgroundType; 
        this.useGreenScreen=c.greenScreen; 
        this.blurStrength=c.blurAmount/10.0; 
        this.saturation=c.saturation; 
        this.contrast=c.contrast; 
        this.brightness=c.brightness; 
        if(c.backgroundType==='image'&&c.backgroundImage){
            const i=new Image();
            i.crossOrigin="Anonymous";
            i.src=c.backgroundImage;
            i.onload=()=>{this.backgroundImage=i;if(this.isWebGLSupported)this.uploadBgTexture();};
        }else{
            this.backgroundImage=null;
        } 
    }
    
    private uploadBgTexture() { if(!this.gl||!this.bgTexture||!this.backgroundImage)return; const gl=this.gl; gl.bindTexture(gl.TEXTURE_2D,this.bgTexture); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.backgroundImage); }
    
    async start(is: MediaStream): Promise<MediaStream> { 
        if (this.isDestroyed) return is;
        if (this.activeStreamId === is.id && this.processingStream) {
            return this.processingStream;
        }

        this.stopProcessing(); 
        this.activeStreamId = is.id;

        const vt = is.getVideoTracks()[0]; 
        if (!vt) return is; 
        
        const settings = vt.getSettings();
        if (settings.width) this.canvas.width = settings.width;
        if (settings.height) this.canvas.height = settings.height;
        else { this.canvas.width = 1280; this.canvas.height = 720; }

        if (this.gl) this.gl.viewport(0, 0, this.canvas.width, this.canvas.height); 
        
        if (!this.sourceVideo) {
            this.sourceVideo = document.createElement('video'); 
            // FIX: Explicit dimensions & DOM attachment
            this.sourceVideo.width = 1280;
            this.sourceVideo.height = 720;
            this.sourceVideo.autoplay = true; 
            this.sourceVideo.muted = true; 
            this.sourceVideo.playsInline = true;
            this.sourceVideo.style.position = 'absolute';
            this.sourceVideo.style.opacity = '0';
            
            if (this.shadowContainer) this.shadowContainer.appendChild(this.sourceVideo);
        }
        
        this.sourceVideo.srcObject = is; 
        this.sourceVideo.play().catch(e => {});
        
        const os = this.canvas.captureStream(60); 
        this.processingStream = os; 
        
        if (this.worker) this.worker.postMessage('start');
        
        if(this.segmenter && this.isSegmenterReady) {
            this.segmenter.onResults((r:any) => {
                if(this.gl && this.sourceVideo && !this.isDestroyed) {
                    this.drawWebGL(this.sourceVideo, r.segmentationMask);
                }
            });
        } 
        return os; 
    }

    private async processFrame() {
        if(!this.sourceVideo || this.isDestroyed) return; 
        
        if(this.sourceVideo.readyState >= 2) {
            if (this.sourceVideo.videoWidth > 0 && this.sourceVideo.videoHeight > 0) {
                if(this.gl) {
                    const nAI = this.activeEffect !== 'none' && !this.useGreenScreen && this.isSegmenterReady;
                    if(nAI) {
                        this.frameCount++;
                        if(this.frameCount % this.segmentationSkipRatio === 0) {
                            try { await this.segmenter.send({image:this.sourceVideo}); } catch(e) {}
                        }
                        this.drawWebGL(this.sourceVideo, null); 
                    } else {
                        this.drawWebGL(this.sourceVideo, null);
                    }
                } else if(this.ctx2d) {
                    this.ctx2d.drawImage(this.sourceVideo, 0, 0, this.canvas.width, this.canvas.height);
                }
            }
        } 
    }

    private drawWebGL(s:any,m:any){ if(!this.gl||!this.program)return; const gl=this.gl; gl.useProgram(this.program); gl.uniform1i(gl.getUniformLocation(this.program,'u_frame'),0); gl.uniform1i(gl.getUniformLocation(this.program,'u_mask'),1); gl.uniform1i(gl.getUniformLocation(this.program,'u_bg'),2); gl.uniform1i(gl.getUniformLocation(this.program,'u_effect'),this.activeEffect==='blur'?1:this.activeEffect==='image'?2:0); gl.uniform1f(gl.getUniformLocation(this.program,'u_saturation'), this.saturation); gl.uniform1f(gl.getUniformLocation(this.program,'u_contrast'), this.contrast); gl.uniform1f(gl.getUniformLocation(this.program,'u_brightness'), this.brightness); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,this.frameTexture); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,s); if(m){gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.maskTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,m);} gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,this.bgTexture); gl.enableVertexAttribArray(gl.getAttribLocation(this.program,"a_position"));gl.bindBuffer(gl.ARRAY_BUFFER,this.positionBuffer);gl.vertexAttribPointer(gl.getAttribLocation(this.program,"a_position"),2,gl.FLOAT,false,0,0); gl.enableVertexAttribArray(gl.getAttribLocation(this.program,"a_texCoord"));gl.bindBuffer(gl.ARRAY_BUFFER,this.texCoordBuffer);gl.vertexAttribPointer(gl.getAttribLocation(this.program,"a_texCoord"),2,gl.FLOAT,false,0,0); gl.drawArrays(gl.TRIANGLE_STRIP,0,4); }
    
    stopProcessing() { 
        this.activeStreamId = null;
        if(this.worker) this.worker.postMessage('stop');
        if(this.sourceVideo){
            this.sourceVideo.pause();
            this.sourceVideo.srcObject = null;
            this.sourceVideo.removeAttribute('src'); 
            this.sourceVideo.load();
        } 
    }

    stop() {
        this.stopProcessing();
        this.isDestroyed = true;
        if(this.worker) this.worker.terminate();
        
        if (this.shadowContainer && document.body.contains(this.shadowContainer)) {
            document.body.removeChild(this.shadowContainer);
        }

        if (this.gl) {
            const gl = this.gl;
            if (this.program) gl.deleteProgram(this.program);
            if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
            if (this.texCoordBuffer) gl.deleteBuffer(this.texCoordBuffer);
            if (this.frameTexture) gl.deleteTexture(this.frameTexture);
            if (this.maskTexture) gl.deleteTexture(this.maskTexture);
            if (this.bgTexture) gl.deleteTexture(this.bgTexture);
            const ext = gl.getExtension('WEBGL_lose_context');
            if (ext) ext.loseContext();
            this.gl = null;
        }
        
        if (this.segmenter) {
            try { this.segmenter.close(); } catch(e){}
            this.segmenter = null;
        }
    }
}
