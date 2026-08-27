// Payment-choice architecture: every payment method implements the same
// `authorize`/`capture` contract, so the routes layer never branches on
// method — new methods (e.g. a real card processor) plug in here.

function makeSandboxProvider(name, { failureRate = 0.02 } = {}) {
  return {
    name,
    async authorize({ amount, currency }) {
      await delay();
      const success = Math.random() >= failureRate;
      return {
        success,
        status: success ? 'AUTHORIZED' : 'FAILED',
        reference: `${name}-auth-${Math.random().toString(36).slice(2, 10)}`,
        message: success ? `Authorized ${currency} ${amount} via ${name}` : `${name} declined the payment`,
      };
    },
    async capture({ amount, currency }) {
      await delay();
      return {
        success: true,
        status: 'CAPTURED',
        reference: `${name}-cap-${Math.random().toString(36).slice(2, 10)}`,
        message: `Captured ${currency} ${amount} via ${name}`,
      };
    },
  };
}

function delay() {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

export const PROVIDERS = {
  card: makeSandboxProvider('card'),
  mobile_money: makeSandboxProvider('mobile_money'),
  wallet: makeSandboxProvider('wallet', { failureRate: 0 }),
  cash: {
    name: 'cash',
    // Cash is settled in person; "authorize" just records intent, and
    // "capture" happens when the driver confirms cash was received.
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
