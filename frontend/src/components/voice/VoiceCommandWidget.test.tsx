import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VoiceCommandWidget from './VoiceCommandWidget';
import { aiApi } from '../../services/aiApi';

vi.mock('../../services/aiApi', () => ({
  aiApi: {
    interpretarAudio: vi.fn(),
    interpretarTexto: vi.fn(),
  },
}));

describe('VoiceCommandWidget Component Tests', () => {
  const onExecuteActionMock = vi.fn();
  const onCloseMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    onExecuteActionMock.mockReturnValue({ success: true, message: 'Clase creada' });

    // Mockear MediaRecorder y navigator.mediaDevices para entorno jsdom
    Object.defineProperty(window, 'MediaRecorder', {
      writable: true,
      configurable: true,
      value: class MockMediaRecorder {
        state = 'inactive';
        ondataavailable = null;
        onstop = null;
        start() {
          this.state = 'recording';
        }
        stop() {
          this.state = 'inactive';
          if (this.onstop) {
            (this.onstop as unknown as () => void)();
          }
        }
        static isTypeSupported() {
          return true;
        }
      },
    });

    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
    });
  });

  afterEach(cleanup);

  it('no renderiza nada cuando isOpen es false', () => {
    const { container } = render(
      <VoiceCommandWidget
        isOpen={false}
        onClose={onCloseMock}
        onExecuteAction={onExecuteActionMock}
        existingClasses={[]}
        canEdit={true}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renderiza el modal, botón de micrófono y tabs de ejemplos cuando está abierto', () => {
    render(
      <VoiceCommandWidget
        isOpen={true}
        onClose={onCloseMock}
        onExecuteAction={onExecuteActionMock}
        existingClasses={[]}
        canEdit={true}
      />,
    );

    expect(screen.getByRole('heading', { level: 2, name: /Modelado Asistido por Voz/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Iniciar grabación de voz/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/¿Prefieres escribir\?/i)).toBeInTheDocument();
    expect(screen.getByText(/Crear interfaz Repositorio/i)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Clases/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Atributos y Métodos/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Relaciones/i })).toBeInTheDocument();
  });

  it('permite cambiar de categoría de ejemplos y muestra los comandos respectivos', () => {
    render(
      <VoiceCommandWidget
        isOpen={true}
        onClose={onCloseMock}
        onExecuteAction={onExecuteActionMock}
        existingClasses={[]}
        canEdit={true}
      />,
    );

    const relTab = screen.getByRole('tab', { name: /Relaciones/i });
    fireEvent.click(relTab);

    expect(screen.getByText(/Conectar Paciente con Medico como asociacion/i)).toBeInTheDocument();
  });

  it('permite escribir una orden manual y la interpreta llamando a la IA', async () => {
    vi.mocked(aiApi.interpretarTexto).mockResolvedValueOnce({
      action: {
        type: 'CREATE_CLASS',
        name: 'Cliente',
        isAbstract: false,
        isInterface: false,
        attributes: [{ name: 'nombre', type: 'String' }],
      },
      transcript: 'crear clase Cliente con atributo nombre texto',
      source: 'gemini',
    });

    render(
      <VoiceCommandWidget
        isOpen={true}
        onClose={onCloseMock}
        onExecuteAction={onExecuteActionMock}
        existingClasses={[]}
        canEdit={true}
      />,
    );

    const input = screen.getByPlaceholderText(/¿Prefieres escribir\?/i);
    fireEvent.change(input, { target: { value: 'crear clase Cliente con atributo nombre texto' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar instrucción en texto/i }));

    await waitFor(() => {
      expect(onExecuteActionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CREATE_CLASS',
          name: 'Cliente',
        }),
      );
    });
  });

  it('ejecuta directamente un comando al hacer click en un chip de ejemplo', async () => {
    vi.mocked(aiApi.interpretarTexto).mockResolvedValueOnce({
      action: {
        type: 'CREATE_CLASS',
        name: 'Repositorio',
        isInterface: true,
      },
      transcript: 'Crear interfaz Repositorio',
      source: 'gemini',
    });

    render(
      <VoiceCommandWidget
        isOpen={true}
        onClose={onCloseMock}
        onExecuteAction={onExecuteActionMock}
        existingClasses={[]}
        canEdit={true}
      />,
    );

    const chip = screen.getByText('Crear interfaz Repositorio');
    fireEvent.click(chip);

    await waitFor(() => {
      expect(onExecuteActionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CREATE_CLASS',
          name: 'Repositorio',
          isInterface: true,
        }),
      );
    });
  });

  it('cierra el modal al pulsar el botón de cerrar', () => {
    render(
      <VoiceCommandWidget
        isOpen={true}
        onClose={onCloseMock}
        onExecuteAction={onExecuteActionMock}
        existingClasses={[]}
        canEdit={true}
      />,
    );

    const closeBtn = screen.getByLabelText(/Cerrar modal de comandos por voz/i);
    fireEvent.click(closeBtn);
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });
});
