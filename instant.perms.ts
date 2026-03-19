import type { InstantRules } from "@instantdb/react";

const rules = {
  $default: {
    allow: {
      $default: "false",
    },
  },
  attrs: {
    allow: {
      $default: "false",
    },
  },
  users: {
    allow: {
      view: "isOwner",
      create: "isOwner",
      update: "isOwner && isStillOwner",
      delete: "isOwner",
    },
    bind: {
      isOwner: "auth.id != null && auth.id == data.userId",
      isStillOwner: "auth.id != null && auth.id == newData.userId",
    },
  },
  portfolios: {
    allow: {
      view: "isOwner",
      create: "isOwner",
      update: "isOwner && isStillOwner",
      delete: "isOwner",
    },
    bind: {
      isOwner: "auth.id != null && auth.id == data.userId",
      isStillOwner: "auth.id != null && auth.id == newData.userId",
    },
  },
  positions: {
    allow: {
      view: "isOwner",
      create: "isOwner",
      update: "isOwner",
      delete: "isOwner",
    },
    bind: {
      isOwner:
        "auth.id != null && auth.id in data.ref('portfolio.owner.userId')",
    },
  },
  portfolio_events: {
    allow: {
      view: "isOwner",
      create: "isOwner",
      update: "false",
      delete: "false",
    },
    bind: {
      isOwner:
        "auth.id != null && auth.id in data.ref('portfolio.owner.userId')",
    },
  },
} satisfies InstantRules;

export default rules;
