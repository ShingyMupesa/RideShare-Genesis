CREATE TABLE IF NOT EXISTS driver_subscription_plans (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
  price_amount REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'KES',
  billing_period TEXT NOT NULL DEFAULT 'monthly', perks_json TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE TABLE IF NOT EXISTS driver_subscriptions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES driver_subscription_plans(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active', started_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_driver_subscriptions_user ON driver_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_driver_subscriptions_plan ON driver_subscriptions(plan_id);
