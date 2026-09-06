export default async function handler(req, res) {
  // Allow CORS for local dev / client calls
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { orderId, orderAmount, customerEmail, customerPhone, customerName } = req.body || {};

    if (!orderId || !orderAmount) {
      return res.status(400).json({ error: 'Missing orderId or orderAmount' });
    }

    const appId = process.env.CASHFREE_APP_ID;
    const secretKey = process.env.CASHFREE_SECRET_KEY;
    const env = process.env.CASHFREE_ENV || 'production';

    if (!appId || !secretKey) {
      return res.status(500).json({ error: 'Cashfree API credentials not configured on server' });
    }

    const baseUrl = env === 'sandbox' 
      ? 'https://sandbox.cashfree.com/pg' 
      : 'https://api.cashfree.com/pg';

    const safePhone = (customerPhone && /^[6-9]\d{9}$/.test(customerPhone.trim()))
      ? customerPhone.trim()
      : '9999999999';

    const cleanEmail = (customerEmail && customerEmail.includes('@'))
      ? customerEmail.trim().toLowerCase()
      : 'customer@tamilmarketing.in';

    const payload = {
      order_id: String(orderId),
      order_amount: parseFloat(Number(orderAmount).toFixed(2)),
      order_currency: 'INR',
      customer_details: {
        customer_id: 'cust_' + String(orderId).replace(/[^a-zA-Z0-9_-]/g, '_'),
        customer_name: (customerName && customerName.trim()) || 'Tamil Marketing Customer',
        customer_email: cleanEmail,
        customer_phone: safePhone
      },
      order_meta: {
        payment_methods: 'upi,cc,dc,nb,app'
      }
    };

    const response = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: {
        'x-client-id': appId,
        'x-client-secret': secretKey,
        'x-api-version': '2023-08-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Cashfree order creation error:', data);
      return res.status(response.status).json({
        error: data.message || 'Failed to create Cashfree payment order',
        details: data
      });
    }

    return res.status(200).json({
      success: true,
      order_id: data.order_id,
      cf_order_id: data.cf_order_id,
      payment_session_id: data.payment_session_id,
      order_amount: data.order_amount,
      order_currency: data.order_currency
    });

  } catch (error) {
    console.error('Server error creating Cashfree order:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
