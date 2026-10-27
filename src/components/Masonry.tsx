import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface MasonryProps {
  items: { id: string; content: ReactNode }[];
  variant?: 'photos' | 'galleries';
}

// Place each card in the shortest column, preserving source/keyboard order.
// Observe the actual cards so captions, fonts, and image loads can change height.
export default function Masonry({ items, variant = 'photos' }: MasonryProps) {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    let frame = 0;
    const layout = () => {
      const width = element.clientWidth;
      if (!width) return;
      const columns = variant === 'galleries'
        ? width < 1000 || items.length === 1 ? 1 : 2
        : width < 440 ? 1 : width < 900 ? 2 : 3;
      const gap = variant === 'galleries' ? 40 : width < 580 ? 12 : 20;
      const bottomGap = variant === 'galleries' ? 56 : gap + 8;
      const cardWidth = (width - (columns - 1) * gap) / columns;
      const heights = Array<number>(columns).fill(0);
      for (const card of element.children) {
        const item = card as HTMLElement;
        item.style.width = `${cardWidth}px`;
        const shortest = heights.indexOf(Math.min(...heights));
        item.style.transform = `translate(${shortest * (cardWidth + gap)}px, ${heights[shortest]}px)`;
        heights[shortest] += item.getBoundingClientRect().height + bottomGap;
      }
      element.style.height = `${Math.max(...heights, 0) - (items.length ? bottomGap : 0)}px`;
      setReady(true);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(layout); };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    layout();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [items, variant]);

  return <div className={`masonry ${ready ? 'masonry-ready' : ''}`} ref={container}>
    {items.map(item => <div className="masonry-item" key={item.id}>{item.content}</div>)}
  </div>;
}
