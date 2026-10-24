/**
 * Google Analytics 4 (GA4) & Meta Pixel (Facebook Pixel) Tracking Module
 * Supports automatic script injection, eCommerce standard events, and safe fallbacks.
 */

window.StoreTracking = (function() {
  let gaId = '';
  let metaPixelId = '';
  let isInitialized = false;

  async function init() {
    if (isInitialized) return;
    try {
      const res = await fetch('/api/config');
      const config = await res.json();
      
      gaId = config.tracking?.gaMeasurementId || '';
      metaPixelId = config.tracking?.metaPixelId || '';

      if (gaId && !gaId.includes('DEMOTEST') && !gaId.includes('XXXXX')) {
        injectGA(gaId);
      } else {
        console.log('ℹ️ Google Analytics configured with ID:', gaId || 'None');
      }

      if (metaPixelId && !metaPixelId.includes('123456789012345')) {
        injectMetaPixel(metaPixelId);
      } else {
        console.log('ℹ️ Meta Pixel configured with ID:', metaPixelId || 'None');
      }

      isInitialized = true;
    } catch (err) {
      console.warn('Tracking initialization notice:', err.message);
    }
  }

  // 1. Inject Google Tag (gtag.js)
  function injectGA(id) {
    window.dataLayer = window.dataLayer || [];
    function gtag(){ window.dataLayer.push(arguments); }
    window.gtag = gtag;

    gtag('js', new Date());
    gtag('config', id, { send_page_view: true });

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(script);
    console.log('✅ Google Analytics 4 (GA4) Active:', id);
  }

  // 2. Inject Meta Pixel (fbq)
  function injectMetaPixel(pixelId) {
    if (window.fbq) return;
    
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');

    window.fbq('init', pixelId);
    window.fbq('track', 'PageView');
    console.log('✅ Meta Pixel Active:', pixelId);
  }

  // Helper methods for eCommerce events
  return {
    init: init,

    // Track View Content (on Landing Page)
    trackViewContent: function(productName = 'AI Digital Business Guide', price = 199) {
      init().then(() => {
        if (window.gtag) {
          window.gtag('event', 'view_item', {
            currency: 'INR',
            value: price,
            items: [{ item_name: productName, price: price }]
          });
        }
        if (window.fbq) {
          window.fbq('track', 'ViewContent', {
            content_name: productName,
            value: price,
            currency: 'INR'
          });
        }
      });
    },

    // Track Initiate Checkout (when entering checkout page)
    trackInitiateCheckout: function(price = 199) {
      init().then(() => {
        if (window.gtag) {
          window.gtag('event', 'begin_checkout', {
            currency: 'INR',
            value: price,
            items: [{ item_name: 'AI Digital Business Guide', price: price }]
          });
        }
        if (window.fbq) {
          window.fbq('track', 'InitiateCheckout', {
            value: price,
            currency: 'INR'
          });
        }
      });
    },

    // Track Order Bump Add/Remove
    trackOrderBump: function(isAdded, bumpPrice = 99) {
      if (isAdded) {
        if (window.gtag) {
          window.gtag('event', 'add_to_cart', {
            currency: 'INR',
            value: bumpPrice,
            items: [{ item_name: '500+ AI Prompt Vault', price: bumpPrice }]
          });
        }
        if (window.fbq) {
          window.fbq('track', 'AddToCart', {
            content_name: '500+ AI Prompt Vault',
            value: bumpPrice,
            currency: 'INR'
          });
        }
      }
    },

    // Track Purchase (on Success Page)
    trackPurchase: function(orderId, totalValue = 199, currency = 'INR') {
      init().then(() => {
        if (window.gtag) {
          window.gtag('event', 'purchase', {
            transaction_id: orderId,
            value: totalValue,
            currency: currency,
            items: [{ item_name: 'AI Digital Business Guide & Bonuses', price: totalValue }]
          });
        }
        if (window.fbq) {
          window.fbq('track', 'Purchase', {
            value: totalValue,
            currency: currency,
            content_name: 'AI Digital Business Guide',
            order_id: orderId
          });
        }
        console.log(`🎯 Purchase Event Tracked: Order ${orderId}, Value: ₹${totalValue}`);
      });
    }
  };
})();

// Auto initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.StoreTracking.init();
});
