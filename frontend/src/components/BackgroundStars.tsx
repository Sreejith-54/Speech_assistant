import React, { useRef, useEffect, useMemo, useCallback } from 'react';

const BackgroundStars: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Generate stars with memoization to prevent regeneration on renders
  const stars = useMemo(() => {
    const starCount = 200;
    return Array.from({ length: starCount }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      size: Math.random() * 1.5 + 0.5,
      twinkleSpeed: Math.random() * 2 + 1,
      moveSpeed: Math.random() * 0.05 + 0.02,
      angle: Math.random() * Math.PI * 2
    }));
  }, []);

  const drawStars = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number, time: number) => {
    ctx.clearRect(0, 0, width, height);
    
    stars.forEach((star) => {
      // Circular motion
      const radius = 1;
      star.angle += star.moveSpeed * 0.01;
      star.x += Math.cos(star.angle) * radius * 0.1;
      star.y += Math.sin(star.angle) * radius * 0.1;
      
      // Wrap around screen
      if (star.x < 0) star.x = width;
      if (star.x > width) star.x = 0;
      if (star.y < 0) star.y = height;
      if (star.y > height) star.y = 0;
      
      // Calculate twinkle
      const twinkle = Math.sin(time * star.twinkleSpeed + star.x * 0.01) * 0.5 + 0.5;
      const alpha = twinkle * 0.3;
      
      // Draw star with subtle glow
      ctx.beginPath();
      const gradient = ctx.createRadialGradient(
        star.x, star.y, 0,
        star.x, star.y, star.size * 3
      );
      gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
      gradient.addColorStop(0.5, `rgba(255, 255, 255, ${alpha * 0.3})`);
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = gradient;
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [stars]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    handleResize();
    window.addEventListener('resize', handleResize);

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
      window.removeEventListener('resize', handleResize);
    };
  }, [drawStars]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none opacity-70"
    />
  );
};

export default BackgroundStars;
