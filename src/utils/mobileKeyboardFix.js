/**
 * Mobile Keyboard Fix for Chat Modal
 * Dynamically adjusts chat modal height when mobile keyboard appears
 */

export class MobileKeyboardFix {
  constructor() {
    this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    this.originalHeight = null;
    this.keyboardVisible = false;
    
    if (this.isMobile) {
      this.init();
    }
  }

  init() {
    // Listen for keyboard events
    if ('visualViewport' in window) {
      window.visualViewport.addEventListener('resize', this.handleViewportResize.bind(this));
    }
    
    // Fallback for older browsers
    window.addEventListener('resize', this.handleWindowResize.bind(this));
    
    // Focus/blur events for input fields
    document.addEventListener('focusin', this.handleFocusIn.bind(this));
    document.addEventListener('focusout', this.handleFocusOut.bind(this));
  }

  handleViewportResize() {
    const viewport = window.visualViewport;
    const keyboardHeight = window.innerHeight - viewport.height;
    
    if (keyboardHeight > 100) { // Keyboard is likely visible
      this.adjustModalForKeyboard(keyboardHeight);
    } else {
      this.restoreModalHeight();
    }
  }

  handleWindowResize() {
    const windowHeight = window.innerHeight;
    const screenHeight = screen.height;
    
    // Estimate keyboard height based on window resize
    if (this.originalHeight && windowHeight < this.originalHeight * 0.8) {
      const keyboardHeight = this.originalHeight - windowHeight;
      this.adjustModalForKeyboard(keyboardHeight);
    } else {
      this.restoreModalHeight();
    }
  }

  handleFocusIn(event) {
    if (event.target.matches('.chat-input, .chat-input-form input, .chat-input-form textarea')) {
      this.keyboardVisible = true;
      setTimeout(() => {
        this.scrollInputIntoView();
      }, 100);
    }
  }

  handleFocusOut(event) {
    if (event.target.matches('.chat-input, .chat-input-form input, .chat-input-form textarea')) {
      this.keyboardVisible = false;
      this.restoreModalHeight();
    }
  }

  adjustModalForKeyboard(keyboardHeight) {
    const modals = document.querySelectorAll('.chat-modal-content');
    modals.forEach(modal => {
      if (!this.originalHeight) {
        this.originalHeight = modal.style.height || getComputedStyle(modal).height;
      }
      
      const newHeight = `calc(100vh - ${keyboardHeight + 60}px)`;
      modal.style.height = newHeight;
      modal.style.maxHeight = newHeight;
      modal.style.marginBottom = `${keyboardHeight + 20}px`;
    });
  }

  restoreModalHeight() {
    const modals = document.querySelectorAll('.chat-modal-content');
    modals.forEach(modal => {
      modal.style.height = '';
      modal.style.maxHeight = '';
      modal.style.marginBottom = '';
    });
  }

  scrollInputIntoView() {
    const input = document.querySelector('.chat-input, .chat-input-form input, .chat-input-form textarea');
    if (input) {
      input.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }

  // Static method to apply fix to specific modal
  static applyToModal(modalSelector) {
    const modal = document.querySelector(modalSelector);
    if (modal) {
      const fix = new MobileKeyboardFix();
      return fix;
    }
    return null;
  }
}

// Auto-initialize on mobile devices
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    new MobileKeyboardFix();
  });
}

export default MobileKeyboardFix;
