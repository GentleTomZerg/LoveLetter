import { describe, expect, it } from 'vitest';
import { greeting } from '../src/index.js';

describe('core package placeholder', () => {
  it('exposes a greeting from the engine entry point', () => {
    expect(greeting()).toBe('Love Letter core engine');
  });
});
