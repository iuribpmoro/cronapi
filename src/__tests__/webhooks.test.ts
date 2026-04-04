import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

const { mockConstructEvent, mockRetrieve } = vi.hoisted(() => ({
  mockConstructEvent: vi.fn(),
  mockRetrieve: vi.fn(),
}));

vi.mock('../db/client', () => ({
  db: { query: vi.fn() },
}));

vi.mock('../lib/apiKeys', () => ({
  generateApiKey: vi.fn(),
  validateApiKey: vi.fn(),
  listApiKeys: vi.fn(),
  revokeApiKey: vi.fn(),
}));

vi.mock('../lib/usageTracking', () => ({
  logConversionEvent: vi.fn(),
  logRequest: vi.fn(),
  trackUsage: vi.fn(),
  getUsageToday: vi.fn(),
}));

vi.mock('stripe', () => {
  const MockStripe = vi.fn().mockImplementation(function () {
    return {
      webhooks: { constructEvent: mockConstructEvent },
      checkout: { sessions: { retrieve: mockRetrieve } },
    };
  });
  return { default: MockStripe };
});

import { db } from '../db/client';
import { buildApp } from '../app';

const mockQuery = vi.mocked(db.query);

describe('Stripe webhook routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_INDIE_PRICE_ID = 'price_indie';
    process.env.STRIPE_PRO_PRICE_ID = 'price_pro';
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it('rejects when stripe-signature header is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ type: 'test' }),
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('signature');
  });

  it('rejects when STRIPE_WEBHOOK_SECRET is not set', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: { 'content-type': 'application/json', 'stripe-signature': 'sig' },
      payload: JSON.stringify({ type: 'test' }),
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects when signature verification fails', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('Signature mismatch');
    });

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: { 'content-type': 'application/json', 'stripe-signature': 'bad_sig' },
      payload: JSON.stringify({ type: 'test' }),
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('signature verification failed');
  });

  it('handles checkout.session.completed with indie plan', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_123', customer: 'cus_123' } },
    });
    mockRetrieve.mockResolvedValue({
      customer: 'cus_123',
      subscription: 'sub_123',
      line_items: { data: [{ price: { id: 'price_indie' } }] },
      customer_details: { email: 'user@example.com' },
    });
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 } as any);

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: { 'content-type': 'application/json', 'stripe-signature': 'sig_valid' },
      payload: JSON.stringify({ type: 'checkout.session.completed' }),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).received).toBe(true);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET plan'),
      expect.arrayContaining(['indie'])
    );
  });

  it('handles checkout.session.completed with pro plan', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_456', customer: 'cus_456' } },
    });
    mockRetrieve.mockResolvedValue({
      customer: 'cus_456',
      subscription: 'sub_456',
      line_items: { data: [{ price: { id: 'price_pro' } }] },
      customer_details: { email: 'pro@example.com' },
    });
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 } as any);

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: { 'content-type': 'application/json', 'stripe-signature': 'sig_valid' },
      payload: JSON.stringify({ type: 'checkout.session.completed' }),
    });

    expect(res.statusCode).toBe(200);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET plan'),
      expect.arrayContaining(['pro'])
    );
  });

  it('handles checkout.session.completed with unknown price → free plan', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_789', customer: 'cus_789' } },
    });
    mockRetrieve.mockResolvedValue({
      customer: 'cus_789',
      subscription: 'sub_789',
      line_items: { data: [{ price: { id: 'price_unknown' } }] },
      customer_details: { email: 'free@example.com' },
    });
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 } as any);

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: { 'content-type': 'application/json', 'stripe-signature': 'sig_valid' },
      payload: JSON.stringify({ type: 'checkout.session.completed' }),
    });

    expect(res.statusCode).toBe(200);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET plan'),
      expect.arrayContaining(['free'])
    );
  });

  it('handles customer.subscription.deleted → downgrades to free', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'customer.subscription.deleted',
      data: { object: { customer: 'cus_cancel' } },
    });
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 } as any);

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: { 'content-type': 'application/json', 'stripe-signature': 'sig_valid' },
      payload: JSON.stringify({ type: 'customer.subscription.deleted' }),
    });

    expect(res.statusCode).toBe(200);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("plan = 'free'"),
      expect.arrayContaining(['cus_cancel'])
    );
  });

  it('handles customer.subscription.updated', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'customer.subscription.updated',
      data: { object: { customer: 'cus_update', items: { data: [{ price: { id: 'price_indie' } }] } } },
    });
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 } as any);

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: { 'content-type': 'application/json', 'stripe-signature': 'sig_valid' },
      payload: JSON.stringify({ type: 'customer.subscription.updated' }),
    });

    expect(res.statusCode).toBe(200);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET plan'),
      expect.arrayContaining(['indie', 'cus_update'])
    );
  });

  it('handles customer.subscription.updated with pro plan', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'customer.subscription.updated',
      data: { object: { customer: 'cus_pro', items: { data: [{ price: { id: 'price_pro' } }] } } },
    });
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 } as any);

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: { 'content-type': 'application/json', 'stripe-signature': 'sig_valid' },
      payload: JSON.stringify({ type: 'customer.subscription.updated' }),
    });

    expect(res.statusCode).toBe(200);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET plan'),
      expect.arrayContaining(['pro'])
    );
  });

  it('handles unknown event types gracefully', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'payment_intent.created',
      data: { object: {} },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: { 'content-type': 'application/json', 'stripe-signature': 'sig_valid' },
      payload: JSON.stringify({ type: 'payment_intent.created' }),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).received).toBe(true);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
