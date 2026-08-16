/** @typedef {'jazzcash' | 'easypaisa'} PaymentMethodId */

export const PAYMENT_METHODS = Object.freeze(['jazzcash', 'easypaisa']);

const LOGO_BY_METHOD = Object.freeze({
  jazzcash: '/Payment methods logo/jazz cash logo.png',
  easypaisa: '/Payment methods logo/easypaisa logo.png',
});

const LABEL_BY_METHOD = Object.freeze({
  jazzcash: 'JazzCash',
  easypaisa: 'EasyPaisa',
});

/** @param {PaymentMethodId | string} method */
export function getPaymentMethodLogoSrc(method) {
  return LOGO_BY_METHOD[method] || '';
}

/** @param {PaymentMethodId | string} method */
export function getPaymentMethodLabel(method) {
  return LABEL_BY_METHOD[method] || String(method || '');
}
