/**
 * Landing Page Interactive Scripts
 * Urgency Countdown, Social Proof Notifications, FAQ Accordion
 */

document.addEventListener('DOMContentLoaded', () => {
  initCountdown();
  initFAQ();
  initSocialProofToast();
});

// 1. Urgency Countdown Timer (15 Minutes Rolling Timer)
function initCountdown() {
  const minsEl = document.getElementById('count-mins');
  const secsEl = document.getElementById('count-secs');
  if (!minsEl || !secsEl) return;

  let totalSeconds = 14 * 60 + 45; // 14 mins 45 seconds

  const timer = setInterval(() => {
    if (totalSeconds <= 0) {
      totalSeconds = 15 * 60; // reset for perpetual urgency
    }
    totalSeconds--;

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    minsEl.textContent = minutes < 10 ? '0' + minutes : minutes;
    secsEl.textContent = seconds < 10 ? '0' + seconds : seconds;
  }, 1000);
}

// 2. FAQ Accordion Toggle
function initFAQ() {
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    if (!question) return;

    question.addEventListener('click', () => {
      const isOpen = item.classList.contains('active');
      // Close other items
      faqItems.forEach(i => i.classList.remove('active'));
      if (!isOpen) {
        item.classList.add('active');
      }
    });
  });
}

// 3. Social Proof Real-time Popups
function initSocialProofToast() {
  const toast = document.getElementById('live-toast');
  if (!toast) return;

  const buyers = [
    { name: 'राहुल शर्मा', city: 'दिल्ली', time: '2 मिनट पहले' },
    { name: 'प्रिया पटेल', city: 'अहमदाबाद', time: '4 मिनट पहले' },
    { name: 'अमित वर्मा', city: 'लखनऊ', time: '1 मिनट पहले' },
    { name: 'रोहित सिंह', city: 'जयपुर', time: '6 मिनट पहले' },
    { name: 'विकास यादव', city: 'पटना', time: '3 मिनट पहले' },
    { name: 'नेहा कुलकर्णी', city: 'पुणे', time: '5 मिनट पहले' },
    { name: 'संदीप बिष्ट', city: 'देहरादून', time: '2 मिनट पहले' },
    { name: 'मोहित गुप्ता', city: 'इंदौर', time: '7 मिनट पहले' }
  ];

  let index = 0;

  function showToast() {
    const buyer = buyers[index % buyers.length];
    index++;

    const titleEl = document.getElementById('toast-title');
    const timeEl = document.getElementById('toast-time');

    if (titleEl && timeEl) {
      titleEl.textContent = `${buyer.name} (${buyer.city}) ने अभी ई-बुक खरीदी`;
      timeEl.textContent = `✓ सत्यापित खरीद • ${buyer.time}`;
    }

    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');
    }, 4500);
  }

  // Initial trigger after 4 seconds, then repeat every 14 seconds
  setTimeout(() => {
    showToast();
    setInterval(showToast, 14000);
  }, 4000);
}
