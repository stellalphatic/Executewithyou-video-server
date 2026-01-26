/**
 * File Presentation Utility
 * Converts PDF and PPTX files to canvas-based video streams for LiveKit
 */

import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';

// Set up PDF.js worker - use unpkg CDN which has proper CORS headers
// Or fallback to no worker (uses main thread)
if (typeof window !== 'undefined') {
  // Use unpkg which has proper CORS headers
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

export interface SlideImage {
  dataUrl: string;
  width: number;
  height: number;
}

export interface PresentationResult {
  slides: SlideImage[];
  totalSlides: number;
  error?: string;
}

/**
 * Parse PDF file and extract pages as images
 */
export async function parsePDF(file: File): Promise<PresentationResult> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const slides: SlideImage[] = [];
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 }); // High quality
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D context not available');
      
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      await page.render({
        canvasContext: context,
        viewport: viewport,
      }).promise;
      
      slides.push({
        dataUrl: canvas.toDataURL('image/png'),
        width: viewport.width,
        height: viewport.height,
      });
    }
    
    return { slides, totalSlides: slides.length };
  } catch (error) {
    console.error('[FilePresentation] PDF parse error:', error);
    return { slides: [], totalSlides: 0, error: String(error) };
  }
}

/**
 * Parse PPTX file and extract slides as images
 * PPTX files are ZIP archives with slide images in ppt/media/
 */
export async function parsePPTX(file: File): Promise<PresentationResult> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const slides: SlideImage[] = [];
    
    // Find all slide relationships to get proper ordering
    const slideOrder: { slideNum: number; imageName: string }[] = [];
    
    // Parse slide relationships to find images
    const slidesFolder = zip.folder('ppt/slides');
    if (!slidesFolder) {
      throw new Error('Invalid PPTX: No slides folder found');
    }
    
    // Get all slide XML files
    const slideFiles: string[] = [];
    slidesFolder.forEach((path, file) => {
      if (path.match(/^slide\d+\.xml$/)) {
        slideFiles.push(path);
      }
    });
    
    // Sort slides by number
    slideFiles.sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] || '0');
      const numB = parseInt(b.match(/\d+/)?.[0] || '0');
      return numA - numB;
    });
    
    // For each slide, we need to render it
    // Since proper PPTX rendering is complex, we'll extract embedded images
    // or use a canvas-based approach
    
    // Get all media files (images)
    const mediaFolder = zip.folder('ppt/media');
    const mediaFiles: { name: string; data: ArrayBuffer }[] = [];
    
    if (mediaFolder) {
      const mediaPromises: Promise<void>[] = [];
      mediaFolder.forEach((path, file) => {
        if (file.dir) return;
        const promise = file.async('arraybuffer').then(data => {
          mediaFiles.push({ name: path, data });
        });
        mediaPromises.push(promise);
      });
      await Promise.all(mediaPromises);
    }
    
    // Sort media files
    mediaFiles.sort((a, b) => {
      const numA = parseInt(a.name.match(/\d+/)?.[0] || '0');
      const numB = parseInt(b.name.match(/\d+/)?.[0] || '0');
      return numA - numB;
    });
    
    // Convert each image to a slide
    for (const media of mediaFiles) {
      if (!media.name.match(/\.(png|jpg|jpeg|gif)$/i)) continue;
      
      const blob = new Blob([media.data]);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      
      // Load image to get dimensions
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = dataUrl;
      });
      
      slides.push({
        dataUrl,
        width: img.width,
        height: img.height,
      });
    }
    
    // If no media found, create placeholder slides based on slide count
    if (slides.length === 0 && slideFiles.length > 0) {
      console.log('[FilePresentation] No media found, rendering slides as text');
      for (let i = 0; i < slideFiles.length; i++) {
        const canvas = document.createElement('canvas');
        canvas.width = 1920;
        canvas.height = 1080;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#1a1a2e';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 64px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`Slide ${i + 1}`, canvas.width / 2, canvas.height / 2);
          ctx.font = '32px Arial';
          ctx.fillStyle = '#888888';
          ctx.fillText('(PPTX text rendering not supported)', canvas.width / 2, canvas.height / 2 + 80);
          
          slides.push({
            dataUrl: canvas.toDataURL('image/png'),
            width: 1920,
            height: 1080,
          });
        }
      }
    }
    
    return { slides, totalSlides: slides.length || slideFiles.length };
  } catch (error) {
    console.error('[FilePresentation] PPTX parse error:', error);
    return { slides: [], totalSlides: 0, error: String(error) };
  }
}

/**
 * Parse any supported file type
 */
export async function parsePresentation(file: File): Promise<PresentationResult> {
  const ext = file.name.toLowerCase().split('.').pop();
  
  if (ext === 'pdf') {
    return parsePDF(file);
  } else if (ext === 'pptx') {
    return parsePPTX(file);
  } else {
    return { slides: [], totalSlides: 0, error: `Unsupported file type: ${ext}` };
  }
}

/**
 * Create a MediaStream from canvas for presenting slides
 */
export class PresentationStream {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private slides: SlideImage[] = [];
  private currentSlide = 0;
  private stream: MediaStream | null = null;
  private animationFrame: number | null = null;
  
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1920;
    this.canvas.height = 1080;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    this.ctx = ctx;
  }
  
  async loadSlides(slides: SlideImage[]): Promise<void> {
    this.slides = slides;
    this.currentSlide = 0;
    await this.renderCurrentSlide();
  }
  
  private async renderCurrentSlide(): Promise<void> {
    if (this.slides.length === 0) return;
    
    const slide = this.slides[this.currentSlide];
    
    // Clear canvas with dark background
    this.ctx.fillStyle = '#0a0a0f';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Load and draw image centered with aspect ratio
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = slide.dataUrl;
    });
    
    // Calculate scale to fit canvas while maintaining aspect ratio
    const scale = Math.min(
      this.canvas.width / img.width,
      this.canvas.height / img.height
    );
    
    const drawWidth = img.width * scale;
    const drawHeight = img.height * scale;
    const x = (this.canvas.width - drawWidth) / 2;
    const y = (this.canvas.height - drawHeight) / 2;
    
    this.ctx.drawImage(img, x, y, drawWidth, drawHeight);
  }
  
  async nextSlide(): Promise<number> {
    if (this.currentSlide < this.slides.length - 1) {
      this.currentSlide++;
      await this.renderCurrentSlide();
    }
    return this.currentSlide + 1; // 1-indexed
  }
  
  async prevSlide(): Promise<number> {
    if (this.currentSlide > 0) {
      this.currentSlide--;
      await this.renderCurrentSlide();
    }
    return this.currentSlide + 1; // 1-indexed
  }
  
  async goToSlide(slideNum: number): Promise<number> {
    const index = Math.max(0, Math.min(slideNum - 1, this.slides.length - 1));
    this.currentSlide = index;
    await this.renderCurrentSlide();
    return this.currentSlide + 1;
  }
  
  getCurrentSlide(): number {
    return this.currentSlide + 1; // 1-indexed
  }
  
  getTotalSlides(): number {
    return this.slides.length;
  }
  
  getStream(): MediaStream {
    if (this.stream) return this.stream;
    
    // Create stream from canvas
    // @ts-ignore - captureStream is not in TS types but is supported
    this.stream = this.canvas.captureStream(30); // 30 FPS
    
    // Start render loop to keep stream active
    const render = () => {
      // Just trigger a re-paint to keep the stream active
      this.ctx.fillStyle = '#0a0a0f';
      this.ctx.fillRect(0, 0, 1, 1); // Minimal update
      this.animationFrame = requestAnimationFrame(render);
    };
    render();
    
    return this.stream;
  }
  
  stop(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.slides = [];
    this.currentSlide = 0;
  }
  
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }
}
