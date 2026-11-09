const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
};

const maxReceiptSize = 5 * 1024 * 1024;
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

type JsonRecord = Record<string, unknown>;

function jsonResponse(body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function supabaseHeaders(apiKey: string, authorization: string, contentType?: string) {
  return {
    apikey: apiKey,
    Authorization: authorization,
    ...(contentType ? { 'Content-Type': contentType } : {}),
  };
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorMessage(value: unknown, fallback: string): string {
  if (!value || typeof value !== 'object') return fallback;
  const record = value as JsonRecord;
  for (const key of ['message', 'error_description', 'error', 'details']) {
    if (typeof record[key] === 'string' && record[key]) return record[key] as string;
  }
  return fallback;
}

async function cleanupUnsubmittedReceipt(
  supabaseUrl: string,
  serviceRoleKey: string,
  receiptPath: string,
) {
  const headers = supabaseHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`);
  const encodedPath = receiptPath.split('/').map(encodeURIComponent).join('/');
  const [storageResponse, screeningResponse] = await Promise.all([
    fetch(`${supabaseUrl}/storage/v1/object/gcash-payment-receipts/${encodedPath}`, {
      method: 'DELETE',
      headers,
    }),
    fetch(`${supabaseUrl}/rest/v1/gcash_receipt_ai_checks?receipt_path=eq.${encodeURIComponent(receiptPath)}`, {
      method: 'DELETE',
      headers,
    }),
  ]);
  if (!storageResponse.ok) console.error(`Unsubmitted receipt cleanup failed with HTTP ${storageResponse.status}.`);
  if (!screeningResponse.ok) console.error(`Receipt screening cleanup failed with HTTP ${screeningResponse.status}.`);
}

function hasExpectedImageSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === 'image/png') {
    return bytes.length >= 8
      && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  if (mimeType === 'image/webp') {
    return bytes.length >= 12
      && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF'
      && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
  }
  return false;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Invalid method.' }, 405);

  const authorization = request.headers.get('Authorization') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const sightengineUser = Deno.env.get('SIGHTENGINE_API_USER');
  const sightengineSecret = Deno.env.get('SIGHTENGINE_API_SECRET');
  if (!/^Bearer\s+\S+$/i.test(authorization)) return jsonResponse({ error: 'Please sign in first.' }, 401);
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !sightengineUser || !sightengineSecret) {
    console.error('GCash receipt function is missing required configuration.');
    return jsonResponse({ error: 'GCash receipt screening is not configured. Please contact support.' }, 503);
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: supabaseHeaders(anonKey, authorization),
  });
  if (!userResponse.ok) return jsonResponse({ error: 'Your session has expired. Please sign in again.' }, 401);
  const authUser = await responseJson(userResponse);
  if (!authUser || typeof authUser !== 'object' || typeof (authUser as JsonRecord).id !== 'string') {
    return jsonResponse({ error: 'Your session could not be verified.' }, 401);
  }
  const authUserId = (authUser as JsonRecord).id as string;
  const adminHeaders = supabaseHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`, 'application/json');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonResponse({ error: 'Choose a valid receipt image smaller than 5MB.' }, 400);
  }

  const reservationId = String(form.get('reservation_id') ?? '');
  const paymentType = String(form.get('payment_type') ?? '');
  const receipt = form.get('receipt');
  if (!/^[1-9]\d*$/.test(reservationId) || !['down_payment', 'balance'].includes(paymentType)) {
    return jsonResponse({ error: 'Select a valid booking payment.' }, 422);
  }
  if (!(receipt instanceof File) || receipt.size < 1 || receipt.size > maxReceiptSize) {
    return jsonResponse({ error: 'Choose a valid receipt image smaller than 5MB.' }, 413);
  }
  if (!allowedMimeTypes.has(receipt.type)) {
    return jsonResponse({ error: 'Receipt must be a JPG, PNG, or WEBP image.' }, 422);
  }
  const receiptBytes = new Uint8Array(await receipt.arrayBuffer());
  if (!hasExpectedImageSignature(receiptBytes, receipt.type)) {
    return jsonResponse({ error: 'The uploaded file is not a valid JPG, PNG, or WEBP image.' }, 422);
  }

  const profileUrl = new URL(`${supabaseUrl}/rest/v1/users`);
  profileUrl.search = new URLSearchParams({
    select: 'id,role',
    auth_user_id: `eq.${authUserId}`,
    limit: '1',
  }).toString();
  const profileResponse = await fetch(profileUrl, { headers: adminHeaders });
  const profileData = await responseJson(profileResponse);
  if (!profileResponse.ok || !Array.isArray(profileData) || !profileData[0]) {
    console.error(`Could not load receipt submitter profile. HTTP ${profileResponse.status}.`);
    return jsonResponse({ error: 'Your customer profile could not be loaded.' }, 502);
  }
  const profile = profileData[0] as JsonRecord;
  if (profile.role !== 'customer') return jsonResponse({ error: 'Please sign in as a customer first.' }, 403);

  const customerUrl = new URL(`${supabaseUrl}/rest/v1/customers`);
  customerUrl.search = new URLSearchParams({
    select: 'id',
    user_id: `eq.${String(profile.id)}`,
    limit: '1',
  }).toString();
  const customerResponse = await fetch(customerUrl, { headers: adminHeaders });
  const customerData = await responseJson(customerResponse);
  if (!customerResponse.ok || !Array.isArray(customerData) || !customerData[0]) {
    console.error(`Could not load receipt submitter customer record. HTTP ${customerResponse.status}.`);
    return jsonResponse({ error: 'Your customer profile could not be loaded.' }, 502);
  }
  const customerId = String((customerData[0] as JsonRecord).id);

  const reservationUrl = new URL(`${supabaseUrl}/rest/v1/reservations`);
  reservationUrl.search = new URLSearchParams({
    select: 'id,customer_id,caterer_id,reservation_status,payment_status,booking_payment_method',
    id: `eq.${reservationId}`,
    customer_id: `eq.${customerId}`,
    limit: '1',
  }).toString();
  const reservationResponse = await fetch(reservationUrl, { headers: adminHeaders });
  const reservationData = await responseJson(reservationResponse);
  if (!reservationResponse.ok) {
    console.error(`Could not validate receipt reservation. HTTP ${reservationResponse.status}.`);
    return jsonResponse({ error: 'Could not validate this booking. Please try again.' }, 502);
  }
  if (!Array.isArray(reservationData) || !reservationData[0]) {
    return jsonResponse({ error: 'Booking not found.' }, 404);
  }
  const reservation = reservationData[0] as JsonRecord;
  if (paymentType === 'down_payment' && reservation.booking_payment_method !== 'gcash') {
    return jsonResponse({ error: 'This booking is not set up for GCash payment.' }, 422);
  }
  const paymentAvailable = paymentType === 'down_payment'
    ? reservation.reservation_status === 'pending' && reservation.payment_status === 'pending'
    : reservation.reservation_status === 'confirmed' && reservation.payment_status === 'partial';
  if (!paymentAvailable) {
    return jsonResponse({ error: 'This payment is not available for the selected booking.' }, 409);
  }

  const catererUrl = new URL(`${supabaseUrl}/rest/v1/caterers`);
  catererUrl.search = new URLSearchParams({
    select: 'gcash_qr_code',
    id: `eq.${String(reservation.caterer_id)}`,
    limit: '1',
  }).toString();
  const catererResponse = await fetch(catererUrl, { headers: adminHeaders });
  const catererData = await responseJson(catererResponse);
  if (!catererResponse.ok) {
    console.error(`Could not validate the GCash payment destination. HTTP ${catererResponse.status}.`);
    return jsonResponse({ error: 'Could not validate the GCash payment destination. Please try again.' }, 502);
  }
  if (!Array.isArray(catererData) || !catererData[0] || !(catererData[0] as JsonRecord).gcash_qr_code) {
    return jsonResponse({ error: 'This caterer has not added a GCash QR code.' }, 422);
  }

  const pendingUrl = new URL(`${supabaseUrl}/rest/v1/payments`);
  pendingUrl.search = new URLSearchParams({
    select: 'id',
    reservation_id: `eq.${reservationId}`,
    payment_type: `eq.${paymentType}`,
    payment_method: 'eq.gcash',
    payment_status: 'eq.pending',
    limit: '1',
  }).toString();
  const pendingResponse = await fetch(pendingUrl, { headers: adminHeaders });
  const pendingData = await responseJson(pendingResponse);
  if (!pendingResponse.ok) {
    console.error(`Could not check for a pending GCash receipt. HTTP ${pendingResponse.status}.`);
    return jsonResponse({ error: 'Could not check this payment. Please try again.' }, 502);
  }
  if (Array.isArray(pendingData) && pendingData.length > 0) {
    return jsonResponse({ error: 'A GCash receipt is already waiting for caterer review.' }, 409);
  }

  const sightengineForm = new FormData();
  sightengineForm.append('media', receipt, receipt.name);
  sightengineForm.append('models', 'genai');
  sightengineForm.append('api_user', sightengineUser);
  sightengineForm.append('api_secret', sightengineSecret);
  let screeningResponse: Response;
  try {
    screeningResponse = await fetch('https://api.sightengine.com/1.0/check.json', {
      method: 'POST',
      body: sightengineForm,
      signal: AbortSignal.timeout(35000),
    });
  } catch (reason) {
    console.error('Sightengine GCash receipt screening request failed.', reason);
    return jsonResponse({ error: 'Could not screen this receipt right now. Your receipt was not submitted; please try again.' }, 502);
  }
  const screeningData = await responseJson(screeningResponse);
  const screeningResult = screeningData && typeof screeningData === 'object' ? screeningData as JsonRecord : {};
  const screeningType = screeningResult.type && typeof screeningResult.type === 'object'
    ? screeningResult.type as JsonRecord
    : {};
  const aiProbability = Number(screeningType.ai_generated);
  if (
    !screeningResponse.ok
    || screeningResult.status !== 'success'
    || !Number.isFinite(aiProbability)
    || aiProbability < 0
    || aiProbability > 1
  ) {
    console.error(`Sightengine GCash receipt screening failed. HTTP ${screeningResponse.status}.`);
    return jsonResponse({ error: 'Could not screen this receipt right now. Your receipt was not submitted; please try again.' }, 502);
  }

  const extensionByMime: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  const receiptPath = `${authUserId}/${reservationId}/${crypto.randomUUID()}.${extensionByMime[receipt.type]}`;
  const encodedPath = receiptPath.split('/').map(encodeURIComponent).join('/');
  const storageResponse = await fetch(`${supabaseUrl}/storage/v1/object/gcash-payment-receipts/${encodedPath}`, {
    method: 'POST',
    headers: {
      ...supabaseHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`, receipt.type),
      'x-upsert': 'false',
    },
    body: receiptBytes,
  });
  if (!storageResponse.ok) {
    console.error(`GCash receipt storage upload failed. HTTP ${storageResponse.status}.`);
    return jsonResponse({ error: 'Could not save your receipt. Please try again.' }, 502);
  }

  const sightengineRequest = screeningResult.request && typeof screeningResult.request === 'object'
    ? screeningResult.request as JsonRecord
    : {};
  const probability = Math.round(aiProbability * 100000) / 100000;
  const checkResponse = await fetch(`${supabaseUrl}/rest/v1/gcash_receipt_ai_checks`, {
    method: 'POST',
    headers: { ...adminHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      receipt_path: receiptPath,
      customer_auth_user_id: authUserId,
      reservation_id: Number(reservationId),
      payment_type: paymentType,
      ai_generated_probability: probability,
      requires_manual_review: probability >= 0.3,
      sightengine_request_id: String(sightengineRequest.id ?? ''),
    }),
  });
  if (!checkResponse.ok) {
    await cleanupUnsubmittedReceipt(supabaseUrl, serviceRoleKey, receiptPath);
    console.error(`GCash receipt screening result could not be saved. HTTP ${checkResponse.status}.`);
    return jsonResponse({ error: 'The receipt screening result could not be saved. Please try again.' }, 502);
  }

  let submissionResponse: Response;
  try {
    submissionResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/submit_gcash_payment`, {
      method: 'POST',
      headers: supabaseHeaders(anonKey, authorization, 'application/json'),
      body: JSON.stringify({
        p_reservation_id: Number(reservationId),
        p_payment_type: paymentType,
        p_receipt_path: receiptPath,
      }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (reason) {
    console.error('GCash payment submission result is ambiguous; receipt and screening record were retained.', reason);
    return jsonResponse({
      error: 'We could not confirm whether your receipt was submitted. Refresh your bookings before trying again.',
    }, 502);
  }
  if (!submissionResponse.ok) {
    const submissionError = errorMessage(await responseJson(submissionResponse), 'Could not submit the GCash receipt.');
    await cleanupUnsubmittedReceipt(supabaseUrl, serviceRoleKey, receiptPath);
    return jsonResponse({ error: submissionError }, 422);
  }

  return jsonResponse({
    success: true,
    payment_id: await responseJson(submissionResponse),
    ai_generated_probability: probability,
    requires_manual_review: probability >= 0.3,
  });
});
