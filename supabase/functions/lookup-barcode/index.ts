const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });

const barcodeCandidates = (raw: string): string[] => {
  const digits = raw.replace(/\D/g, "");
  const values = new Set<string>();

  if (digits) values.add(digits);

  // Enkelte nettlesere returnerer UPC-A (12 siffer), mens databasen kan ha
  // samme vare lagret som EAN-13 med ledende null.
  if (digits.length === 12) values.add(`0${digits}`);
  if (digits.length === 13 && digits.startsWith("0")) values.add(digits.slice(1));

  return [...values];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Kun POST støttes" }, 405);
  }

  try {
    const body = await req.json();
    const rawBarcode = String(body?.barcode ?? "").trim();

    if (!rawBarcode) {
      return json({ error: "Strekkode mangler" }, 400);
    }

    const fields = [
      "code",
      "product_name",
      "product_name_no",
      "generic_name",
      "nutriments",
    ].join(",");

    let lastStatus = 0;

    for (const barcode of barcodeCandidates(rawBarcode)) {
      const endpoints = [
        `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(
          barcode
        )}.json?fields=${fields}`,
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(
          barcode
        )}.json?fields=${fields}`,
        `https://no.openfoodfacts.org/api/v2/product/${encodeURIComponent(
          barcode
        )}.json?fields=${fields}`,
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            headers: {
              Accept: "application/json",
              "User-Agent":
                "NIRO/0.3 (https://garus1996.github.io/kaloriapp/)",
            },
          });

          lastStatus = response.status;
          if (!response.ok) continue;

          const data = await response.json();
          if (data?.product) {
            return json({ ...data, matched_barcode: barcode });
          }
        } catch {
          // Prøv neste endepunkt eller strekkodevariant.
        }
      }
    }

    return json(
      {
        error: "Produktet ble ikke funnet",
        status: lastStatus || undefined,
      },
      404
    );
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Ukjent serverfeil",
      },
      500
    );
  }
});
