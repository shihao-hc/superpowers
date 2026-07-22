'use strict';
const FingerprintIsolator = require('./src/agent/FingerprintIsolator');

describe('debug', () => {
  it('checks Math.random mock', () => {
    const spy = jest.spyOn(Math, 'random').mockReturnValue(0.75);
    console.log('Math.random() =', Math.random(), '(expected 0.75)');
    const noise = (Math.random() - 0.5) * 2;
    console.log('noise =', noise);
    const data = new Uint8ClampedArray([100, 150, 200, 255, 50, 60, 70, 255]);
    FingerprintIsolator._addCanvasNoise({ data }, 2, 1);
    console.log('data[0] =', data[0]);
    expect(data[0]).not.toBe(100);
    spy.mockRestore();
  });
});
