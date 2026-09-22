import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import UMLCanvas from './UMLCanvas';
import { useDiagramStore } from '../../store/useDiagramStore';

vi.mock('react-konva', () => {
  const container = ({ children, onClick, onDblClick, text }: Record<string, unknown>) => (
    <div
      onClick={onClick as React.MouseEventHandler<HTMLDivElement> | undefined}
      onDoubleClick={onDblClick
        ? () => (onDblClick as (event: unknown) => void)({
            cancelBubble: false,
            target: { getAbsolutePosition: () => ({ x: 20, y: 30 }), width: () => 180, height: () => 24 },
          })
        : undefined}
    >
      {children as React.ReactNode}
      {text as React.ReactNode}
    </div>
  );
  return { Stage: container, Layer: container, Group: container, Rect: container, Text: container, Line: container, Circle: container };
});

const diagram = {
  version: 1,
  classes: [{
    id: 'class-1', name: 'Paciente', isAbstract: false, isInterface: false,
    attributes: [], methods: [], position: { x: 40, y: 50 },
  }],
  relationships: [],
};

const canvasProps = {
  connecting: false,
  relationshipType: 'ASSOCIATION' as const,
  view: { x: 0, y: 0, scale: 1 },
  setView: vi.fn(),
  onConnected: vi.fn(),
};

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() { /* jsdom has no layout to observe. */ }
    disconnect() { /* no-op */ }
  });
  useDiagramStore.getState().setDiagram(diagram);
  useDiagramStore.getState().selectClass('class-1');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('no expone acciones mutables del menú contextual en solo lectura', () => {
  render(<UMLCanvas {...canvasProps} editable={false} />);

  expect(screen.queryByTitle('Añadir Atributo')).not.toBeInTheDocument();
  expect(screen.queryByTitle('Añadir Método')).not.toBeInTheDocument();
  expect(screen.queryByTitle('Conectar a...')).not.toBeInTheDocument();
  expect(screen.queryByTitle('Borrar Clase')).not.toBeInTheDocument();
});

it('cancela una edición abierta si el permiso se revoca antes de confirmarla', async () => {
  const page = render(<UMLCanvas {...canvasProps} editable />);
  fireEvent.doubleClick(screen.getByText('Paciente'));
  expect(screen.getByDisplayValue('Paciente')).toBeInTheDocument();

  page.rerender(<UMLCanvas {...canvasProps} editable={false} />);

  await waitFor(() => expect(screen.queryByDisplayValue('Paciente')).not.toBeInTheDocument());
  expect(useDiagramStore.getState().classes[0].name).toBe('Paciente');
});
