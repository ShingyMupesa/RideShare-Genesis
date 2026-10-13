// Payment-choice architecture: every payment method implements the same
// authorize/capture contract, so the routes layer never branches on method.

function makeSandboxProvider(name, { failureRate = 0.02 } = {}) {
  return {
    name,
    async authorize({ amount, currency }) {
      const success = Math.random() >= failureRate;
      return {
        success,
        status: success ? 'AUTHORIZED' : 'FAILED',
        reference: `${name}-auth-${Math.random().toString(36).slice(2, 10)}`,
        message: success ? `Authorized ${currency} ${amount} via ${name}` : `${name} declined the payment`,
      };
    },
    async capture({ amount, currency }) {
      return {
        success: true,
        status: 'CAPTURED',
        reference: `${name}-cap-${Math.random().toString(36).slice(2, 10)}`,
        message: `Captured ${currency} ${amount} via ${name}`,
      };
    },
  };
}

export const PROVIDERS = {
  card: makeSandboxProvider('card'),
  mobile_money: makeSandboxProvider('mobile_money'),
  wallet: makeSandboxProvider('wallet', { failureRate: 0 }),
  cash: {
    name: 'cash',
    async authorize({ amount, currency }) {
      return { success: true, status: 'AUTHORIZED', reference: `cash-${Date.now()}`, message: `Cash payment of ${currency} ${amount} arranged` };
    },
    async capture({ amount, currency }) {
      return { success: true, status: 'CAPTURED', reference: `cash-${Date.now()}`, message: `Cash payment of ${currency} ${amount} confirmed received` };
    },
  },
};

export function getProvider(method) {
  return PROVIDERS[method] || null;
}

export const SUPPORTED_METHODS = Object.keys(PROVIDERS);
