export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const orderId = req.query.orderId;
  if (!orderId) {
    return res.status(400).json({ error: 'Missing orderId' });
  }

  const appId = process.env.CASHFREE_APP_ID;
  const secretKey = process.env.CASHFREE_SECRET_KEY;
  const env = process.env.CASHFREE_ENV || 'production';

  if (!appId || !secretKey) {
    return res.status(500).json({ error: 'Cashfree API credentials missing on server' });
  }

  const baseUrl = env === 'sandbox' 
    ? 'https://sandbox.cashfree.com/pg' 
    : 'https://api.cashfree.com/pg';

  try {
    const response = await fetch(`${baseUrl}/orders/${encodeURIComponent(orderId)}`, {
      method: 'GET',
      headers: {
        'x-client-id': appId,
        'x-client-secret': secretKey,
        'x-api-version': '2023-08-01',
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Cashfree order fetch error:', data);
      return res.status(response.status).json({
        error: data.message || 'Unable to fetch order from Cashfree',
        details: data
      });
    }

    const isPaid = data.order_status === 'PAID';

    return res.status(200).json({
      success: true,
      order_id: data.order_id,
      cf_order_id: data.cf_order_id,
      order_status: data.order_status,
      order_amount: data.order_amount,
      isPaid: isPaid
    });

  } catch (error) {
    console.error('Server error checking Cashfree order:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
