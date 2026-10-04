// Tamil Marketing - Backend Visitor & Meta Ads Device Tracking API
// Deduplicates devices, filters bots, identifies Meta Ads traffic, and sets persistent device cookie

// Known bot/crawler patterns to filter out automated traffic (preserving real Instagram & Facebook in-app users)
const BOT_REGEX = /bot|crawler|spider|crawling|googlebot|bingbot|yandex|baidu|slurp|duckduckbot|facebookexternalhit|meta-externalagent|facebot|facebookcatalog|instagrambot|whatsapp|telegrambot|twitterbot|pinterestbot|slackbot|applebot|ahrefs|semrush|dotbot|screaming frog|headlesschrome|phantomjs|puppeteer|selenium|curl|wget|python|axios|go-http-client/i;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userAgent = req.headers['user-agent'] || '';
    
    // 1. Bot & Crawler Detection (Exclude automated traffic to count only REAL people)
    if (BOT_REGEX.test(userAgent)) {
      return res.status(200).json({
        success: false,
        isBot: true,
        message: 'Bot/crawler ignored to preserve accurate real user counts'
      });
    }

    const payload = req.method === 'POST' ? (req.body || {}) : (req.query || {});
    let {
      deviceId,
      url,
      referrer,
      screen,
      language,
      platform,
      browser,
      isNewDevice
    } = payload;

    // 2. Cookie inspection for persistent device identity
    const cookiesHeader = req.headers['cookie'] || '';
    const cookieMatch = cookiesHeader.match(/(?:^|;\s*)_tm_did=([^;]+)/);
    const cookieDeviceId = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;

    if (!deviceId && cookieDeviceId) {
      deviceId = cookieDeviceId;
    }

    // If still no device ID, generate one on the backend
    if (!deviceId || typeof deviceId !== 'string' || deviceId.trim().length < 6) {
      deviceId = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 10);
      isNewDevice = true;
    } else {
      deviceId = deviceId.trim();
    }

    // 3. Extract & analyze Meta Ads signals
    const parsedUrl = url ? new URL(url, 'https://tamilmarketing.in') : null;
    const searchParams = parsedUrl ? parsedUrl.searchParams : new URLSearchParams();

    const fbclid = searchParams.get('fbclid') || '';
    const utmSource = (searchParams.get('utm_source') || '').toLowerCase();
    const utmMedium = (searchParams.get('utm_medium') || '').toLowerCase();
    const utmCampaign = searchParams.get('utm_campaign') || '';
    const utmContent = searchParams.get('utm_content') || '';
    const utmTerm = searchParams.get('utm_term') || '';

    const refStr = (referrer || req.headers['referer'] || '').toLowerCase();
    const isMetaReferrer = refStr.includes('facebook.com') ||
                           refStr.includes('instagram.com') ||
                           refStr.includes('l.facebook.com') ||
                           refStr.includes('lm.facebook.com') ||
                           refStr.includes('l.instagram.com') ||
                           refStr.includes('fb.me');

    const isMetaUtm = ['facebook', 'meta', 'fb', 'instagram', 'ig'].includes(utmSource) ||
                      ['cpc', 'paid', 'paid_social', 'meta_ads', 'facebook_ad', 'instagram_ad'].includes(utmMedium);

    const isMetaApp = /\[FBAN\/|\[FB_IAB\/|Instagram/i.test(userAgent);

    const isMeta = Boolean(fbclid || isMetaUtm || isMetaReferrer || isMetaApp);

    let metaSourceDetail = 'organic_direct';
    if (fbclid) {
      metaSourceDetail = refStr.includes('instagram') ? 'meta_instagram_ad' : 'meta_facebook_ad';
    } else if (isMetaUtm) {
      metaSourceDetail = utmSource ? `meta_${utmSource}` : 'meta_ads';
    } else if (isMetaReferrer) {
      metaSourceDetail = refStr.includes('instagram') ? 'meta_instagram_referral' : 'meta_facebook_referral';
    } else if (isMetaApp) {
      metaSourceDetail = /Instagram/i.test(userAgent) ? 'meta_instagram_inapp' : 'meta_facebook_inapp';
    }

    // 4. Device & Client Environment Parsing
    const isMobile = /mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(userAgent) ||
                     (platform && platform.toLowerCase().includes('mobile'));
    const resolvedDeviceType = isMobile ? 'mobile' : 'desktop';

    // Set first-party HTTP cookie for persistent device identity across visits (1 year)
    res.setHeader('Set-Cookie', [
      `_tm_did=${encodeURIComponent(deviceId)}; Path=/; Max-Age=31536000; SameSite=Lax`,
      isMeta ? `_tm_meta_src=${encodeURIComponent(metaSourceDetail)}; Path=/; Max-Age=31536000; SameSite=Lax` : ''
    ].filter(Boolean));

    return res.status(200).json({
      success: true,
      deviceId,
      isNewDevice: Boolean(isNewDevice),
      isMeta,
      metaSourceDetail,
      metaDetails: {
        hasFbclid: Boolean(fbclid),
        utmSource: utmSource || (isMetaReferrer ? (refStr.includes('instagram') ? 'instagram' : 'facebook') : ''),
        utmMedium,
        utmCampaign: utmCampaign || (fbclid ? 'Meta Ad Click' : ''),
        utmContent,
        utmTerm
      },
      deviceInfo: {
        deviceType: resolvedDeviceType,
        browser: browser || 'Unknown',
        platform: platform || 'Unknown'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Track visit error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
