// Regression tests for the V2 plan taxonomy display mapping + ordering.
// Run: node tests/plan-taxonomy.test.mjs
import assert from 'assert';
import { getPlanDisplayName, isHigherTier, isFreePlan, formatPlanPrice } from '../src/lib/planTaxonomy.js';

const plans = [
  { tier: 'basic', family: 'professional', price_pence: 0 },
  { tier: 'plus', family: 'professional', price_pence: 3000 },
  { tier: 'pro', family: 'professional', price_pence: 6000 },
  { tier: 'basic', family: 'business', price_pence: 10000 },
  { tier: 'plus', family: 'business', price_pence: 15000 },
  { tier: 'pro', family: 'business', price_pence: 20000 },
];

const expectedNames = ['Basic', 'Plus', 'Pro', 'Enhance', 'Expand', 'Enterprise'];
plans.forEach((p, i) => {
  assert.strictEqual(getPlanDisplayName(p), expectedNames[i], `plan ${i} display name`);
});

assert.strictEqual(isFreePlan(plans[0]), true, 'basic-professional is free');
assert.strictEqual(isFreePlan(plans[3]), false, 'enhance is paid');
assert.strictEqual(formatPlanPrice(0), 'Free');
assert.strictEqual(formatPlanPrice(3000), '£30.00');
assert.strictEqual(formatPlanPrice(20000), '£200.00');

// Price-based ordering across all six tiers
assert.strictEqual(isHigherTier(0, 3000), true, 'plus > basic');
assert.strictEqual(isHigherTier(6000, 3000), false, 'plus not > pro');
assert.strictEqual(isHigherTier(15000, 20000), true, 'enterprise > expand');
assert.strictEqual(isHigherTier(6000, 10000), true, 'enhance > pro (cross-family upgrade)');

console.log('plan-taxonomy: all assertions passed');