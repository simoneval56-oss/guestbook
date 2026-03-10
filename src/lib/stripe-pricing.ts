type StripePriceConfig = {
  basic1to5: string;
  basic6to10: string;
  extra: string | null;
};

type StripeLineItem = {
  price: string;
  quantity: number;
};

function asNonEmpty(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  return normalized.length ? normalized : null;
}

export function getStripePriceConfig(): StripePriceConfig | null {
  const basic1to5 = asNonEmpty(process.env.STRIPE_PRICE_BASIC_1_5);
  const basic6to10 = asNonEmpty(process.env.STRIPE_PRICE_BASIC_6_10);
  const extra = asNonEmpty(process.env.STRIPE_PRICE_EXTRA);

  if (!basic1to5 || !basic6to10) {
    return null;
  }

  return {
    basic1to5,
    basic6to10,
    extra
  };
}

export function buildStripeLineItemsForPropertyCount(
  propertyCount: number,
  config: StripePriceConfig
): StripeLineItem[] {
  const safeCount = Math.max(propertyCount, 1);

  if (safeCount <= 5) {
    return [{ price: config.basic1to5, quantity: 1 }];
  }

  if (safeCount <= 10) {
    return [{ price: config.basic6to10, quantity: 1 }];
  }

  if (!config.extra) {
    throw new Error("stripe_price_extra_missing");
  }

  return [
    { price: config.basic6to10, quantity: 1 },
    { price: config.extra, quantity: safeCount - 10 }
  ];
}

