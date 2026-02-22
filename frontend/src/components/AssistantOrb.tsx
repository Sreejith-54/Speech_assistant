import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';

interface AssistantOrbProps {
  state: 'idle' | 'greeting' | 'listening' | 'processing' | 'speaking' | 'vision_file' | 'vision_processing' | 'vision_asr';
}

const AssistantOrb: React.FC<AssistantOrbProps> = ({ state }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsCanvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 208, height: 208 });
  
  // Adjust size based on screen size
  useEffect(() => {
    const updateSize = () => {
      const isMobile = window.innerWidth < 768;
      setDimensions({
        width: isMobile ? 156 : 208,
        height: isMobile ? 156 : 208
      });
    };
    
    updateSize();
    window.addEventListener('resize', updateSize);
    
    return () => {
      window.removeEventListener('resize', updateSize);
    };
  }, []);
  
  // Create stars with memoization
  const stars = useMemo(() => {
    const starCount = 75;
    return Array.from({ length: starCount }, () => ({
      x: Math.random() * 400 - 100, // Wider distribution
      y: Math.random() * 400 - 100, // Wider distribution
      size: Math.random() * 0.8 + 0.2, // Smaller size range
      twinkleSpeed: Math.random() * 2 + 1,
      moveSpeed: Math.random() * 0.2 + 0.1
    }));
  }, []);

  // Star animation function
  const drawStars = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number, time: number) => {
    ctx.clearRect(0, 0, width, height);
    
    stars.forEach((star: any) => {
      // Update position
      star.x += star.moveSpeed;
      if (star.x > width + 100) star.x = -100;
      
      // Calculate twinkle
      const twinkle = Math.sin(time * star.twinkleSpeed) * 0.5 + 0.5;
      let alpha = twinkle * 0.4; // Base alpha
      
      // Enhance stars based on state
      if (state === 'listening') {
        alpha *= 1.5; // Brighter during listening
      } else if (state === 'greeting') {
        alpha *= 1.4; // Almost as bright as listening during greeting
      } else if (state === 'speaking') {
        alpha *= 1 + (0.5 * Math.sin(time * 5)); // Pulsing during speaking
      }
      
      // Draw star with subtle glow
      ctx.beginPath();
      const gradient = ctx.createRadialGradient(
        star.x, star.y, 0,
        star.x, star.y, star.size * 2
      );
      gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = gradient;
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [stars, state]);

  // Aurora effect animation
  const drawAurora = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number, time: number) => {
    // Clear canvas completely each frame for clean animation
    ctx.clearRect(0, 0, width, height);
    
    // Create base gradient for the ethereal background
    let baseGradient;
    
    // Change gradient colors based on state
    if (state === 'vision_file') {
      // Light blue/cyan for vision file
      baseGradient = ctx.createLinearGradient(0, 0, width, height);
      baseGradient.addColorStop(0, 'rgba(125, 211, 252, 0.15)'); // sky-300
      baseGradient.addColorStop(0.5, 'rgba(186, 230, 253, 0.1)'); // sky-200
      baseGradient.addColorStop(1, 'rgba(224, 242, 254, 0.12)'); // sky-100
    } else if (state === 'vision_asr') {
      // Bright green for vision ASR (matching listening)
      baseGradient = ctx.createLinearGradient(0, 0, width, height);
      baseGradient.addColorStop(0, 'rgba(72, 255, 167, 0.15)');
      baseGradient.addColorStop(0.5, 'rgba(135, 206, 235, 0.1)');
      baseGradient.addColorStop(1, 'rgba(186, 85, 255, 0.08)');
    } else if (state === 'vision_processing') {
      // Teal for vision processing
      baseGradient = ctx.createLinearGradient(0, 0, width, height);
      baseGradient.addColorStop(0, 'rgba(183, 245, 235, 0.15)');
      baseGradient.addColorStop(0.5, 'rgba(153, 235, 225, 0.12)');
      baseGradient.addColorStop(1, 'rgba(45, 212, 191, 0.15)');
    } else if (state === 'listening') {
      // Bright green for listening
      baseGradient = ctx.createLinearGradient(0, 0, width, height);
      baseGradient.addColorStop(0, 'rgba(72, 255, 167, 0.15)');
      baseGradient.addColorStop(0.5, 'rgba(135, 206, 235, 0.1)');
      baseGradient.addColorStop(1, 'rgba(186, 85, 255, 0.08)');
    } else if (state === 'greeting') {
      // Blue for greeting
      baseGradient = ctx.createLinearGradient(0, 0, width, height);
      baseGradient.addColorStop(0, 'rgba(59, 130, 246, 0.15)'); // Blue
      baseGradient.addColorStop(0.5, 'rgba(96, 165, 250, 0.1)'); // Lighter blue
      baseGradient.addColorStop(1, 'rgba(59, 130, 246, 0.08)'); // Blue again
    } else if (state === 'processing') {
      // Purple/blue for processing
      baseGradient = ctx.createLinearGradient(0, 0, width, height);
      baseGradient.addColorStop(0, 'rgba(72, 209, 255, 0.1)');
      baseGradient.addColorStop(0.5, 'rgba(135, 150, 235, 0.1)');
      baseGradient.addColorStop(1, 'rgba(186, 85, 255, 0.15)');
    } else if (state === 'speaking') {
      // Gold/amber for speaking
      baseGradient = ctx.createLinearGradient(0, 0, width, height);
      baseGradient.addColorStop(0, 'rgba(255, 223, 72, 0.1)');
      baseGradient.addColorStop(0.5, 'rgba(255, 167, 72, 0.08)');
      baseGradient.addColorStop(1, 'rgba(255, 109, 72, 0.12)');
    } else {
      // Default/idle state - subtle green
      baseGradient = ctx.createLinearGradient(0, 0, width, height);
      baseGradient.addColorStop(0, 'rgba(72, 255, 167, 0.1)');
      baseGradient.addColorStop(0.5, 'rgba(135, 206, 235, 0.1)');
      baseGradient.addColorStop(1, 'rgba(186, 85, 255, 0.1)');
    }
    
    // Fill with gradient
    ctx.fillStyle = 'rgba(72, 255, 167, 0.06)';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = baseGradient;
    ctx.fillRect(0, 0, width, height);

    // Create flowing aurora effect
    const numWaves = 3;
    for (let wave = 0; wave < numWaves; wave++) {
      const waveOffset = wave * (Math.PI / numWaves);
      
      ctx.beginPath();
      
      // Start from the left edge
      ctx.moveTo(-width * 0.1, height / 2);
      
      // Create smooth wave path
      for (let x = -width * 0.1; x <= width * 1.1; x += 1) {
        const progress = (x + width * 0.1) / (width * 1.2);
        const amplitude = height * 0.15; // Reduced amplitude to prevent overflow
        
        // Wave speed modifier based on state
        let speedMod = 1.0;
        if (state === 'listening') speedMod = 1.5;
        if (state === 'greeting') speedMod = 1.8;  // Slightly faster than listening
        if (state === 'processing') speedMod = 2.5;
        if (state === 'speaking') speedMod = 2.0;
        
        // Complex wave function for organic movement
        const y = height / 2 + 
          Math.sin(progress * 4 + time * speedMod + waveOffset) * amplitude * 0.5 +
          Math.sin(progress * 7 + time * 0.5 * speedMod) * amplitude * 0.3 +
          Math.sin(progress * 2 - time * 0.7 * speedMod) * amplitude * 0.2;
        
        ctx.lineTo(x, y);
      }
      
      // Complete the path
      ctx.lineTo(width, height * 1.1); // Extend slightly beyond bottom
      ctx.lineTo(0, height * 1.1); // Extend slightly beyond bottom
      ctx.closePath();
      
      // Create gradient for each wave
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      const alpha = 0.18 - wave * 0.04; // Slightly increased contrast between waves
      
      // Color based on state
      let baseHue;
      if (state === 'vision_file') {
        baseHue = wave === 0 ? 195 : wave === 1 ? 200 : 205; // Light blue/cyan range
      } else if (state === 'vision_asr') {
        baseHue = wave === 0 ? 145 : wave === 1 ? 160 : 175; // Green range (matching listening)
      } else if (state === 'vision_processing') {
        baseHue = wave === 0 ? 175 : wave === 1 ? 165 : 180; // Teal range
      } else if (state === 'listening') {
        baseHue = wave === 0 ? 145 : wave === 1 ? 160 : 175; // Green range
      } else if (state === 'greeting') {
        baseHue = wave === 0 ? 210 : wave === 1 ? 220 : 200; // Blue range
      } else if (state === 'processing') {
        baseHue = wave === 0 ? 260 : wave === 1 ? 240 : 220; // Purple/Blue range
      } else if (state === 'speaking') {
        baseHue = wave === 0 ? 30 : wave === 1 ? 45 : 60; // Gold/Amber range
      } else {
        baseHue = wave === 0 ? 145 : wave === 1 ? 190 : 290; // Default range
      }
      
      // Ethereal color transitions
      const hueShift = Math.sin(time * 0.5 + wave) * 15;
      gradient.addColorStop(0, `hsla(${baseHue + hueShift}, 85%, 75%, 0)`); // Start transparent
      gradient.addColorStop(0.4, `hsla(${baseHue + hueShift}, 90%, 85%, ${alpha * 1.6})`); // Intense peak
      gradient.addColorStop(0.8, `hsla(${baseHue + hueShift}, 85%, 75%, ${alpha})`); // Maintain intensity
      gradient.addColorStop(1, `hsla(${baseHue + hueShift}, 85%, 75%, 0)`); // End transparent
      
      ctx.fillStyle = gradient;
      
      // Apply gaussian blur for soft edges
      ctx.filter = 'blur(15px)';
      ctx.fill();
      ctx.filter = 'none';
      
      // Add subtle highlight
      ctx.strokeStyle = `hsla(${baseHue + hueShift}, 95%, 85%, ${alpha * 0.7})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    
    // Add subtle noise texture
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const noiseIntensity = 3; // Reduced noise intensity for cleaner look
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * noiseIntensity;
      data[i] += noise;
      data[i + 1] += noise;
      data[i + 2] += noise;
    }
    ctx.putImageData(imageData, 0, 0);
    
    // Add final glow layer based on state
    ctx.beginPath();
    const glow = ctx.createRadialGradient(
      width / 2, height / 2, 0,
      width / 2, height / 2, width * 0.7
    );
    
    // Color based on state
    if (state === 'vision_file') {
      // Light blue/cyan glow for vision file
      const pulseIntensity = 0.25 + Math.sin(time * 2) * 0.05;
      glow.addColorStop(0, `rgba(125, 211, 252, ${pulseIntensity})`); // sky-300
      glow.addColorStop(0.5, `rgba(186, 230, 253, ${pulseIntensity * 0.4})`); // sky-200
      glow.addColorStop(1, 'rgba(224, 242, 254, 0)'); // sky-100
    } else if (state === 'vision_processing') {
      // Rotating teal glow for vision processing
      const rotationX = Math.cos(time * 2) * width * 0.2;
      const rotationY = Math.sin(time * 2) * height * 0.2;
      ctx.ellipse(
        width/2 + rotationX, height/2 + rotationY, 
        width * 0.3, height * 0.3, 
        time, 0, Math.PI * 2
      );
      ctx.filter = 'blur(30px)';
      ctx.fillStyle = 'rgba(45, 212, 191, 0.1)';
      ctx.fill();
      ctx.filter = 'none';
      
      glow.addColorStop(0, 'rgba(45, 212, 191, 0.15)');
      glow.addColorStop(0.5, 'rgba(45, 212, 191, 0.05)');
      glow.addColorStop(1, 'rgba(45, 212, 191, 0)');
    } else if (state === 'vision_asr') {
      // Emerald pulsing glow for vision ASR (matching listening state)
      const pulseIntensity = 0.25 + Math.sin(time * 2.5) * 0.07;
      glow.addColorStop(0, `rgba(72, 255, 167, ${pulseIntensity})`); 
      glow.addColorStop(0.5, `rgba(72, 255, 167, ${pulseIntensity * 0.4})`);
      glow.addColorStop(1, 'rgba(72, 255, 167, 0)');
    } else if (state === 'listening') {
      // Pulsing green glow for listening
      const pulseIntensity = 0.2 + Math.sin(time * 3) * 0.1;
      glow.addColorStop(0, `rgba(72, 255, 167, ${pulseIntensity})`); 
      glow.addColorStop(0.5, `rgba(72, 255, 167, ${pulseIntensity * 0.4})`);
      glow.addColorStop(1, 'rgba(72, 255, 167, 0)');
    } else if (state === 'greeting') {
      // Pulsing blue glow for greeting
      const pulseIntensity = 0.2 + Math.sin(time * 2.5) * 0.1;
      glow.addColorStop(0, `rgba(59, 130, 246, ${pulseIntensity})`); 
      glow.addColorStop(0.5, `rgba(59, 130, 246, ${pulseIntensity * 0.4})`);
      glow.addColorStop(1, 'rgba(59, 130, 246, 0)');
    } else if (state === 'processing') {
      // Rotating purple glow for processing
      const rotationX = Math.cos(time * 2) * width * 0.2;
      const rotationY = Math.sin(time * 2) * height * 0.2;
      ctx.ellipse(
        width/2 + rotationX, height/2 + rotationY, 
        width * 0.3, height * 0.3, 
        time, 0, Math.PI * 2
      );
      ctx.filter = 'blur(30px)';
      ctx.fillStyle = 'rgba(186, 85, 255, 0.1)';
      ctx.fill();
      ctx.filter = 'none';
      
      glow.addColorStop(0, 'rgba(186, 85, 255, 0.15)');
      glow.addColorStop(0.5, 'rgba(186, 85, 255, 0.05)');
      glow.addColorStop(1, 'rgba(186, 85, 255, 0)');
    } else if (state === 'speaking') {
      // Rippling amber glow for speaking
      const ripple = Math.sin(time * 5) * 0.1;
      glow.addColorStop(0, `rgba(255, 167, 72, 0.2)`);
      glow.addColorStop(0.4 + ripple, `rgba(255, 167, 72, 0.1)`);
      glow.addColorStop(0.7 + ripple, `rgba(255, 167, 72, 0.05)`);
      glow.addColorStop(1, 'rgba(255, 167, 72, 0)');
    } else {
      // Subtle glow for idle
      glow.addColorStop(0, 'rgba(72, 255, 167, 0.2)');
      glow.addColorStop(0.5, 'rgba(72, 255, 167, 0.08)');
      glow.addColorStop(1, 'rgba(72, 255, 167, 0)');
    }
    
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }, [state]);

  // Set up canvas for aurora effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrame: number;
    let startTime = Date.now();

    const animate = () => {
      const time = (Date.now() - startTime) * 0.001;
      drawAurora(ctx, canvas.width, canvas.height, time);
      animationFrame = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [drawAurora]);

  // Set up canvas for stars
  useEffect(() => {
    const canvas = starsCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrame: number;
    let startTime = Date.now();

    const animate = () => {
      const time = (Date.now() - startTime) * 0.001;
      drawStars(ctx, canvas.width, canvas.height, time);
      animationFrame = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [drawStars]);

  return (
    <div 
      className={`
        relative transition-all duration-500 z-50
        ${state === 'listening' ? 'scale-110' : ''}
        ${state === 'greeting' ? 'scale-105' : ''}
        ${state === 'processing' ? 'scale-105' : ''}
        ${state === 'speaking' ? 'scale-110 pulse-slow' : ''}
        ${state === 'vision_file' ? 'scale-110' : ''}
        ${state === 'vision_processing' ? 'scale-105' : ''}
        ${state === 'vision_asr' ? 'scale-110' : ''}
      `}
      style={{
        width: `${dimensions.width}px`,
        height: `${dimensions.height}px`
      }}
    >
      {/* Soft gaussian ambient glow */}
      <div className="absolute -inset-32 rounded-full">
        <div className={`
          absolute inset-0 blur-2xl transform scale-90
          ${state === 'vision_file' ? 'bg-gradient-radial from-sky-300/[0.04] via-sky-200/[0.01] to-transparent' : ''}
          ${state === 'vision_processing' ? 'bg-gradient-radial from-teal-300/[0.04] via-teal-300/[0.01] to-transparent' : ''}
          ${state === 'vision_asr' ? 'bg-gradient-radial from-emerald-500/[0.04] via-emerald-500/[0.01] to-transparent' : ''}
          ${state === 'listening' ? 'bg-gradient-radial from-emerald-500/[0.04] via-emerald-500/[0.01] to-transparent' : ''}
          ${state === 'greeting' ? 'bg-gradient-radial from-blue-500/[0.04] via-blue-500/[0.01] to-transparent' : ''}
          ${state === 'processing' ? 'bg-gradient-radial from-purple-500/[0.04] via-purple-500/[0.01] to-transparent' : ''}
          ${state === 'speaking' ? 'bg-gradient-radial from-amber-500/[0.04] via-amber-500/[0.01] to-transparent' : ''}
          ${state === 'idle' ? 'bg-gradient-radial from-emerald-500/[0.02] via-emerald-500/[0.005] to-transparent' : ''}
        `} />
      </div>
      
      <div className="absolute -inset-16">
        <canvas
          ref={starsCanvasRef}
          width={400}
          height={400}
          className="absolute inset-0 w-full h-full scale-150"
        />
      </div>
      
      {/* Aurora effect */}
      <div className={`
        absolute inset-0 rounded-full shadow-[0_0_60px_-8px_rgba(72,255,167,0.4)]
        backdrop-blur-md overflow-hidden border
        ring-1
        ${state === 'vision_file' ? 'bg-gradient-to-b from-sky-300/50 via-sky-200/45 to-sky-100/50 border-sky-300/40 ring-sky-200/30' : ''}
        ${state === 'vision_processing' ? 'bg-gradient-to-b from-teal-300/45 via-teal-200/40 to-teal-300/45 border-teal-400/30 ring-teal-400/20' : ''}
        ${state === 'vision_asr' ? 'bg-gradient-to-b from-emerald-300/50 via-emerald-200/45 to-emerald-300/50 border-emerald-400/40 ring-emerald-400/30' : ''}
        ${state === 'listening' ? 'bg-gradient-to-b from-emerald-300/50 via-emerald-200/45 to-emerald-300/50 border-emerald-400/40 ring-emerald-400/30' : ''}
        ${state === 'greeting' ? 'bg-gradient-to-b from-blue-300/50 via-blue-200/45 to-blue-300/50 border-blue-400/40 ring-blue-400/30' : ''}
        ${state === 'processing' ? 'bg-gradient-to-b from-purple-300/45 via-blue-300/40 to-purple-300/45 border-purple-400/30 ring-purple-400/20' : ''}
        ${state === 'speaking' ? 'bg-gradient-to-b from-amber-300/45 via-yellow-300/40 to-amber-300/45 border-amber-400/30 ring-amber-400/20' : ''}
        ${state === 'idle' ? 'bg-gradient-to-b from-emerald-300/45 via-sky-300/40 to-purple-300/45 border-emerald-400/30 ring-emerald-400/20' : ''}
      `}>
        <canvas
          ref={canvasRef}
          width={300}
          height={300}
          className="absolute inset-0 w-full h-full opacity-100 mix-blend-plus-lighter"
        />
      </div>
    </div>
  );
};

export default AssistantOrb;
