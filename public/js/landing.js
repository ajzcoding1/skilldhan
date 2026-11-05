/**
 * Landing page interactions
 */

document.addEventListener('DOMContentLoaded', () => {
  initFAQ();
  initVerifiedPurchaseToast();
});

async function initVerifiedPurchaseToast() {
  const toast = document.getElementById('buyer-toast');
  if (!toast) return;

  const labelElement = document.getElementById('buyer-toast-label');
  const messageElement = document.getElementById('buyer-toast-message');
  const timeElement = document.getElementById('buyer-toast-time');
  const cta = document.getElementById('buyer-toast-cta');
  const closeButton = toast.querySelector('.buyer-toast-close');
  let dismissed = false;
  let nextTimer;
  let hideTimer;

  function formatTimeAgo(paidAt) {
    const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(paidAt)) / 60000));
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  closeButton.addEventListener('click', function dismissToast() {
    dismissed = true;
    window.clearTimeout(nextTimer);
    window.clearTimeout(hideTimer);
    toast.hidden = true;
  });

  try {
    const response = await fetch('/api/recent-purchases', { cache: 'no-store' });
    if (!response.ok) throw new Error('Recent purchase request failed.');
    const data = await response.json();
    if (!Array.isArray(data.purchases)) throw new Error('Recent purchase response is invalid.');

    const purchases = data.purchases.filter(purchase =>
      purchase &&
      typeof purchase.paidAt === 'string' &&
      Number.isFinite(Date.parse(purchase.paidAt)) &&
      Date.parse(purchase.paidAt) <= Date.now() &&
      Date.now() - Date.parse(purchase.paidAt) <= 7 * 24 * 60 * 60 * 1000
    );
    if (purchases.length === 0) {
      labelElement.textContent = 'A practical starter bundle';
      messageElement.textContent = 'Get the AI Digital Business Guide + 4 bonus resources for ₹199.';
      timeElement.textContent = 'One-time purchase · Secure checkout';
      cta.hidden = false;
      toast.hidden = false;
      hideTimer = window.setTimeout(() => {
        toast.hidden = true;
      }, 9000);
      return;
    }

    let index = 0;
    function showNextPurchase() {
      if (dismissed || index >= purchases.length) return;

      labelElement.textContent = 'Verified purchase';
      messageElement.textContent = 'A customer purchased the AI Digital Business Guide.';
      timeElement.textContent = formatTimeAgo(purchases[index].paidAt);
      cta.hidden = true;
      toast.hidden = false;
      index += 1;

      hideTimer = window.setTimeout(() => {
        toast.hidden = true;
        if (index < purchases.length && !dismissed) {
          nextTimer = window.setTimeout(showNextPurchase, 18000);
        }
      }, 6500);
    }

    nextTimer = window.setTimeout(showNextPurchase, 4000);
  } catch (error) {
    console.warn('Verified purchase notifications are unavailable:', error.message);
  }
}

function initFAQ() {
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    if (!question) return;

    question.addEventListener('click', () => {
      const isOpen = item.classList.contains('active');
      faqItems.forEach(faqItem => {
        faqItem.classList.remove('active');
        const button = faqItem.querySelector('.faq-question');
        if (button) button.setAttribute('aria-expanded', 'false');
        const answer = faqItem.querySelector('.faq-answer');
        if (answer) {
          answer.setAttribute('aria-hidden', 'true');
          answer.setAttribute('inert', '');
        }
      });
      if (!isOpen) {
        item.classList.add('active');
        question.setAttribute('aria-expanded', 'true');
        const answer = item.querySelector('.faq-answer');
        if (answer) {
          answer.setAttribute('aria-hidden', 'false');
          answer.removeAttribute('inert');
        }
      }
    });
  });
}
