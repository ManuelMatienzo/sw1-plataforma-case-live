import { describe, expect, it } from 'vitest';
import { createClientId } from './uuid';

describe('createClientId', () => {
  it('genera UUID v4 aun cuando randomUUID no está disponible', () => {
    const cryptoWithoutRandomUuid = {
      getRandomValues<T extends ArrayBufferView>(array: T): T {
        const bytes = array as unknown as Uint8Array;
        bytes.forEach((_value, index) => { bytes[index] = index + 1; });
        return array;
      },
    };
    expect(createClientId(cryptoWithoutRandomUuid)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
