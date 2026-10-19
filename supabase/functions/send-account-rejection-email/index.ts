const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function escapeHtml(value: string) {
  const replacements: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (character) => replacements[character] ?? character);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  const authorization = request.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const fromAddress = Deno.env.get('ACCOUNT_REJECTION_FROM');
  if (!authorization?.startsWith('Bearer ')) return jsonResponse({ error: 'Authentication required.' }, 401);
  if (!supabaseUrl || !supabaseAnonKey || !resendApiKey || !fromAddress) {
    console.error('Account rejection email function is missing required configuration.');
    return jsonResponse({ error: 'Email service is not configured.' }, 500);
  }

  let requestBody: { accountType?: string; accountProfileId?: number | string };
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonResponse({ error: 'Invalid request body.' }, 400);
    }
    requestBody = body as { accountType?: string; accountProfileId?: number | string };
  } catch {
    return jsonResponse({ error: 'Invalid request body.' }, 400);
  }

  const { accountType, accountProfileId } = requestBody;
  if (
    (accountType !== 'customer' && accountType !== 'caterer')
    || !/^\d+$/.test(String(accountProfileId ?? ''))
  ) {
    return jsonResponse({ error: 'A valid account type and profile ID are required.' }, 400);
  }

  const supabaseHeaders = {
    apikey: supabaseAnonKey,
    Authorization: authorization,
    'Content-Type': 'application/json',
  };

  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: supabaseHeaders,
  });
  if (!authResponse.ok) return jsonResponse({ error: 'Your session is invalid or expired.' }, 401);

  const accountsResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/get_admin_accounts`, {
    method: 'POST',
    headers: supabaseHeaders,
    body: '{}',
  });
  if (!accountsResponse.ok) {
    return jsonResponse({ error: 'Only an administrator can send account rejection notices.' }, 403);
  }

  const accounts: Record<string, unknown>[] = await accountsResponse.json();
  if (!Array.isArray(accounts)) return jsonResponse({ error: 'Unable to verify the rejected account.' }, 502);
  const account = accounts.find((item: Record<string, unknown>) =>
    item.role === accountType
    && String(item[accountType === 'customer' ? 'customer_id' : 'caterer_id']) === String(accountProfileId)
  );
  if (!account || account[accountType === 'customer' ? 'customer_verified' : 'caterer_verified'] !== false) {
    return jsonResponse({ error: 'The rejected account could not be verified.' }, 404);
  }

  const recipientEmail = typeof account.email === 'string' ? account.email : '';
  const rejectionReason = typeof account.rejection_reason === 'string' ? account.rejection_reason : '';
  const recipientName = accountType === 'customer' ? account.full_name : account.business_name;
  if (!recipientEmail || !rejectionReason) {
    return jsonResponse({ error: 'The account rejection details are incomplete.' }, 422);
  }

  const safeName = escapeHtml(typeof recipientName === 'string' && recipientName ? recipientName : 'there');
  const safeReason = escapeHtml(rejectionReason);
  const message = accountType === 'customer' ? 'customer account' : 'caterer application';
  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [recipientEmail],
      subject: 'Update on your CaterAI account verification',
      text: `Hello ${typeof recipientName === 'string' && recipientName ? recipientName : 'there'},\n\nAfter reviewing your ${message}, we are unable to approve it at this time.\n\nReason: ${rejectionReason}\n\nYou may update your information and contact CaterAI support if you need assistance.`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#25232b"><h2>CaterAI account update</h2><p>Hello ${safeName},</p><p>After reviewing your ${message}, we are unable to approve it at this time.</p><p><strong>Reason:</strong> ${safeReason}</p><p>You may update your information and contact CaterAI support if you need assistance.</p></div>`,
    }),
  });

  if (!emailResponse.ok) {
    console.error(`Resend rejected an account rejection email with status ${emailResponse.status}.`);
    return jsonResponse({ error: 'The email provider could not send the rejection notice.' }, 502);
  }

  return jsonResponse({ sent: true });
});
