const Notifications = (function() {
  const TOAST_DURATION = 3000;
  const container = null;

  const ICONS = {
    success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
    error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
    warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
    points: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>',
    timer: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>'
  };

  function getContainer() {
    return document.getElementById('toastContainer');
  }

  function show(message, type = 'info', duration = TOAST_DURATION, icon = null) {
    const container = getContainer();
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');

    const iconHtml = icon || ICONS[type] || ICONS.info;
    toast.innerHTML = `
      <span class="toast-icon">${iconHtml}</span>
      <span class="toast-message">${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      hide(toast);
    }, duration);

    return toast;
  }

  function hide(toast) {
    if (!toast || !toast.parentNode) return;
    
    toast.classList.add('hiding');
    
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function success(message, duration) {
    return show(message, 'success', duration);
  }

  function error(message, duration) {
    return show(message, 'error', duration || 5000);
  }

  function warning(message, duration) {
    return show(message, 'warning', duration);
  }

  function info(message, duration) {
    return show(message, 'info', duration);
  }

  function points(points, duration) {
    return show(`+${points} точки`, 'success', duration, ICONS.points);
  }

  function timeUp() {
    return show('Времето изтече!', 'warning', 3000, ICONS.timer);
  }

  function answerSubmitted() {
    return show('Отговорът е изпратен!', 'success', 2000);
  }

  function connectionError() {
    return show('Грешка при свързване', 'error', 5000);
  }

  function reconnecting(attempt) {
    return show(`Опит за свързване... (${attempt})`, 'warning', 2000);
  }

  function reconnected() {
    return show('Свързахте се отново!', 'success', 2000);
  }

  function clearAll() {
    const container = getContainer();
    if (!container) return;
    
    const toasts = container.querySelectorAll('.toast');
    toasts.forEach(toast => hide(toast));
  }

  return {
    show,
    hide,
    success,
    error,
    warning,
    info,
    points,
    timeUp,
    answerSubmitted,
    connectionError,
    reconnecting,
    reconnected,
    clearAll
  };
})();

const Confetti = (function() {
  const COLORS = ['#f59e0b', '#fbbf24', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444'];
  
  function createParticle(container) {
    const particle = document.createElement('div');
    particle.className = 'confetti';
    
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const left = Math.random() * 100;
    const delay = Math.random() * 2;
    const duration = 2 + Math.random() * 2;
    const size = 5 + Math.random() * 10;
    
    particle.style.cssText = `
      left: ${left}%;
      top: -10px;
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      animation-delay: ${delay}s;
      animation-duration: ${duration}s;
      border-radius: ${Math.random() > 0.5 ? '50%' : '0'};
    `;
    
    container.appendChild(particle);
    
    setTimeout(() => {
      if (particle.parentNode) {
        particle.parentNode.removeChild(particle);
      }
    }, (delay + duration) * 1000);
  }

  function burst(container, count = 50) {
    for (let i = 0; i < count; i++) {
      setTimeout(() => createParticle(container), i * 20);
    }
  }

  function celebrate(container) {
    burst(container, 100);
    
    setTimeout(() => burst(container, 50), 500);
    setTimeout(() => burst(container, 50), 1000);
  }

  function winnerCelebration(container) {
    celebrate(container);
    
    setTimeout(() => burst(container, 30), 2000);
    setTimeout(() => burst(container, 30), 2500);
  }

  function clear(container) {
    if (!container) return;
    container.innerHTML = '';
  }

  return {
    burst,
    celebrate,
    winnerCelebration,
    clear
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Notifications, Confetti };
}
