// Picture-in-Picture mode for AssistMD
// Creates an always-on-top floating assistant

export class PiPAssistant {
  private pipWindow: Window | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private video: HTMLVideoElement | null = null;
  
  async initializePiP() {
    // Create a canvas to render our UI
    this.canvas = document.createElement('canvas');
    this.canvas.width = 400;
    this.canvas.height = 600;
    
    // Create video element from canvas stream
    this.video = document.createElement('video');
    const stream = this.canvas.captureStream(30); // 30 FPS
    this.video.srcObject = stream;
    this.video.muted = true;
    
    // Wait for video to be ready
    await new Promise(resolve => {
      this.video!.onloadedmetadata = resolve;
      this.video!.play();
    });
  }
  
  async openPiP() {
    if (!this.video) await this.initializePiP();
    
    try {
      // Request PiP - this creates always-on-top window!
      const pipWindow = await this.video!.requestPictureInPicture();
      this.pipWindow = pipWindow as any;

      // Set PiP window size
      if ('width' in pipWindow) {
        (pipWindow as any).width = 350;
        (pipWindow as any).height = 500;
      }

      // Start rendering our UI to the PiP window
      this.startRendering();

      // Handle PiP window close
      pipWindow.addEventListener('resize', () => {
        console.log('PiP resized');
      });

      return true;
    } catch (error) {
      console.error('PiP failed:', error);
      return false;
    }
  }
  
  private startRendering() {
    const ctx = this.canvas?.getContext('2d');
    if (!ctx) return;
    
    const render = () => {
      // Clear canvas
      if (!this.canvas) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      
      // Draw UI elements
      ctx.fillStyle = '#000000';
      ctx.font = '16px Arial';
      ctx.fillText('AssistMD Voice Assistant', 20, 40);
      
      // Draw status indicator
      const listening = document.querySelector('[data-listening="true"]');
      ctx.fillStyle = listening ? '#10b981' : '#6b7280';
      ctx.beginPath();
      ctx.arc(350, 40, 10, 0, 2 * Math.PI);
      ctx.fill();
      
      // Draw transcript
      const transcript = this.getLatestTranscript();
      ctx.fillStyle = '#374151';
      ctx.font = '14px Arial';
      this.wrapText(ctx, transcript, 20, 80, 360, 20);
      
      if (this.pipWindow) {
        requestAnimationFrame(render);
      }
    };
    
    render();
  }
  
  private getLatestTranscript(): string {
    // Get last few transcript lines from your store
    const items = (window as any).transcript?.get() || [];
    return items.slice(-5).map((item: any) => item.text).join(' ');
  }
  
  private wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
    const words = text.split(' ');
    let line = '';
    
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      
      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line, x, y);
        line = words[n] + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, y);
  }
  
  closePiP() {
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture();
    }
    this.pipWindow = null;
  }
}

// Usage:
// const pip = new PiPAssistant();
// await pip.openPiP();  // Opens always-on-top window!