import { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { db } from '../db/client';

export async function webhookRoutes(app: FastifyInstance) {
  // Capture raw body buffer for Stripe signature verification.
  // Fastify's built-in JSON parser discards the original bytes; we need them
  // to call stripe.webhooks.constructEvent(). Scoped to this plugin only.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, function (req, body, done) {
    (req as any).rawBody = body;
    try {
      done(null, JSON.parse(body.toString()));
    } catch (err: any) {
      done(err as Error, undefined);
    }
  });

  app.post(
    '/stripe',
    {},
    async (request, reply) => {
      const sig = request.headers['stripe-signature'];
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!webhookSecret || !sig) {
        return reply.code(400).send({ error: 'Missing webhook secret or signature' });
      }

      const rawBody = (request as any).rawBody;
      if (!rawBody) {
        return reply.code(400).send({ error: 'Raw body not available for signature verification' });
      }

      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' });

      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(
          rawBody,
          sig,
          webhookSecret
        );
      } catch (err: any) {
        return reply.code(400).send({ error: `Webhook signature verification failed: ${err.message}` });
      }

      const session = event.data.object as any;

      switch (event.type) {
        case 'checkout.session.completed': {
          // line_items are not expanded in the webhook payload by default;
          // retrieve the session with expansion to get the price id.
          const sessionWithItems = await stripe.checkout.sessions.retrieve(session.id, {
            expand: ['line_items'],
          });
          const customerId = sessionWithItems.customer as string;
          const subscriptionId = sessionWithItems.subscription as string;
          const priceId = sessionWithItems.line_items?.data?.[0]?.price?.id ?? '';

          const indiePriceId = process.env.STRIPE_INDIE_PRICE_ID;
          const proPriceId = process.env.STRIPE_PRO_PRICE_ID;
          const plan = priceId === proPriceId ? 'pro' : priceId === indiePriceId ? 'indie' : 'free';

          await db.query(
            `UPDATE users SET plan = $1, stripe_customer_id = $2, stripe_subscription_id = $3, updated_at = NOW()
             WHERE stripe_customer_id = $2 OR email = $4`,
            [plan, customerId, subscriptionId, sessionWithItems.customer_details?.email ?? '']
          );
          break;
        }

        case 'customer.subscription.deleted': {
          const customerId = session.customer as string;
          await db.query(
            `UPDATE users SET plan = 'free', stripe_subscription_id = NULL, updated_at = NOW()
             WHERE stripe_customer_id = $1`,
            [customerId]
          );
          break;
        }

        case 'customer.subscription.updated': {
          const customerId = session.customer as string;
          const priceId = session.items?.data?.[0]?.price?.id ?? '';
          const indiePriceId = process.env.STRIPE_INDIE_PRICE_ID;
          const proPriceId = process.env.STRIPE_PRO_PRICE_ID;
          const plan = priceId === proPriceId ? 'pro' : priceId === indiePriceId ? 'indie' : 'free';

          await db.query(
            `UPDATE users SET plan = $1, updated_at = NOW() WHERE stripe_customer_id = $2`,
            [plan, customerId]
          );
          break;
        }
      }

      return reply.send({ received: true });
    }
  );
}
