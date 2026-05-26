import { Rng } from './Rng';

describe('Rng', () => {
  it('produces an identical sequence for the same seed', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toEqual(b.next());
  });

  it('returns floats in [0, 1)', () => {
    const rng = new Rng(99);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('resumes the exact sequence after getState/setState', () => {
    const rng = new Rng(777);
    for (let i = 0; i < 10; i++) rng.next();
    const snapshot = rng.getState();
    const expected = Array.from({ length: 20 }, () => rng.next());

    const restored = new Rng(0);
    restored.setState(snapshot);
    const actual = Array.from({ length: 20 }, () => restored.next());

    expect(actual).toEqual(expected);
  });

  it('avoids the degenerate zero state', () => {
    const rng = new Rng(0);
    expect(rng.getState()).not.toBe(0);
    expect(rng.next()).toBeGreaterThan(0);
  });

  it('nextRange stays within inclusive bounds', () => {
    const rng = new Rng(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextRange(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('shuffle is deterministic for a given seed', () => {
    const a = new Rng(5);
    const b = new Rng(5);
    const arrA = [1, 2, 3, 4, 5, 6, 7, 8];
    const arrB = [1, 2, 3, 4, 5, 6, 7, 8];
    a.shuffle(arrA);
    b.shuffle(arrB);
    expect(arrA).toEqual(arrB);
  });
});
