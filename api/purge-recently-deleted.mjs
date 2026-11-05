import { createClient } from "@supabase/supabase-js";

const proofBucket = "hs-payment-proofs";
const offeringImageBucket = "hs-offering-images";

const getConfig = () => ({
  supabaseUrl: (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").trim(),
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  cronSecret: process.env.CRON_SECRET?.trim(),
});

const uniquePaths = (paths) => Array.from(new Set((Array.isArray(paths) ? paths : []).filter((path) => typeof path === "string" && path)));

const removeObjects = async (client, bucket, paths) => {
  for (let offset = 0; offset < paths.length; offset += 1000) {
    const { error } = await client.storage.from(bucket).remove(paths.slice(offset, offset + 1000));
    if (error) throw error;
  }
};

export default async function handler(request, response) {
  const { supabaseUrl, serviceRoleKey, cronSecret } = getConfig();
  if (request.method !== "GET" && request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed." });
    return;
  }
  if (!cronSecret) {
    response.status(503).json({ error: "The purge worker is not configured." });
    return;
  }
  if (request.headers.authorization !== `Bearer ${cronSecret}`) {
    response.status(401).json({ error: "Unauthorized." });
    return;
  }
  if (!supabaseUrl || !serviceRoleKey) {
    response.status(503).json({ error: "The database purge service is not configured." });
    return;
  }

  try {
    const client = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: assetRows, error: assetError } = await client.rpc("hs_expired_recently_deleted_assets");
    if (assetError) throw assetError;
    const assets = Array.isArray(assetRows) ? assetRows[0] : assetRows;
    const payerIds = Array.isArray(assets?.payer_ids) ? assets.payer_ids : [];
    const offeringIds = Array.isArray(assets?.offering_ids) ? assets.offering_ids : [];
    const proofPaths = uniquePaths(assets?.proof_paths);
    const offeringImagePaths = uniquePaths(assets?.offering_image_paths);

    await removeObjects(client, proofBucket, proofPaths);
    await removeObjects(client, offeringImageBucket, offeringImagePaths);

    const { data: purgeResult, error: purgeError } = await client.rpc("hs_purge_expired_recently_deleted", {
      p_payer_ids: payerIds,
      p_offering_ids: offeringIds,
    });
    if (purgeError) throw purgeError;
    response.status(200).json({ ok: true, result: Array.isArray(purgeResult) ? purgeResult[0] : purgeResult });
  } catch (error) {
    console.error("Recently Deleted purge failed:", error instanceof Error ? error.message : error);
    response.status(500).json({ error: "The Recently Deleted purge did not complete." });
  }
}
