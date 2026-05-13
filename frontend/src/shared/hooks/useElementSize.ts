import { useEffect, useState } from "react";
import type { RefObject } from "react";

interface ElementSize {
  width: number;
  height: number;
}

const hasMeaningfulSizeChange = (
  previousSize: ElementSize,
  nextSize: ElementSize,
) =>
  Math.abs(previousSize.width - nextSize.width) >= 1 ||
  Math.abs(previousSize.height - nextSize.height) >= 1;

export function useElementSize<TElement extends HTMLElement>(
  ref: RefObject<TElement>,
): ElementSize {
  const [size, setSize] = useState<ElementSize>({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return undefined;
    }

    const updateSize = () => {
      const nextSize = {
        width: Math.round(element.clientWidth),
        height: Math.round(element.clientHeight),
      };

      setSize((current) =>
        hasMeaningfulSizeChange(current, nextSize) ? nextSize : current,
      );
    };

    updateSize();

    const observer = new ResizeObserver((entries) => {
      const nextEntry = entries[0];

      if (!nextEntry) {
        updateSize();
        return;
      }

      const nextSize = {
        width: Math.round(nextEntry.contentRect.width),
        height: Math.round(nextEntry.contentRect.height),
      };

      setSize((current) =>
        hasMeaningfulSizeChange(current, nextSize) ? nextSize : current,
      );
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [ref]);

  return size;
}
