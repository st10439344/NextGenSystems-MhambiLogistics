
'use strict';

const { calculateTotal } = require('../src/services/demoPaymentMath');

describe('Demo payment calculations', () => {
  test('full amount includes VAT', () => {
    expect(calculateTotal(3500)).toEqual({
      subtotal: 3500,
      vat: 525,
      total: 4025
    });
  });

  test('reject invalid quotation amount', () => {
    expect(() => calculateTotal(0)).toThrow();
    expect(() => calculateTotal(NaN)).toThrow();
  });
});
