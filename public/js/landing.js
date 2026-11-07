/**
 * Landing page interactions
 */

document.addEventListener('DOMContentLoaded', () => {
  initFAQ();
});

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
