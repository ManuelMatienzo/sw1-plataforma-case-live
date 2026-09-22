import { useEffect, useRef, useState } from 'react';
import { CanvasTheme } from './geometry';

interface Props {
  initialValue: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  theme?: CanvasTheme;
  onSave: (val: string) => void;
  onCancel: () => void;
}

export default function InlineEditor({ initialValue, x, y, width, height, scale, theme, onSave, onCancel }: Props) {
  const [val, setVal] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <input
      ref={inputRef}
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={() => onSave(val)}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          onSave(val);
        } else if (e.key === 'Escape') {
          onCancel();
        }
      }}
      style={{
        position: 'absolute',
        left: `${x}px`,
        top: `${y}px`,
        width: `${width * scale}px`,
        height: `${height * scale}px`,
        fontSize: `${14 * scale}px`, // approximate scale of the text
        fontFamily: 'inherit',
        background: theme ? theme.surface : 'var(--color-bg-elevated)',
        color: theme ? theme.text : 'var(--color-text-primary)',
        border: `1px solid ${theme ? theme.focus : 'var(--color-focus)'}`,
        borderRadius: '2px',
        padding: '0 2px',
        boxSizing: 'border-box',
        outline: 'none',
        zIndex: 100,
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
      }}
    />
  );
}
