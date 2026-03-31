import { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { db } from '../db/client';

export async function webhookRoutes(app: FastifyInstance) {
  app.post(
    '/stripe',
    {
      config: { rawBody: true },
    },
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
          const customerId = session.customer as string;
          const subscriptionId = session.subscription as string;
          const priceId = session.line_items?.data?.[0]?.price?.id ?? '';

          const indiePriceId = process.env.STRIPE_INDIE_PRICE_ID;
          const proPriceId = process.env.STRIPE_PRO_PRICE_ID;
          const plan = priceId === proPriceId ? 'pro' : priceId === indiePriceId ? 'indie' : 'free';

          await db.query(
            `UPDATE users SET plan = $1, stripe_customer_id = $2, stripe_subscription_id = $3, updated_at = NOW()
             WHERE stripe_customer_id = $2 OR email = $4`,
            [plan, customerId, subscriptionId, session.customer_details?.email ?? '']
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
