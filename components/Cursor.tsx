'use client';

import { useEffect, useState } from 'react';

const CLICKABLE_SELECTOR =
  "a, button, [role='button'], [data-cursor-pointer], input, textarea, select, label, .cursor-pointer";

export default function Cursor() {
  const [isMobile, setIsMobile] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isOverClickable, setIsOverClickable] = useState(false);

  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkIfMobile();
    window.addEventListener('resize', checkIfMobile);

    return () => {
      window.removeEventListener('resize', checkIfMobile);
    };
  }, []);

  useEffect(() => {
    if (isMobile) return;

    const isClickableElement = (element: Element | null) => {
      if (!element) return false;
      return Boolean(element.closest(CLICKABLE_SELECTOR));
    };

    const handleMouseMove = (event: MouseEvent) => {
      setPosition({ x: event.clientX, y: event.clientY });
      setIsOverClickable(isClickableElement(document.elementFromPoint(event.clientX, event.clientY)));
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isMobile]);

  if (isMobile) return null;

  const size = isOverClickable ? '30px' : '20px';
  const rotation = isOverClickable ? 'rotate(90deg)' : 'rotate(0deg)';

  return (
    <div
      className="cursor"
      aria-hidden="true"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: size,
        height: size,
        transform: `translate(-50%, -50%) ${rotation}`,
      }}
    />
  );
}
