// JSON schemas of the API requests, checked by Fastify.

import { filterFields, maxQueryLimit, severities } from "@cbm-logviewer/shared";

const patterns = {
  type: "array",
  items: { type: "string", minLength: 1, maxLength: 1000 },
  maxItems: 100,
} as const;

export const filtersSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    from: { type: "string", maxLength: 100 },
    to: { type: "string", maxLength: 100 },
    severities: {
      type: "array",
      items: { enum: severities.map((s) => s.code) },
      uniqueItems: true,
    },
    fields: {
      type: "object",
      additionalProperties: false,
      properties: Object.fromEntries(
        filterFields.map((f) => [
          f,
          {
            type: "object",
            additionalProperties: false,
            properties: { match: patterns, exclude: patterns },
          },
        ]),
      ),
    },
  },
} as const;

export const queryBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["filters", "limit"],
  properties: {
    filters: filtersSchema,
    limit: { type: "integer", minimum: 1, maximum: maxQueryLimit },
  },
} as const;

export const statsBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["filters"],
  properties: {
    filters: filtersSchema,
    buckets: { type: "integer", minimum: 1, maximum: 1000 },
  },
} as const;
