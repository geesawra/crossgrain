import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface MasonryProps {
  items: { id: string; content: ReactNode }[];
}

// Place each card in the shortest column, preserving source/keyboard order.
// Observe the actual cards so captions, fonts, and image loads can change height.
export default function Masonry({ items }: MasonryProps) {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    let frame = 0;
    const layout = () => {
      const width = element.clientWidth;
      if (!width) return;
      const columns = width < 580 ? 1 : width < 960 ? 2 : width < 1380 ? 3 : 4;
      const gap = width < 580 ? 12 : 20;
      const cardWidth = (width - (columns - 1) * gap) / columns;
      const heights = Array<number>(columns).fill(0);
      for (const card of element.children) {
        const item = card as HTMLElement;
        item.style.width = `${cardWidth}px`;
        const shortest = heights.indexOf(Math.min(...heights));
        item.style.transform = `translate(${shortest * (cardWidth + gap)}px, ${heights[shortest]}px)`;
        heights[shortest] += item.getBoundingClientRect().height + gap + 8;
      }
      element.style.height = `${Math.max(...heights, 0) - (items.length ? gap + 8 : 0)}px`;
      setReady(true);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(layout); };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    layout();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [items]);

  return <div className={`masonry ${ready ? 'masonry-ready' : ''}`} ref={container}>
    {items.map(item => <div className="masonry-item" key={item.id}>{item.content}</div>)}
  </div>;
}
