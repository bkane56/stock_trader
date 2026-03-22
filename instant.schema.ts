import { i } from "@instantdb/react";

const _schema = i.schema({
  entities: {
    $users: i.entity({
      email: i.string().optional(),
    }),
    users: i.entity({
      userId: i.string().indexed(),
      email: i.string().optional(),
      name: i.string().optional(),
      tier: i.string().optional(),
      avatarUrl: i.string().optional(),
      createdAt: i.date(),
      updatedAt: i.date(),
    }),
    portfolios: i.entity({
      userId: i.string().indexed(),
      name: i.string(),
      baseCurrency: i.string(),
      cashReserve: i.number(),
      strategyGrowthPct: i.number(),
      strategyFixedPct: i.number(),
      resetAt: i.date().optional(),
      snapshotTotalValue: i.number().optional(),
      snapshotInvestedAmount: i.number().optional(),
      snapshotAt: i.date().optional(),
      createdAt: i.date(),
      updatedAt: i.date(),
    }),
    positions: i.entity({
      portfolioId: i.string().indexed(),
      symbol: i.string().indexed(),
      name: i.string(),
      sector: i.string(),
      shares: i.number(),
      avgCost: i.number(),
      updatedPrice: i.number(),
      analysisTag: i.string().optional(),
      analysisText: i.string().optional(),
      createdAt: i.date(),
      updatedAt: i.date(),
    }),
    portfolio_events: i.entity({
      portfolioId: i.string().indexed(),
      eventType: i.string(),
      symbol: i.string().optional(),
      asset: i.string().optional(),
      shares: i.number().optional(),
      price: i.number().optional(),
      amount: i.number(),
      status: i.string(),
      eventAt: i.date(),
    }),
    company_names: i.entity({
      userId: i.string().indexed(),
      symbol: i.string().indexed(),
      name: i.string(),
      updatedAt: i.date(),
    }),
  },
  links: {
    portfolioOwner: {
      forward: { on: "portfolios", has: "one", label: "owner" },
      reverse: { on: "users", has: "many", label: "portfolios" },
    },
    portfolioPositions: {
      forward: { on: "positions", has: "one", label: "portfolio" },
      reverse: { on: "portfolios", has: "many", label: "positions" },
    },
    portfolioEvents: {
      forward: { on: "portfolio_events", has: "one", label: "portfolio" },
      reverse: { on: "portfolios", has: "many", label: "events" },
    },
    userAuthIdentity: {
      forward: { on: "users", has: "one", label: "$user" },
      reverse: { on: "$users", has: "one", label: "profile" },
    },
  },
});

type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
