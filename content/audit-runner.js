// @ts-nocheck

/**
 * WCAG 2.2 Accessibility Compliance Injected Auditor
 * Executes axe-core against WCAG 2.2 AA rules, evaluates interactive :hover contrast,
 * audits ARIA labels for semantic accuracy and WCAG 2.5.3 (Label in Name),
 * and audits Screen Reader & VoiceOver compatibility.
 */

(function () {
  /**
   * Latest normative WCAG 2.2 AA, 2.1 AA, 2.0 AA tags (excludes non-normative best practices)
   */
  const WCAG_22_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

  /**
   * Identifies elements that belong to the extension's HUDs, overlays, or injected UI
   */
  function isExtensionElement(el) {
    if (!el) return false;
    if (el.closest) {
      if (el.closest('[data-auditforge-ext="true"]')) return true;
      if (el.closest('#__auditforge_mobile_sim_root__')) return true;
      if (el.closest('#__auditforge_overlay_root__')) return true;
      if (el.closest('#__auditforge_highlighter_root__')) return true;
      if (el.closest('#__auditforge_voiceover_hud__')) return true;
      if (el.closest('#__auditforge_tab_trail_svg__')) return true;
      if (el.closest('.af-mob-drawer') || el.closest('.af-mob-chassis') || el.closest('.af-mob-header')) return true;
      if (el.closest('[id*="__auditforge"]') || el.closest('[id*="__af_"]')) return true;
    }
    const id = el.id || '';
    if (id.includes('__auditforge') || id.includes('__af_')) return true;
    return false;
  }

  function parseColor(col) {
    if (!col || typeof col !== 'string') return [0, 0, 0];
    col = col.trim();
    if (col.startsWith('#')) {
      let hex = col.slice(1);
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      if (hex.length === 8) hex = hex.slice(0, 6);
      const num = parseInt(hex.slice(0, 6), 16);
      return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    }
    const match = col.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (match) {
      return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
    }
    return [0, 0, 0];
  }

  function channelLuminance(c) {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }

  function relativeLuminance([r, g, b]) {
    return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
  }

  function getContrastRatio(rgb1, rgb2) {
    const l1 = relativeLuminance(rgb1);
    const l2 = relativeLuminance(rgb2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function rgbToHex([r, g, b]) {
    return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
  }

  function calculateColorContrastFix(fgStr, bgStr, expectedRatioStr = '4.5:1') {
    const minRatio = parseFloat(expectedRatioStr) || 4.5;
    const fg = parseColor(fgStr);
    const bg = parseColor(bgStr);
    const curRatio = getContrastRatio(fg, bg);

    const bgLum = relativeLuminance(bg);
    const shouldDarken = bgLum > 0.179;
    const targetRatio = Math.max(minRatio, 4.65);
    let bestFg = [...fg];
    let bestRatio = curRatio;

    for (let step = 1; step <= 100; step++) {
      const factor = step / 100;
      const testFg = shouldDarken
        ? fg.map(c => c * (1 - factor))
        : fg.map(c => c + (255 - c) * factor);
      const r = getContrastRatio(testFg, bg);
      if (r >= targetRatio) {
        bestFg = testFg;
        bestRatio = r;
        break;
      }
    }

    const suggestedHex = rgbToHex(bestFg);
    const fgHex = rgbToHex(fg);
    const bgHex = rgbToHex(bg);

    return {
      currentFg: fgHex,
      currentBg: bgHex,
      currentRatio: `${curRatio.toFixed(2)}:1`,
      requiredRatio: `${minRatio.toFixed(1)}:1`,
      suggestedFg: suggestedHex,
      suggestedRatio: `${bestRatio.toFixed(2)}:1`,
      cssFix: `color: ${suggestedHex}; /* Meets WCAG AA (${bestRatio.toFixed(2)}:1 vs ${minRatio.toFixed(1)}:1 required) */`,
    };
  }

  /**
   * Identifies whether a given DOM element is an internal artifact of the extension UI
   * (e.g. Tab Trail toolbar/badges, spotlight overlay, diagnostic panels, toasts, etc.)
   * @param {Element|null} el
   * @returns {boolean}
   */
  function isExtensionElement(el) {
    if (!el || el === document.documentElement || el === document.body) return false;
    try {
      if (el.id && (el.id.startsWith('__auditforge') || el.id.startsWith('__af_'))) return true;
      const cls = (typeof el.className === 'string' ? el.className : (el.getAttribute ? el.getAttribute('class') : '')) || '';
      if (cls.includes('__auditforge') || cls.includes('__af_')) return true;
      if (typeof el.closest === 'function') {
        return !!el.closest('[id^="__auditforge"], [id^="__af_"], [class*="__auditforge"], [class*="__af_"]');
      }
    } catch (_) {}
    return false;
  }

  function getUniqueSelector(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    let path = [];
    let cur = el;
    while (cur && cur.nodeType === Node.ELEMENT_NODE && cur !== document.body && cur !== document.documentElement) {
      let sel = cur.tagName.toLowerCase();
      if (cur.id) {
        sel += `#${CSS.escape(cur.id)}`;
        path.unshift(sel);
        break;
      } else {
        let sibling = cur;
        let nth = 1;
        while ((sibling = sibling.previousElementSibling)) {
          if (sibling.tagName === cur.tagName) nth++;
        }
        sel += `:nth-of-type(${nth})`;
      }
      path.unshift(sel);
      cur = cur.parentElement;
    }
    return path.join(' > ');
  }

  /**
   * Resolves the accessible name for a given DOM element according to
   * the Accessible Name and Description Computation (AccName) specification.
   * @param {Element} el
   * @returns {string}
   */
  function getAccessibleNameForElement(el) {
    if (!el) return '';

    // 1. aria-labelledby (highest precedence)
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const ids = labelledBy.split(/\s+/).filter(Boolean);
      const parts = ids.map(id => {
        const ref = document.getElementById(id);
        return ref ? (ref.innerText || ref.textContent || '').trim() : '';
      }).filter(Boolean);
      if (parts.length > 0) return parts.join(' ');
    }

    // 2. aria-label
    const ariaLabel = (el.getAttribute('aria-label') || '').trim();
    if (ariaLabel) return ariaLabel;

    // 3. Form input / control values or associated labels
    const tag = el.tagName.toLowerCase();
    if (['input', 'select', 'textarea'].includes(tag)) {
      if (tag === 'input') {
        const type = (el.getAttribute('type') || 'text').toLowerCase();
        if (['button', 'submit', 'reset'].includes(type) && el.value) {
          return el.value.trim();
        }
      }
      const labelEl = (el.labels && el.labels[0])
        ? el.labels[0]
        : (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : el.closest('label'));
      if (labelEl) {
        const lblText = (labelEl.innerText || labelEl.textContent || '').trim();
        if (lblText) return lblText;
      }
      const ph = el.getAttribute('placeholder');
      if (ph) return ph.trim();
    }

    // 4. Embedded SVG <title> or <desc>
    const svgTitle = el.querySelector('svg > title, svg title');
    if (svgTitle) {
      const titleText = (svgTitle.textContent || '').trim();
      if (titleText) return titleText;
    }

    // 5. Embedded img with alt attribute
    const img = el.querySelector('img[alt]');
    if (img) {
      const altText = (img.getAttribute('alt') || '').trim();
      if (altText) return altText;
    }

    // 6. Child element with aria-label
    const childWithAria = el.querySelector('[aria-label]');
    if (childWithAria) {
      const childLabel = (childWithAria.getAttribute('aria-label') || '').trim();
      if (childLabel) return childLabel;
    }

    // 7. Rendered text or textContent (captures .sr-only / visually-hidden text)
    const text = (el.innerText || el.textContent || '').trim();
    if (text) return text;

    // 8. Fallback to title attribute
    const titleAttr = (el.getAttribute('title') || '').trim();
    if (titleAttr) return titleAttr;

    return '';
  }

  function getRemediationSnippet(id, html = '') {
    switch (id) {
      case 'color-contrast':
        return `/* Increase contrast to satisfy WCAG AA (minimum 4.5:1 ratio) */\ncolor: #111827;\nbackground-color: #FFFFFF;`;
      case 'color-contrast-hover':
        return `/* Increase hover-state contrast to satisfy WCAG AA (minimum 4.5:1 ratio) */\nbutton:hover, a:hover {\n  background-color: #0F172A;\n  color: #FFFFFF; /* High contrast text */\n}`;
      case 'screen-reader-alt-quality':
        return `<!-- Provide clear, natural alt text without file extensions or redundant prefixes (WCAG 1.1.1) -->\n<img src="chart.png" alt="Bar chart showing 24% revenue increase in Q3" />`;
      case 'screen-reader-heading-order':
        return `<!-- Structure headings sequentially without skipping levels so VoiceOver/NVDA users can navigate sections (WCAG 1.3.1 / 2.4.6) -->\n<h1>Primary Page Title</h1>\n<h2>Section Heading</h2> <!-- Precede h3 with h2 -->\n<h3>Sub-section Heading</h3>`;
      case 'screen-reader-landmarks':
        return `<!-- Wrap primary content in <main> and uniquely label multiple <nav> landmarks (WCAG 1.3.1 / 2.4.1) -->\n<nav aria-label="Main Navigation">...</nav>\n<main id="main-content">...</main>\n<nav aria-label="Footer Navigation">...</nav>`;
      case 'screen-reader-hidden-focus':
        return `<!-- Do not place focusable elements inside containers with aria-hidden="true" (WCAG 4.1.2) -->\n<!-- When closing drawers or modals, apply tabindex="-1" or inert -->\n<div aria-hidden="true">\n  <!-- Ensure all children have inert or disabled -->\n</div>`;
      case 'screen-reader-link-purpose':
        return `<!-- Provide descriptive link text or aria-label so screen reader Links List conveys purpose (WCAG 2.4.4 / 2.4.9) -->\n<a href="/pricing" aria-label="View enterprise pricing and plan details">Learn more</a>`;
      case 'aria-label-generic':
        return `<!-- Provide meaningful, descriptive accessible name (WCAG 2.4.6 / 4.1.2) -->\n<button aria-label="Close dialog window">\n  <svg ...></svg>\n</button>`;
      case 'aria-label-redundant-role':
        return `<!-- Remove redundant role word from aria-label -->\n<button aria-label="Submit search query">Search</button>`;
      case 'aria-label-name-mismatch':
        return `<!-- WCAG 2.2 SC 2.5.3 (Label in Name) -->\n<!-- Ensure aria-label contains visible text word-for-word -->\n<button aria-label="Download audit report as PDF">\n  Download audit report\n</button>`;
      case 'aria-label-icon-mismatch':
        return `<!-- Align accessible name with visual icon intent -->\n<button aria-label="Search catalog">\n  <svg class="search-icon" ...></svg>\n</button>`;
      case 'aria-label-empty':
        return `<!-- Provide non-empty accessible name -->\n<button aria-label="Toggle navigation menu">\n  <span class="hamburger"></span>\n</button>`;
      case 'image-alt':
        return `<!-- Provide descriptive alt text for informative images -->\n<img src="..." alt="Descriptive summary of this image" />\n<!-- If decorative: alt="" role="presentation" -->`;
      case 'button-name':
        return `<!-- Provide discernible accessible name for button -->\n<button aria-label="Search website">\n  <svg ...></svg>\n</button>`;
      case 'label':
        return `<!-- Associate input control with a visible label element -->\n<label for="email-input">Email Address</label>\n<input type="email" id="email-input" name="email" required />`;
      case 'link-name':
        return `<!-- Ensure link has discernible text or accessible label -->\n<a href="/checkout" aria-label="Proceed to secure checkout">\n  <span class="icon"></span>\n</a>`;
      case 'heading-order':
        return `<!-- Maintain sequential hierarchical heading levels without skipping -->\n<h2>Section Heading</h2>\n<h3>Sub-section Heading</h3>`;
      case 'html-has-lang':
        return `<!-- Declare document language on root html tag -->\n<html lang="en">`;
      case 'target-size':
        return `/* WCAG 2.2 SC 2.5.8: Minimum target size of 24x24 CSS pixels */\nmin-width: 24px;\nmin-height: 24px;\npadding: 4px;`;
      default:
        return `<!-- WCAG 2.2 Remediation -->\n<!-- Ensure valid semantic HTML, accessible names, and keyboard navigability -->`;
    }
  }

  function calculateComplianceScore(results) {
    const critical = results.critical || 0;
    const serious = results.serious || 0;
    const moderate = results.moderate || 0;
    const minor = results.minor || 0;

    const penalty = (critical * 12) + (serious * 6) + (moderate * 3) + (minor * 1);
    const score = Math.max(12, Math.min(100, Math.round(100 - penalty)));

    let grade = 'F';
    let riskLevel = 'Severe';
    let summary = '';

    if (score >= 95) {
      grade = 'A+';
      riskLevel = 'Low';
      summary = 'Excellent digital accessibility and screen reader compatibility. Demonstrates full alignment with WCAG 2.2 AA.';
    } else if (score >= 88) {
      grade = 'A';
      riskLevel = 'Low';
      summary = 'Strong compliance posture with minor best-practice refinements identified.';
    } else if (score >= 75) {
      grade = 'B';
      riskLevel = 'Moderate';
      summary = 'Moderate accessibility issues detected. Secondary navigation or contrast elements require attention.';
    } else if (score >= 60) {
      grade = 'C';
      riskLevel = 'High';
      summary = 'Significant barriers detected. Multiple interactive pathways fail WCAG 2.2 AA criteria.';
    } else if (score >= 45) {
      grade = 'D';
      riskLevel = 'High';
      summary = 'Major accessibility barriers detected. Primary controls and contrast fail WCAG 2.2 AA standards.';
    } else {
      grade = 'F';
      riskLevel = 'Severe';
      summary = 'Critical accessibility barriers identified. Essential user pathways fail basic screen reader, keyboard, or contrast criteria.';
    }

    return { score, grade, riskLevel, summary };
  }

  function evaluateHoverStateContrast() {
    const selector = 'button, a[href], [role="button"], [role="link"], input[type="submit"], input[type="button"]';
    const elements = Array.from(document.querySelectorAll(selector));
    const failingNodes = [];

    function getEffectiveBg(node) {
      let cur = node;
      while (cur && cur !== document) {
        const cs = window.getComputedStyle(cur);
        const bg = cs.backgroundColor;
        if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') return bg;
        cur = cur.parentElement;
      }
      return 'rgb(255, 255, 255)';
    }

    const candidates = elements.filter((el) => {
      if (isExtensionElement(el)) return false;
      const rect = el.getBoundingClientRect();
      const cs = window.getComputedStyle(el);
      return rect.width > 2 && rect.height > 2 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
    }).slice(0, 30);

    for (const el of candidates) {
      try {
        const restingCs = window.getComputedStyle(el);
        const text = (el.innerText || el.value || '').trim();
        if (!text) continue;

        const restingFg = restingCs.color;
        const restingBg = getEffectiveBg(el);
        const fontSize = parseFloat(restingCs.fontSize) || 16;
        const fontWeight = restingCs.fontWeight;

        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, cancelable: true }));

        const hoverCs = window.getComputedStyle(el);
        const hoverFg = hoverCs.color;
        const hoverBg = getEffectiveBg(el);

        el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false, cancelable: true }));

        const hoverFgRgb = parseColor(hoverFg);
        const hoverBgRgb = parseColor(hoverBg);
        const hoverRatio = getContrastRatio(hoverFgRgb, hoverBgRgb);

        const isLargeText = fontSize >= 24 || (fontSize >= 18.5 && (fontWeight === 'bold' || parseInt(fontWeight, 10) >= 700));
        const requiredRatio = isLargeText ? 3.0 : 4.5;

        if (hoverRatio < requiredRatio) {
          const restingFgRgb = parseColor(restingFg);
          const restingBgRgb = parseColor(restingBg);
          const restingRatio = getContrastRatio(restingFgRgb, restingBgRgb);

          const contrastFix = calculateColorContrastFix(hoverFg, hoverBg, `${requiredRatio}:1`);
          const sel = getUniqueSelector(el);
          contrastFix.cssFix = `/* Fix :hover state contrast (WCAG 2.2 AA SC 1.4.3) */\n${sel}:hover {\n  background-color: ${contrastFix.currentBg};\n  color: ${contrastFix.suggestedFg}; /* Contrast: ${contrastFix.suggestedRatio} PASS */\n}`;

          failingNodes.push({
            target: sel,
            html: el.outerHTML.slice(0, 300),
            failureSummary: `Element has insufficient contrast on :hover (${hoverRatio.toFixed(2)}:1 vs ${requiredRatio}:1 required). Resting state: ${restingRatio.toFixed(2)}:1.`,
            contrastFix,
            hoverDetails: {
              restingRatio: `${restingRatio.toFixed(2)}:1`,
              hoverRatio: `${hoverRatio.toFixed(2)}:1`,
              requiredRatio: `${requiredRatio.toFixed(1)}:1`,
              restingFg: rgbToHex(restingFgRgb),
              restingBg: rgbToHex(restingBgRgb),
              hoverFg: rgbToHex(hoverFgRgb),
              hoverBg: rgbToHex(hoverBgRgb),
              textSnippet: text.slice(0, 40),
            },
          });
        }
      } catch {
        // Skip detached/unreadable node
      }
    }

    if (failingNodes.length === 0) return null;

    return {
      id: 'color-contrast-hover',
      impact: 'serious',
      description: 'Ensures the contrast between foreground text and background colors meets WCAG 2.2 AA thresholds (minimum 4.5:1, or 3:1 for large text) when interactive elements are hovered (:hover state).',
      help: 'Interactive element fails color contrast requirements in :hover state',
      helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html',
      tags: ['wcag2aa', 'wcag143', 'wcag-hover'],
      wcagRule: 'WCAG 2.2 AA 1.4.3 (Hover)',
      affectedCount: failingNodes.length,
      nodes: failingNodes,
      remediationCode: failingNodes[0]?.contrastFix?.cssFix || getRemediationSnippet('color-contrast-hover'),
    };
  }

  function evaluateAriaLabelAccuracy() {
    const genericWords = new Set([
      'button', 'btn', 'link', 'click here', 'click', 'icon', 'image', 'img',
      'graphic', 'photo', 'picture', 'close', 'close button', 'item', 'more',
      'read more', 'learn more', 'tab', 'menu', 'menu item', 'open', 'view',
      'submit', 'text', 'details', 'arrow', 'symbol', 'action', 'press', 'here',
      'modal', 'dialog', 'element', 'widget', 'component',
    ]);
    const singlePunctuation = new Set(['x', '+', '-', '>', '<', '...', '*', '#', '•', '»', '«', '›', '‹', '→', '←', '↑', '↓']);

    /**
     * WCAG 2.5.3 explicitly applies ONLY to interactive User Interface Components
     * (buttons, links, form inputs, tabs, menu items, etc.) which speech users activate via voice.
     * Non-interactive landmarks (<main>, <nav>, <header>, <footer>, <section>, <aside>) and
     * grouping containers (<fieldset>, <form>, <div>, etc.) are strictly excluded.
     */
    function isUserInterfaceComponent(el, tag, role) {
      if (['button', 'select', 'textarea', 'summary'].includes(tag)) return true;
      if (tag === 'a' && el.hasAttribute('href')) return true;
      if (tag === 'input') {
        const inputType = (el.getAttribute('type') || 'text').toLowerCase();
        return inputType !== 'hidden';
      }

      const interactiveRoles = new Set([
        'button',
        'link',
        'checkbox',
        'radio',
        'switch',
        'tab',
        'menuitem',
        'menuitemcheckbox',
        'menuitemradio',
        'combobox',
        'searchbox',
        'textbox',
        'slider',
        'spinbutton',
        'option',
        'treeitem',
      ]);
      return interactiveRoles.has(role);
    }

    /**
     * Extracts the visible text specifically intended for this control,
     * stripping out decorative elements (aria-hidden, SVG, icons) that speech users do not speak.
     */
    function getVisibleLabelText(el, tag) {
      if (tag === 'input') {
        const type = (el.getAttribute('type') || 'text').toLowerCase();
        if (['button', 'submit', 'reset'].includes(type)) {
          return (el.value || '').trim();
        }
        const labelEl = (el.labels && el.labels[0])
          ? el.labels[0]
          : (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : el.closest('label'));
        if (labelEl) {
          return (labelEl.innerText || labelEl.textContent || '').trim();
        }
        return (el.getAttribute('placeholder') || '').trim();
      }

      if (tag === 'textarea' || tag === 'select') {
        const labelEl = (el.labels && el.labels[0])
          ? el.labels[0]
          : (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : el.closest('label'));
        if (labelEl) {
          return (labelEl.innerText || labelEl.textContent || '').trim();
        }
        return (el.getAttribute('placeholder') || '').trim();
      }

      try {
        const clone = el.cloneNode(true);
        const decorative = clone.querySelectorAll('[aria-hidden="true"], [role="presentation"], [role="none"], svg, img');
        decorative.forEach(d => d.remove());
        return (clone.innerText || clone.textContent || '').trim();
      } catch {
        return (el.innerText || el.textContent || '').trim();
      }
    }

    /**
     * Normalizes text for speech comparison: strips punctuation, symbols, and emojis,
     * collapses whitespace, and lowercases. Speech engines match spoken words/numbers,
     * not punctuation marks or emojis.
     */
    function normalizeForSpeech(str) {
      return (str || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    const elements = Array.from(document.querySelectorAll('[aria-label], [aria-labelledby]'));
    const genericNodes = [];
    const redundantRoleNodes = [];
    const nameMismatchNodes = [];
    const iconMismatchNodes = [];
    const emptyNodes = [];

    for (const el of elements) {
      if (isExtensionElement(el)) continue;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;

      const rawLabel = el.getAttribute('aria-label') || '';
      const labelledBy = el.getAttribute('aria-labelledby');
      let resolvedLabel = rawLabel.trim();

      if (!resolvedLabel && labelledBy) {
        const ids = labelledBy.split(/\s+/).filter(Boolean);
        const parts = ids.map(id => {
          const ref = document.getElementById(id);
          return ref ? (ref.innerText || ref.textContent || '').trim() : '';
        }).filter(Boolean);
        if (parts.length > 0) resolvedLabel = parts.join(' ');
      }

      const selector = getUniqueSelector(el);
      const html = el.outerHTML.slice(0, 300);
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute('role') || tag;
      const isInteractive = isUserInterfaceComponent(el, tag, role);
      const visibleText = isInteractive ? getVisibleLabelText(el, tag) : (el.innerText || el.textContent || '').trim();
      const focalRes = getFocalTarget(el);
      const nodeRect = focalRes ? focalRes.rect : null;

      // Check 1: Empty or whitespace-only aria-label
      if (el.hasAttribute('aria-label') && !resolvedLabel) {
        emptyNodes.push({
          target: selector,
          html,
          rect: nodeRect,
          focalRect: nodeRect,
          failureSummary: 'Element has an aria-label attribute that is empty or contains only whitespace.',
          ariaDetails: {
            ariaLabel: '""',
            visibleText: visibleText || '(none)',
            diagnosis: 'Empty aria-label provides no name to screen readers.',
            recommendedLabel: 'Add a descriptive text summary of this element’s purpose.',
          },
        });
        continue;
      }

      const lowerLabel = resolvedLabel.toLowerCase().replace(/\s+/g, ' ');

      // Check 2: Generic / Placeholder / Low-information label
      if (genericWords.has(lowerLabel) || singlePunctuation.has(lowerLabel) || resolvedLabel.length === 1) {
        genericNodes.push({
          target: selector,
          html,
          rect: nodeRect,
          focalRect: nodeRect,
          failureSummary: `Accessible name "${resolvedLabel}" is too generic or non-descriptive to convey the purpose to screen reader users (WCAG 2.4.6 / 4.1.2).`,
          ariaDetails: {
            ariaLabel: resolvedLabel,
            visibleText: visibleText || '(none)',
            diagnosis: `Generic label "${resolvedLabel}" fails WCAG 2.4.6 / 4.1.2.`,
            recommendedLabel: lowerLabel === 'close'
              ? 'Close dialog'
              : (lowerLabel === 'search' ? 'Search catalog' : 'Descriptive action name'),
          },
        });
      }

      // Check 3: Redundant role repetition
      const rolePatterns = [
        { tags: ['button'], roles: ['button'], suffix: ' button', roleWord: 'button' },
        { tags: ['button'], roles: ['button'], suffix: ' btn', roleWord: 'btn' },
        { tags: ['a'], roles: ['link'], suffix: ' link', roleWord: 'link' },
        { tags: ['input'], roles: ['checkbox'], suffix: ' checkbox', roleWord: 'checkbox' },
        { tags: ['input'], roles: ['radio'], suffix: ' radio', roleWord: 'radio' },
        { tags: ['nav'], roles: ['navigation'], suffix: ' navigation', roleWord: 'navigation' },
      ];

      for (const p of rolePatterns) {
        const matchesTagOrRole = p.tags.includes(tag) || p.roles.includes(role);
        if (matchesTagOrRole && (lowerLabel.endsWith(p.suffix) || lowerLabel === p.roleWord)) {
          const cleanedLabel = resolvedLabel.replace(new RegExp(`\\s*${p.roleWord}$`, 'i')).trim();
          redundantRoleNodes.push({
            target: selector,
            html,
            rect: nodeRect,
            focalRect: nodeRect,
            failureSummary: `Accessible name "${resolvedLabel}" redundantly repeats the element role "${p.roleWord}". Screen readers announce the role natively.`,
            ariaDetails: {
              ariaLabel: resolvedLabel,
              visibleText: visibleText || '(none)',
              diagnosis: `Screen reader announces "${resolvedLabel}, ${p.roleWord}". Remove "${p.roleWord}".`,
              recommendedLabel: cleanedLabel || 'Action description',
            },
          });
          break;
        }
      }

      // Check 4: WCAG 2.2 SC 2.5.3 (Label in Name)
      // Strictly applies ONLY to interactive User Interface Components with visible text
      if (isInteractive && visibleText) {
        const normVisible = normalizeForSpeech(visibleText);
        const normLabel = normalizeForSpeech(resolvedLabel);

        if (normVisible && normVisible.length >= 2) {
          if (!normLabel.includes(normVisible)) {
            nameMismatchNodes.push({
              target: selector,
              html,
              rect: nodeRect,
              focalRect: nodeRect,
              failureSummary: `WCAG 2.2 SC 2.5.3 Failure (Label in Name): Visible text "${visibleText}" is missing from accessible name "${resolvedLabel}". Speech-to-text users calling out the visible label will fail to activate this control.`,
              ariaDetails: {
                ariaLabel: resolvedLabel,
                visibleText: visibleText,
                diagnosis: `Label in Name violation: accessible name ("${resolvedLabel}") does not contain the visual text ("${visibleText}").`,
                recommendedLabel: `${visibleText} — ${resolvedLabel}`,
              },
            });
          }
        }
      }

      // Check 5: Icon-to-Label Semantic Contradiction
      // Only evaluate on interactive controls or dedicated icon elements
      const isIconElement = tag === 'svg' || tag === 'i' || (typeof el.className === 'string' && el.className.includes('icon'));
      if (isInteractive || isIconElement) {
        const iconNodes = Array.from(el.querySelectorAll('svg, i, span[class*="icon"], [class*="fa-"], [class*="bi-"], [class*="feather"]'));
        if (iconNodes.length > 0) {
          let iconText = '';
          for (const icon of iconNodes) {
            iconText += ' ' + (icon.getAttribute('class') || '') + ' ' + (icon.getAttribute('id') || '') + ' ' + (icon.getAttribute('data-icon') || '') + ' ' + (icon.getAttribute('name') || '');
            const titleChild = icon.querySelector('title');
            if (titleChild) iconText += ' ' + (titleChild.textContent || '');
          }
          iconText = iconText.toLowerCase();

          const contradictionRules = [
            {
              iconKeywords: ['trash', 'delete', 'remove', 'bin'],
              conflictingLabels: ['search', 'edit', 'add', 'create', 'save', 'next', 'cart'],
              expected: 'Delete or remove item',
            },
            {
              iconKeywords: ['search', 'magnif', 'glass'],
              conflictingLabels: ['close', 'delete', 'cart', 'menu', 'filter', 'edit'],
              expected: 'Search site or catalog',
            },
            {
              iconKeywords: ['cart', 'basket', 'bag'],
              conflictingLabels: ['search', 'close', 'delete', 'login', 'account'],
              expected: 'View shopping cart or checkout',
            },
            {
              iconKeywords: ['close', 'times', 'cross', 'dismiss'],
              conflictingLabels: ['search', 'cart', 'save', 'submit', 'edit'],
              expected: 'Close or dismiss dialogue',
            },
          ];

          for (const rule of contradictionRules) {
            const hasIconKeyword = rule.iconKeywords.some(kw => iconText.includes(kw));
            if (hasIconKeyword) {
              const hasConflict = rule.conflictingLabels.some(kw => lowerLabel.includes(kw));
              if (hasConflict) {
                iconMismatchNodes.push({
                  target: selector,
                  html,
                  rect: nodeRect,
                  focalRect: nodeRect,
                  failureSummary: `Accessible label "${resolvedLabel}" contradicts visual meaning of the embedded icon. Icon indicates: ${rule.expected}.`,
                  ariaDetails: {
                    ariaLabel: resolvedLabel,
                    visibleText: visibleText || '(none)',
                    diagnosis: `Icon contradiction: visual icon indicates "${rule.expected}", but aria-label is "${resolvedLabel}".`,
                    recommendedLabel: rule.expected,
                  },
                });
                break;
              }
            }
          }
        }
      }
    }

    return {
      emptyNodes: emptyNodes.slice(0, 25),
      genericNodes: genericNodes.slice(0, 25),
      redundantRoleNodes: redundantRoleNodes.slice(0, 25),
      nameMismatchNodes: nameMismatchNodes.slice(0, 25),
      iconMismatchNodes: iconMismatchNodes.slice(0, 25),
    };
  }

  /**
   * Traverses the DOM in natural screen reader linear reading order.
   * Linearizes landmarks, headings, paragraphs, lists, controls, and images.
   * Deduplicates labels and child nodes so announcements match Apple VoiceOver & NVDA.
   * @param {Element} [root=document.body]
   * @param {number} [maxItems=160]
   * @returns {Array<Object>}
   */
  function extractScreenReaderNarrative(root = document.body, maxItems = 160) {
    const results = [];
    if (!root) return results;

    const landmarkTags = new Set(['header', 'nav', 'main', 'footer', 'aside']);
    const landmarkRoles = new Set(['banner', 'navigation', 'main', 'contentinfo', 'complementary', 'search']);
    const controlTags = new Set(['button', 'a', 'input', 'select', 'textarea']);
    const controlRoles = new Set(['button', 'link', 'checkbox', 'switch', 'tab', 'radio', 'menuitem']);
    const textBlockTags = new Set(['p', 'blockquote', 'figcaption', 'dd', 'dt', 'caption', 'th', 'td', 'legend']);
    const blockTags = new Set([
      'p', 'blockquote', 'figcaption', 'dd', 'dt', 'caption', 'th', 'td', 'legend',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'button', 'a', 'input', 'select', 'textarea',
      'ul', 'ol', 'li', 'div', 'section', 'article', 'header', 'footer', 'nav', 'main'
    ]);

    const vaguePhrases = new Set([
      'click here', 'click', 'learn more', 'read more', 'more', 'details', 'view',
      'here', 'link', 'continue', 'go', 'find out more', 'explore', 'see more',
    ]);

    function isElementHidden(el) {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return true;
      if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return true;
      if (typeof window.getComputedStyle === 'function') {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return true;
      }
      if (typeof el.getBoundingClientRect === 'function') {
        const rect = el.getBoundingClientRect();
        const style = typeof window.getComputedStyle === 'function' ? window.getComputedStyle(el) : null;
        const isSrOnly = style && (style.position === 'absolute' && (rect.width <= 1 || rect.height <= 1) && (el.textContent || '').trim().length > 0);
        if (rect.width === 0 && rect.height === 0 && !isSrOnly) return true;
      }
      return false;
    }

    function getLandmarkInfo(el) {
      const tag = el.tagName.toLowerCase();
      const role = (el.getAttribute('role') || '').toLowerCase();
      const name = (el.getAttribute('aria-label') || '').trim();

      if (tag === 'header' || role === 'banner') {
        return {
          label: 'banner',
          spoken: name ? `"${name}", banner landmark` : 'banner landmark',
          vo: name ? `${name}, banner landmark` : 'banner landmark',
          talkback: name ? `${name}, Banner, Landmark` : 'Banner, Landmark',
          nvda: `Banner landmark${name ? `, ${name}` : ''}`,
          narrator: name ? `${name}, banner landmark` : 'banner landmark',
        };
      }
      if (tag === 'nav' || role === 'navigation') {
        return {
          label: 'navigation',
          spoken: name ? `"${name}", navigation landmark` : 'navigation landmark',
          vo: name ? `${name}, navigation landmark` : 'navigation landmark',
          talkback: name ? `${name}, Navigation, Landmark` : 'Navigation, Landmark',
          nvda: `Navigation landmark${name ? `, ${name}` : ''}`,
          narrator: name ? `${name}, navigation landmark` : 'navigation landmark',
        };
      }
      if (tag === 'main' || role === 'main') {
        return {
          label: 'main content',
          spoken: name ? `"${name}", main content landmark` : 'main content landmark',
          vo: name ? `${name}, main content landmark` : 'main content landmark',
          talkback: name ? `${name}, Main, Landmark` : 'Main, Landmark',
          nvda: `Main landmark${name ? `, ${name}` : ''}`,
          narrator: name ? `${name}, main landmark` : 'main landmark',
        };
      }
      if (tag === 'footer' || role === 'contentinfo') {
        return {
          label: 'content information',
          spoken: name ? `"${name}", content information landmark` : 'content information landmark',
          vo: name ? `${name}, content information landmark` : 'content information landmark',
          talkback: name ? `${name}, Content information, Landmark` : 'Content information, Landmark',
          nvda: `Content information landmark${name ? `, ${name}` : ''}`,
          narrator: name ? `${name}, content information landmark` : 'content information landmark',
        };
      }
      if (tag === 'aside' || role === 'complementary') {
        return {
          label: 'complementary',
          spoken: name ? `"${name}", complementary landmark` : 'complementary landmark',
          vo: name ? `${name}, complementary landmark` : 'complementary landmark',
          talkback: name ? `${name}, Complementary, Landmark` : 'Complementary, Landmark',
          nvda: `Complementary landmark${name ? `, ${name}` : ''}`,
          narrator: name ? `${name}, complementary landmark` : 'complementary landmark',
        };
      }
      if (role === 'search') {
        return {
          label: 'search',
          spoken: name ? `"${name}", search landmark` : 'search landmark',
          vo: name ? `${name}, search landmark` : 'search landmark',
          talkback: name ? `${name}, Search, Landmark` : 'Search, Landmark',
          nvda: `Search landmark${name ? `, ${name}` : ''}`,
          narrator: name ? `${name}, search landmark` : 'search landmark',
        };
      }
      if ((tag === 'section' || tag === 'form' || role === 'region') && name) {
        return {
          label: 'region',
          spoken: `"${name}", region landmark`,
          vo: `${name}, region landmark`,
          talkback: `${name}, Region, Landmark`,
          nvda: `Region landmark, ${name}`,
          narrator: `${name}, region landmark`,
        };
      }
      return null;
    }

    function walk(node) {
      if (results.length >= maxItems) return;
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
      if (isExtensionElement(node)) return;
      if (isElementHidden(node)) return;
      const tag = node.tagName.toLowerCase();
      if (['script', 'style', 'noscript', 'template'].includes(tag)) return;
      const role = (node.getAttribute('role') || '').toLowerCase();

      // 1. Landmark Container
      const lm = getLandmarkInfo(node);
      if (lm) {
        results.push({
          element: node,
          type: 'Landmark',
          rotorCategory: 'landmark',
          spokenText: lm.spoken,
          voiceOverText: lm.vo,
          talkBackText: lm.talkback,
          nvdaText: lm.nvda,
          narratorText: lm.narrator,
          state: '',
          selector: getUniqueSelector(node),
          isBarrier: false,
          earcon: 'landmark',
        });
      }

      // 2. Heading
      const isHeading = /^h[1-6]$/i.test(tag) || role === 'heading';
      if (isHeading) {
        const lvl = role === 'heading' ? (node.getAttribute('aria-level') || '2') : (tag[1] || '2');
        const name = getAccessibleNameForElement(node);
        if (name) {
          results.push({
            element: node,
            type: `Heading ${lvl}`,
            rotorCategory: 'heading',
            spokenText: `"${name}", heading level ${lvl}`,
            voiceOverText: `${name}, heading level ${lvl}`,
            talkBackText: `${name}, Heading ${lvl}`,
            nvdaText: `Heading level ${lvl}, ${name}`,
            narratorText: `${name}, heading level ${lvl}`,
            state: '',
            selector: getUniqueSelector(node),
            isBarrier: false,
            earcon: 'control',
          });
        } else {
          results.push({
            element: node,
            type: `Heading ${lvl}`,
            rotorCategory: 'heading',
            spokenText: `empty heading level ${lvl}`,
            voiceOverText: `empty, heading level ${lvl}`,
            talkBackText: `Unlabelled, Heading ${lvl}`,
            nvdaText: `Heading level ${lvl}, blank`,
            narratorText: `empty heading level ${lvl}`,
            state: '',
            selector: getUniqueSelector(node),
            isBarrier: true,
            earcon: 'barrier',
          });
        }
        return;
      }

      // 3. Interactive Controls
      const isControl = controlTags.has(tag) || controlRoles.has(role);
      if (isControl) {
        const name = getAccessibleNameForElement(node);

        if (tag === 'button' || role === 'button') {
          const states = [];
          const isExpanded = node.getAttribute('aria-expanded');
          if (isExpanded === 'true') states.push('expanded');
          else if (isExpanded === 'false') states.push('collapsed');
          const isDisabled = node.hasAttribute('disabled') || node.getAttribute('aria-disabled') === 'true';
          if (isDisabled) states.push('dimmed');
          const stateStr = states.join(', ');

          const tbStates = [];
          if (isExpanded === 'true') tbStates.push('expanded');
          else if (isExpanded === 'false') tbStates.push('collapsed');
          if (isDisabled) tbStates.push('disabled');
          const tbStateStr = tbStates.length ? `, ${tbStates.join(', ')}` : '';

          const nvdaStates = [];
          if (isExpanded === 'true') nvdaStates.push('expanded');
          else if (isExpanded === 'false') nvdaStates.push('collapsed');
          if (isDisabled) nvdaStates.push('unavailable');
          const nvdaStateStr = nvdaStates.length ? `, ${nvdaStates.join(', ')}` : '';

          if (name) {
            const stateSuffix = stateStr ? `, ${stateStr}` : '';
            const actionHint = isExpanded === 'false' ? ', double tap to expand' : isExpanded === 'true' ? ', double tap to collapse' : ', double tap to activate';
            const tbHint = isExpanded === 'false' ? ', double-tap to expand' : isExpanded === 'true' ? ', double-tap to collapse' : ', double-tap to activate';
            results.push({
              element: node,
              type: 'Button',
              rotorCategory: 'control',
              spokenText: `"${name}"${stateSuffix}, button`,
              voiceOverText: `${name}${stateSuffix}, button${isDisabled ? '' : actionHint}`,
              talkBackText: `${name}, Button${tbStateStr}${isDisabled ? '' : tbHint}`,
              nvdaText: `Button, ${name}${nvdaStateStr}`,
              narratorText: `${name}, button${stateSuffix}`,
              state: stateStr,
              selector: getUniqueSelector(node),
              isBarrier: false,
              earcon: 'control',
            });
          } else {
            results.push({
              element: node,
              type: 'Button',
              rotorCategory: 'control',
              spokenText: 'unlabelled button',
              voiceOverText: 'unlabelled, button',
              talkBackText: 'Unlabelled, Button',
              nvdaText: 'Button, blank',
              narratorText: 'button, unlabelled',
              state: stateStr,
              selector: getUniqueSelector(node),
              isBarrier: true,
              earcon: 'barrier',
            });
          }
          return;
        }

        if (tag === 'a' || role === 'link') {
          const targetAttr = (node.getAttribute('target') || '').toLowerCase();
          const opensNewTab = targetAttr === '_blank';
          const mentionsNewTab = /new\s+(tab|window)/i.test(name);
          const stateStr = (opensNewTab && !mentionsNewTab) ? 'opens new window' : '';

          if (name) {
            const isVague = vaguePhrases.has(name.toLowerCase());
            const voSuffix = stateStr ? ', opens in new window' : '';
            const tbSuffix = stateStr ? ', opens in new tab' : '';
            const nvdaSuffix = stateStr ? ', opens in new window' : '';
            results.push({
              element: node,
              type: 'Link',
              rotorCategory: 'link',
              spokenText: `"${name}"${stateStr ? ` (${stateStr})` : ''}, link`,
              voiceOverText: `${name}${voSuffix}, link`,
              talkBackText: `${name}, Link${tbSuffix}`,
              nvdaText: `Link, ${name}${nvdaSuffix}`,
              narratorText: `${name}${voSuffix}, link`,
              state: stateStr,
              selector: getUniqueSelector(node),
              isBarrier: isVague,
              earcon: isVague ? 'barrier' : 'link',
            });
          } else {
            results.push({
              element: node,
              type: 'Link',
              rotorCategory: 'link',
              spokenText: 'unlabelled link',
              voiceOverText: 'unlabelled, link',
              talkBackText: 'Unlabelled, Link',
              nvdaText: 'Link, blank',
              narratorText: 'link, unlabelled',
              state: stateStr,
              selector: getUniqueSelector(node),
              isBarrier: true,
              earcon: 'barrier',
            });
          }
          return;
        }

        if (['input', 'select', 'textarea'].includes(tag) || ['checkbox', 'switch', 'tab', 'radio'].includes(role)) {
          const fieldType = (node.getAttribute('type') || tag).toLowerCase();
          const isRequired = node.hasAttribute('required') || node.getAttribute('aria-required') === 'true';
          const isInvalid = node.getAttribute('aria-invalid') === 'true';

          let itemType = 'Form Field';
          let voRole = 'edit text';
          let tbRole = 'Edit box';
          let nvdaRole = 'Edit';
          let narRole = 'edit';
          let voState = isRequired ? 'required' : '';
          let tbState = isRequired ? 'Required' : '';
          let nvdaState = isRequired ? 'required' : '';
          let narState = isRequired ? 'required' : '';
          let hint = 'double-tap to edit';
          let tbHint = 'double-tap to enter text';

          if (fieldType === 'checkbox' || role === 'checkbox') {
            itemType = 'Checkbox';
            voRole = 'checkbox';
            tbRole = 'Check box';
            nvdaRole = 'Check box';
            narRole = 'check box';
            const isChecked = node.checked || node.getAttribute('aria-checked') === 'true';
            voState = isChecked ? 'checked' : 'unchecked';
            tbState = isChecked ? 'Checked' : 'Not checked';
            nvdaState = isChecked ? 'checked' : 'not checked';
            narState = isChecked ? 'checked' : 'unchecked';
            hint = 'double-tap to toggle';
            tbHint = 'double-tap to toggle';
          } else if (role === 'switch') {
            itemType = 'Switch';
            voRole = 'switch';
            tbRole = 'Switch';
            nvdaRole = 'Toggle button';
            narRole = 'toggle switch';
            const isChecked = node.getAttribute('aria-checked') === 'true';
            voState = isChecked ? 'on' : 'off';
            tbState = isChecked ? 'On' : 'Off';
            nvdaState = isChecked ? 'pressed' : 'not pressed';
            narState = isChecked ? 'on' : 'off';
            hint = 'double-tap to toggle setting';
            tbHint = 'double-tap to toggle';
          } else if (role === 'tab') {
            itemType = 'Tab';
            voRole = 'tab';
            tbRole = 'Tab';
            nvdaRole = 'Tab';
            narRole = 'tab';
            const isSelected = node.getAttribute('aria-selected') === 'true';
            voState = isSelected ? 'selected' : 'not selected';
            tbState = isSelected ? 'Selected' : 'Not selected';
            nvdaState = isSelected ? 'selected' : 'not selected';
            narState = isSelected ? 'selected' : 'not selected';
            hint = 'double-tap to select';
            tbHint = 'double-tap to select';
          } else if (fieldType === 'radio' || role === 'radio') {
            itemType = 'Radio Button';
            voRole = 'radio button';
            tbRole = 'Radio button';
            nvdaRole = 'Radio button';
            narRole = 'radio button';
            const isChecked = node.checked || node.getAttribute('aria-checked') === 'true';
            voState = isChecked ? 'selected' : '';
            tbState = isChecked ? 'Checked' : 'Not checked';
            nvdaState = isChecked ? 'checked' : 'not checked';
            narState = isChecked ? 'selected' : '';
            hint = 'double-tap to select';
            tbHint = 'double-tap to select';
          } else if (tag === 'select') {
            itemType = 'Select';
            voRole = 'pop-up button';
            tbRole = 'Drop-down list';
            nvdaRole = 'Combo box';
            narRole = 'combo box';
            hint = 'double-tap to activate';
            tbHint = 'double-tap to change';
          }

          if (isInvalid) {
            voState = voState ? `${voState}, invalid data` : 'invalid data';
            tbState = tbState ? `${tbState}, Invalid entry` : 'Invalid entry';
            nvdaState = nvdaState ? `${nvdaState}, invalid entry` : 'invalid entry';
            narState = narState ? `${narState}, invalid data` : 'invalid data';
          }

          if (name) {
            const voStateStr = voState ? `, ${voState}` : '';
            const tbStateStr = tbState ? `, ${tbState}` : '';
            const nvdaStateStr = nvdaState ? `, ${nvdaState}` : '';
            const narStateStr = narState ? `, ${narState}` : '';

            results.push({
              element: node,
              type: itemType,
              rotorCategory: 'control',
              spokenText: `"${name}"${voStateStr}, ${voRole}`,
              voiceOverText: `${name}${voStateStr}, ${voRole}, ${hint}`,
              talkBackText: `${name}, ${tbRole}${tbStateStr}, ${tbHint}`,
              nvdaText: `${nvdaRole}, ${name}${nvdaStateStr}`,
              narratorText: `${name}, ${narRole}${narStateStr}`,
              state: voState,
              selector: getUniqueSelector(node),
              isBarrier: false,
              earcon: 'control',
            });
          } else {
            results.push({
              element: node,
              type: itemType,
              rotorCategory: 'control',
              spokenText: `unlabelled ${voRole}`,
              voiceOverText: `unlabelled, ${voRole}`,
              talkBackText: `Unlabelled, ${tbRole}`,
              nvdaText: `${nvdaRole}, unlabelled`,
              narratorText: `unlabelled ${narRole}`,
              state: voState,
              selector: getUniqueSelector(node),
              isBarrier: true,
              earcon: 'barrier',
            });
          }
          return;
        }
      }

      // 4. Image
      if (tag === 'img' || role === 'img') {
        const hasAltAttr = node.hasAttribute('alt');
        const alt = (node.getAttribute('alt') || '').trim();
        const ariaOrTitle = (node.getAttribute('aria-label') || node.getAttribute('title') || '').trim();

        if (hasAltAttr && alt === '' && !ariaOrTitle) {
          return; // Explicit decorative image: skipped
        }

        const effectiveText = alt || ariaOrTitle;
        if (effectiveText) {
          results.push({
            element: node,
            type: 'Image',
            rotorCategory: 'image',
            spokenText: `"${effectiveText}", graphic`,
            voiceOverText: `${effectiveText}, image`,
            talkBackText: `${effectiveText}, Graphic`,
            nvdaText: `Graphic, ${effectiveText}`,
            narratorText: `${effectiveText}, image`,
            state: '',
            selector: getUniqueSelector(node),
            isBarrier: false,
            earcon: 'control',
          });
        } else {
          const srcName = (node.getAttribute('src') || '').split('/').pop()?.split('?')[0] || 'unlabelled_image';
          results.push({
            element: node,
            type: 'Image',
            rotorCategory: 'image',
            spokenText: `"${srcName}", unlabelled graphic`,
            voiceOverText: `${srcName}, image, unlabelled graphic`,
            talkBackText: `Unlabelled graphic, ${srcName}`,
            nvdaText: `Graphic, ${srcName}, unlabelled`,
            narratorText: `unlabelled graphic, ${srcName}`,
            state: '',
            selector: getUniqueSelector(node),
            isBarrier: true,
            earcon: 'barrier',
          });
        }
        return;
      }

      // 5. Paragraphs & Explicit Text Blocks
      if (textBlockTags.has(tag)) {
        const text = (node.innerText || node.textContent || '').trim();
        if (text) {
          results.push({
            element: node,
            type: tag === 'legend' ? 'Legend' : 'Text',
            rotorCategory: 'text',
            spokenText: `"${text}"`,
            voiceOverText: text,
            talkBackText: text,
            nvdaText: text,
            narratorText: text,
            state: '',
            selector: getUniqueSelector(node),
            isBarrier: false,
            earcon: 'text',
          });
          return;
        }
      }

      // 6. List Item
      if (tag === 'li') {
        const hasChildBlocks = Array.from(node.children).some(c =>
          textBlockTags.has(c.tagName.toLowerCase()) ||
          /^h[1-6]$/i.test(c.tagName) ||
          controlTags.has(c.tagName.toLowerCase()) ||
          c.tagName.toLowerCase() === 'img'
        );
        if (!hasChildBlocks) {
          const text = (node.innerText || node.textContent || '').trim();
          if (text) {
            results.push({
              element: node,
              type: 'Text',
              rotorCategory: 'text',
              spokenText: `"${text}"`,
              voiceOverText: text,
              talkBackText: text,
              nvdaText: text,
              narratorText: text,
              state: '',
              selector: getUniqueSelector(node),
              isBarrier: false,
              earcon: 'text',
            });
            return;
          }
        }
      }

      // 7. Generic Container with Direct Perceptible Text
      if (['div', 'span', 'section', 'article', 'label'].includes(tag)) {
        if (!node.closest('label') && tag !== 'label') {
          const hasDirectText = Array.from(node.childNodes).some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim().length > 0);
          const hasChildBlocks = Array.from(node.children).some(c => blockTags.has(c.tagName.toLowerCase()));
          if (hasDirectText && !hasChildBlocks) {
            const text = (node.innerText || node.textContent || '').trim();
            if (text && text.length > 1) {
              results.push({
                element: node,
                type: 'Text',
                rotorCategory: 'text',
                spokenText: `"${text}"`,
                voiceOverText: text,
                talkBackText: text,
                nvdaText: text,
                narratorText: text,
                state: '',
                selector: getUniqueSelector(node),
                isBarrier: false,
                earcon: 'text',
              });
              return;
            }
          }
        }
      }

      // 8. Traverse Children in Document Order
      for (const child of node.children) {
        walk(child);
      }
    }

    walk(root);
    return results;
  }

  /**
   * Evaluates Screen Reader & VoiceOver Compatibility
   * Audits:
   * 1. Alt-Text Natural Speech & Redundancy (WCAG 1.1.1)
   * 2. Heading Outline & Narrative Flow (WCAG 1.3.1, 2.4.6)
   * 3. Landmark Navigation Architecture (WCAG 1.3.1, 2.4.1)
   * 4. Silent Focus Traps (aria-hidden with focusable elements) (WCAG 4.1.2)
   * 5. Ambiguous Screen Reader Link List Purpose (WCAG 2.4.4, 2.4.9)
   * 6. Speech Transcript Sequence Simulator
   *
   * @returns {Object}
   */
  function evaluateScreenReaderCompatibility() {
    // 1. Alt-Text Narrative Quality & Speech Redundancy (WCAG 1.1.1)
    const images = Array.from(document.querySelectorAll('img, [role="img"]'));
    const altQualityNodes = [];
    const fileExtRegex = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff)$/i;
    const redundantPrefixes = /^(image|picture|graphic|photo|icon)\s+of\s+/i;
    const rawPrefixes = /^(img_|dsc_|screenshot_|photo_|image_)/i;

    for (const img of images) {
      if (isExtensionElement(img)) continue;
      const alt = (img.getAttribute('alt') || img.getAttribute('aria-label') || '').trim();
      if (!alt) continue;

      const isFileExt = fileExtRegex.test(alt);
      const hasRedundantPrefix = redundantPrefixes.test(alt);
      const hasRawPrefix = rawPrefixes.test(alt);
      const isUrl = /^https?:\/\//i.test(alt);

      if (isFileExt || hasRedundantPrefix || hasRawPrefix || isUrl) {
        let diagnosis = '';
        let recommended = '';
        if (isFileExt || hasRawPrefix) {
          diagnosis = `Alt text "${alt}" contains raw file name or technical prefix. Screen readers announce this awkwardly character-by-character.`;
          recommended = 'Provide natural language description of image content';
        } else if (hasRedundantPrefix) {
          diagnosis = `Alt text "${alt}" starts with redundant "${alt.split(/\s+/).slice(0, 2).join(' ')}". Screen readers already announce the role "graphic" natively.`;
          recommended = alt.replace(redundantPrefixes, '');
        } else if (isUrl) {
          diagnosis = `Alt text "${alt}" is a raw URL string, creating an unpleasant reading experience.`;
          recommended = 'Describe the image content rather than pasting the image link';
        }

        const fImg = getFocalTarget(img);
        altQualityNodes.push({
          target: getUniqueSelector(img),
          html: img.outerHTML.slice(0, 300),
          rect: fImg.rect,
          focalRect: fImg.rect,
          failureSummary: diagnosis,
          srDetails: {
            currentText: alt,
            diagnosis,
            recommended,
          },
        });
      }
    }

    // 2. Heading Rotor & Narrative Hierarchy (WCAG 1.3.1, 2.4.6)
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]')).filter(h => !isExtensionElement(h));
    const headingNodes = [];
    const h1Elements = headings.filter(h => h.tagName.toLowerCase() === 'h1' || h.getAttribute('aria-level') === '1');

    if (h1Elements.length === 0 && headings.length > 0) {
      const fH1 = getFocalTarget(headings[0]);
      headingNodes.push({
        target: getUniqueSelector(headings[0]),
        html: headings[0].outerHTML.slice(0, 300),
        rect: fH1.rect,
        focalRect: fH1.rect,
        failureSummary: 'Document is missing a top-level <h1> heading. Screen reader users navigating by heading rotor cannot discern the primary subject of the page.',
        srDetails: {
          currentText: '(Missing <h1>)',
          diagnosis: 'VoiceOver Rotor / NVDA H-key navigation begins with sub-headings, obscuring page topic.',
          recommended: 'Add a single <h1> heading representing the primary title or theme of the document.',
        },
      });
    }

    let prevLevel = 0;
    for (const h of headings) {
      const tag = h.tagName.toLowerCase();
      const level = parseInt(h.getAttribute('aria-level') || (tag.startsWith('h') ? tag[1] : '2'), 10);
      const text = (h.innerText || h.textContent || '').trim();

      if (!text) {
        const fEmpty = getFocalTarget(h);
        headingNodes.push({
          target: getUniqueSelector(h),
          html: h.outerHTML.slice(0, 300),
          rect: fEmpty.rect,
          focalRect: fEmpty.rect,
          failureSummary: `Empty <${tag}> heading found. Screen reader announces empty heading level without readable content.`,
          srDetails: {
            currentText: `Empty <${tag}>`,
            diagnosis: `Screen reader announces "${tag}, level ${level}" followed by complete silence.`,
            recommended: 'Remove empty heading or add descriptive section text.',
          },
        });
        continue;
      }

      if (prevLevel > 0 && level > prevLevel + 1) {
        const fJump = getFocalTarget(h);
        headingNodes.push({
          target: getUniqueSelector(h),
          html: h.outerHTML.slice(0, 300),
          rect: fJump.rect,
          focalRect: fJump.rect,
          failureSummary: `Skipped heading level: <${tag}> (level ${level}) follows level ${prevLevel}. Screen reader users navigating headings will assume an entire preceding section was missed.`,
          srDetails: {
            currentText: `"${text}" (<${tag}>)`,
            diagnosis: `Heading levels jump from h${prevLevel} directly to h${level}. Break in narrative hierarchy.`,
            recommended: `Change <${tag}> to <h${prevLevel + 1}> or introduce an intermediate <h${prevLevel + 1}> parent section.`,
          },
        });
      }
      prevLevel = level;
    }

    // 3. Landmark Architecture & Navigation Structure (WCAG 1.3.1, 2.4.1)
    const landmarkNodes = [];
    const mainLandmarks = document.querySelectorAll('main, [role="main"]');
    if (mainLandmarks.length === 0) {
      landmarkNodes.push({
        target: 'body',
        html: document.body ? document.body.outerHTML.slice(0, 150) : '<body>',
        failureSummary: 'Page lacks a semantic <main> or role="main" landmark. Screen reader users cannot bypass repetitive headers or sidebars to jump straight to primary content.',
        srDetails: {
          currentText: '(Missing <main>)',
          diagnosis: 'Users must manually tab through entire header on every page load.',
          recommended: 'Wrap primary page content in <main id="main-content">.',
        },
      });
    }

    const navs = Array.from(document.querySelectorAll('nav, [role="navigation"]')).filter(n => !isExtensionElement(n));
    if (navs.length > 1) {
      const unlabelledNavs = navs.filter(n => !n.getAttribute('aria-label') && !n.getAttribute('aria-labelledby'));
      if (unlabelledNavs.length > 0) {
        unlabelledNavs.forEach(nav => {
          const fNav = getFocalTarget(nav);
          landmarkNodes.push({
            target: getUniqueSelector(nav),
            html: nav.outerHTML.slice(0, 300),
            rect: fNav.rect,
            focalRect: fNav.rect,
            failureSummary: 'Multiple navigation landmarks exist without unique aria-label attributes. Screen reader announces "navigation" for both, leaving users unable to differentiate primary from secondary navigation.',
            srDetails: {
              currentText: '<nav>',
              diagnosis: 'VoiceOver / NVDA announces identical "navigation" landmarks with no context.',
              recommended: 'Add distinguishing aria-label (e.g. aria-label="Main menu" vs aria-label="Footer links").',
            },
          });
        });
      }
    }

    // 4. Focusable Elements Inside aria-hidden="true" (WCAG 4.1.2)
    const hiddenFocusNodes = [];
    const ariaHiddenContainers = Array.from(document.querySelectorAll('[aria-hidden="true"]'));
    for (const container of ariaHiddenContainers) {
      if (isExtensionElement(container)) continue;
      const focusableChildren = container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
      for (const child of Array.from(focusableChildren).slice(0, 3)) {
        const fChild = getFocalTarget(child);
        hiddenFocusNodes.push({
          target: getUniqueSelector(child),
          html: child.outerHTML.slice(0, 300),
          rect: fChild.rect,
          focalRect: fChild.rect,
          failureSummary: 'Interactive focusable element is nested inside a container with aria-hidden="true". Keyboard focus will land on this control, but the screen reader will remain completely silent.',
          srDetails: {
            currentText: child.outerHTML.slice(0, 60),
            diagnosis: 'Critical silent focus trap: keyboard lands on element, but screen reader announces nothing.',
            recommended: 'Add tabindex="-1" / inert to hidden elements, or remove aria-hidden="true" if element is active.',
          },
        });
      }
    }

    // 5. Ambiguous Link Purpose in Screen Reader Links List (WCAG 2.4.4, 2.4.9)
    const ambiguousLinkNodes = [];
    const links = Array.from(document.querySelectorAll('a[href]'));
    const vaguePhrases = new Set([
      'click here', 'click', 'learn more', 'read more', 'more', 'details', 'view',
      'here', 'link', 'continue', 'go', 'find out more', 'explore', 'see more',
    ]);

    for (const link of links) {
      if (isExtensionElement(link)) continue;
      const text = (link.innerText || '').trim().toLowerCase();
      const ariaLabel = (link.getAttribute('aria-label') || '').trim();

      if (vaguePhrases.has(text) && !ariaLabel) {
        const fLink = getFocalTarget(link);
        ambiguousLinkNodes.push({
          target: getUniqueSelector(link),
          html: link.outerHTML.slice(0, 300),
          rect: fLink.rect,
          focalRect: fLink.rect,
          failureSummary: `Link text "${text}" is ambiguous without contextual aria-label. Screen reader "Links List" will display isolated repetitive "${text}" entries.`,
          srDetails: {
            currentText: `"${text}"`,
            diagnosis: 'Fails in screen reader Links List (VO + U / NVDA Elements List) because destination is not conveyed.',
            recommended: `Add descriptive aria-label explaining link destination (e.g. aria-label="${text} about our annual insurance policies").`,
          },
        });
      }
    }

    // 6. Voiceover Announcement Sequence (Simulated Speech Timeline)
    const speechSequence = extractScreenReaderNarrative(document.body, 160);

    const totalBarriers = altQualityNodes.length + headingNodes.length + landmarkNodes.length + hiddenFocusNodes.length + ambiguousLinkNodes.length;
    const srScore = Math.max(15, Math.min(100, Math.round(100 - (totalBarriers * 7))));

    return {
      srScore,
      altQualityNodes: altQualityNodes.slice(0, 25),
      headingNodes: headingNodes.slice(0, 25),
      landmarkNodes: landmarkNodes.slice(0, 25),
      hiddenFocusNodes: hiddenFocusNodes.slice(0, 25),
      ambiguousLinkNodes: ambiguousLinkNodes.slice(0, 25),
      speechSequence: speechSequence.slice(0, 160),
    };
  }

  /**
   * Evaluates sequential keyboard tab navigation order and detects flow anomalies.
   * Elements with positive tabindex (> 0) precede normal elements and disrupt natural order.
   * Detects visual order jumps, missing accessible names, and skip-to-content links.
   * @returns {Object} Structured tab order data
   */
  /**
   * Resolves the actual visible DOM element and bounding rect for interactive controls.
   * Modern web forms frequently hide native inputs (e.g. input[type="radio"], input[type="checkbox"])
   * off-screen using `position: absolute; left: -9999px;` or `clip: rect(0,0,0,0);` while rendering
   * custom labels, cards, or styled wrappers.
   * This helper finds the visible interactive target so indicators, badges, and focus trails
   * render accurately on-screen rather than flying off the canvas.
   * @param {Element} el
   * @returns {{ visualElement: Element, rect: { top: number, left: number, width: number, height: number } }}
   */
  function resolveVisualTarget(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') {
      return { visualElement: el, rect: { top: 0, left: 0, width: 0, height: 0 } };
    }

    const rect = el.getBoundingClientRect();
    const isOffscreen = rect.left < -20 || rect.top < -20 || rect.left > (window.innerWidth * 2);
    const isTinyOrZero = rect.width <= 2 || rect.height <= 2;

    if (isOffscreen || isTinyOrZero) {
      // 1. Check associated <label>
      let label = null;
      if (el.labels && el.labels.length > 0) {
        label = el.labels[0];
      } else if (el.id) {
        try {
          label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        } catch (_) {}
      }
      if (!label) {
        label = el.closest('label');
      }

      if (label) {
        const lRect = label.getBoundingClientRect();
        if (lRect.width > 2 && lRect.height > 2 && lRect.left >= 0 && lRect.top >= 0) {
          return {
            visualElement: label,
            rect: {
              top: Math.round(lRect.top),
              left: Math.round(lRect.left),
              width: Math.round(lRect.width),
              height: Math.round(lRect.height),
            }
          };
        }
      }

      // 2. Custom card, wrapper, or button container
      const wrapper = el.closest('.radio-card, .custom-radio, .form-check, .checkbox-card, .radio-btn, .option-card, [role="radio"], [role="checkbox"], .choice-card, .field-wrapper, .input-group');
      if (wrapper) {
        const wRect = wrapper.getBoundingClientRect();
        if (wRect.width > 2 && wRect.height > 2 && wRect.left >= 0 && wRect.top >= 0) {
          return {
            visualElement: wrapper,
            rect: {
              top: Math.round(wRect.top),
              left: Math.round(wRect.left),
              width: Math.round(wRect.width),
              height: Math.round(wRect.height),
            }
          };
        }
      }

      // 3. Ascend to closest visible ancestor
      let parent = el.parentElement;
      while (parent && parent !== document.body && parent !== document.documentElement) {
        const pRect = parent.getBoundingClientRect();
        if (pRect.width > 15 && pRect.height > 15 && pRect.left >= 0 && pRect.left < window.innerWidth && pRect.top >= 0) {
          return {
            visualElement: parent,
            rect: {
              top: Math.round(pRect.top),
              left: Math.round(pRect.left),
              width: Math.round(pRect.width),
              height: Math.round(pRect.height),
            }
          };
        }
        parent = parent.parentElement;
      }
    }

    return {
      visualElement: el,
      rect: {
        top: Math.round(Math.max(0, rect.top)),
        left: Math.round(Math.max(0, rect.left)),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
    };
  }

  /**
   * Resolves the focal visual sub-target and bounding rect for an issue.
   * For wide or oversized container elements (e.g. 1280px wide card-headers, accordion-headers,
   * form-groups, or rows), this finds the core text/control child (button, heading, label, input, title)
   * so screenshot cropping centers on the exact area of the issue rather than shrinking an entire row.
   * @param {Element} el
   * @returns {{ element: Element, rect: { top: number, left: number, width: number, height: number } }}
   */
  function getFocalTarget(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') {
      return { element: el, rect: { top: 0, left: 0, width: 0, height: 0 } };
    }

    // 1. Resolve visual target if element is off-screen/hidden (e.g. native radio/checkbox)
    const resolved = resolveVisualTarget(el);
    const baseEl = resolved.visualElement || el;
    const baseRect = resolved.rect || baseEl.getBoundingClientRect();

    // 2. If already compact (<= 450px wide and <= 250px high), it's already a focused target
    if (baseRect.width > 0 && baseRect.width <= 450 && baseRect.height > 0 && baseRect.height <= 250) {
      return {
        element: baseEl,
        rect: {
          top: Math.round(baseRect.top),
          left: Math.round(baseRect.left),
          width: Math.round(baseRect.width),
          height: Math.round(baseRect.height),
        }
      };
    }

    // 3. For wide or tall containers (card-header, accordion-header, form-group, row, etc.),
    // find the primary focal content child (heading, button, label, control, text title)
    try {
      const focalCandidate = baseEl.querySelector(
        'button, h1, h2, h3, h4, h5, h6, [role="heading"], [role="button"], label, input, select, textarea, a, .accordion-title, .card-title, .title, legend, strong, b'
      );
      if (focalCandidate) {
        const cRect = focalCandidate.getBoundingClientRect();
        if (cRect.width > 10 && cRect.height > 10 && cRect.width < baseRect.width) {
          return {
            element: focalCandidate,
            rect: {
              top: Math.round(cRect.top),
              left: Math.round(cRect.left),
              width: Math.round(cRect.width),
              height: Math.round(cRect.height),
            }
          };
        }
      }

      // Check for non-empty direct text node
      const range = document.createRange();
      for (const child of baseEl.childNodes) {
        if (child.nodeType === Node.TEXT_NODE && child.textContent.trim().length > 0) {
          range.selectNodeContents(child);
          const tRect = range.getBoundingClientRect();
          if (tRect.width > 10 && tRect.height > 10) {
            return {
              element: baseEl,
              rect: {
                top: Math.round(tRect.top),
                left: Math.round(tRect.left),
                width: Math.round(tRect.width),
                height: Math.round(tRect.height),
              }
            };
          }
        }
      }
    } catch (_) {}

    return {
      element: baseEl,
      rect: {
        top: Math.round(baseRect.top),
        left: Math.round(baseRect.left),
        width: Math.round(Math.min(baseRect.width, 450)),
        height: Math.round(baseRect.height),
      }
    };
  }

  let lastTabOrderElements = [];

  function evaluateTabNavigationOrder() {
    const candidates = Array.from(document.querySelectorAll(
      'a[href], button, input, select, textarea, [tabindex], summary, iframe, [contenteditable], audio[controls], video[controls], area[href]'
    ));

    const rawFocusable = [];

    for (const el of candidates) {
      if (!el || isExtensionElement(el)) continue;
      if (el.hasAttribute('disabled')) continue;
      if (el.tagName === 'INPUT' && el.type === 'hidden') continue;

      const rawTabIndex = el.getAttribute('tabindex');
      let tabIndex = 0;
      let hasExplicitTabIndex = false;

      if (rawTabIndex !== null) {
        const parsed = parseInt(rawTabIndex, 10);
        if (!isNaN(parsed)) {
          tabIndex = parsed;
          hasExplicitTabIndex = true;
        }
      } else {
        const naturallyFocusable = /^(a|button|input|select|textarea|summary|iframe)$/i.test(el.tagName) || el.hasAttribute('contenteditable');
        if (!naturallyFocusable) continue;
      }

      if (tabIndex < 0) continue;
      if (el.closest('[inert]')) continue;

      // Check visibility
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;

      const { visualElement, rect } = resolveVisualTarget(el);
      const isZeroSize = rect.width === 0 && rect.height === 0;
      const textContent = (el.textContent || '').trim().toLowerCase();
      const isSkipLink = textContent.includes('skip to') || textContent.includes('skip navigation') || (el.getAttribute('href') || '').startsWith('#');

      if (isZeroSize && !isSkipLink && rect.left <= 0) continue;

      // Robust accessible name resolution across native form controls and custom ARIA elements
      let accessibleName = '';
      if (el.getAttribute('aria-label')) {
        accessibleName = el.getAttribute('aria-label').trim();
      } else if (el.getAttribute('aria-labelledby')) {
        const ids = el.getAttribute('aria-labelledby').split(/\s+/);
        accessibleName = ids.map(id => document.getElementById(id)?.textContent || '').join(' ').trim();
      } else if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
        const labelEl = (el.labels && el.labels[0])
          ? el.labels[0]
          : (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : el.closest('label'));
        if (labelEl) {
          accessibleName = (labelEl.innerText || labelEl.textContent || '').trim();
        } else if (el.type === 'submit' || el.type === 'button') {
          accessibleName = el.value || '';
        } else if (el.placeholder) {
          accessibleName = el.placeholder;
        }
      }
      if (!accessibleName && el.title) {
        accessibleName = el.title;
      }
      if (!accessibleName) {
        accessibleName = (el.innerText || el.textContent || '').trim();
      }

      let role = el.getAttribute('role') || el.tagName.toLowerCase();
      if (el.tagName === 'INPUT') {
        role = `${el.type || 'text'} input`;
      } else if (el.tagName === 'A') {
        role = 'link';
      }

      const isRadio = (el.tagName === 'INPUT' && el.type === 'radio') || el.getAttribute('role') === 'radio';
      let radioGroupName = null;
      if (isRadio) {
        if (el.tagName === 'INPUT') {
          const formId = el.form ? (el.form.id || el.form.name || 'form') : 'no-form';
          radioGroupName = `${formId}::${el.name || el.id || 'unnamed-radio'}`;
        } else {
          const groupContainer = el.closest('[role="radiogroup"]') || el.closest('form') || el.parentElement;
          const containerId = groupContainer ? (groupContainer.id || groupContainer.className || 'radiogroup') : 'radiogroup';
          radioGroupName = `aria::${containerId}::${el.getAttribute('name') || 'radio'}`;
        }
      }

      rawFocusable.push({
        element: el,
        visualElement,
        selector: getUniqueSelector(el),
        tagName: el.tagName.toLowerCase(),
        role,
        name: accessibleName.replace(/\s+/g, ' ').slice(0, 100) || '(No accessible name)',
        tabIndex,
        hasExplicitTabIndex,
        isSkipLink,
        isRadio,
        radioGroupName,
        checked: el.checked || el.getAttribute('aria-checked') === 'true',
        rect,
      });
    }

    // Process Radio Groups:
    // In HTML/WAI-ARIA sequential keyboard navigation, each radio button group forms
    // a single logical tab stop:
    // - If one option is checked, pressing Tab moves focus directly to that checked radio button.
    // - If NO option is checked, pressing Tab moves focus to the first enabled radio button.
    // Once inside the group, pressing Tab moves OUT of the group to the next section/control,
    // rather than tabbing sequentially between individual answers.
    // Arrow keys (↑ / ↓ / ← / →) are used by keyboard users to change selection within the group.
    const radioGroups = new Map();
    rawFocusable.forEach(item => {
      if (item.isRadio && item.radioGroupName) {
        if (!radioGroups.has(item.radioGroupName)) {
          radioGroups.set(item.radioGroupName, []);
        }
        radioGroups.get(item.radioGroupName).push(item);
      }
    });

    const activeRadioStops = new Set();
    radioGroups.forEach((items) => {
      const checkedItem = items.find(it => it.checked);
      const activeItem = checkedItem || items[0];
      if (activeItem) {
        activeRadioStops.add(activeItem);
        activeItem.isRadioGroupLeader = true;
        activeItem.radioGroupTotal = items.length;
        activeItem.role = `radio group (1 of ${items.length})`;
        activeItem.radioOptions = items.map(it => it.name).filter(Boolean);
      }
    });

    // Filter out radio buttons that are not the active tab stop for their group
    const focusable = rawFocusable.filter(item => {
      if (item.isRadio && item.radioGroupName) {
        return activeRadioStops.has(item);
      }
      return true;
    });

    // HTML5 sequential tab order sorting
    const positiveTabindexList = focusable
      .filter(item => item.tabIndex > 0)
      .sort((a, b) => {
        if (a.tabIndex !== b.tabIndex) return a.tabIndex - b.tabIndex;
        const pos = a.element.compareDocumentPosition(b.element);
        return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
      });

    const normalTabindexList = focusable
      .filter(item => item.tabIndex === 0)
      .sort((a, b) => {
        const pos = a.element.compareDocumentPosition(b.element);
        return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
      });

    const orderedSequence = [...positiveTabindexList, ...normalTabindexList];
    lastTabOrderElements = orderedSequence;

    let positiveTabIndexCount = positiveTabindexList.length;
    let visualJumpCount = 0;
    let missingNameCount = 0;
    let hasSkipLink = false;

    if (orderedSequence.length > 0) {
      const firstTwo = orderedSequence.slice(0, 2);
      hasSkipLink = firstTwo.some(it => it.isSkipLink);
    }

    const analyzedItems = orderedSequence.map((item, idx) => {
      const prev = idx > 0 ? orderedSequence[idx - 1] : null;
      let hasVisualJump = false;
      let warningText = null;

      if (item.tabIndex > 0) {
        warningText = `tabindex="${item.tabIndex}" forces element earlier in keyboard flow, disrupting natural DOM order (WCAG 2.4.3).`;
      }

      if (prev) {
        const verticalJump = prev.rect.top - item.rect.top;
        if (verticalJump > 160 && !item.isSkipLink) {
          hasVisualJump = true;
          visualJumpCount++;
          if (!warningText) {
            warningText = `Focus jumps upwards by ~${Math.round(verticalJump)}px, contradicting visual top-to-bottom reading order.`;
          }
        }
      }

      const hasMissingName = !item.name || item.name === '(No accessible name)';
      if (hasMissingName) {
        missingNameCount++;
        if (!warningText) {
          warningText = 'Interactive element has no discernible accessible name for assistive tools.';
        }
      }

      return {
        step: idx + 1,
        selector: item.selector,
        tagName: item.tagName,
        role: item.role,
        name: item.name,
        tabIndex: item.tabIndex,
        hasPositiveTabIndex: item.tabIndex > 0,
        hasVisualJump,
        hasMissingName,
        warningText,
        rect: item.rect,
        isRadioGroupLeader: !!item.isRadioGroupLeader,
        radioGroupTotal: item.radioGroupTotal || 1,
        radioOptions: item.radioOptions || [],
      };
    });

    let flowStatus = 'Sequential';
    if (positiveTabIndexCount > 0) {
      flowStatus = 'Disrupted';
    } else if (visualJumpCount > 0) {
      flowStatus = 'Needs Review';
    }

    return {
      totalElements: analyzedItems.length,
      positiveTabIndexCount,
      visualJumpCount,
      missingNameCount,
      hasSkipLink,
      flowStatus,
      items: analyzedItems.slice(0, 150),
    };
  }

  /**
   * Extracts all hyperlinks from the DOM with accessible names, destination URLs,
   * target attributes, and in-page anchor validation.
   * @returns {Array<Object>} List of link descriptors
   */
  function extractPageLinks() {
    const anchors = Array.from(document.querySelectorAll('a[href], [role="link"][href]'));
    const results = [];

    for (let i = 0; i < anchors.length; i++) {
      const el = anchors[i];
      if (!el || isExtensionElement(el)) continue;
      const rawHref = (el.getAttribute('href') || '').trim();
      if (!rawHref) {
        results.push({
          index: i + 1,
          selector: getUniqueSelector(el),
          rawHref: '',
          url: '',
          text: (el.innerText || el.textContent || el.getAttribute('aria-label') || '').trim() || '(Empty link)',
          isHash: false,
          hashTargetExists: false,
          isProtocol: false,
          isExternal: false,
          isEmpty: true,
          target: el.getAttribute('target') || '',
          rel: el.getAttribute('rel') || '',
          rect: (() => {
            const r = el.getBoundingClientRect();
            return { top: Math.round(r.top + window.scrollY), left: Math.round(r.left + window.scrollX), width: Math.round(r.width), height: Math.round(r.height) };
          })(),
        });
        continue;
      }

      let isHash = rawHref.startsWith('#');
      let hashTargetExists = false;
      let isProtocol = false;
      let isExternal = false;
      let resolvedUrl = '';

      if (isHash) {
        const isSpaRoute = /^#(\/|!)/.test(rawHref);
        const isTopAnchor = rawHref.toLowerCase() === '#top';
        const targetId = rawHref.slice(1);
        if (isTopAnchor || isSpaRoute) {
          hashTargetExists = true;
        } else if (targetId) {
          try {
            let decodedId = targetId;
            try {
              decodedId = decodeURIComponent(targetId);
            } catch (_) {}

            hashTargetExists = !!(
              document.getElementById(targetId) ||
              (decodedId !== targetId && document.getElementById(decodedId)) ||
              document.querySelector(`[name="${CSS.escape(targetId)}"]`) ||
              (decodedId !== targetId && document.querySelector(`[name="${CSS.escape(decodedId)}"]`))
            );
          } catch (_) {
            hashTargetExists = false;
          }
        } else {
          hashTargetExists = false; // Just href="#"
        }
        resolvedUrl = window.location.href.split('#')[0] + rawHref;
      } else if (/^(mailto|tel|sms|javascript):/i.test(rawHref)) {
        isProtocol = true;
        resolvedUrl = rawHref;
      } else {
        try {
          const baseUri = document.baseURI || window.location.href;
          const parsed = new URL(rawHref, baseUri);
          resolvedUrl = parsed.href;
          isExternal = parsed.origin !== window.location.origin;
        } catch (_) {
          resolvedUrl = rawHref;
        }
      }

      let text = (el.innerText || el.textContent || '').trim();
      if (!text) {
        text = el.getAttribute('aria-label') || el.getAttribute('title') || '';
      }
      if (!text) {
        const img = el.querySelector('img[alt]');
        if (img) text = img.getAttribute('alt') || '';
      }
      if (!text) {
        text = '(Empty link text)';
      }
      if (text.length > 80) text = text.slice(0, 77) + '...';

      const r = el.getBoundingClientRect();

      results.push({
        index: i + 1,
        selector: getUniqueSelector(el),
        rawHref,
        url: resolvedUrl,
        text,
        isHash,
        hashTargetExists,
        isProtocol,
        isExternal,
        isEmpty: false,
        target: el.getAttribute('target') || '',
        rel: el.getAttribute('rel') || '',
        rect: {
          top: Math.round(r.top + window.scrollY),
          left: Math.round(r.left + window.scrollX),
          width: Math.round(r.width),
          height: Math.round(r.height),
        },
      });
    }

    return results;
  }


  // =========================================================================
  // MOBILE & RESPONSIVE LAYOUT AUDIT ENGINE & VIEWPORT SIMULATOR
  // =========================================================================
// @ts-nocheck
  /**
   * Robust element finder supporting selectors, arrays, text matching, and iframe/rootDoc contexts
   * @param {string|string[]|Element} target
   * @param {Document} [targetDoc]
   * @param {Object} [meta]
   * @returns {Element|null}
   */
  function findElement(target, targetDoc = document, meta = {}) {
    if (!target) return null;
    if (meta && meta.__af_elA && targetDoc && targetDoc.contains(meta.__af_elA)) {
      return meta.__af_elA;
    }
    if (meta && meta.__af_elB && targetDoc && targetDoc.contains(meta.__af_elB)) {
      return meta.__af_elB;
    }
    if (target && (target.nodeType === 1 || (typeof Element !== 'undefined' && target instanceof Element))) {
      return typeof isExtensionElement === 'function' && isExtensionElement(target) ? null : target;
    }

    const tStr = typeof target === 'string' ? target.trim() : (Array.isArray(target) ? target.join(' ') : String(target || ''));
    if (tStr.includes('__auditforge') || tStr.includes('__af_')) return null;

    // Handle array of selectors (e.g. iframe traversal from axe-core)
    if (Array.isArray(target)) {
      if (target.length === 1) return findElement(target[0], targetDoc, meta);
      let currentDoc = targetDoc;
      let foundEl = null;
      for (let i = 0; i < target.length; i++) {
        const sel = target[i];
        if (!currentDoc || sel.includes('__auditforge') || sel.includes('__af_')) break;
        try {
          foundEl = currentDoc.querySelector(sel);
          if (foundEl && (foundEl.tagName === 'IFRAME' || foundEl.tagName === 'FRAME')) {
            try {
              currentDoc = foundEl.contentDocument || foundEl.contentWindow?.document;
            } catch (_) {
              return (typeof isExtensionElement === 'function' && isExtensionElement(foundEl)) ? null : foundEl;
            }
          }
        } catch (_) {
          break;
        }
      }
      if (foundEl && (!isExtensionElement || !isExtensionElement(foundEl))) return foundEl;
    }

    const selectorStr = typeof target === 'string' ? target.trim() : String(target).trim();
    if (!selectorStr) return null;

    // Root document scope checks
    if (selectorStr === 'html' || selectorStr === ':root') return targetDoc.documentElement;
    if (selectorStr === 'body') return targetDoc.body;

    // 1. Direct querySelector
    try {
      const el = targetDoc.querySelector(selectorStr);
      if (el && (!isExtensionElement || !isExtensionElement(el))) return el;
    } catch (_) {}

    // 2. Container ID scoping: if selector contains #id, search from that container
    const idMatch = selectorStr.match(/#([a-zA-Z0-9_-]+)/);
    if (idMatch) {
      const containerId = idMatch[1];
      try {
        const container = targetDoc.getElementById(containerId);
        if (container && (!isExtensionElement || !isExtensionElement(container))) {
          if (selectorStr.endsWith(`#${containerId}`) || !selectorStr.includes(' ')) return container;
          const afterId = selectorStr.split(`#${containerId}`)[1].replace(/^\s*>\s*/, '').trim();
          if (afterId) {
            try {
              const subEl = container.querySelector(afterId);
              if (subEl && (!isExtensionElement || !isExtensionElement(subEl))) return subEl;
            } catch (_) {}
            const lastTagMatch = afterId.match(/([a-z0-9-]+)(?::[^\s>]+)?$/i);
            if (lastTagMatch) {
              const tag = lastTagMatch[1];
              const subCandidates = Array.from(container.querySelectorAll(tag));
              if (meta && meta.html) {
                const snippet = meta.html.slice(0, 45);
                const matched = subCandidates.find(c => (!isExtensionElement || !isExtensionElement(c)) && c.outerHTML && c.outerHTML.includes(snippet));
                if (matched) return matched;
              }
              if (meta && (meta.text || meta.textA)) {
                const q = (meta.text || meta.textA).trim().toLowerCase();
                const matched = subCandidates.find(c => (!isExtensionElement || !isExtensionElement(c)) && (c.innerText || c.textContent || '').trim().toLowerCase().includes(q));
                if (matched) return matched;
              }
              if (subCandidates.length > 0) return subCandidates[0];
            }
          }
        }
      } catch (_) {}
    }

    // 3. Direct ID lookup if selector contains #id
    if (selectorStr.startsWith('#') && !selectorStr.includes(' ') && !selectorStr.includes('>') && !selectorStr.includes(':')) {
      try {
        const el = targetDoc.getElementById(selectorStr.slice(1));
        if (el && (!isExtensionElement || !isExtensionElement(el))) return el;
      } catch (_) {}
    }

    // 4. Escape CSS identifiers (colons, dots, slashes in Tailwind / React / Vue classes)
    try {
      const escaped = selectorStr.replace(/#([^\s>+~.:[\]]+)/g, (_, id) => `#${CSS.escape(id)}`);
      const el = targetDoc.querySelector(escaped);
      if (el && (!isExtensionElement || !isExtensionElement(el))) return el;
    } catch (_) {}

    // 5. Terminal segment fallback (rightmost component)
    const parts = selectorStr.split(/\s*>\s*|\s+/).filter(Boolean);
    if (parts.length > 1) {
      for (let i = parts.length - 1; i >= 0; i--) {
        try {
          const seg = parts[i];
          if (seg.includes('__auditforge') || seg.includes('__af_')) continue;
          const el = targetDoc.querySelector(seg);
          if (el && (!isExtensionElement || !isExtensionElement(el))) return el;
        } catch (_) {}
      }
    }

    // 6. HTML snippet matching fallback
    if (meta && meta.html) {
      try {
        const hrefMatch = meta.html.match(/href=["']([^"']+)["']/i);
        if (hrefMatch) {
          const hrefVal = hrefMatch[1].split(/[?#]/)[0];
          if (hrefVal) {
            const matchedLink = Array.from(targetDoc.querySelectorAll('a')).find(a => (!isExtensionElement || !isExtensionElement(a)) && (a.getAttribute('href') || '').includes(hrefVal));
            if (matchedLink) return matchedLink;
          }
        }
        const tagMatch = meta.html.match(/^<([a-z0-9-]+)/i);
        if (tagMatch) {
          const tag = tagMatch[1];
          const candidates = Array.from(targetDoc.querySelectorAll(tag));
          const snippet = meta.html.slice(0, 45);
          const matched = candidates.find((c) => (!isExtensionElement || !isExtensionElement(c)) && c.outerHTML && c.outerHTML.includes(snippet));
          if (matched) return matched;
        }
      } catch (_) {}
    }

    // 7. Match by text content in interactive elements
    if (meta && (meta.text || meta.textA || meta.target)) {
      const queryText = (meta.text || meta.textA || '').trim().toLowerCase();
      if (queryText) {
        const interactives = Array.from(targetDoc.querySelectorAll('button, a, input, select, textarea, [role="button"], [role="link"], h1, h2, h3, h4, img'));
        const matched = interactives.find((el) => (!isExtensionElement || !isExtensionElement(el)) && ((el.innerText || el.textContent || '')).trim().toLowerCase().includes(queryText));
        if (matched) return matched;
      }
    }

    return null;
  }

const POPULAR_MOBILE_DEVICES = {
  'iphone-16-pro': { id: 'iphone-16-pro', name: 'iPhone 16 / 15 Pro', width: 393, height: 852, dpr: 3 },
  'iphone-se': { id: 'iphone-se', name: 'iPhone SE (Compact)', width: 375, height: 667, dpr: 2 },
  'galaxy-s24': { id: 'galaxy-s24', name: 'Samsung Galaxy S24', width: 360, height: 780, dpr: 3 },
  'pixel-8': { id: 'pixel-8', name: 'Google Pixel 8', width: 412, height: 915, dpr: 2.6 },
  'iphone-16-max': { id: 'iphone-16-max', name: 'iPhone 16 Pro Max', width: 430, height: 932, dpr: 3 },
};

function evaluateMobileResponsiveLayout(activeDeviceId = 'iphone-16-pro', options = {}) {
  const doc = options.rootDoc || document;
  const win = doc.defaultView || (doc.ownerDocument && doc.ownerDocument.defaultView) || window;
  const activeDeviceConfig = POPULAR_MOBILE_DEVICES[activeDeviceId] || POPULAR_MOBILE_DEVICES['iphone-16-pro'];
  const isLandscape = Boolean(options.landscape || options.isLandscape);
  const activeDevice = {
    ...activeDeviceConfig,
    width: isLandscape ? activeDeviceConfig.height : activeDeviceConfig.width,
    height: isLandscape ? activeDeviceConfig.width : activeDeviceConfig.height,
    isLandscape,
  };
  const allDevices = Object.values(POPULAR_MOBILE_DEVICES);

  const issues = [];
  const issuesByDevice = {};
  for (const dev of allDevices) {
    issuesByDevice[dev.id] = [];
  }

  // Detect if document is rendered at or near mobile viewport width (e.g. inside mobile simulator iframe)
  const isDocRenderedAtMobileWidth = win.innerWidth <= (activeDevice.width + 50) || (doc !== document && doc.body);

  // Helper to test if element is visible
  function isElementVisible(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return false;
    if (typeof isExtensionElement === 'function' && isExtensionElement(el)) return false;
    if (el.id && (el.id.includes('__auditforge') || el.id.includes('__af_'))) return false;

    // Check basic style visibility
    try {
      const elWin = el.ownerDocument?.defaultView || win;
      const style = elWin.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0' || style.visibility === 'collapse') {
        return false;
      }
      if (style.pointerEvents === 'none' && !el.matches('img, svg, p, span, h1, h2, h3, h4, h5, h6')) {
        return false;
      }
      if (el.getAttribute('aria-hidden') === 'true' || el.closest('[aria-hidden="true"], [hidden]')) {
        return false;
      }
    } catch (_) {}

    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // 1. Viewport Meta Configuration Check
  let viewportMetaIssues = [];
  const viewportMeta = (doc.head || doc).querySelector?.('meta[name="viewport"]') || document.querySelector('meta[name="viewport"]');
  if (!viewportMeta) {
    const issue = {
      id: 'mobile-viewport-missing',
      type: 'viewport-meta',
      severity: 'critical',
      wcagRule: 'WCAG 2.2 AA 1.4.10 Reflow / 1.4.4',
      title: 'Missing Mobile Viewport Meta Tag',
      selector: 'head',
      html: '<head> ... </head>',
      failureSummary: 'Page lacks a <meta name="viewport"> tag. Mobile browsers will render a 980px desktop view scaled down, causing tiny unreadable text, broken responsive steps, and severe horizontal clipping.',
      remediationCode: '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
      device: 'All Mobile Devices',
      deviceId: 'all',
    };
    issues.push(issue);
    viewportMetaIssues.push(issue);
    for (const dev of allDevices) issuesByDevice[dev.id].push(issue);
  } else {
    const content = (viewportMeta.getAttribute('content') || '').toLowerCase();
    if (content.includes('user-scalable=no') || content.includes('user-scalable=0') || content.includes('maximum-scale=1.0') || content.includes('maximum-scale=1,')) {
      const issue = {
        id: 'mobile-viewport-zoom-locked',
        type: 'viewport-meta',
        severity: 'serious',
        wcagRule: 'WCAG 2.2 AA 1.4.4 Resize Text',
        title: 'Mobile Pinch-to-Zoom Disabled (user-scalable=no)',
        selector: 'meta[name="viewport"]',
        html: viewportMeta.outerHTML.slice(0, 300),
        failureSummary: 'Viewport restricts pinch-to-zoom (user-scalable=no or maximum-scale=1). This violates WCAG 1.4.4 by preventing users with low vision or motor impairments from zooming into content.',
        remediationCode: '<!-- Enable mobile zooming and scale up to 500% (WCAG 1.4.4) -->\n<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">',
        device: 'All Mobile Devices',
        deviceId: 'all',
      };
      issues.push(issue);
      viewportMetaIssues.push(issue);
      for (const dev of allDevices) issuesByDevice[dev.id].push(issue);
    }
    if (!content.includes('width=device-width')) {
      const issue = {
        id: 'mobile-viewport-no-width',
        type: 'viewport-meta',
        severity: 'moderate',
        wcagRule: 'WCAG 2.2 AA 1.4.10 Reflow',
        title: 'Viewport Missing width=device-width',
        selector: 'meta[name="viewport"]',
        html: viewportMeta.outerHTML.slice(0, 300),
        failureSummary: 'Viewport tag does not declare width=device-width, leading to inconsistent initial responsive sizing across mobile screen widths.',
        remediationCode: '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
        device: 'All Mobile Devices',
        deviceId: 'all',
      };
      issues.push(issue);
      viewportMetaIssues.push(issue);
      for (const dev of allDevices) issuesByDevice[dev.id].push(issue);
    }
  }

  // 2. Horizontal Overflow Check (Content Too Wide)
  const fixedWidthRules = [];
  try {
    const sheets = doc.styleSheets || document.styleSheets;
    for (const sheet of sheets) {
      try {
        for (const rule of sheet.cssRules || []) {
          // If this rule is inside a desktop-only media query (e.g. min-width: 768px, 48em, 40rem),
          // it does not apply on mobile screens, so skip it to avoid false alarms!
          if (rule.parentRule && rule.parentRule.type === CSSRule.MEDIA_RULE) {
            const mediaCondition = (rule.parentRule.conditionText || rule.parentRule.media?.mediaText || '').toLowerCase();
            let minWidthPx = 0;
            const pxMatch = mediaCondition.match(/min-width:\s*([\d.]+)px/);
            if (pxMatch) minWidthPx = parseFloat(pxMatch[1]);
            const emMatch = mediaCondition.match(/min-width:\s*([\d.]+)(?:em|rem)/);
            if (emMatch) minWidthPx = parseFloat(emMatch[1]) * 16;
            if (minWidthPx > 430) {
              continue; // Desktop media rule, skip!
            }
          }
          if (rule.style && rule.selectorText) {
            const w = rule.style.width;
            const mw = rule.style.minWidth;
            let pxVal = 0;
            if (w && w.endsWith('px')) pxVal = Math.max(pxVal, parseFloat(w));
            if (mw && mw.endsWith('px')) pxVal = Math.max(pxVal, parseFloat(mw));
            if (pxVal > 0) {
              fixedWidthRules.push({ selector: rule.selectorText, width: pxVal });
            }
          }
        }
      } catch (_) {}
    }
  } catch (_) {}

  const candidateElements = Array.from((doc.body || doc).querySelectorAll('*')).filter(el => {
    if (typeof isExtensionElement === 'function' && isExtensionElement(el)) return false;
    if (['script', 'style', 'noscript', 'template', 'defs', 'clippath'].includes(el.tagName.toLowerCase())) return false;
    return isElementVisible(el);
  });

  const reportedOverflowSelectors = new Set();

  for (const dev of allDevices) {
    const devWidth = dev.width;

    for (const el of candidateElements) {
      const sel = typeof getUniqueSelector === 'function' ? getUniqueSelector(el) : el.tagName.toLowerCase();
      if (reportedOverflowSelectors.has(`${dev.id}:${sel}`)) continue;

      let style;
      try { style = win.getComputedStyle(el); } catch (_) { continue; }

      // Check: Fixed pixel min-width, width, or rigid unconstrained element exceeding device width
      let isFixedTooWide = false;
      let specifiedWidth = 0;

      // 0. Skip elements inside intentional accessible horizontal scrolling containers (WCAG 1.4.10)
      let isInsideHScroll = false;
      let p = el.parentElement;
      while (p && p !== (doc.body || document.body) && p !== (doc.documentElement || document.documentElement)) {
        try {
          const cs = win.getComputedStyle(p);
          if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') {
            isInsideHScroll = true;
            break;
          }
        } catch (_) {}
        p = p.parentElement;
      }
      if (isInsideHScroll) continue;

      const r = el.getBoundingClientRect();

      // If document is rendered at mobile viewport width (e.g. in the simulator iframe):
      // The browser's layout engine has already computed true responsive widths, flex-wrap, and media queries!
      if (isDocRenderedAtMobileWidth) {
        // If element and its scrollWidth fit cleanly within device viewport, it DOES NOT overflow!
        if (r.width <= devWidth + 6 && el.scrollWidth <= el.clientWidth + 6) {
          continue;
        }

        // Real overflow detected in rendered DOM:
        if (r.width > devWidth + 6 || (el.scrollWidth > el.clientWidth + 6 && el.scrollWidth > devWidth + 6)) {
          isFixedTooWide = true;
          specifiedWidth = Math.round(Math.max(r.width, el.scrollWidth));
        }
      } else {
        // Fallback for static desktop scan:
        // Skip elements that fluidly adapt via max-width: 100% or width: 100%
        const hasFluidMaxWidth = style.maxWidth === '100%' || style.maxWidth === '100vw' || style.width === '100%' || style.width === '100vw';
        if (hasFluidMaxWidth && el.scrollWidth <= devWidth + 6) continue;

        const inlineWidth = el.style.width || el.style.minWidth;
        const attrWidth = el.getAttribute('width');
        const computedMinWidth = parseFloat(style.minWidth) || 0;
        const computedWidth = parseFloat(style.width) || 0;
        const isRigidElement = ['table', 'pre', 'svg', 'canvas', 'img', 'video', 'iframe'].includes(el.tagName.toLowerCase());

        // 1. Min-width in computed style
        if (computedMinWidth > devWidth + 2) {
          isFixedTooWide = true;
          specifiedWidth = Math.round(computedMinWidth);
        }
        // 2. Inline style width in px
        else if (inlineWidth && inlineWidth.endsWith('px') && parseFloat(inlineWidth) > devWidth + 2 && !hasFluidMaxWidth) {
          isFixedTooWide = true;
          specifiedWidth = Math.round(parseFloat(inlineWidth));
        }
        // 3. Matched CSS rules with fixed px width (only if no responsive max-width)
        else if (!hasFluidMaxWidth) {
          for (const { selector, width } of fixedWidthRules) {
            if (width > devWidth + 2) {
              try {
                if (el.matches(selector)) {
                  if (style.maxWidth !== '100%' && style.maxWidth !== '100vw') {
                    isFixedTooWide = true;
                    specifiedWidth = Math.max(specifiedWidth, Math.round(width));
                  }
                }
              } catch (_) {}
            }
          }
        }

        // 4. HTML width attribute on media / table / iframe
        if (!isFixedTooWide && attrWidth && !attrWidth.includes('%') && !hasFluidMaxWidth) {
          const num = parseFloat(attrWidth);
          if (num > devWidth + 2) {
            isFixedTooWide = true;
            specifiedWidth = Math.round(num);
          }
        }

        // 5. Rigid elements without fluid max-width: 100%
        if (!isFixedTooWide && isRigidElement && (computedWidth > devWidth + 2 || el.scrollWidth > devWidth + 4)) {
          if (style.maxWidth !== '100%' && style.width !== '100%' && style.overflowX !== 'auto' && style.overflowX !== 'scroll') {
            const hasFixedWidth = (inlineWidth && inlineWidth.endsWith('px')) || (attrWidth && !attrWidth.includes('%')) || computedMinWidth > devWidth;
            if (hasFixedWidth) {
              isFixedTooWide = true;
              specifiedWidth = Math.round(Math.max(computedWidth, el.scrollWidth));
            }
          }
        }

        // 6. whiteSpace: nowrap causing scrollWidth to overflow
        if (!isFixedTooWide && style.whiteSpace === 'nowrap' && el.scrollWidth > devWidth + 4) {
          if (style.overflowX !== 'auto' && style.overflowX !== 'scroll' && !el.closest('[style*="overflow"]')) {
            if (computedMinWidth > devWidth || (inlineWidth && parseFloat(inlineWidth) > devWidth)) {
              isFixedTooWide = true;
              specifiedWidth = Math.round(el.scrollWidth);
            }
          }
        }

        // 7. Uncontained horizontal scroll overflow
        if (!isFixedTooWide && el.scrollWidth > el.clientWidth + 6 && el.scrollWidth > devWidth + 6 && style.overflowX !== 'auto' && style.overflowX !== 'scroll') {
          if (computedMinWidth > devWidth || (inlineWidth && parseFloat(inlineWidth) > devWidth)) {
            isFixedTooWide = true;
            specifiedWidth = Math.round(el.scrollWidth);
          }
        }
      }

      if (isFixedTooWide && specifiedWidth > devWidth) {
        reportedOverflowSelectors.add(`${dev.id}:${sel}`);
        const overflowPx = specifiedWidth - devWidth;
        const rect = {
          top: Math.round(r.top + win.scrollY),
          left: Math.round(r.left + win.scrollX),
          width: specifiedWidth,
          height: Math.round(r.height),
        };

        const overflowIssue = {
          id: `mobile-overflow-${dev.id}`,
          type: 'overflow',
          severity: overflowPx > 40 ? 'serious' : 'moderate',
          wcagRule: 'WCAG 2.2 AA 1.4.10 Reflow',
          title: `Content Too Wide on ${dev.name}`,
          selector: sel,
          html: (el.outerHTML || '').slice(0, 300),
          textA: (el.innerText || el.textContent || '').trim().slice(0, 80),
          __af_elA: el,
          rect,
          elementWidth: specifiedWidth,
          viewportWidth: devWidth,
          overflowPixels: overflowPx,
          device: dev.name,
          deviceId: dev.id,
          failureSummary: `Element width (${specifiedWidth}px) exceeds the ${dev.name} viewport width (${devWidth}px) by ${overflowPx}px. This forces horizontal scrolling and causes text or controls to be clipped on mobile.`,
          remediationCode: `/* Constrain width to mobile viewport and enable fluid scaling (WCAG 1.4.10) */\n${sel} {\n  max-width: 100% !important;\n  box-sizing: border-box !important;\n  width: auto !important;\n  overflow-x: auto; /* Adds touch scrollbar if content cannot wrap */\n}`,
        };

        issues.push(overflowIssue);
        issuesByDevice[dev.id].push(overflowIssue);
      }
    }
  }

  // 3. Overlapping Elements Check (Interactive Controls & Text Collisions)
  const interactiveAndTextElements = candidateElements.filter(el => {
    const tag = el.tagName.toLowerCase();
    // Exclude structural containers, cards, sections, and lists
    if (['div', 'section', 'article', 'main', 'aside', 'header', 'footer', 'form', 'nav', 'ul', 'ol', 'li'].includes(tag)) {
      return false;
    }
    // Exclude status badges, notification counters, pills, dots, tags, and small decorative indicators
    const cls = typeof el.className === 'string' ? el.className.toLowerCase() : '';
    if (cls.includes('badge') || cls.includes('counter') || cls.includes('pill') || cls.includes('indicator') || cls.includes('dot') || cls.includes('tag')) {
      return false;
    }
    // Exclude closed/collapsed modals or dropdown menus
    if (el.closest('.modal:not(.show), .dropdown-menu:not(.show), .drawer:not(.open), [aria-hidden="true"], [hidden]')) {
      return false;
    }
    if (['button', 'input', 'select', 'textarea'].includes(tag)) return true;
    if (tag === 'a' && el.hasAttribute('href')) return true;
    if (el.getAttribute('role') === 'button' || el.getAttribute('role') === 'link') return true;
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) return true;
    if (el.classList.contains('btn') || el.classList.contains('button')) return true;
    return false;
  }).slice(0, 80); // Capped for responsive speed

  const reportedOverlapPairs = new Set();

  for (let i = 0; i < interactiveAndTextElements.length; i++) {
    const elA = interactiveAndTextElements[i];
    const rA = elA.getBoundingClientRect();
    if (rA.width <= 0 || rA.height <= 0) continue;

    for (let j = i + 1; j < interactiveAndTextElements.length; j++) {
      const elB = interactiveAndTextElements[j];
      if (elA.contains(elB) || elB.contains(elA)) continue;

      // Skip if both elements belong to the same parent button, link, or card control
      if (elA.closest('a, button, [role="button"]') && elA.closest('a, button, [role="button"]') === elB.closest('a, button, [role="button"]')) continue;

      // Skip elements grouped in a button-group or segmented control with intentional touching borders
      const btnGroupA = elA.closest('.btn-group, [role="group"]');
      const btnGroupB = elB.closest('.btn-group, [role="group"]');
      if (btnGroupA && btnGroupA === btnGroupB) continue;

      // Skip floating labels over inputs (Material Design / Bootstrap floating labels)
      if ((elA.tagName === 'LABEL' && elA.htmlFor === elB.id) || (elB.tagName === 'LABEL' && elB.htmlFor === elA.id)) continue;
      if (elA.closest('.form-floating, [class*="floating-label" i]') && elA.closest('.form-floating, [class*="floating-label" i]') === elB.closest('.form-floating, [class*="floating-label" i]')) continue;

      // Skip card link overlays (stretched links covering a card)
      const sA = win.getComputedStyle(elA);
      const sB = win.getComputedStyle(elB);
      if (sA.position === 'absolute' && elA.tagName === 'A' && elB.parentElement === elA.parentElement) continue;
      if (sB.position === 'absolute' && elB.tagName === 'A' && elA.parentElement === elB.parentElement) continue;

      // Skip elements in different steps of a multi-step flow
      const stepA = elA.closest('.step, [class*="step-"], [id*="step-"]');
      const stepB = elB.closest('.step, [class*="step-"], [id*="step-"]');
      if (stepA && stepB && stepA !== stepB) continue;

      // Skip fixed/sticky elements against scrolling static page flow (e.g. sticky header over scrolled page)
      const isFixedOrStickyA = sA.position === 'fixed' || sA.position === 'sticky';
      const isFixedOrStickyB = sB.position === 'fixed' || sB.position === 'sticky';
      if ((isFixedOrStickyA && !isFixedOrStickyB) || (!isFixedOrStickyA && isFixedOrStickyB)) continue;

      const rB = elB.getBoundingClientRect();
      if (rB.width <= 0 || rB.height <= 0) continue;

      // Check visibility & opacity
      try {
        if (sA.visibility !== 'visible' || sB.visibility !== 'visible') continue;
        if (parseFloat(sA.opacity) < 0.2 || parseFloat(sB.opacity) < 0.2) continue;
        if (sA.pointerEvents === 'none' || sB.pointerEvents === 'none') continue;
      } catch (_) {}

      // Check geometric rectangle intersection
      const xOverlap = Math.max(0, Math.min(rA.right, rB.right) - Math.max(rA.left, rB.left));
      const yOverlap = Math.max(0, Math.min(rA.bottom, rB.bottom) - Math.max(rA.top, rB.top));
      const overlapArea = xOverlap * yOverlap;

      const areaA = rA.width * rA.height;
      const areaB = rB.width * rB.height;
      const minArea = Math.min(areaA, areaB);
      const overlapRatio = minArea > 0 ? (overlapArea / minArea) : 0;

      // Meaningful collision threshold:
      // Must have at least 250 sq px overlap, at least 16px in both dimensions,
      // and cover at least 25% of the smaller element's bounding rect
      if (overlapArea >= 250 && xOverlap >= 16 && yOverlap >= 16 && overlapRatio >= 0.25) {
        const selA = typeof getUniqueSelector === 'function' ? getUniqueSelector(elA) : elA.tagName.toLowerCase();
        const selB = typeof getUniqueSelector === 'function' ? getUniqueSelector(elB) : elB.tagName.toLowerCase();
        const pairKey = [selA, selB].sort().join(' <-> ');
        if (reportedOverlapPairs.has(pairKey)) continue;
        reportedOverlapPairs.add(pairKey);

        const isInteractiveA = ['button', 'input', 'select', 'textarea', 'a'].includes(elA.tagName.toLowerCase()) || elA.getAttribute('role') === 'button';
        const isInteractiveB = ['button', 'input', 'select', 'textarea', 'a'].includes(elB.tagName.toLowerCase()) || elB.getAttribute('role') === 'button';

        const severity = (isInteractiveA && isInteractiveB) ? 'critical' : 'serious';
        const overlapIssue = {
          id: 'mobile-overlapping-elements',
          type: 'overlap',
          severity,
          wcagRule: 'WCAG 2.2 AA 1.4.10 Reflow / 2.1.1 Keyboard',
          title: (isInteractiveA && isInteractiveB) ? 'Overlapping Interactive Controls' : 'Overlapping Elements Collision',
          selector: selA,
          selectorB: selB,
          html: elA.outerHTML.slice(0, 200),
          htmlB: elB.outerHTML.slice(0, 200),
          textA: (elA.innerText || elA.textContent || '').trim().slice(0, 80),
          textB: (elB.innerText || elB.textContent || '').trim().slice(0, 80),
          __af_elA: elA,
          __af_elB: elB,
          rect: {
            top: Math.round(rA.top + win.scrollY),
            left: Math.round(rA.left + win.scrollX),
            width: Math.round(rA.width),
            height: Math.round(rA.height),
          },
          rectB: {
            top: Math.round(rB.top + win.scrollY),
            left: Math.round(rB.left + win.scrollX),
            width: Math.round(rB.width),
            height: Math.round(rB.height),
          },
          overlapArea: Math.round(overlapArea),
          device: 'All Mobile Devices',
          deviceId: 'all',
          failureSummary: `Elements visually collide and overlap by ${Math.round(overlapArea)}px² (${Math.round(xOverlap)}×${Math.round(yOverlap)}px). ${isInteractiveA || isInteractiveB ? 'An interactive control is obstructed, preventing touchscreen taps or obscuring crucial text on mobile.' : 'Content blocks overlap, rendering text illegible.'}`,
          remediationCode: `/* Separate overlapping elements and establish clear flow / z-index */\n${selA} {\n  position: relative;\n  z-index: 10;\n  margin-bottom: 16px;\n}\n${selB} {\n  position: relative;\n  z-index: 5;\n}`,
        };

        issues.push(overlapIssue);
        for (const dev of allDevices) issuesByDevice[dev.id].push(overlapIssue);
      }
    }
  }

  // 4. Disjointed Page Steps & Multi-Step Flow Breakages Check
  const stepContainers = Array.from((doc.body || doc).querySelectorAll(
    '[class*="wizard" i], [class*="stepper" i], ' +
    'ol[class*="steps" i], ul[class*="steps" i], nav[aria-label*="step" i], ' +
    '.steps-wrapper, .form-steps, .checkout-steps, .wizard-bar'
  )).filter(el => {
    if (typeof isExtensionElement === 'function' && isExtensionElement(el)) return false;
    if (['body', 'html', 'main'].includes(el.tagName.toLowerCase())) return false;
    // Exclude tabs and breadcrumbs from disjointed-steps checks to prevent false alarms
    if (el.getAttribute('role') === 'tablist' || el.closest('[role="tablist"]')) return false;
    if (el.matches('nav[aria-label*="breadcrumb" i], [class*="bread" i]')) return false;
    return isElementVisible(el);
  });

  const reportedStepContainers = new Set();

  for (const container of stepContainers) {
    const sel = typeof getUniqueSelector === 'function' ? getUniqueSelector(container) : container.tagName.toLowerCase();
    if (reportedStepContainers.has(sel)) continue;

    // Find step children: items with class step, li children, or child elements
    let stepItems = Array.from(container.children).filter(child => {
      if (child.tagName.toLowerCase() === 'script' || child.tagName.toLowerCase() === 'style') return false;
      return isElementVisible(child);
    });

    if (stepItems.length === 1 && (stepItems[0].tagName.toLowerCase() === 'ul' || stepItems[0].tagName.toLowerCase() === 'ol')) {
      stepItems = Array.from(stepItems[0].children).filter(isElementVisible);
    }

    // Must have at least 2 distinct steps to be a multi-step flow
    if (stepItems.length < 2) continue;

    reportedStepContainers.add(sel);

    // Examine step item geometries at mobile scale
    const itemRects = stepItems.map(item => item.getBoundingClientRect());
    const topPositions = itemRects.map(r => Math.round(r.top));
    const uniqueTops = Array.from(new Set(topPositions));

    // Check A: Awkward Multi-Line Staggering / Wrapping
    // In horizontal steppers, if top positions differ significantly, steps wrapped onto multiple lines.
    const isVerticalStack = uniqueTops.length === stepItems.length;
    // Check if it's a regular balanced grid (e.g. 2x2, 3x2)
    const countsPerRow = uniqueTops.map(t => topPositions.filter(pos => pos === t).length);
    const isUniformGrid = countsPerRow.length > 1 && countsPerRow.every(c => c === countsPerRow[0]);
    const isMultiLine = !isVerticalStack && !isUniformGrid && uniqueTops.length > 1 && uniqueTops.length < stepItems.length;

    // Check B: Step Badge / Number Collision with Labels or Adjacent Steps
    let hasBadgeCollision = false;
    let badgeCollisionDetails = '';

    for (let s = 0; s < stepItems.length; s++) {
      const item = stepItems[s];
      const badge = item.querySelector('[class*="number" i], [class*="badge" i], [class*="icon" i], [class*="bullet" i], span:first-child');
      const label = item.querySelector('[class*="title" i], [class*="label" i], [class*="name" i], [class*="text" i], p, span:last-child');
      if (badge && label && badge !== label) {
        const rBadge = badge.getBoundingClientRect();
        const rLabel = label.getBoundingClientRect();
        if (rBadge.width > 0 && rLabel.width > 0) {
          const xOver = Math.max(0, Math.min(rBadge.right, rLabel.right) - Math.max(rBadge.left, rLabel.left));
          const yOver = Math.max(0, Math.min(rBadge.bottom, rLabel.bottom) - Math.max(rBadge.top, rLabel.top));
          if (xOver > 4 && yOver > 4) {
            hasBadgeCollision = true;
            badgeCollisionDetails = `Step #${s + 1} number badge collides with step label text.`;
            break;
          }
        }
      }
    }

    // Check C: Detached / Misaligned Connector Lines
    let hasDetachedConnector = false;
    const connectors = container.querySelectorAll('[class*="line" i], [class*="connector" i], [class*="bar" i], [class*="divider" i]');
    for (const conn of connectors) {
      const connStyle = win.getComputedStyle(conn);
      if (connStyle.position === 'absolute') {
        const connRect = conn.getBoundingClientRect();
        if (connRect.width > activeDevice.width || connRect.left < 0) {
          hasDetachedConnector = true;
          break;
        }
      }
    }

    // Check D: Stepper container width overflow
    const containerRect = container.getBoundingClientRect();
    const isStepperOverflowing = containerRect.width > activeDevice.width + 6 || container.scrollWidth > activeDevice.width + 6;

    // Disjointed steps flagged when wizard breaks across uneven lines or has collisions
    if (isMultiLine || hasBadgeCollision || hasDetachedConnector || isStepperOverflowing) {
      let failureSummary = '';
      if (hasBadgeCollision) {
        failureSummary = `Multi-step flow (${stepItems.length} steps) has badge collisions: ${badgeCollisionDetails}. On small viewports, steps collide with numbering badges, making the current step unreadable.`;
      } else if (hasDetachedConnector) {
        failureSummary = `Multi-step flow connector line is disjointed or misaligned, detaching from steps on mobile viewports. The connector bars drift away from the step sequence.`;
      } else if (isStepperOverflowing) {
        failureSummary = `Multi-step indicator (${stepItems.length} steps) overflows the ${activeDevice.name} screen width (${Math.round(containerRect.width)}px vs ${activeDevice.width}px), causing trailing steps to be truncated off-screen so users cannot see upcoming process steps.`;
      } else {
        failureSummary = `Multi-step flow breaks into ${uniqueTops.length} disjointed horizontal rows on mobile screens. When horizontal steppers wrap unevenly, the sequential order (WCAG 1.3.2) is visually fragmented, causing severe disorientation for screen magnifier and mobile users.`;
      }

      const stepIssue = {
        id: 'mobile-disjointed-steps',
        type: 'disjointed-steps',
        severity: (hasBadgeCollision || isStepperOverflowing) ? 'serious' : 'moderate',
        wcagRule: 'WCAG 2.2 AA 1.3.2 Meaningful Sequence / 1.4.10 Reflow',
        title: 'Disjointed Multi-Step Flow or Wizard Stepper',
        selector: sel,
        html: container.outerHTML.slice(0, 300),
        textA: (container.innerText || container.textContent || '').trim().slice(0, 80),
        __af_elA: container,
        stepCount: stepItems.length,
        rect: {
          top: Math.round(containerRect.top + win.scrollY),
          left: Math.round(containerRect.left + win.scrollX),
          width: Math.round(containerRect.width),
          height: Math.round(containerRect.height),
        },
        device: activeDevice.name,
        deviceId: activeDevice.id,
        failureSummary,
        remediationCode: `/* Responsive Mobile Stepper: Stack vertically or enable horizontal scroll snap (WCAG 1.3.2 / 1.4.10) */\n@media (max-width: 600px) {\n  ${sel} {\n    display: flex !important;\n    flex-direction: column !important;\n    gap: 12px !important;\n    width: 100% !important;\n  }\n  /* Alternatively, enable smooth touch swipeable step track */\n  /* ${sel} { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; } */\n}`,
      };

      issues.push(stepIssue);
      for (const dev of allDevices) issuesByDevice[dev.id].push(stepIssue);
    }
  }

  // 5. Sticky & Fixed Viewport Occlusions Check
  const fixedElements = candidateElements.filter(el => {
    try {
      const pos = win.getComputedStyle(el).position;
      return pos === 'fixed' || pos === 'sticky';
    } catch (_) { return false; }
  });

  for (const el of fixedElements) {
    const r = el.getBoundingClientRect();
    const h = Math.round(r.height);
    // If sticky banner/bar consumes > 30% of active mobile screen height
    if (h > activeDevice.height * 0.3) {
      const sel = typeof getUniqueSelector === 'function' ? getUniqueSelector(el) : el.tagName.toLowerCase();
      const stickyIssue = {
        id: 'mobile-sticky-occlusion',
        type: 'sticky-occlusion',
        severity: 'serious',
        wcagRule: 'WCAG 2.2 AA 1.4.10 Reflow',
        title: 'Sticky Element Consumes Excessive Screen Height',
        selector: sel,
        html: el.outerHTML.slice(0, 250),
        textA: (el.innerText || el.textContent || '').trim().slice(0, 80),
        __af_elA: el,
        rect: {
          top: Math.round(r.top + win.scrollY),
          left: Math.round(r.left + win.scrollX),
          width: Math.round(r.width),
          height: h,
        },
        device: activeDevice.name,
        deviceId: activeDevice.id,
        failureSummary: `Fixed/sticky element height (${h}px) consumes ${(h / activeDevice.height * 100).toFixed(0)}% of the ${activeDevice.name} screen, obstructing viewable page content and keyboard interactions.`,
        remediationCode: `/* Reduce sticky header height on mobile viewports */\n@media (max-width: 600px) {\n  ${sel} {\n    max-height: 70px !important;\n    position: static !important; /* Allow header to scroll with page on small screens */\n  }\n}`,
      };
      issues.push(stickyIssue);
      for (const dev of allDevices) issuesByDevice[dev.id].push(stickyIssue);
    }
  }

  // Calculate Mobile Health Score (0 - 100)
  let scoreDeduction = 0;
  const overlapsCount = issues.filter(i => i.type === 'overlap').length;
  const overflowsCount = issues.filter(i => i.type === 'overflow').length;
  const stepsCount = issues.filter(i => i.type === 'disjointed-steps').length;
  const viewportCount = issues.filter(i => i.type === 'viewport-meta').length;
  const stickyCount = issues.filter(i => i.type === 'sticky-occlusion').length;

  if (viewportCount > 0) scoreDeduction += 20;
  scoreDeduction += Math.min(35, overlapsCount * 12);
  scoreDeduction += Math.min(30, overflowsCount * 8);
  scoreDeduction += Math.min(25, stepsCount * 10);
  scoreDeduction += Math.min(10, stickyCount * 5);

  const mobileScore = Math.max(0, Math.min(100, 100 - scoreDeduction));

  let grade = 'A+';
  let riskLevel = 'Low';
  if (mobileScore < 50) { grade = 'F'; riskLevel = 'Severe'; }
  else if (mobileScore < 65) { grade = 'D'; riskLevel = 'High'; }
  else if (mobileScore < 75) { grade = 'C'; riskLevel = 'Moderate'; }
  else if (mobileScore < 88) { grade = 'B'; riskLevel = 'Moderate'; }
  else if (mobileScore < 95) { grade = 'A'; riskLevel = 'Low'; }

  // Sort issues by severity: critical -> serious -> moderate -> minor
  const sevOrder = { critical: 1, serious: 2, moderate: 3, minor: 4 };
  issues.sort((a, b) => (sevOrder[a.severity] || 5) - (sevOrder[b.severity] || 5));

  return {
    mobileScore,
    grade,
    riskLevel,
    activeDevice,
    availableDevices: allDevices,
    summary: {
      totalIssues: issues.length,
      overlapsCount,
      overflowsCount,
      disjointedStepsCount: stepsCount,
      touchTargetCount: 0,
      viewportMetaCount: viewportCount,
      stickyCount,
    },
    issues,
    issuesByDevice,
  };
}


/**
 * In-Page Interactive Mobile Viewport Simulator HUD
 */
let mobileSimCleanup = null;

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[c]));
}

function populateMobileSimulatorIframe(iframe, options = {}) {
  if (!iframe) return;
  const targetUrl = options.url || window.location.href;
  const isMockTest = targetUrl.includes('.test') || targetUrl.startsWith('data:') || targetUrl.startsWith('blob:');
  const requestedMode = options.mode || window.__af_mobile_sim_mode;
  const useLive = requestedMode === 'live' || (!requestedMode && !isMockTest && (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')));

  if (useLive) {
    loadLiveIframe(iframe, targetUrl, options);
  } else {
    loadSnapshotIntoIframe(iframe, options);
  }
}

/**
 * Loads the live webpage inside the mobile simulator iframe.
 * Allows interacting with live JavaScript SPAs, completing multi-step forms (e.g. quotes.annuityready.com),
 * and receiving native event handling and API calls with authentic mobile responsive layout styling.
 */
function loadLiveIframe(iframe, targetUrl, options = {}) {
  let isLoaded = false;
  let fallbackTimer = null;

  const onFrameLoad = () => {
    try {
      const idoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (idoc && idoc.body && idoc.location && idoc.location.href !== 'about:blank') {
        const isErrorPage = idoc.title && (idoc.title.includes('refused to connect') || idoc.title.includes('Error'));
        if (!isErrorPage) {
          isLoaded = true;
          if (fallbackTimer) {
            clearTimeout(fallbackTimer);
            fallbackTimer = null;
          }

          // Apply active vision filter if one was set
          if (window.__af_active_color_filter && window.__af_active_color_filter !== 'none') {
            applyVisionFilterToMobileSimulator(window.__af_active_color_filter);
          }

          // Initialize mobile device touch controls & kinetic drag-to-scroll
          setupMobileTouchEmulation(iframe, idoc);

          // Inject highlight styles into simulator iframe
          injectMobileSimulatorHighlightStyles(idoc);

          // Update layout evaluation for the live document in the iframe
          if (typeof options.onUpdateLayout === 'function') {
            options.onUpdateLayout(idoc);
          }

          // Observe DOM changes inside live iframe (e.g. form step progression like clicking 'Let's get started')
          let debounceMutation = null;
          const obs = new MutationObserver(() => {
            if (debounceMutation) clearTimeout(debounceMutation);
            debounceMutation = setTimeout(() => {
              if (typeof options.onUpdateLayout === 'function') {
                options.onUpdateLayout(idoc);
              }
            }, 300);
          });
          obs.observe(idoc.body, { childList: true, subtree: true, attributes: false });
          return;
        }
      }
    } catch (err) {
      console.warn('[Mobile Simulator] Live iframe access restricted, falling back to snapshot:', err);
    }

    if (!isLoaded) {
      loadSnapshotIntoIframe(iframe, options);
    }
  };

  iframe.removeEventListener('load', iframe.__af_live_load_handler);
  iframe.__af_live_load_handler = onFrameLoad;
  iframe.addEventListener('load', onFrameLoad);

  // Safety fallback timeout in case live network or frame embedding is blocked
  fallbackTimer = setTimeout(() => {
    if (!isLoaded) {
      console.log('[Mobile Simulator] Live load timeout reached, loading snapshot fallback.');
      loadSnapshotIntoIframe(iframe, options);
    }
  }, 2200);

  try {
    iframe.removeAttribute('srcdoc');
    iframe.src = targetUrl;
  } catch (err) {
    loadSnapshotIntoIframe(iframe, options);
  }
}

/**
 * Loads a frozen snapshot of the parent DOM into the simulator.
 * Wires up smart interactive event mirroring so clicks and inputs in the snapshot trigger the parent document.
 */
function loadSnapshotIntoIframe(iframe, options = {}) {
  try {
    const baseHref = window.location.href.split('#')[0];
    const headNodes = [
      `<base href="${escapeHtml(baseHref)}">`,
      `<meta charset="utf-8">`,
      `<meta name="viewport" content="width=device-width, initial-scale=1.0">`,
    ];

    if (document.title) {
      headNodes.push(`<title>${escapeHtml(document.title)}</title>`);
    }

    // Copy styles and meta from document.head
    Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style, meta')).forEach(el => {
      if (isExtensionElement(el)) return;
      if (el.id && (el.id.includes('__af_') || el.id.includes('__auditforge'))) return;
      headNodes.push(el.outerHTML);
    });

    // Copy readable CSS rules from document.styleSheets that might be dynamically generated
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        if (!sheet.href && sheet.cssRules && sheet.cssRules.length > 0) {
          const rules = Array.from(sheet.cssRules).map(r => r.cssText).join('\n');
          if (rules && !rules.includes('__auditforge') && !rules.includes('af-mob-')) {
            headNodes.push(`<style data-af-cloned="dynamic">${rules}</style>`);
          }
        }
      } catch (_) {}
    }

    // Simulator helper styles embedded in the iframe
    headNodes.push(`
      <style id="__af_sim_embedded_css__">
        html {
          width: 100% !important;
          overflow-x: hidden !important;
          -webkit-text-size-adjust: 100%;
        }
        body {
          width: 100% !important;
          margin: 0;
          overflow-x: hidden !important;
          -webkit-overflow-scrolling: touch;
        }
        .af-mob-highlight-target {
          outline: 3.5px solid #ef4444 !important;
          outline-offset: 3px !important;
          box-shadow: 0 0 25px rgba(239, 68, 68, 0.95), inset 0 0 15px rgba(239, 68, 68, 0.3) !important;
          transition: all 0.3s ease !important;
          animation: afMobPulse 1.2s infinite alternate !important;
        }
        .af-mob-highlight-secondary {
          outline: 3.5px solid #f97316 !important;
          outline-offset: 3px !important;
          box-shadow: 0 0 25px rgba(249, 115, 22, 0.95), inset 0 0 15px rgba(249, 115, 22, 0.3) !important;
          transition: all 0.3s ease !important;
          animation: afMobPulse 1.2s infinite alternate !important;
        }
        @keyframes afMobPulse {
          0% { transform: scale(1); box-shadow: 0 0 15px rgba(239, 68, 68, 0.7); }
          100% { transform: scale(1.02); box-shadow: 0 0 35px rgba(239, 68, 68, 1); }
        }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(100, 116, 139, 0.4); border-radius: 9999px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(100, 116, 139, 0.7); }
      </style>
    `);

    // Clone body and remove all extension elements and scripts to avoid double-execution
    const bodyClone = document.body.cloneNode(true);
    const extSelectors = [
      '[data-auditforge-ext="true"]',
      '#__auditforge_mobile_sim_root__',
      '#__auditforge_overlay_root__',
      '#__auditforge_highlighter_root__',
      '#__auditforge_voiceover_hud__',
      '#__auditforge_tab_trail_svg__',
      '[id*="__auditforge"]',
      '[id*="__af_"]',
      '.af-mob-drawer',
      '.af-mob-chassis',
      '.af-mob-header',
      'script'
    ];
    bodyClone.querySelectorAll(extSelectors.join(', ')).forEach(el => el.remove());

    const bodyClass = (document.body.className || '').replace(/__af_[^\s]+/g, '').trim();
    const bodyStyle = document.body.getAttribute('style') || '';

    const docHtml = `<!DOCTYPE html>
<html lang="${escapeHtml(document.documentElement.lang || 'en')}" class="${escapeHtml(document.documentElement.className || '')}">
<head>
${headNodes.join('\n')}
</head>
<body class="${escapeHtml(bodyClass)}" style="${escapeHtml(bodyStyle)}">
${bodyClone.innerHTML}
</body>
</html>`;

    // Set up load listener BEFORE assigning srcdoc to ensure no race conditions
    iframe.addEventListener('load', () => {
      try {
        const idoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!idoc) return;

        // Apply active vision filter if one was set on the page
        if (window.__af_active_color_filter && window.__af_active_color_filter !== 'none') {
          applyVisionFilterToMobileSimulator(window.__af_active_color_filter);
        }

        // Initialize mobile device touch controls & kinetic drag-to-scroll
        setupMobileTouchEmulation(iframe, idoc);

        // Inject highlight styles into simulator iframe
        injectMobileSimulatorHighlightStyles(idoc);

        // Setup intelligent interactive event mirroring to parent page
        setupSnapshotEventMirroring(idoc, iframe);

        // Update layout evaluation
        if (typeof options.onUpdateLayout === 'function') {
          options.onUpdateLayout(idoc);
        }
      } catch (_) {}
    }, { once: true });

    iframe.removeAttribute('src');
    iframe.srcdoc = docHtml;
  } catch (err) {
    console.warn('[Mobile Simulator] Snapshot population warning:', err);
  }
}

/**
 * Wires up interactive event forwarding for snapshot mode.
 * When a user clicks a button, link, or changes an input inside the snapshot,
 * the matching element in the live document is focused and triggered, then the snapshot re-syncs.
 */
function setupSnapshotEventMirroring(idoc, iframe) {
  if (!idoc || !idoc.body) return;

  function findMatchingElement(el) {
    if (!el || el === idoc.body || el === idoc.documentElement) return null;

    // 1. By ID (handle duplicate IDs like in quotes.annuityready.com by checking tagName match first)
    if (el.id && !el.id.startsWith('__af_')) {
      const exactMatch = document.querySelector(`${el.tagName.toLowerCase()}#${CSS.escape(el.id)}`) || document.getElementById(el.id);
      if (exactMatch) return exactMatch;
    }

    // 2. By data-test / data-testid / data-test-id
    const testId = el.getAttribute('data-test') || el.getAttribute('data-testid') || el.getAttribute('data-test-id');
    if (testId) {
      const match = document.querySelector(`[data-test="${CSS.escape(testId)}"], [data-testid="${CSS.escape(testId)}"], [data-test-id="${CSS.escape(testId)}"]`);
      if (match) return match;
    }

    // 3. By name
    if (el.name) {
      const match = document.querySelector(`[name="${CSS.escape(el.name)}"]`);
      if (match) return match;
    }

    // 4. By button or link text content
    if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button') {
      const text = el.innerText?.trim();
      if (text) {
        const candidates = Array.from(document.querySelectorAll('button, a, [role="button"]'));
        const textMatch = candidates.find(c => c.innerText?.trim() === text);
        if (textMatch) return textMatch;
      }
    }

    // 5. By unique CSS selector
    try {
      const sel = typeof getUniqueSelector === 'function' ? getUniqueSelector(el) : null;
      if (sel) {
        const match = document.querySelector(sel);
        if (match) return match;
      }
    } catch (_) {}

    return null;
  }

  // Intercept clicks on interactive elements and mirror to live document
  idoc.addEventListener('click', (e) => {
    const target = e.target;
    const clickable = target.closest('button, a, input, select, textarea, label, [role="button"]');
    if (!clickable) return;

    // Direct link navigation
    if (clickable.tagName === 'A') {
      const href = clickable.getAttribute('href');
      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        e.preventDefault();
        window.location.href = clickable.href;
        return;
      }
    }

    const parentEl = findMatchingElement(clickable);
    if (parentEl) {
      try {
        parentEl.focus?.();
        parentEl.click?.();
        parentEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      } catch (_) {}

      // Re-sync snapshot DOM shortly after to reflect next step
      setTimeout(() => {
        loadSnapshotIntoIframe(iframe);
      }, 350);
    }
  }, true);

  // Intercept form input changes and mirror to live document
  idoc.addEventListener('input', (e) => {
    const parentEl = findMatchingElement(e.target);
    if (parentEl && 'value' in parentEl && 'value' in e.target) {
      parentEl.value = e.target.value;
      parentEl.dispatchEvent(new Event('input', { bubbles: true }));
      parentEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, true);
}

/**
 * Full Mobile Device Touch Emulation Engine
 * Provides authentic smartphone touch-drag kinetic scrolling, momentum physics,
 * grab-cursor styling, nested container scrolling, wheel support, touch event emulation,
 * and a translucent mobile fingertip touch indicator.
 */
function setupMobileTouchEmulation(iframe, idoc) {
  if (!idoc || !idoc.body) return;

  // 1. Inject Mobile Touch Styles (smooth kinetic touch cursor & pointer styles)
  let touchStyle = idoc.getElementById('__af_touch_emulation_css__');
  if (!touchStyle) {
    touchStyle = idoc.createElement('style');
    touchStyle.id = '__af_touch_emulation_css__';
    touchStyle.textContent = `
      html, body {
        cursor: grab !important;
        overscroll-behavior: contain;
      }
      input, textarea, select, button, [contenteditable="true"] {
        cursor: auto !important;
        user-select: auto !important;
        -webkit-user-select: auto !important;
      }
      body.af-touch-dragging, body.af-touch-dragging * {
        cursor: grabbing !important;
        user-select: none !important;
        -webkit-user-select: none !important;
      }
      /* Sleek translucent mobile touch indicator / puck */
      #__af_touch_puck__ {
        position: fixed;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(56, 189, 248, 0.45) 0%, rgba(13, 159, 186, 0.25) 70%, rgba(27, 111, 126, 0.4) 100%);
        border: 2px solid rgba(56, 189, 248, 0.85);
        box-shadow: 0 0 14px rgba(56, 189, 248, 0.5), inset 0 0 8px rgba(255, 255, 255, 0.3);
        pointer-events: none;
        z-index: 2147483647;
        transform: translate(-50%, -50%) scale(1);
        transition: transform 0.1s cubic-bezier(0.2, 0.8, 0.2, 1), background 0.15s ease, opacity 0.2s ease;
        opacity: 0;
      }
      #__af_touch_puck__.active-pressing {
        transform: translate(-50%, -50%) scale(0.8);
        background: radial-gradient(circle, rgba(56, 189, 248, 0.75) 0%, rgba(13, 159, 186, 0.5) 70%, rgba(18, 119, 136, 0.7) 100%);
        border-color: #38bdf8;
        box-shadow: 0 0 22px rgba(56, 189, 248, 0.8), inset 0 0 10px rgba(255, 255, 255, 0.6);
      }
      /* Touch tap ripple wave */
      .af-touch-ripple {
        position: fixed;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        border: 2px solid rgba(56, 189, 248, 0.9);
        background: rgba(56, 189, 248, 0.25);
        pointer-events: none;
        z-index: 2147483646;
        transform: translate(-50%, -50%) scale(1);
        animation: afTouchRippleAnim 0.45s ease-out forwards;
      }
      @keyframes afTouchRippleAnim {
        0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        100% { transform: translate(-50%, -50%) scale(2.8); opacity: 0; }
      }
    `;
    idoc.head.appendChild(touchStyle);
  }

  // 2. Touch Puck Element
  let puck = idoc.getElementById('__af_touch_puck__');
  if (!puck) {
    puck = idoc.createElement('div');
    puck.id = '__af_touch_puck__';
    idoc.body.appendChild(puck);
  }

  // 3. Kinetic Drag Scrolling Engine
  let isDown = false;
  let startX = 0;
  let startY = 0;
  let scrollStartX = 0;
  let scrollStartY = 0;
  let hasMoved = false;
  let lastX = 0;
  let lastY = 0;
  let lastTime = 0;
  let velX = 0;
  let velY = 0;
  let momentumAnimId = null;
  let activeScrollEl = null;

  function stopMomentum() {
    if (momentumAnimId) {
      cancelAnimationFrame(momentumAnimId);
      momentumAnimId = null;
    }
  }

  function findScrollTarget(el) {
    let cur = el;
    while (cur && cur !== idoc.body && cur !== idoc.documentElement) {
      try {
        const style = idoc.defaultView?.getComputedStyle(cur);
        if (style) {
          const oy = style.overflowY;
          const ox = style.overflowX;
          if ((oy === 'auto' || oy === 'scroll') && cur.scrollHeight > cur.clientHeight + 2) {
            return cur;
          }
          if ((ox === 'auto' || ox === 'scroll') && cur.scrollWidth > cur.clientWidth + 2) {
            return cur;
          }
        }
      } catch (_) {}
      cur = cur.parentElement;
    }
    return idoc.scrollingElement || idoc.documentElement || idoc.body;
  }

  function onTouchStart(clientX, clientY, target) {
    if (window.__af_mobile_touch_mode === false) return;
    stopMomentum();
    isDown = true;
    hasMoved = false;
    startX = clientX;
    startY = clientY;
    lastX = clientX;
    lastY = clientY;
    lastTime = performance.now();
    velX = 0;
    velY = 0;

    activeScrollEl = findScrollTarget(target);
    scrollStartX = activeScrollEl.scrollLeft;
    scrollStartY = activeScrollEl.scrollTop;

    puck.classList.add('active-pressing');
    puck.style.opacity = '1';
    puck.style.left = `${clientX}px`;
    puck.style.top = `${clientY}px`;

    // Trigger subtle touch ripple
    const ripple = idoc.createElement('div');
    ripple.className = 'af-touch-ripple';
    ripple.style.left = `${clientX}px`;
    ripple.style.top = `${clientY}px`;
    idoc.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 450);
  }

  function onTouchMove(clientX, clientY) {
    if (window.__af_mobile_touch_mode === false) {
      puck.style.opacity = '0';
      return;
    }
    puck.style.opacity = '1';
    puck.style.left = `${clientX}px`;
    puck.style.top = `${clientY}px`;

    if (!isDown) return;

    const dx = clientX - startX;
    const dy = clientY - startY;

    if (!hasMoved && Math.hypot(dx, dy) > 4) {
      hasMoved = true;
      idoc.body.classList.add('af-touch-dragging');
    }

    if (hasMoved && activeScrollEl) {
      activeScrollEl.scrollLeft = scrollStartX - dx;
      activeScrollEl.scrollTop = scrollStartY - dy;

      const now = performance.now();
      const dt = now - lastTime;
      if (dt > 8) {
        velX = (clientX - lastX) / dt;
        velY = (clientY - lastY) / dt;
        lastX = clientX;
        lastY = clientY;
        lastTime = now;
      }
    }
  }

  function onTouchEnd() {
    if (!isDown) return;
    isDown = false;
    puck.classList.remove('active-pressing');
    idoc.body.classList.remove('af-touch-dragging');

    if (hasMoved && activeScrollEl) {
      // Launch kinetic momentum scroll
      let currentVelY = velY * 16;
      let currentVelX = velX * 16;
      const friction = 0.94;
      const targetScrollEl = activeScrollEl;

      if (Math.hypot(currentVelX, currentVelY) > 2) {
        function stepMomentum() {
          if (Math.abs(currentVelY) < 0.1 && Math.abs(currentVelX) < 0.1) {
            momentumAnimId = null;
            return;
          }
          targetScrollEl.scrollTop -= currentVelY;
          targetScrollEl.scrollLeft -= currentVelX;
          currentVelY *= friction;
          currentVelX *= friction;
          momentumAnimId = requestAnimationFrame(stepMomentum);
        }
        momentumAnimId = requestAnimationFrame(stepMomentum);
      }
    }
  }

  idoc.addEventListener('mouseenter', (e) => {
    if (window.__af_mobile_touch_mode === false) return;
    puck.style.opacity = '1';
    puck.style.left = `${e.clientX}px`;
    puck.style.top = `${e.clientY}px`;
  });

  idoc.addEventListener('mouseleave', () => {
    puck.style.opacity = '0';
  });

  idoc.addEventListener('mousedown', (e) => {
    onTouchStart(e.clientX, e.clientY, e.target);
  });

  idoc.addEventListener('mousemove', (e) => {
    onTouchMove(e.clientX, e.clientY);
  });

  idoc.addEventListener('mouseup', () => {
    onTouchEnd();
  });

  // Listen on outer window as well so releasing outside iframe completes momentum glide
  window.addEventListener('mouseup', () => {
    if (isDown) onTouchEnd();
  });

  // Touch screen support (Surface, touchscreen laptops, mobile devices)
  idoc.addEventListener('touchstart', (e) => {
    if (e.touches[0]) {
      onTouchStart(e.touches[0].clientX, e.touches[0].clientY, e.target);
    }
  }, { passive: true });

  idoc.addEventListener('touchmove', (e) => {
    if (e.touches[0]) {
      onTouchMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });

  idoc.addEventListener('touchend', () => {
    onTouchEnd();
  }, { passive: true });

  // Mouse wheel support inside iframe
  idoc.addEventListener('wheel', (e) => {
    const targetEl = findScrollTarget(e.target);
    if (targetEl) {
      targetEl.scrollTop += e.deltaY;
      targetEl.scrollLeft += e.deltaX;
    }
  }, { passive: true });

  // Intercept click during swipe so links aren't accidentally triggered during touch drag
  idoc.addEventListener('click', (e) => {
    if (hasMoved) {
      e.preventDefault();
      e.stopPropagation();
      hasMoved = false;
    }
  }, true);
}

function applyVisionFilterToMobileSimulator(filterType) {
  const iframe = document.getElementById('af-mob-iframe');
  if (!iframe) return;
  try {
    const idoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!idoc || !idoc.documentElement) return;

    const CVD_FILTER_ID_MAP = {
      protanopia: '__af_cvd_protanopia__',
      deuteranopia: '__af_cvd_deuteranopia__',
      tritanopia: '__af_cvd_tritanopia__',
      achromatopsia: '__af_cvd_achromatopsia__',
    };

    let defsSvg = idoc.getElementById('__af_sim_cvd_defs__');
    if (!defsSvg) {
      defsSvg = idoc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      defsSvg.id = '__af_sim_cvd_defs__';
      defsSvg.setAttribute('style', 'position: absolute; height: 0; width: 0; overflow: hidden;');
      defsSvg.setAttribute('aria-hidden', 'true');
      defsSvg.innerHTML = `
        <defs>
          <filter id="__af_cvd_protanopia__">
            <feColorMatrix type="matrix" values="
              0.567, 0.433, 0.000, 0, 0
              0.558, 0.442, 0.000, 0, 0
              0.000, 0.242, 0.758, 0, 0
              0.000, 0.000, 0.000, 1, 0" />
          </filter>
          <filter id="__af_cvd_deuteranopia__">
            <feColorMatrix type="matrix" values="
              0.625, 0.375, 0.000, 0, 0
              0.700, 0.300, 0.000, 0, 0
              0.000, 0.300, 0.700, 0, 0
              0.000, 0.000, 0.000, 1, 0" />
          </filter>
          <filter id="__af_cvd_tritanopia__">
            <feColorMatrix type="matrix" values="
              0.950, 0.050, 0.000, 0, 0
              0.000, 0.433, 0.567, 0, 0
              0.000, 0.475, 0.525, 0, 0
              0.000, 0.000, 0.000, 1, 0" />
          </filter>
          <filter id="__af_cvd_achromatopsia__">
            <feColorMatrix type="matrix" values="
              0.299, 0.587, 0.114, 0, 0
              0.299, 0.587, 0.114, 0, 0
              0.299, 0.587, 0.114, 0, 0
              0.000, 0.000, 0.000, 1, 0" />
          </filter>
        </defs>
      `;
      idoc.documentElement.appendChild(defsSvg);
    }

    if (!filterType || filterType === 'none') {
      idoc.documentElement.style.removeProperty('filter');
    } else if (CVD_FILTER_ID_MAP[filterType]) {
      idoc.documentElement.style.setProperty('filter', `url(#${CVD_FILTER_ID_MAP[filterType]})`, 'important');
    } else if (filterType === 'cataracts') {
      idoc.documentElement.style.setProperty('filter', 'blur(3.5px) contrast(0.82) brightness(1.05)', 'important');
    } else if (filterType === 'photophobia') {
      idoc.documentElement.style.setProperty('filter', 'invert(1) hue-rotate(180deg) contrast(1.15)', 'important');
    }

    const visionSelect = document.getElementById('af-mob-vision-select');
    if (visionSelect && visionSelect.value !== (filterType || 'none')) {
      visionSelect.value = filterType || 'none';
    }
  } catch (err) {
    console.warn('[Mobile Simulator] Vision filter apply warning:', err);
  }
}

function openDeviceWindow(url, width, height) {
  const targetUrl = url || window.location.href;
  const w = width || 393;
  const h = height || 852;
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        action: 'OPEN_DEVICE_WINDOW',
        url: targetUrl,
        width: w,
        height: h
      }, (resp) => {
        if (!resp?.success) {
          window.open(targetUrl, '_blank', `width=${w},height=${h},menubar=no,toolbar=no,location=yes,status=no,resizable=yes`);
        }
      });
      return;
    }
  } catch (_) {}
  window.open(targetUrl, '_blank', `width=${w},height=${h},menubar=no,toolbar=no,location=yes,status=no,resizable=yes`);
}

/**
 * Injects rich spotlight, beacon, collision zone, and pulse styles into the simulator iframe document.
 */
function injectMobileSimulatorHighlightStyles(idoc) {
  if (!idoc) return;
  let style = idoc.getElementById('__af_mob_sim_highlight_styles__');
  if (!style) {
    style = idoc.createElement('style');
    style.id = '__af_mob_sim_highlight_styles__';
    style.textContent = `
      .af-mob-highlight-target {
        outline: 3.5px solid #ef4444 !important;
        outline-offset: 3px !important;
        box-shadow: 0 0 25px rgba(239, 68, 68, 0.95), inset 0 0 15px rgba(239, 68, 68, 0.3) !important;
        transition: all 0.25s ease !important;
        animation: afMobPulseA 1.4s infinite alternate !important;
      }
      .af-mob-highlight-secondary {
        outline: 3.5px dashed #f59e0b !important;
        outline-offset: 3px !important;
        box-shadow: 0 0 25px rgba(245, 158, 11, 0.95), inset 0 0 15px rgba(245, 158, 11, 0.3) !important;
        transition: all 0.25s ease !important;
        animation: afMobPulseB 1.4s infinite alternate !important;
      }
      #__af_mob_spotlight_overlay__ {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        min-height: 100%;
        pointer-events: none;
        z-index: 2147483640;
      }
      .af-mob-box {
        position: absolute;
        box-sizing: border-box;
        pointer-events: none;
        border-radius: 6px;
      }
      .af-mob-box-a {
        border: 3px solid #ef4444;
        box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.35), 0 0 25px rgba(239, 68, 68, 0.85), inset 0 0 15px rgba(239, 68, 68, 0.25);
        animation: afMobPulseA 1.4s infinite alternate;
      }
      .af-mob-box-b {
        border: 3px dashed #f59e0b;
        box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.35), 0 0 25px rgba(245, 158, 11, 0.85), inset 0 0 15px rgba(245, 158, 11, 0.25);
        animation: afMobPulseB 1.4s infinite alternate;
      }
      .af-mob-box-tag {
        position: absolute;
        top: -24px;
        left: 0;
        background: #090d16;
        border: 1px solid rgba(255, 255, 255, 0.25);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 10.5px;
        font-weight: 700;
        padding: 2px 7px;
        border-radius: 4px;
        white-space: nowrap;
        pointer-events: none;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .af-mob-box-a .af-mob-box-tag { border-color: #ef4444; color: #fca5a5; }
      .af-mob-box-b .af-mob-box-tag { border-color: #f59e0b; color: #fde68a; }
      .af-mob-collision-box {
        position: absolute;
        box-sizing: border-box;
        background: repeating-linear-gradient(135deg, rgba(239, 68, 68, 0.38) 0px, rgba(239, 68, 68, 0.38) 8px, rgba(245, 158, 11, 0.38) 8px, rgba(245, 158, 11, 0.38) 16px);
        border: 2px solid #ef4444;
        box-shadow: 0 0 25px rgba(239, 68, 68, 0.7);
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
      }
      .af-mob-collision-badge {
        background: rgba(15, 23, 42, 0.95);
        border: 1.5px solid #ef4444;
        color: #fee2e2;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 10px;
        font-weight: 800;
        padding: 2px 7px;
        border-radius: 4px;
        box-shadow: 0 3px 10px rgba(0,0,0,0.7);
        white-space: nowrap;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }
      .af-mob-overflow-marker {
        position: absolute;
        right: 0;
        background: rgba(239, 68, 68, 0.92);
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 10.5px;
        font-weight: 800;
        padding: 3px 8px;
        border-radius: 4px 0 0 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.5);
        pointer-events: none;
        z-index: 2147483645;
        white-space: nowrap;
      }
      .af-mob-touch-target-box {
        position: absolute;
        box-sizing: border-box;
        border: 2px dashed #38bdf8;
        background: rgba(56, 189, 248, 0.12);
        border-radius: 8px;
        pointer-events: none;
      }
      .af-mob-touch-badge {
        position: absolute;
        bottom: -20px;
        left: 50%;
        transform: translateX(-50%);
        background: #0284c7;
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 9.5px;
        font-weight: 700;
        padding: 1px 6px;
        border-radius: 3px;
        white-space: nowrap;
      }
      .af-mob-corner {
        position: absolute;
        width: 8px;
        height: 8px;
        border-color: #ffffff;
        border-style: solid;
      }
      .af-mob-tl { top: -2px; left: -2px; border-width: 2.5px 0 0 2.5px; border-top-left-radius: 3px; }
      .af-mob-tr { top: -2px; right: -2px; border-width: 2.5px 2.5px 0 0; border-top-right-radius: 3px; }
      .af-mob-bl { bottom: -2px; left: -2px; border-width: 0 0 2.5px 2.5px; border-bottom-left-radius: 3px; }
      .af-mob-br { bottom: -2px; right: -2px; border-width: 0 2.5px 2.5px 0; border-bottom-right-radius: 3px; }
      @keyframes afMobPulseA {
        0% { box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.3), 0 0 15px rgba(239, 68, 68, 0.7); }
        100% { box-shadow: 0 0 0 7px rgba(239, 68, 68, 0.5), 0 0 32px rgba(239, 68, 68, 0.95); }
      }
      @keyframes afMobPulseB {
        0% { box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.3), 0 0 15px rgba(245, 158, 11, 0.7); }
        100% { box-shadow: 0 0 0 7px rgba(245, 158, 11, 0.5), 0 0 32px rgba(245, 158, 11, 0.95); }
      }
    `;
    (idoc.head || idoc.body || idoc.documentElement).appendChild(style);
  }
}

/**
 * Clears active mobile simulator highlights, visual overlay boxes, and in-screen banners.
 */
function clearMobileSimulatorHighlights(idoc, mobSimRoot) {
  if (idoc) {
    try {
      idoc.querySelectorAll('.af-mob-highlight-target, .af-mob-highlight-secondary').forEach(el => {
        el.classList.remove('af-mob-highlight-target', 'af-mob-highlight-secondary');
      });
      const overlay = idoc.getElementById('__af_mob_spotlight_overlay__');
      if (overlay) overlay.remove();
    } catch (_) {}
  }
  const screenBanner = document.getElementById('af-mob-screen-banner');
  if (screenBanner) screenBanner.remove();

  if (mobSimRoot) {
    mobSimRoot.querySelectorAll('.af-mob-issue-card').forEach(c => c.classList.remove('active'));
    const drawerTitle = mobSimRoot.querySelector('.af-mob-drawer-title');
    if (drawerTitle && drawerTitle.__af_original_title) {
      drawerTitle.innerHTML = drawerTitle.__af_original_title;
    }
  }
}

/**
 * Extracts a concise, readable element label for tags and banners
 */
function getShortElementLabel(el, selector = '', fallback = 'Element') {
  if (el) {
    if (el.id) return `#${el.id}`;
    const txt = (el.innerText || el.textContent || '').trim();
    if (txt) return `<${el.tagName.toLowerCase()}> "${txt.slice(0, 22)}${txt.length > 22 ? '…' : ''}"`;
    if (el.tagName === 'A' && el.getAttribute('href')) return `<a> (${el.getAttribute('href').slice(0, 20)})`;
    if (el.className && typeof el.className === 'string') {
      const firstCls = el.className.trim().split(/\s+/)[0];
      if (firstCls) return `.${firstCls}`;
    }
    return `<${el.tagName.toLowerCase()}>`;
  }
  if (selector) {
    const parts = selector.split(/\s*>\s*|\s+/).filter(Boolean);
    return parts[parts.length - 1] || selector;
  }
  return fallback;
}

/**
 * Renders the visual overlay boxes, corner brackets, badges, and collision zones inside idoc
 */
function renderMobileSimulatorOverlay(idoc, targetA, targetB, meta = {}) {
  if (!idoc || !idoc.body) return;

  const existing = idoc.getElementById('__af_mob_spotlight_overlay__');
  if (existing) existing.remove();

  const overlay = idoc.createElement('div');
  overlay.id = '__af_mob_spotlight_overlay__';

  const win = idoc.defaultView || window;
  const scrollX = win.scrollX || idoc.documentElement.scrollLeft || 0;
  const scrollY = win.scrollY || idoc.documentElement.scrollTop || 0;

  let rA = null;
  if (targetA) {
    const b = targetA.getBoundingClientRect();
    rA = {
      top: b.top + scrollY,
      left: b.left + scrollX,
      width: Math.max(b.width, 24),
      height: Math.max(b.height, 20),
    };
  } else if (meta.rect) {
    rA = {
      top: meta.rect.top,
      left: meta.rect.left,
      width: Math.max(meta.rect.width, 24),
      height: Math.max(meta.rect.height, 20),
    };
  }

  let rB = null;
  if (targetB) {
    const b = targetB.getBoundingClientRect();
    rB = {
      top: b.top + scrollY,
      left: b.left + scrollX,
      width: Math.max(b.width, 24),
      height: Math.max(b.height, 20),
    };
  } else if (meta.rectB) {
    rB = {
      top: meta.rectB.top,
      left: meta.rectB.left,
      width: Math.max(meta.rectB.width, 24),
      height: Math.max(meta.rectB.height, 20),
    };
  }

  const pad = 4;

  if (rA) {
    const labelA = getShortElementLabel(targetA, meta.selector || meta.target, 'Target 1');
    const boxA = idoc.createElement('div');
    boxA.className = 'af-mob-box af-mob-box-a';
    boxA.style.top = `${Math.round(rA.top - pad)}px`;
    boxA.style.left = `${Math.round(rA.left - pad)}px`;
    boxA.style.width = `${Math.round(rA.width + pad * 2)}px`;
    boxA.style.height = `${Math.round(rA.height + pad * 2)}px`;
    boxA.innerHTML = `
      <div class="af-mob-box-tag">🎯 Target 1: <span>${escapeHtml(labelA)}</span></div>
      <div class="af-mob-corner af-mob-tl"></div>
      <div class="af-mob-corner af-mob-tr"></div>
      <div class="af-mob-corner af-mob-bl"></div>
      <div class="af-mob-corner af-mob-br"></div>
    `;
    overlay.appendChild(boxA);
  }

  if (rB) {
    const labelB = getShortElementLabel(targetB, meta.selectorB, 'Colliding 2');
    const boxB = idoc.createElement('div');
    boxB.className = 'af-mob-box af-mob-box-b';
    boxB.style.top = `${Math.round(rB.top - pad)}px`;
    boxB.style.left = `${Math.round(rB.left - pad)}px`;
    boxB.style.width = `${Math.round(rB.width + pad * 2)}px`;
    boxB.style.height = `${Math.round(rB.height + pad * 2)}px`;
    boxB.innerHTML = `
      <div class="af-mob-box-tag">⚡ Colliding 2: <span>${escapeHtml(labelB)}</span></div>
      <div class="af-mob-corner af-mob-tl"></div>
      <div class="af-mob-corner af-mob-tr"></div>
      <div class="af-mob-corner af-mob-bl"></div>
      <div class="af-mob-corner af-mob-br"></div>
    `;
    overlay.appendChild(boxB);
  }

  // Draw Collision Zone Box if this is an overlap issue
  if (rA && rB && meta.type === 'overlap') {
    const overlapLeft = Math.max(rA.left, rB.left);
    const overlapTop = Math.max(rA.top, rB.top);
    const overlapRight = Math.min(rA.left + rA.width, rB.left + rB.width);
    const overlapBottom = Math.min(rA.top + rA.height, rB.top + rB.height);
    const overlapW = overlapRight - overlapLeft;
    const overlapH = overlapBottom - overlapTop;

    if (overlapW > 0 && overlapH > 0) {
      const colBox = idoc.createElement('div');
      colBox.className = 'af-mob-collision-box';
      colBox.style.top = `${Math.round(overlapTop)}px`;
      colBox.style.left = `${Math.round(overlapLeft)}px`;
      colBox.style.width = `${Math.round(overlapW)}px`;
      colBox.style.height = `${Math.round(overlapH)}px`;
      colBox.innerHTML = `<span class="af-mob-collision-badge">💥 Collision (${Math.round(overlapW)}×${Math.round(overlapH)}px)</span>`;
      overlay.appendChild(colBox);
    }
  }

  // Draw overflow marker if overflow issue
  if (rA && meta.type === 'overflow') {
    const overflowMarker = idoc.createElement('div');
    overflowMarker.className = 'af-mob-overflow-marker';
    overflowMarker.style.top = `${Math.round(rA.top)}px`;
    overflowMarker.innerHTML = `⚠️ Overflow (+${meta.overflowPixels || Math.round(rA.width - (win.innerWidth || 390))}px)`;
    overlay.appendChild(overflowMarker);
  }

  // Draw minimum touch target comparison if touch-target issue
  if (rA && meta.type === 'touch-target') {
    const minDim = 24;
    const cX = rA.left + rA.width / 2;
    const cY = rA.top + rA.height / 2;
    const targetBox = idoc.createElement('div');
    targetBox.className = 'af-mob-touch-target-box';
    targetBox.style.top = `${Math.round(cY - minDim / 2)}px`;
    targetBox.style.left = `${Math.round(cX - minDim / 2)}px`;
    targetBox.style.width = `${minDim}px`;
    targetBox.style.height = `${minDim}px`;
    targetBox.innerHTML = `<span class="af-mob-touch-badge">Min 24×24px</span>`;
    overlay.appendChild(targetBox);
  }

  idoc.body.appendChild(overlay);
}

/**
 * Renders the sleek floating inspector banner docked at the bottom of the mobile phone screen
 */
function showMobileScreenBanner(screen, meta = {}, targetA = null, targetB = null, idoc = null, mobSimRoot = null) {
  if (!screen) return;

  const existing = screen.querySelector('#af-mob-screen-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.className = 'af-mob-screen-banner';
  banner.id = 'af-mob-screen-banner';

  const sev = (meta.severity || 'serious').toLowerCase();
  const title = meta.title || meta.rule || 'Mobile Layout Barrier';
  const desc = meta.failureSummary || 'This element causes layout obstruction or tap collision on mobile viewports.';
  const labelA = getShortElementLabel(targetA, meta.selector || meta.target, 'Target Element');
  const labelB = (meta.selectorB || targetB) ? getShortElementLabel(targetB, meta.selectorB, 'Colliding Element') : null;

  banner.innerHTML = `
    <div class="af-mob-banner-top">
      <span class="af-mob-banner-badge ${sev}">${sev.toUpperCase()}</span>
      <span class="af-mob-banner-title" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
      <button type="button" class="af-mob-banner-btn-close" id="af-mob-banner-btn-close" title="Dismiss highlight">✕</button>
    </div>
    <div class="af-mob-banner-desc">${escapeHtml(desc)}</div>
    <div class="af-mob-banner-targets">
      <div class="af-mob-banner-pill af-mob-pill-a">🎯 <strong>Target:</strong> <span>${escapeHtml(labelA)}</span></div>
      ${labelB ? `<div class="af-mob-banner-pill af-mob-pill-b">⚡ <strong>Colliding with:</strong> <span>${escapeHtml(labelB)}</span></div>` : ''}
    </div>
  `;

  banner.querySelector('#af-mob-banner-btn-close')?.addEventListener('click', (e) => {
    e.stopPropagation();
    clearMobileSimulatorHighlights(idoc, mobSimRoot);
  });

  screen.appendChild(banner);
}

/**
 * Updates the simulator drawer title and activates the matching card
 */
function updateDrawerLocatedState(mobSimRoot, targetSelector, meta = {}) {
  if (!mobSimRoot) return;
  const drawerBody = mobSimRoot.querySelector('#af-mob-drawer-body');
  if (drawerBody) {
    drawerBody.querySelectorAll('.af-mob-issue-card').forEach(c => c.classList.remove('active'));
    let matchingCard = null;
    if (typeof meta.index === 'number') {
      matchingCard = drawerBody.querySelector(`.af-mob-issue-card[data-idx="${meta.index}"]`);
    }
    if (!matchingCard) {
      const cards = Array.from(drawerBody.querySelectorAll('.af-mob-issue-card'));
      matchingCard = cards.find(card => {
        const selText = card.querySelector('.af-mob-issue-sel')?.textContent || '';
        const titleText = card.querySelector('.af-mob-issue-title')?.textContent || '';
        return (targetSelector && selText.includes(String(targetSelector))) ||
               (meta.rule && titleText.includes(String(meta.rule))) ||
               (meta.title && titleText.includes(String(meta.title))) ||
               (meta.selector && selText.includes(String(meta.selector)));
      });
    }
    if (matchingCard) {
      matchingCard.classList.add('active');
      matchingCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  const drawerTitle = mobSimRoot.querySelector('.af-mob-drawer-title');
  if (drawerTitle) {
    if (!drawerTitle.__af_original_title) {
      drawerTitle.__af_original_title = drawerTitle.innerHTML;
    }
    const issueName = meta.title || meta.rule || targetSelector || 'Layout Issue';
    drawerTitle.innerHTML = `<span style="color: #38bdf8;">🎯 Located:</span> <span style="font-size: 11px; color: #f8fafc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px;">${escapeHtml(issueName)}</span>`;
  }
}

/**
 * Main coordinator function to highlight and visualize issues inside the mobile simulator
 */
function highlightInMobileSimulator(targetSelector, meta = {}) {
  const mobSimRoot = document.getElementById('__auditforge_mobile_sim_root__');
  const mobSimIframe = document.querySelector('#af-mob-iframe');
  const screen = document.getElementById('af-mob-screen');
  if (!mobSimRoot || !mobSimIframe) return { success: false, error: 'Mobile simulator is not active' };

  const idoc = mobSimIframe.contentDocument || mobSimIframe.contentWindow?.document;
  if (!idoc) return { success: false, error: 'Simulator iframe document unavailable' };

  // 1. Ensure CSS highlight styles exist inside the simulator iframe
  injectMobileSimulatorHighlightStyles(idoc);

  // 2. Clear any prior highlight classes, overlay boxes, and screen banners
  clearMobileSimulatorHighlights(idoc, mobSimRoot);

  // 3. Resolve target element A and colliding element B
  let targetA = meta.__af_elA && idoc.contains(meta.__af_elA) ? meta.__af_elA : null;
  let targetB = meta.__af_elB && idoc.contains(meta.__af_elB) ? meta.__af_elB : null;

  if (!targetA && targetSelector) {
    targetA = findElement(targetSelector, idoc, meta);
  }
  if (!targetB && meta.selectorB) {
    targetB = findElement(meta.selectorB, idoc, { html: meta.htmlB, text: meta.textB, target: meta.title });
  }

  // Handle viewport-meta issue
  if (meta.type === 'viewport-meta') {
    showMobileScreenBanner(screen, meta, null, null, idoc, mobSimRoot);
    updateDrawerLocatedState(mobSimRoot, targetSelector, meta);
    return { success: true, inSimulator: true };
  }

  if (targetA) {
    try {
      targetA.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    } catch (_) {
      try { targetA.scrollIntoView(true); } catch (_) {}
    }
    targetA.classList.add('af-mob-highlight-target');
  }

  if (targetB) {
    targetB.classList.add('af-mob-highlight-secondary');
  }

  // 4. Render visual overlay layer (bounding boxes, badges, collision hazard zone)
  renderMobileSimulatorOverlay(idoc, targetA, targetB, meta);

  // 5. Render sleek in-screen inspector banner docked at the bottom of the phone screen
  showMobileScreenBanner(screen, meta, targetA, targetB, idoc, mobSimRoot);

  // 6. Update drawer card active state and located badge
  updateDrawerLocatedState(mobSimRoot, targetSelector, meta);

  return { success: true, inSimulator: true, targetA: Boolean(targetA), targetB: Boolean(targetB) };
}

function startMobileSimulator(options = {}) {
  stopMobileSimulator();

  let currentDeviceId = options.deviceId || 'iphone-16-pro';
  let isLandscape = Boolean(options.landscape);

  const root = document.createElement('div');
  root.id = '__auditforge_mobile_sim_root__';
  root.setAttribute('data-auditforge-ext', 'true');

  const styleEl = document.createElement('style');
  styleEl.id = '__af_mobile_sim_css__';
  styleEl.textContent = `
    #__auditforge_mobile_sim_root__ {
      position: fixed;
      inset: 0;
      z-index: 2147483640;
      background: rgba(8, 9, 14, 0.88);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #f1f5f9;
      user-select: none;
      animation: afMobileFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      overflow: hidden;
    }
    @keyframes afMobileFadeIn {
      from { opacity: 0; transform: scale(0.98); }
      to { opacity: 1; transform: scale(1); }
    }
    #__auditforge_mobile_sim_root__ * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    .af-mob-header {
      height: 56px;
      padding: 0 20px;
      background: rgba(15, 17, 26, 0.95);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-shrink: 0;
    }
    .af-mob-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13.5px;
      font-weight: 700;
      letter-spacing: -0.2px;
      color: #f8fafc;
    }
    .af-mob-badge {
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.3);
      padding: 3px 8px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
    }
    .af-mob-controls {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .af-mob-select {
      background: #1e2230;
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #f8fafc;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 12.5px;
      font-weight: 500;
      outline: none;
      cursor: pointer;
      transition: border-color 0.15s;
    }
    .af-mob-select:hover, .af-mob-select:focus {
      border-color: #38bdf8;
    }
    .af-mob-btn {
      background: #1e2230;
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #f8fafc;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .af-mob-btn:hover {
      background: #282e42;
      border-color: rgba(255, 255, 255, 0.25);
    }
    .af-mob-btn.active {
      background: rgba(56, 189, 248, 0.18);
      border-color: #38bdf8;
      color: #38bdf8;
    }
    .af-mob-btn-close {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.35);
      color: #fca5a5;
    }
    .af-mob-btn-close:hover {
      background: rgba(239, 68, 68, 0.3);
      color: #fff;
    }
    .af-mob-body {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      overflow: hidden;
      position: relative;
    }
    .af-mob-device-container {
      display: flex;
      align-items: center;
      gap: 24px;
      height: 100%;
      max-width: 100%;
      justify-content: center;
    }
    .af-mob-chassis {
      position: relative;
      background: #0f111a;
      border: 11px solid #1e2233;
      border-radius: 46px;
      box-shadow: 0 25px 60px -10px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.1);
      display: flex;
      flex-direction: column;
      align-items: center;
      overflow: hidden;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      flex-shrink: 0;
    }
    .af-mob-notch {
      position: absolute;
      top: 9px;
      left: 50%;
      transform: translateX(-50%);
      width: 105px;
      height: 24px;
      background: #000;
      border-radius: 14px;
      z-index: 20;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }
    .af-mob-lens {
      width: 9px;
      height: 9px;
      background: #0d1626;
      border: 1.5px solid #1a2744;
      border-radius: 50%;
      margin-left: 50px;
    }
    .af-mob-screen {
      width: 100%;
      height: 100%;
      border-radius: 36px;
      background: #fff;
      overflow: hidden;
      position: relative;
    }
    .af-mob-iframe {
      width: 100%;
      height: 100%;
      border: none;
      display: block;
      background: #fff;
    }
    .af-mob-drawer {
      width: 360px;
      max-height: calc(100vh - 120px);
      background: rgba(15, 17, 26, 0.95);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 18px 45px rgba(0, 0, 0, 0.6);
      overflow: hidden;
      flex-shrink: 0;
    }
    .af-mob-drawer-header {
      padding: 14px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .af-mob-drawer-title {
      font-size: 13px;
      font-weight: 700;
      color: #f1f5f9;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .af-mob-drawer-body {
      padding: 12px;
      overflow-y: auto;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .af-mob-issue-card {
      background: #181b26;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .af-mob-issue-card:hover {
      background: #202434;
      border-color: rgba(56, 189, 248, 0.4);
      transform: translateY(-1px);
    }
    .af-mob-issue-card.active {
      border-color: #38bdf8;
      background: #1e2638;
      box-shadow: 0 0 12px rgba(56, 189, 248, 0.25);
    }
    .af-mob-issue-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .af-mob-issue-tag {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .af-mob-tag-crit { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); }
    .af-mob-tag-ser  { background: rgba(249, 115, 22, 0.2); color: #fb923c; border: 1px solid rgba(249, 115, 22, 0.4); }
    .af-mob-tag-mod  { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); }
    .af-mob-issue-title {
      font-weight: 600;
      color: #f8fafc;
      line-height: 1.35;
    }
    .af-mob-issue-desc {
      font-size: 11px;
      color: #94a3b8;
      line-height: 1.4;
    }
    .af-mob-issue-sel {
      font-family: monospace;
      font-size: 10.5px;
      background: #0f111a;
      padding: 3px 6px;
      border-radius: 4px;
      color: #38bdf8;
      word-break: break-all;
    }
    .af-mob-card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 4px;
      padding-top: 6px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
    }
    .af-mob-btn-locate-issue {
      background: #0d2836;
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.35);
      font-size: 11px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .af-mob-btn-locate-issue:hover {
      background: #0284c7;
      color: #ffffff;
      border-color: #38bdf8;
      box-shadow: 0 0 10px rgba(56, 189, 248, 0.4);
    }
    .af-mob-issue-card.active .af-mob-btn-locate-issue {
      background: #0284c7;
      color: #ffffff;
      border-color: #38bdf8;
    }
    .af-mob-status-pill {
      font-size: 10px;
      font-weight: 700;
      color: #38bdf8;
      display: none;
      align-items: center;
      gap: 3px;
    }
    .af-mob-issue-card.active .af-mob-status-pill {
      display: flex;
    }
    .af-mob-screen-banner {
      position: absolute;
      bottom: 14px;
      left: 12px;
      right: 12px;
      background: rgba(11, 15, 25, 0.95);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(239, 68, 68, 0.4);
      border-top: 3px solid #ef4444;
      border-radius: 12px;
      padding: 10px 12px;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.8), 0 0 15px rgba(239, 68, 68, 0.3);
      z-index: 100;
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #f8fafc;
      animation: afMobBannerSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      pointer-events: auto;
    }
    .af-mob-banner-top {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .af-mob-banner-badge {
      font-size: 9.5px;
      font-weight: 800;
      padding: 2px 5px;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .af-mob-banner-badge.critical { background: rgba(239, 68, 68, 0.25); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.5); }
    .af-mob-banner-badge.serious { background: rgba(249, 115, 22, 0.25); color: #fb923c; border: 1px solid rgba(249, 115, 22, 0.5); }
    .af-mob-banner-badge.moderate { background: rgba(245, 158, 11, 0.25); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.5); }
    .af-mob-banner-title {
      font-size: 11.5px;
      font-weight: 700;
      color: #f1f5f9;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .af-mob-banner-btn-close {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #cbd5e1;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      cursor: pointer;
      line-height: 1;
      transition: all 0.15s ease;
      flex-shrink: 0;
    }
    .af-mob-banner-btn-close:hover {
      background: #ef4444;
      color: #ffffff;
      border-color: #ef4444;
    }
    .af-mob-banner-desc {
      font-size: 10.5px;
      line-height: 1.35;
      color: #94a3b8;
    }
    .af-mob-banner-targets {
      display: flex;
      flex-direction: column;
      gap: 3px;
      margin-top: 2px;
    }
    .af-mob-banner-pill {
      font-size: 10px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      padding: 3px 6px;
      border-radius: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .af-mob-pill-a {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.35);
      color: #fca5a5;
    }
    .af-mob-pill-b {
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.35);
      color: #fde68a;
    }
    @keyframes afMobBannerSlideUp {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .af-mob-empty {
      padding: 32px 16px;
      text-align: center;
      color: #94a3b8;
      font-size: 12px;
    }
  `;
  root.appendChild(styleEl);

  // Main UI skeleton with clean iframe without restrictive src
  root.innerHTML += `
    <div class="af-mob-header">
      <div class="af-mob-brand">
        <span>📱 Mobile Viewport Simulator</span>
        <span class="af-mob-badge" id="af-mob-score-badge">Auditing...</span>
      </div>
      <div class="af-mob-controls">
        <select class="af-mob-select" id="af-mob-device-select">
          <option value="iphone-16-pro">iPhone 16 / 15 Pro (393 × 852)</option>
          <option value="iphone-se">iPhone SE (Compact) (375 × 667)</option>
          <option value="galaxy-s24">Samsung Galaxy S24 (360 × 780)</option>
          <option value="pixel-8">Google Pixel 8 (412 × 915)</option>
          <option value="iphone-16-max">iPhone 16 Pro Max (430 × 932)</option>
        </select>
        <select class="af-mob-select" id="af-mob-vision-select" title="Simulate Color Vision Deficiency / Low Vision on Mobile View">
          <option value="none">👁️ Vision: Normal</option>
          <option value="protanopia">🔴 Protanopia (Red-Blind)</option>
          <option value="deuteranopia">🟢 Deuteranopia (Green-Blind)</option>
          <option value="tritanopia">🔵 Tritanopia (Blue-Blind)</option>
          <option value="achromatopsia">⚪ Achromatopsia (Monochrome)</option>
          <option value="cataracts">🌫️ Cataracts (Blur)</option>
          <option value="photophobia">🌓 Photophobia (Invert)</option>
        </select>
        <button type="button" class="af-mob-btn active" id="af-mob-btn-mode" title="Toggle between Live Web App (interactive forms & multi-step journeys) and DOM Snapshot mode">
          <span id="af-mob-mode-icon">🌐</span> <span id="af-mob-mode-text">Live Web</span>
        </button>
        <button type="button" class="af-mob-btn" id="af-mob-btn-rotate" title="Rotate device (Portrait / Landscape)">
          <span>🔄</span> <span>Rotate</span>
        </button>
        <button type="button" class="af-mob-btn" id="af-mob-btn-refresh" title="Refresh live snapshot or sync frame">
          <span>⚡</span> <span>Sync DOM</span>
        </button>
        <button type="button" class="af-mob-btn" id="af-mob-btn-popout" title="Open live interactive page at exact device viewport width in a dedicated window">
          <span>🚀</span> <span>Device Window</span>
        </button>
        <button type="button" class="af-mob-btn active" id="af-mob-btn-touch-mode" title="Toggle touch controls emulation (kinetic swipe scrolling vs standard mouse)">
          <span id="af-mob-touch-icon">👆</span> <span id="af-mob-touch-text">Touch Drag: ON</span>
        </button>
        <button type="button" class="af-mob-btn af-mob-btn-close" id="af-mob-btn-close" title="Close simulator (Esc)">
          <span>✕</span> <span>Close</span>
        </button>
      </div>
    </div>
    <div class="af-mob-body">
      <div class="af-mob-device-container">
        <div class="af-mob-chassis" id="af-mob-chassis">
          <div class="af-mob-notch" id="af-mob-notch">
            <div class="af-mob-lens"></div>
          </div>
          <div class="af-mob-screen" id="af-mob-screen">
            <iframe class="af-mob-iframe" id="af-mob-iframe"></iframe>
          </div>
        </div>
        <div class="af-mob-drawer" id="af-mob-drawer">
          <div class="af-mob-drawer-header">
            <div class="af-mob-drawer-title">
              <span>⚠️ Layout Issues</span>
              <span class="af-mob-badge" id="af-mob-issue-count">0</span>
            </div>
          </div>
          <div class="af-mob-drawer-body" id="af-mob-drawer-body">
            <div class="af-mob-empty">Evaluating mobile layout...</div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Mount mobile simulator HUD to document.documentElement (sibling of body)
  // so visual filters applied to document.body never blur or distort our extension tool
  (document.documentElement || document.body).appendChild(root);

  // Setup device dimensions & interactions
  const chassis = root.querySelector('#af-mob-chassis');
  const screen = root.querySelector('#af-mob-screen');
  const notch = root.querySelector('#af-mob-notch');
  const deviceSelect = root.querySelector('#af-mob-device-select');
  const visionSelect = root.querySelector('#af-mob-vision-select');
  const btnMode = root.querySelector('#af-mob-btn-mode');
  const btnRotate = root.querySelector('#af-mob-btn-rotate');
  const btnRefresh = root.querySelector('#af-mob-btn-refresh');
  const btnPopout = root.querySelector('#af-mob-btn-popout');
  const btnTouchMode = root.querySelector('#af-mob-btn-touch-mode');
  const btnClose = root.querySelector('#af-mob-btn-close');
  const drawerBody = root.querySelector('#af-mob-drawer-body');
  const scoreBadge = root.querySelector('#af-mob-score-badge');
  const issueCountBadge = root.querySelector('#af-mob-issue-count');
  const mobIframe = root.querySelector('#af-mob-iframe');

  if (deviceSelect) deviceSelect.value = currentDeviceId;
  if (visionSelect) visionSelect.value = window.__af_active_color_filter || 'none';

  // Determine initial simulator mode
  let currentSimMode = options.mode || (window.location.protocol.startsWith('http') && !window.location.hostname.includes('.test') ? 'live' : 'snapshot');

  function updateModeButtonUI() {
    if (!btnMode) return;
    const isLive = currentSimMode === 'live';
    btnMode.classList.toggle('active', isLive);
    const icon = root.querySelector('#af-mob-mode-icon');
    const text = root.querySelector('#af-mob-mode-text');
    if (icon) icon.textContent = isLive ? '🌐' : '📸';
    if (text) text.textContent = isLive ? 'Live Web' : 'Snapshot';
  }
  updateModeButtonUI();

  function updateDeviceLayout(targetDoc) {
    const dev = POPULAR_MOBILE_DEVICES[currentDeviceId] || POPULAR_MOBILE_DEVICES['iphone-16-pro'];
    let w = isLandscape ? dev.height : dev.width;
    let h = isLandscape ? dev.width : dev.height;

    // Scale to fit screen height comfortably if necessary
    const availableH = window.innerHeight - 150;
    const availableW = window.innerWidth - 440;
    let scaleH = h > availableH ? availableH / h : 1;
    let scaleW = w > availableW ? availableW / w : 1;
    let scale = Math.min(scaleH, scaleW);
    scale = Math.max(0.45, Math.min(1, scale));

    if (screen) {
      screen.style.width = `${w}px`;
      screen.style.height = `${h}px`;
    }
    if (chassis) {
      chassis.style.width = `${w + 22}px`;
      chassis.style.height = `${h + 22}px`;
      chassis.style.transform = scale < 1 ? `scale(${scale.toFixed(3)})` : 'none';
      chassis.style.transformOrigin = 'center center';
    }
    if (notch) {
      notch.style.display = isLandscape ? 'none' : 'flex';
    }

    const docToScan = targetDoc || (mobIframe && (mobIframe.contentDocument || mobIframe.contentWindow?.document)) || document;

    // Run layout scan for this specific device
    const report = evaluateMobileResponsiveLayout(currentDeviceId, { isLandscape, rootDoc: docToScan });
    const devIssues = report.issuesByDevice[currentDeviceId] || report.issues || [];

    // Store state globally for extension popup and external test access
    window.__af_last_mobile_report = report;
    window.__af_active_mobile_device = currentDeviceId;

    try {
      window.dispatchEvent(new CustomEvent('__auditforge_mobile_layout_updated', {
        detail: { report, deviceId: currentDeviceId, isLandscape }
      }));
    } catch (_) {}

    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          action: 'MOBILE_SIMULATOR_LAYOUT_UPDATED',
          report,
          deviceId: currentDeviceId,
          isLandscape,
        }).catch(() => {});
      }
    } catch (_) {}

    if (scoreBadge) {
      scoreBadge.textContent = `${report.mobileScore}/100 (${report.grade})`;
      scoreBadge.style.color = report.mobileScore >= 80 ? '#4ade80' : (report.mobileScore >= 65 ? '#fbbf24' : '#f87171');
    }
    if (issueCountBadge) {
      issueCountBadge.textContent = String(devIssues.length);
    }

    // Populate drawer
    if (drawerBody) {
      if (devIssues.length === 0) {
        drawerBody.innerHTML = `
          <div class="af-mob-empty" style="color: #4ade80;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-bottom: 8px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <p><strong>Clean Mobile Layout</strong></p>
            <p>No overlapping elements, horizontal overflows, or disjointed steps detected on ${dev.name}.</p>
          </div>
        `;
      } else {
        drawerBody.innerHTML = devIssues.map((iss, idx) => {
          const tagClass = iss.severity === 'critical' ? 'af-mob-tag-crit' : (iss.severity === 'serious' ? 'af-mob-tag-ser' : 'af-mob-tag-mod');
          return `
            <div class="af-mob-issue-card" data-idx="${idx}">
              <div class="af-mob-issue-top">
                <span class="af-mob-issue-tag ${tagClass}">${iss.severity}</span>
                <span style="font-size: 11px; color: #64748b;">${iss.type}</span>
              </div>
              <div class="af-mob-issue-title">${escapeHtml(iss.title)}</div>
              <div class="af-mob-issue-desc">${escapeHtml(iss.failureSummary)}</div>
              <div class="af-mob-issue-sel">${escapeHtml(iss.selector)}</div>
              <div class="af-mob-card-footer">
                <button type="button" class="af-mob-btn-locate-issue" data-idx="${idx}" title="Highlight and visualize this issue on the mobile page">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                  <span>🎯 Highlight on Screen</span>
                </button>
                <span class="af-mob-status-pill">📍 Highlighting</span>
              </div>
            </div>
          `;
        }).join('');

        // Wire click listener to cards and locate buttons
        drawerBody.querySelectorAll('.af-mob-issue-card').forEach(card => {
          card.addEventListener('click', (e) => {
            const idx = parseInt(card.getAttribute('data-idx') || '0', 10);
            const iss = devIssues[idx];
            if (!iss) return;

            const isAlreadyActive = card.classList.contains('active');
            if (isAlreadyActive && !e.target.closest('.af-mob-btn-locate-issue')) {
              // Toggle/dismiss on re-click of card body
              clearMobileSimulatorHighlights(mobIframe?.contentDocument || mobIframe?.contentWindow?.document, root);
              return;
            }

            highlightInMobileSimulator(iss.selector, {
              ...iss,
              index: idx,
            });
          });
        });
      }
    }
  }

  // Initial population of iframe
  populateMobileSimulatorIframe(mobIframe, {
    mode: currentSimMode,
    onUpdateLayout: (idoc) => updateDeviceLayout(idoc)
  });

  btnMode?.addEventListener('click', () => {
    currentSimMode = currentSimMode === 'live' ? 'snapshot' : 'live';
    window.__af_mobile_sim_mode = currentSimMode;
    updateModeButtonUI();
    populateMobileSimulatorIframe(mobIframe, {
      mode: currentSimMode,
      onUpdateLayout: (idoc) => updateDeviceLayout(idoc)
    });
  });

  deviceSelect?.addEventListener('change', (e) => {
    currentDeviceId = e.target.value;
    updateDeviceLayout();
  });

  visionSelect?.addEventListener('change', (e) => {
    const filterVal = e.target.value;
    if (typeof window.__auditforgeSetColorFilter === 'function') {
      window.__auditforgeSetColorFilter(filterVal);
    }
  });

  btnRotate?.addEventListener('click', () => {
    isLandscape = !isLandscape;
    btnRotate.classList.toggle('active', isLandscape);
    updateDeviceLayout();
  });

  btnRefresh?.addEventListener('click', () => {
    populateMobileSimulatorIframe(mobIframe, {
      mode: currentSimMode,
      onUpdateLayout: (idoc) => updateDeviceLayout(idoc)
    });
    updateDeviceLayout();
  });

  btnPopout?.addEventListener('click', () => {
    const dev = POPULAR_MOBILE_DEVICES[currentDeviceId] || POPULAR_MOBILE_DEVICES['iphone-16-pro'];
    let w = isLandscape ? dev.height : dev.width;
    let h = isLandscape ? dev.width : dev.height;
    openDeviceWindow(window.location.href, w, h);
  });

  btnTouchMode?.addEventListener('click', () => {
    window.__af_mobile_touch_mode = !(window.__af_mobile_touch_mode !== false);
    const isTouch = window.__af_mobile_touch_mode;
    btnTouchMode.classList.toggle('active', isTouch);
    const icon = root.querySelector('#af-mob-touch-icon');
    const text = root.querySelector('#af-mob-touch-text');
    if (icon) icon.textContent = isTouch ? '👆' : '🖱️';
    if (text) text.textContent = isTouch ? 'Touch Drag: ON' : 'Mouse Mode';

    try {
      const idoc = mobIframe.contentDocument || mobIframe.contentWindow?.document;
      if (idoc && idoc.body) {
        idoc.body.style.cursor = isTouch ? 'grab' : 'default';
        const puck = idoc.getElementById('__af_touch_puck__');
        if (puck) puck.style.display = isTouch ? 'block' : 'none';
      }
    } catch (_) {}
  });

  btnClose?.addEventListener('click', () => {
    stopMobileSimulator();
  });

  const onKey = (e) => {
    if (e.key === 'Escape') {
      stopMobileSimulator();
    }
  };
  window.addEventListener('keydown', onKey);

  // Initialize
  updateDeviceLayout();

  mobileSimCleanup = () => {
    window.removeEventListener('keydown', onKey);
    root.remove();
  };

  return { active: true, deviceId: currentDeviceId, report: window.__af_last_mobile_report };
}

function stopMobileSimulator() {
  if (typeof mobileSimCleanup === 'function') {
    mobileSimCleanup();
    mobileSimCleanup = null;
  }
  document.getElementById('__auditforge_mobile_sim_root__')?.remove();
  window.__af_last_mobile_report = null;

  try {
    window.dispatchEvent(new CustomEvent('__auditforge_mobile_layout_updated', {
      detail: { active: false }
    }));
  } catch (_) {}

  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        action: 'MOBILE_SIMULATOR_LAYOUT_UPDATED',
        active: false,
      }).catch(() => {});
    }
  } catch (_) {}

  return { active: false };
}

  /**
   * Main audit execution entry point
   * @returns {Promise<Object>} Complete audit report
   */
  window.__runWcagAudit = async function () {
    // 0. Ensure any simulated preview fixes and active extension overlays are cleanly dismissed before auditing genuine DOM
    if (typeof window.__auditforgeRevertAllFixes === 'function') {
      try { window.__auditforgeRevertAllFixes(); } catch (_) {}
    }
    if (typeof window.__auditforgeClearHighlight === 'function') {
      try { window.__auditforgeClearHighlight(); } catch (_) {}
    }
    if (typeof stopMobileSimulator === 'function') {
      try { stopMobileSimulator(); } catch (_) {}
    }

    const startTime = performance.now();
    const pageUrl = window.location.href;
    const pageTitle = document.title || pageUrl;

    if (!window.axe) {
      throw new Error('axe-core library is not loaded on this page.');
    }

    // 1. Run axe-core against WCAG 2.2 AA rules with preload disabled
    // Disabling preload prevents axe-core from attempting cross-origin XHR requests for stylesheets/media,
    // which fail with ProgressEvent errors on websites with strict CORS/CSP policies.
    const axeResults = await window.axe.run(document, {
      preload: false,
      runOnly: {
        type: 'tag',
        values: WCAG_22_TAGS,
      },
      resultTypes: ['violations', 'passes', 'incomplete'],
    });

    const violationsBySeverity = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    const formattedViolations = [];

    for (const v of axeResults.violations) {
      // Exclude non-normative best practices that are not WCAG A/AA requirements
      const isNormativeWcag = Array.isArray(v.tags) && v.tags.some(t =>
        t.startsWith('wcag2a') || t.startsWith('wcag2aa') ||
        t.startsWith('wcag21a') || t.startsWith('wcag21aa') ||
        t.startsWith('wcag22a') || t.startsWith('wcag22aa')
      );
      if (!isNormativeWcag) continue;

      const severity = v.impact || 'moderate';
      if (violationsBySeverity[severity] !== undefined) {
        violationsBySeverity[severity] += v.nodes.length;
      }

      const sampleNodes = [];
      for (const node of v.nodes.slice(0, 25)) {
        const targetSelector = Array.isArray(node.target) ? node.target.join(' ') : String(node.target);
        if (targetSelector.includes('__auditforge') || targetSelector.includes('__af_')) {
          continue;
        }
        let contrastFix = null;

        if (v.id === 'color-contrast') {
          const check = (node.any || []).find(c => c.id === 'color-contrast') || (node.any && node.any[0]);
          if (check && check.data) {
            const { fgColor, bgColor, expectedContrastRatio } = check.data;
            if (fgColor && bgColor) {
              contrastFix = calculateColorContrastFix(fgColor, bgColor, expectedContrastRatio || '4.5:1');
            }
          }
        }

        let rect = null;
        let focalRect = null;
        try {
          let el = null;
          try { el = document.querySelector(targetSelector); } catch (_) {}
          if (!el && targetSelector.includes('#')) {
            const idMatch = targetSelector.match(/#([a-zA-Z0-9_-]+)/);
            if (idMatch) el = document.getElementById(idMatch[1]);
          }
          if (el && typeof el.getBoundingClientRect === 'function') {
            const r = el.getBoundingClientRect();
            rect = {
              left: Math.round(r.left),
              top: Math.round(r.top),
              width: Math.round(r.width),
              height: Math.round(r.height),
            };
            const f = getFocalTarget(el);
            if (f && f.rect) {
              focalRect = f.rect;
            }
          }
        } catch (_) {}

        sampleNodes.push({
          target: targetSelector,
          html: node.html ? node.html.trim().slice(0, 300) : '',
          failureSummary: node.failureSummary || v.help,
          contrastFix,
          rect,
          focalRect,
        });
      }

      formattedViolations.push({
        id: v.id,
        impact: severity,
        description: v.description,
        help: v.help,
        helpUrl: v.helpUrl,
        tags: v.tags.filter(t => t.startsWith('wcag') || t.startsWith('best')),
        wcagRule: v.tags.find(t => t.startsWith('wcag22') || t.startsWith('wcag21') || t.startsWith('wcag2')) || 'WCAG 2.2 AA',
        affectedCount: v.nodes.length,
        nodes: sampleNodes,
        remediationCode: sampleNodes[0]?.contrastFix?.cssFix
          ? `/* Color Contrast Fix */\n${sampleNodes[0].contrastFix.cssFix}`
          : getRemediationSnippet(v.id, sampleNodes[0]?.html || ''),
      });
    }

    // 2. Run ARIA Semantic Accuracy Audits
    try {
      const ariaResults = evaluateAriaLabelAccuracy();
      const ariaDefs = [
        {
          key: 'emptyNodes',
          id: 'aria-label-empty',
          impact: 'critical',
          help: 'aria-label attribute must not be empty or whitespace',
          description: 'Elements with an aria-label attribute must not have an empty or whitespace-only value.',
          wcagRule: 'WCAG 2.2 A 4.1.2',
          tags: ['wcag2a', 'wcag412'],
        },
        {
          key: 'genericNodes',
          id: 'aria-label-generic',
          impact: 'serious',
          help: 'Accessible label must not be generic or non-descriptive',
          description: 'Accessible names (aria-label) must provide meaningful, descriptive context rather than generic placeholders (e.g. "button", "link", "icon") or single characters.',
          wcagRule: 'WCAG 2.2 AA 2.4.6 / 4.1.2',
          tags: ['wcag2aa', 'wcag246', 'wcag412'],
        },
        {
          key: 'nameMismatchNodes',
          id: 'aria-label-name-mismatch',
          impact: 'serious',
          help: 'Accessible label must include visible text label (WCAG 2.5.3)',
          description: 'WCAG 2.2 SC 2.5.3 (Label in Name): The accessible name (aria-label) must contain the visible text label to ensure compatibility with speech input and voice control navigation.',
          wcagRule: 'WCAG 2.2 A 2.5.3',
          tags: ['wcag2a', 'wcag253'],
        },
        {
          key: 'iconMismatchNodes',
          id: 'aria-label-icon-mismatch',
          impact: 'moderate',
          help: 'Accessible label contradicts the visual meaning of the embedded icon',
          description: 'Accessible label must accurately reflect the visual function and intent of the embedded icon.',
          wcagRule: 'WCAG 2.2 AA 1.1.1 / 4.1.2',
          tags: ['wcag2aa', 'wcag111', 'wcag412'],
        },
      ];

      for (const def of ariaDefs) {
        const nodes = ariaResults[def.key] || [];
        if (nodes.length > 0) {
          violationsBySeverity[def.impact] = (violationsBySeverity[def.impact] || 0) + nodes.length;
          formattedViolations.push({
            id: def.id,
            impact: def.impact,
            description: def.description,
            help: def.help,
            helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html',
            tags: def.tags,
            wcagRule: def.wcagRule,
            affectedCount: nodes.length,
            nodes,
            remediationCode: getRemediationSnippet(def.id, nodes[0]?.html || ''),
          });
        }
      }
    } catch (ariaErr) {
      console.warn('[WCAG Auditor] ARIA evaluation notice:', ariaErr);
    }

    // 3. Run Screen Reader Compatibility & Narrative Audits
    let srScore = 100;
    let speechSequence = [];
    try {
      const srResults = evaluateScreenReaderCompatibility();
      srScore = srResults.srScore;
      speechSequence = srResults.speechSequence;

      const srDefs = [
        {
          key: 'hiddenFocusNodes',
          id: 'screen-reader-hidden-focus',
          impact: 'critical',
          help: 'Focusable interactive elements hidden from screen readers via aria-hidden',
          description: 'Interactive controls (buttons, links, inputs) must not be nested inside elements with aria-hidden="true". Keyboard focus enters the control, but the screen reader announces complete silence.',
          wcagRule: 'WCAG 2.2 A 4.1.2',
          tags: ['wcag2a', 'wcag412'],
        },
        {
          key: 'altQualityNodes',
          id: 'screen-reader-alt-quality',
          impact: 'moderate',
          help: 'Image alt-text contains file names, extensions, or redundant "image of" speech',
          description: 'Alt text should convey the natural meaning of the visual without file extensions (.jpg, .png) or redundant role phrases ("image of") that screen readers speak twice.',
          wcagRule: 'WCAG 2.2 AA 1.1.1',
          tags: ['wcag2a', 'wcag111'],
        },
        {
          key: 'ambiguousLinkNodes',
          id: 'screen-reader-link-purpose',
          impact: 'moderate',
          help: 'Ambiguous link text without context degrades screen reader Links List',
          description: 'Link text such as "click here", "learn more", or "details" without an accessible label produces unusable screen reader link lists (VO + U / NVDA Elements List).',
          wcagRule: 'WCAG 2.2 AA 2.4.4 / 2.4.9',
          tags: ['wcag2aa', 'wcag244', 'wcag249'],
        },
      ];

      for (const def of srDefs) {
        const nodes = srResults[def.key] || [];
        if (nodes.length > 0) {
          violationsBySeverity[def.impact] = (violationsBySeverity[def.impact] || 0) + nodes.length;
          formattedViolations.push({
            id: def.id,
            impact: def.impact,
            description: def.description,
            help: def.help,
            helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html',
            tags: def.tags,
            wcagRule: def.wcagRule,
            affectedCount: nodes.length,
            nodes,
            remediationCode: getRemediationSnippet(def.id, nodes[0]?.html || ''),
          });
        }
      }
    } catch (srErr) {
      console.warn('[WCAG Auditor] Screen reader evaluation notice:', srErr);
    }

    // 4. Run Interactive :hover Contrast Evaluation
    try {
      const hoverViolation = evaluateHoverStateContrast();
      if (hoverViolation && hoverViolation.nodes.length > 0) {
        violationsBySeverity[hoverViolation.impact] = (violationsBySeverity[hoverViolation.impact] || 0) + hoverViolation.nodes.length;
        formattedViolations.push(hoverViolation);
      }
    } catch (hoverErr) {
      console.warn('[WCAG Auditor] Hover evaluation notice:', hoverErr);
    }

    // 5. Run Tab Navigation Order Evaluation
    let tabOrderData = null;
    try {
      tabOrderData = evaluateTabNavigationOrder();
      if (tabOrderData && tabOrderData.positiveTabIndexCount > 0) {
        violationsBySeverity.serious = (violationsBySeverity.serious || 0) + tabOrderData.positiveTabIndexCount;
        formattedViolations.push({
          id: 'focus-order-tabindex',
          impact: 'serious',
          description: 'Elements should not have positive tabindex attributes (> 0) because they disrupt natural keyboard navigation and reading flow.',
          help: 'Avoid positive tabindex values to maintain natural keyboard navigation order',
          helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html',
          tags: ['wcag2a', 'wcag243'],
          wcagRule: 'WCAG 2.2 A 2.4.3 Focus Order',
          affectedCount: tabOrderData.positiveTabIndexCount,
          nodes: tabOrderData.items.filter(it => it.hasPositiveTabIndex).map(it => ({
            target: it.selector,
            html: `<${it.tagName} tabindex="${it.tabIndex}">${it.name}</${it.tagName}>`,
            failureSummary: `Element has positive tabindex="${it.tabIndex}". Remove positive tabindex to preserve natural DOM order.`,
          })),
          remediationCode: `<!-- Fix: Remove positive tabindex to restore natural keyboard navigation order -->\n<element tabindex="0"> ... </element>`,
        });
      }
    } catch (tabErr) {
      console.warn('[WCAG Auditor] Tab order evaluation notice:', tabErr);
    }

    // 6. Extract Page Links for Link Integrity & Broken Link Auditor
    let pageLinks = [];
    try {
      pageLinks = extractPageLinks();
    } catch (linkErr) {
      console.warn('[WCAG Auditor] Link extraction notice:', linkErr);
    }

    // 7. Run Mobile & Responsive Layout Audit
    let mobileLayoutData = null;
    try {
      mobileLayoutData = evaluateMobileResponsiveLayout('iphone-16-pro');
    } catch (mobileErr) {
      console.warn('[WCAG Auditor] Mobile layout evaluation notice:', mobileErr);
    }

    // Sort violations by severity: critical first, then serious, moderate, minor
    const severityOrder = { critical: 1, serious: 2, moderate: 3, minor: 4 };
    formattedViolations.sort((a, b) => (severityOrder[a.impact] || 5) - (severityOrder[b.impact] || 5));

    const { score, grade, riskLevel, summary } = calculateComplianceScore(violationsBySeverity);
    const durationSeconds = Number(((performance.now() - startTime) / 1000).toFixed(1));

    return {
      success: true,
      url: pageUrl,
      pageTitle: pageTitle || 'Audited Web Page',
      scanDate: new Date().toISOString(),
      formattedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      scanDurationSeconds: durationSeconds,
      standardsVersion: 'WCAG 2.2 Level AA',
      score,
      grade,
      riskLevel,
      summary,
      screenReaderScore: srScore,
      speechSequence,
      tabOrder: tabOrderData,
      links: pageLinks,
      mobileLayout: mobileLayoutData,
      stats: {
        totalViolations: formattedViolations.reduce((acc, v) => acc + v.affectedCount, 0),
        rulesViolatedCount: formattedViolations.length,
        rulesPassedCount: axeResults.passes.length,
        criticalCount: violationsBySeverity.critical,
        seriousCount: violationsBySeverity.serious,
        moderateCount: violationsBySeverity.moderate,
        minorCount: violationsBySeverity.minor,
      },
      violations: formattedViolations,
    };
  };

  /**
   * Clears any active highlight overlay, spotlight mask, toolbar, or toast from the page.
   */
  window.__auditforgeClearHighlight = function () {
    const mobSimIframe = document.querySelector('#af-mob-iframe');
    const mobSimRoot = document.getElementById('__auditforge_mobile_sim_root__');
    if (mobSimIframe || mobSimRoot) {
      const idoc = mobSimIframe?.contentDocument || mobSimIframe?.contentWindow?.document;
      clearMobileSimulatorHighlights(idoc, mobSimRoot);
    }

    if (typeof window.__auditforgeOverlayCleanup === 'function') {
      try {
        window.__auditforgeOverlayCleanup();
      } catch (_) {}
    }
    window.__auditforgeOverlayCleanup = null;
    const existingRoot = document.getElementById('__auditforge_overlay_root__');
    if (existingRoot) existingRoot.remove();
    const existingOverlay = document.getElementById('__auditforge_highlight_overlay__');
    if (existingOverlay) existingOverlay.remove();
    const existingToast = document.getElementById('__auditforge_toast__');
    if (existingToast) existingToast.remove();
    const existingStyles = document.getElementById('__auditforge_overlay_styles__');
    if (existingStyles) existingStyles.remove();
    const legacyStyles = document.getElementById('__auditforge_highlight_styles__');
    if (legacyStyles) legacyStyles.remove();
  };

  /**
   * Renders a full in-page spotlight overlay on the site itself, smoothly scrolls
   * the issue into view, spotlights the target element with a high-contrast cutout and
   * neon animated brackets, and displays a floating in-page diagnostic toolbar.
   *
   * @param {string|string[]} targetSelector CSS selector or array of selectors
   * @param {Object} [meta] Metadata about the issue (impact, help, wcagRule, target, html, contrastFix, ariaDetails, srDetails, description, remediationCode)
   * @returns {{ success: boolean, error?: string }}
   */
  window.__auditforgeHighlight = function (targetSelector, meta = {}) {
    window.__auditforgeClearHighlight();

    // Reject selectors explicitly targeting extension elements
    const rawTargetStr = typeof targetSelector === 'string' ? targetSelector.trim() : (Array.isArray(targetSelector) ? targetSelector.join(' ') : String(targetSelector || ''));
    if (rawTargetStr.includes('__auditforge') || rawTargetStr.includes('__af_')) {
      return { success: false, error: 'Target belongs to extension UI' };
    }

    function safeEscape(str) {
      return String(str || '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      }[c]));
    }

    const mobSimRoot = document.getElementById('__auditforge_mobile_sim_root__');
    const mobSimIframe = document.querySelector('#af-mob-iframe');
    const isSimActive = Boolean(mobSimRoot && mobSimIframe);

    // If mobile simulator HUD is active on page, spotlight target directly inside the simulator iframe
    if (isSimActive) {
      try {
        const idoc = mobSimIframe.contentDocument || mobSimIframe.contentWindow?.document;
        if (idoc) {
          const res = highlightInMobileSimulator(targetSelector, meta);
          return { success: res.success, inSimulator: true };
        }
      } catch (err) {
        console.warn('[Auditor] Simulator highlight error:', err);
      }
    }

    const targetEl = findElement(targetSelector, document, meta);
    const selectorString = Array.isArray(targetSelector) ? targetSelector.join(' ') : String(targetSelector || '');
    const isDocumentScope = targetEl === document.documentElement || targetEl === document.body || selectorString === 'html' || selectorString === 'body' || !selectorString;
    const isNotFound = !targetEl && !isDocumentScope;

    // Palette definition
    const severityPalette = {
      critical: { border: '#ef4444', glow: 'rgba(239, 68, 68, 0.45)', bg: 'rgba(239, 68, 68, 0.12)', text: '#fca5a5' },
      serious:  { border: '#f97316', glow: 'rgba(249, 115, 22, 0.45)', bg: 'rgba(249, 115, 22, 0.12)', text: '#fdba74' },
      moderate: { border: '#f59e0b', glow: 'rgba(245, 158, 11, 0.45)', bg: 'rgba(245, 158, 11, 0.12)', text: '#fde68a' },
      minor:    { border: '#38bdf8', glow: 'rgba(56, 189, 248, 0.45)', bg: 'rgba(56, 189, 248, 0.12)', text: '#bae6fd' },
      default:  { border: '#6366f1', glow: 'rgba(99, 102, 241, 0.45)', bg: 'rgba(99, 102, 241, 0.12)', text: '#c7d2fe' },
    };
    const impactKey = (meta.impact || 'default').toLowerCase();
    const color = severityPalette[impactKey] || severityPalette.default;

    // Inject styles
    let styles = document.getElementById('__auditforge_overlay_styles__');
    if (!styles) {
      styles = document.createElement('style');
      styles.id = '__auditforge_overlay_styles__';
      styles.textContent = `
        @keyframes __af_fade_in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes __af_pulse_ring {
          0% { box-shadow: 0 0 0 99999px rgba(11, 15, 25, 0.72), 0 0 0 0px var(--af-glow), 0 0 20px var(--af-border); }
          50% { box-shadow: 0 0 0 99999px rgba(11, 15, 25, 0.72), 0 0 0 8px rgba(0,0,0,0), 0 0 35px var(--af-border); }
          100% { box-shadow: 0 0 0 99999px rgba(11, 15, 25, 0.72), 0 0 0 0px var(--af-glow), 0 0 20px var(--af-border); }
        }
        @keyframes __af_slide_up {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .__af_root {
          position: fixed;
          inset: 0;
          z-index: 2147483640;
          pointer-events: auto;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
          color: #f8fafc;
          animation: __af_fade_in 0.2s ease-out;
        }
        .__af_backdrop {
          position: fixed;
          inset: 0;
          background: rgba(11, 15, 25, 0.75);
          backdrop-filter: blur(2px);
          -webkit-backdrop-filter: blur(2px);
          cursor: pointer;
        }
        .__af_spotlight {
          position: fixed;
          box-sizing: border-box;
          border: 2.5px solid var(--af-border);
          border-radius: 8px;
          background: transparent;
          box-shadow: 0 0 0 99999px rgba(11, 15, 25, 0.72), 0 0 25px var(--af-border);
          pointer-events: none;
          animation: __af_pulse_ring 2s infinite ease-in-out;
          transition: top 0.05s linear, left 0.05s linear, width 0.05s linear, height 0.05s linear;
        }
        .__af_spotlight .af_corner {
          position: absolute;
          width: 10px;
          height: 10px;
          border-color: #ffffff;
          border-style: solid;
        }
        .__af_spotlight .af_tl { top: -2px; left: -2px; border-width: 3px 0 0 3px; border-top-left-radius: 4px; }
        .__af_spotlight .af_tr { top: -2px; right: -2px; border-width: 3px 3px 0 0; border-top-right-radius: 4px; }
        .__af_spotlight .af_bl { bottom: -2px; left: -2px; border-width: 0 0 3px 3px; border-bottom-left-radius: 4px; }
        .__af_spotlight .af_br { bottom: -2px; right: -2px; border-width: 0 3px 3px 0; border-bottom-right-radius: 4px; }

        .__af_toolbar {
          position: fixed;
          max-width: 480px;
          min-width: 320px;
          background: #040809;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid #1b6f7e;
          border-top: 3.5px solid var(--af-border);
          border-radius: 10px;
          box-shadow: 0 20px 45px rgba(0, 0, 0, 0.95), 0 0 25px var(--af-glow);
          padding: 14px 16px;
          pointer-events: auto;
          z-index: 2147483645;
          animation: __af_slide_up 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .__af_toolbar_header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 8px;
        }
        .__af_badge {
          background: var(--af-border);
          color: #000000;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .__af_rule_title {
          font-size: 12px;
          font-weight: 700;
          color: #e2ebed;
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .__af_btn_close {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(27, 111, 126, 0.3);
          color: #868180;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 12px;
          line-height: 1;
          transition: all 0.15s ease;
        }
        .__af_btn_close:hover {
          background: rgba(239, 68, 68, 0.3);
          border-color: #ef4444;
          color: #ffffff;
        }
        .__af_desc {
          font-size: 11px;
          line-height: 1.45;
          color: #868180;
          margin-bottom: 8px;
        }
        .__af_meta_row {
          font-size: 10px;
          background: #000000;
          border: 1px solid rgba(27, 111, 126, 0.35);
          border-radius: 5px;
          padding: 5px 8px;
          margin-bottom: 6px;
          word-break: break-all;
          font-family: monospace;
          color: #0D9FBA;
        }
        .__af_diag_box {
          background: rgba(245, 158, 11, 0.12);
          border: 1px solid rgba(245, 158, 11, 0.3);
          border-radius: 5px;
          padding: 6px 8px;
          font-size: 10.5px;
          margin-bottom: 8px;
          color: #fef3c7;
        }
        .__af_toolbar_actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 10px;
          padding-top: 8px;
          border-top: 1px solid rgba(27, 111, 126, 0.3);
        }
        .__af_btn_action {
          background: #080f12;
          border: 1px solid rgba(27, 111, 126, 0.35);
          color: #868180;
          padding: 4px 10px;
          border-radius: 5px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .__af_btn_action:hover {
          background: rgba(27, 111, 126, 0.3);
          border-color: #0D9FBA;
          color: #0D9FBA;
        }
      `;
      document.head.appendChild(styles);
    }

    // Create Overlay Root
    const root = document.createElement('div');
    root.id = '__auditforge_overlay_root__';
    root.className = '__af_root';
    root.style.setProperty('--af-border', color.border);
    root.style.setProperty('--af-glow', color.glow);

    // 1. Transparent / Dim Backdrop (dismiss on click)
    const backdrop = document.createElement('div');
    backdrop.className = '__af_backdrop';
    backdrop.title = 'Click anywhere to dismiss overlay (or press Escape)';
    if (isDocumentScope) {
      backdrop.style.background = 'rgba(11, 15, 25, 0.75)';
      backdrop.style.backdropFilter = 'blur(2px)';
    } else {
      backdrop.style.background = 'transparent';
      backdrop.style.backdropFilter = 'none';
    }
    backdrop.addEventListener('click', () => {
      window.__auditforgeClearHighlight();
    });
    root.appendChild(backdrop);

    // 2. Spotlight Cutout (if not page-wide)
    let spotlight = null;
    let prevOutline = '';
    let prevOutlineOffset = '';
    if (!isDocumentScope && !isNotFound && targetEl) {
      if (targetEl.style) {
        prevOutline = targetEl.style.outline;
        prevOutlineOffset = targetEl.style.outlineOffset;
        targetEl.style.outline = `3.5px dashed ${color.border}`;
        targetEl.style.outlineOffset = '4px';
      }

      spotlight = document.createElement('div');
      spotlight.className = '__af_spotlight';
      spotlight.innerHTML = `
        <div class="af_corner af_tl"></div>
        <div class="af_corner af_tr"></div>
        <div class="af_corner af_bl"></div>
        <div class="af_corner af_br"></div>
      `;
      root.appendChild(spotlight);
    }

    // 3. Floating In-Page Action Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = '__af_toolbar';

    const ruleLabel = meta.help || meta.wcagRule || 'WCAG 2.2 Finding';
    const impactLabel = (meta.impact || 'ISSUE').toUpperCase();
    const targetLabel = meta.target || (targetEl ? targetEl.tagName.toLowerCase() : 'Page Scope');

    let diagnosisHtml = '';
    if (meta.contrastFix) {
      const cf = meta.contrastFix;
      diagnosisHtml = `
        <div class="__af_diag_box">
          <strong>⚠️ Contrast Failure:</strong> ${safeEscape(cf.currentRatio)} vs ${safeEscape(cf.requiredRatio)} required.
          <div style="margin-top: 3px;">➔ Fix: Change color to <strong style="color: #38bdf8; font-family: monospace;">${safeEscape(cf.suggestedFg)}</strong> (${safeEscape(cf.suggestedRatio)} PASS)</div>
        </div>
      `;
    } else if (meta.ariaDetails) {
      const ad = meta.ariaDetails;
      diagnosisHtml = `
        <div class="__af_diag_box" style="background: rgba(56, 189, 248, 0.12); border-color: rgba(56, 189, 248, 0.3); color: #e0f2fe;">
          <strong>🗣️ ARIA Analysis:</strong> ${safeEscape(ad.diagnosis)}
          <div style="margin-top: 3px;">➔ Recommended Label: <strong style="color: #34d399;">"${safeEscape(ad.recommendedLabel)}"</strong></div>
        </div>
      `;
    } else if (meta.srDetails) {
      const sd = meta.srDetails;
      diagnosisHtml = `
        <div class="__af_diag_box" style="background: rgba(168, 85, 247, 0.12); border-color: rgba(168, 85, 247, 0.3); color: #f3e8ff;">
          <strong>🎙️ Screen Reader Readout:</strong> ${safeEscape(sd.diagnosis)}
        </div>
      `;
    } else if (meta.spokenText) {
      diagnosisHtml = `
        <div class="__af_diag_box" style="background: rgba(168, 85, 247, 0.12); border-color: rgba(168, 85, 247, 0.3); color: #f3e8ff;">
          <strong>🎙️ VoiceOver Announcement:</strong> ${safeEscape(meta.spokenText)}
        </div>
      `;
    }

    let descText = meta.description;
    if (!descText) {
      if (isDocumentScope) {
        descText = 'This is a page-wide architectural finding (e.g. missing landmark or heading hierarchy) applicable to the whole document structure.';
      } else if (isNotFound) {
        descText = 'The element could not be located on the current web page. It may have been closed, removed, or changed dynamically.';
      } else {
        descText = 'Review the element highlighted in the spotlight on the site.';
      }
    }

    const recenterBtnHtml = (!isDocumentScope && !isNotFound)
      ? `<button type="button" class="__af_btn_action __af_btn_recenter">🎯 Re-center Spotlight</button>`
      : '';

    toolbar.innerHTML = `
      <div class="__af_toolbar_header">
        <span class="__af_badge">${safeEscape(impactLabel)}</span>
        <span class="__af_rule_title" title="${safeEscape(ruleLabel)}">${safeEscape(ruleLabel)}</span>
        <button type="button" class="__af_btn_close" title="Dismiss Overlay (Esc)">✕</button>
      </div>
      <div class="__af_desc">${safeEscape(descText)}</div>
      ${diagnosisHtml}
      <div class="__af_meta_row">
        <strong style="color: #94a3b8;">Target:</strong> ${safeEscape(targetLabel)}
      </div>
      <div class="__af_toolbar_actions">
        ${recenterBtnHtml}
        <button type="button" class="__af_btn_action __af_btn_dismiss">✕ Dismiss</button>
      </div>
    `;

    root.appendChild(toolbar);
    (document.documentElement || document.body).appendChild(root);

    // Scroll to element smoothly
    if (!isDocumentScope && targetEl) {
      try {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      } catch (_) {
        try { targetEl.scrollIntoView(true); } catch (_) {}
      }
    }

    function updateSpotlight() {
      if (isDocumentScope || isNotFound || !targetEl || !spotlight) {
        toolbar.style.top = '50%';
        toolbar.style.left = '50%';
        toolbar.style.transform = 'translate(-50%, -50%)';
        return;
      }

      const r = targetEl.getBoundingClientRect();
      const pad = 8;
      const minDim = 28;
      const top = Math.round(r.top - pad);
      const left = Math.round(r.left - pad);
      const width = Math.round(Math.max(r.width + pad * 2, minDim));
      const height = Math.round(Math.max(r.height + pad * 2, minDim));

      spotlight.style.top = `${top}px`;
      spotlight.style.left = `${left}px`;
      spotlight.style.width = `${width}px`;
      spotlight.style.height = `${height}px`;

      const tHeight = toolbar.offsetHeight || 150;
      const tWidth = toolbar.offsetWidth || 380;

      let tTop = top + height + 14;
      if (tTop + tHeight > window.innerHeight - 15) {
        tTop = top - tHeight - 14;
      }
      if (tTop < 15) {
        tTop = Math.max(15, top + 15);
      }

      const tLeft = Math.max(15, Math.min(left, window.innerWidth - tWidth - 25));

      toolbar.style.top = `${tTop}px`;
      toolbar.style.left = `${tLeft}px`;
      toolbar.style.transform = 'none';
    }

    updateSpotlight();

    // Continuous tracking via interval (handles scroll, animation, and unfocused throttling)
    const intervalId = setInterval(updateSpotlight, 40);
    setTimeout(() => clearInterval(intervalId), 3500);

    window.addEventListener('scroll', updateSpotlight, { passive: true });
    window.addEventListener('resize', updateSpotlight, { passive: true });

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        window.__auditforgeClearHighlight();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    // Event listeners on toolbar buttons
    toolbar.querySelector('.__af_btn_close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      window.__auditforgeClearHighlight();
    });
    toolbar.querySelector('.__af_btn_dismiss')?.addEventListener('click', (e) => {
      e.stopPropagation();
      window.__auditforgeClearHighlight();
    });
    toolbar.querySelector('.__af_btn_recenter')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }
    });

    window.__auditforgeOverlayCleanup = () => {
      clearInterval(intervalId);
      window.removeEventListener('scroll', updateSpotlight);
      window.removeEventListener('resize', updateSpotlight);
      window.removeEventListener('keydown', onKeyDown);
      if (targetEl && targetEl.style) {
        targetEl.style.outline = prevOutline;
        targetEl.style.outlineOffset = prevOutlineOffset;
      }
      root.remove();
    };

    return { success: true, isDocumentScope, target: targetLabel };
  };

  /**
   * Starts the Interactive In-Page Screen Reader Simulator.
   * Accurately emulates:
   * 1. iOS VoiceOver: [Name], [State], [Role], [Hint] + Touch Swipes & Virtual Rotor
   * 2. Android TalkBack: [Name], [Role], [State], [Hint] + Touch Swipes & Reading Granularity
   * 3. NVDA: [Role], [Name], [State] + Virtual Buffer & Quick Nav Keys (H, K, F, D)
   * 4. Windows Narrator: [Name], [Role], [State], [Scan] + Scan Mode & Quick Keys (H, L, B, D)
   * @param {'ios-voiceover'|'android-talkback'|'nvda'|'narrator'|'voiceover'|'talkback'} [persona]
   */
  window.__auditforgeStartVoiceOverSimulator = function (persona = 'ios-voiceover') {
    window.__auditforgeStopVoiceOverSimulator();

    const normPersona = (persona || '').toLowerCase().trim();
    const isTalkBack = normPersona === 'android-talkback' || normPersona === 'talkback';
    const isNVDA = normPersona === 'nvda';
    const isNarrator = normPersona === 'narrator' || normPersona === 'windows-narrator';
    const isVoiceOver = !isTalkBack && !isNVDA && !isNarrator;

    const narrative = extractScreenReaderNarrative(document.body, 400);
    let activeIndex = -1;
    let rotorCategories = ['all', 'heading', 'link', 'control', 'landmark'];
    let currentRotorIndex = 0;

    const readerConfig = isTalkBack ? {
      name: 'Android TalkBack',
      badgeIcon: '🤖',
      badgeBg: '#0D9FBA',
      badgeColor: '#000000',
      outlineColor: '#0D9FBA',
      boxGlow: '0 0 14px rgba(13, 159, 186, 0.85)',
      outlineStyle: '3.5px solid #0D9FBA',
      formula: '[Name], [Role], [State], [Hint]',
      modeType: 'Touch & Granularity',
    } : isNVDA ? {
      name: 'NVDA',
      badgeIcon: '🖥️',
      badgeBg: '#ef4444',
      badgeColor: '#ffffff',
      outlineColor: '#ef4444',
      boxGlow: '0 0 12px rgba(239, 68, 68, 0.75)',
      outlineStyle: '3.5px dashed #ef4444',
      formula: '[Role], [Name], [State]',
      modeType: 'Virtual Buffer',
    } : isNarrator ? {
      name: 'Windows Narrator',
      badgeIcon: '🪟',
      badgeBg: '#0078d4',
      badgeColor: '#ffffff',
      outlineColor: '#0078d4',
      boxGlow: '0 0 14px rgba(0, 120, 212, 0.85)',
      outlineStyle: '3.5px solid #0078d4',
      formula: '[Name], [Role], [State], [Scan]',
      modeType: 'Scan Mode ON',
    } : {
      name: 'iOS VoiceOver',
      badgeIcon: '🍏',
      badgeBg: '#a855f7',
      badgeColor: '#ffffff',
      outlineColor: '#a855f7',
      boxGlow: '0 0 0 2px #ffffff, 0 0 16px rgba(168, 85, 247, 0.9)',
      outlineStyle: '3.5px solid #000000',
      formula: '[Name], [State], [Role], [Hint]',
      modeType: 'Touch & Rotor',
    };

    const banner = document.createElement('div');
    banner.id = '__auditforge_vo_sim_banner__';
    banner.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      background: rgba(4, 8, 9, 0.96);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      border: 1.5px solid #1b6f7e;
      border-radius: 24px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.95), 0 0 25px rgba(13, 159, 186, 0.25);
      padding: 10px 18px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #e2ebed;
      font-size: 12px;
      user-select: none;
      pointer-events: auto;
      animation: __af_sim_pop 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      max-width: 95vw;
      width: max-content;
    `;

    // Dynamic gesture buttons based on mobile touch vs desktop keys
    const controlsHtml = (isVoiceOver || isTalkBack) ? `
      <div class="__af_sim_row __af_sim_gestures">
        <button type="button" class="__af_sim_gesture_btn" id="__af_sim_swipe_prev__" title="Swipe Left (Previous item / Left Arrow)">
          <span>⬅</span> Swipe Left
        </button>
        <button type="button" class="__af_sim_gesture_btn" id="__af_sim_swipe_next__" title="Swipe Right (Next item / Right Arrow)">
          Swipe Right <span>➔</span>
        </button>
        <button type="button" class="__af_sim_gesture_btn __af_sim_btn_accent" id="__af_sim_double_tap__" title="Double-Tap to activate focused element (Space/Enter)">
          <span>👆</span> Double-Tap
        </button>
        <button type="button" class="__af_sim_gesture_btn" id="__af_sim_rotor_btn__" title="${isVoiceOver ? 'Cycle VoiceOver Rotor categories (R key)' : 'Cycle TalkBack Granularity (G key)'}">
          <span>${isVoiceOver ? '🔄' : '🔠'}</span> <span id="__af_sim_rotor_label__">${isVoiceOver ? 'Rotor: All' : 'Granularity: Default'}</span>
        </button>
      </div>
    ` : `
      <div class="__af_sim_row __af_sim_gestures">
        <button type="button" class="__af_sim_gesture_btn" id="__af_sim_swipe_prev__" title="Previous item (Left Arrow / Shift+Tab)">⏮ Prev</button>
        <button type="button" class="__af_sim_gesture_btn" id="__af_sim_swipe_next__" title="Next item (Right Arrow / Tab)">Next ⏭</button>
        <button type="button" class="__af_sim_gesture_btn __af_sim_btn_accent" id="__af_sim_double_tap__" title="Activate/Click element (Space/Enter)">Enter ↵</button>
        <button type="button" class="__af_sim_gesture_btn" id="__af_sim_quick_h__" title="Jump to next Heading (H key)">[H] Heading</button>
        <button type="button" class="__af_sim_gesture_btn" id="__af_sim_quick_link__" title="${isNVDA ? 'Jump to next Link (K key)' : 'Jump to next Link (L key)'}">[${isNVDA ? 'K' : 'L'}] Link</button>
        <button type="button" class="__af_sim_gesture_btn" id="__af_sim_quick_ctrl__" title="${isNVDA ? 'Jump to next Form field (F key)' : 'Jump to next Button (B key)'}">[${isNVDA ? 'F' : 'B'}] Control</button>
        <button type="button" class="__af_sim_gesture_btn" id="__af_sim_quick_landmark__" title="Jump to next Landmark (D key)">[D] Landmark</button>
      </div>
    `;

    banner.innerHTML = `
      <style>
        @keyframes __af_sim_pop { from { opacity: 0; transform: translate(-50%, 18px) scale(0.96); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }
        .__af_sim_row { display: flex; align-items: center; gap: 8px; flex-wrap: nowrap; }
        .__af_sim_badge { background: ${readerConfig.badgeBg}; color: ${readerConfig.badgeColor}; font-weight: 800; font-size: 10.5px; padding: 3px 9px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; display: inline-flex; align-items: center; gap: 4px; }
        .__af_sim_step_badge { background: rgba(27, 111, 126, 0.3); color: #0D9FBA; border: 1px solid rgba(13, 159, 186, 0.4); font-weight: 700; font-size: 10px; padding: 2px 7px; border-radius: 8px; white-space: nowrap; }
        .__af_sim_role_tag { background: rgba(18, 119, 136, 0.3); color: #0D9FBA; border: 1px solid rgba(27, 111, 126, 0.4); font-weight: 700; font-size: 10px; padding: 2px 7px; border-radius: 8px; text-transform: uppercase; white-space: nowrap; }
        .__af_sim_formula { color: #868180; font-size: 10px; background: #080f12; padding: 2px 6px; border-radius: 6px; border: 1px solid rgba(27, 111, 126, 0.25); white-space: nowrap; }
        .__af_sim_caption { color: #e2ebed; font-weight: 500; font-style: italic; max-width: 480px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .__af_sim_gesture_btn { background: #080f12; border: 1px solid rgba(27, 111, 126, 0.4); color: #e2ebed; font-size: 11px; font-weight: 600; padding: 4px 9px; border-radius: 10px; cursor: pointer; transition: all 0.15s ease; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
        .__af_sim_gesture_btn:hover { background: rgba(27, 111, 126, 0.4); border-color: #0D9FBA; color: #0D9FBA; transform: translateY(-1px); }
        .__af_sim_gesture_btn:active { transform: translateY(0); }
        .__af_sim_btn_accent { background: rgba(13, 159, 186, 0.2); border-color: #0D9FBA; color: #0D9FBA; }
        .__af_sim_btn_accent:hover { background: #0D9FBA; color: #000; }
        .__af_sim_btn_exit { background: #080f12; border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 12px; cursor: pointer; transition: all 0.15s; margin-left: auto; }
        .__af_sim_btn_exit:hover { background: #ef4444; color: #fff; }
      </style>
      <div class="__af_sim_row">
        <span class="__af_sim_badge">${readerConfig.badgeIcon} ${readerConfig.name}</span>
        <span id="__af_vo_step_count__" class="__af_sim_step_badge">[0/${narrative.length}]</span>
        <span id="__af_vo_role_tag__" class="__af_sim_role_tag">PAGE</span>
        <span class="__af_sim_formula" title="Emulated speech announcement formula">${readerConfig.formula}</span>
        <span id="__af_vo_caption_text__" class="__af_sim_caption">Navigating ${readerConfig.name}...</span>
        <button type="button" class="__af_sim_btn_exit" id="__af_vo_exit_btn__">Exit ✕</button>
      </div>
      ${controlsHtml}
    `;

    (document.documentElement || document.body).appendChild(banner);

    let activeHighlightEl = null;
    let originalOutline = '';
    let originalOutlineOffset = '';
    let originalBoxShadow = '';

    function isFocusable(el) {
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      if (['button', 'select', 'textarea'].includes(tag)) return !el.disabled;
      if (tag === 'input') return el.type !== 'hidden' && !el.disabled;
      if (tag === 'a' && el.hasAttribute('href')) return true;
      if (el.hasAttribute('tabindex') && parseInt(el.getAttribute('tabindex'), 10) >= 0) return true;
      return false;
    }

    /**
     * Plays authentic synthesized sound cues (earcons) tailored to each screen reader
     */
    function playSimEarcon(type) {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const now = ctx.currentTime;

        if (isTalkBack) {
          // Android TalkBack: Resonant bubble bloop (frequency drop)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.connect(gain);
          gain.connect(ctx.destination);
          if (type === 'barrier') {
            osc.frequency.setValueAtTime(220, now);
            osc.frequency.exponentialRampToValueAtTime(110, now + 0.14);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.linearRampToValueAtTime(0.001, now + 0.14);
            osc.start(now);
            osc.stop(now + 0.14);
          } else {
            osc.frequency.setValueAtTime(460, now);
            osc.frequency.exponentialRampToValueAtTime(280, now + 0.09);
            gain.gain.setValueAtTime(0.06, now);
            gain.gain.linearRampToValueAtTime(0.001, now + 0.09);
            osc.start(now);
            osc.stop(now + 0.09);
          }
        } else if (isNVDA) {
          // NVDA: Synthesized crisp dual-tone chirp
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'square';
          osc.connect(gain);
          gain.connect(ctx.destination);
          if (type === 'barrier') {
            osc.frequency.setValueAtTime(140, now);
            gain.gain.setValueAtTime(0.07, now);
            gain.gain.linearRampToValueAtTime(0.001, now + 0.12);
            osc.start(now);
            osc.stop(now + 0.12);
          } else {
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.setValueAtTime(660, now + 0.04);
            gain.gain.setValueAtTime(0.035, now);
            gain.gain.linearRampToValueAtTime(0.001, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.08);
          }
        } else if (isNarrator) {
          // Windows Narrator: Fluent two-tone melodic chime (D5 & A5 soft sine)
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          osc1.type = 'sine';
          osc2.type = 'sine';
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(ctx.destination);
          if (type === 'barrier') {
            osc1.frequency.setValueAtTime(180, now);
            osc2.frequency.setValueAtTime(135, now);
          } else {
            osc1.frequency.setValueAtTime(587.33, now);
            osc2.frequency.setValueAtTime(880, now);
          }
          gain.gain.setValueAtTime(0.04, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
          osc1.start(now);
          osc2.start(now);
          osc1.stop(now + 0.12);
          osc2.stop(now + 0.12);
        } else {
          // iOS VoiceOver: Harmonic crystalline bell chime (E5 & C6 harmonic)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.connect(gain);
          gain.connect(ctx.destination);
          if (type === 'barrier') {
            osc.frequency.setValueAtTime(196, now);
            osc.frequency.exponentialRampToValueAtTime(110, now + 0.15);
            gain.gain.setValueAtTime(0.07, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
          } else if (type === 'link') {
            osc.frequency.setValueAtTime(659.25, now);
            osc.frequency.exponentialRampToValueAtTime(987.77, now + 0.08);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.08);
          } else {
            osc.frequency.setValueAtTime(523.25, now);
            osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.07);
            gain.gain.setValueAtTime(0.045, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
            osc.start(now);
            osc.stop(now + 0.07);
          }
        }
      } catch (e) {}
    }

    /**
     * Selects voice matching the target platform
     */
    function pickVoiceForPersona() {
      if (!('speechSynthesis' in window)) return null;
      const voices = window.speechSynthesis.getVoices() || [];
      if (voices.length === 0) return null;

      if (isVoiceOver) {
        return voices.find(v => /samantha|daniel|karen|victoria|alex|apple/i.test(v.name)) ||
               voices.find(v => v.lang && v.lang.startsWith('en')) || voices[0];
      }
      if (isTalkBack) {
        return voices.find(v => /google|android/i.test(v.name)) ||
               voices.find(v => v.lang && v.lang.startsWith('en')) || voices[0];
      }
      if (isNVDA) {
        return voices.find(v => /espeak|david|zira/i.test(v.name)) ||
               voices.find(v => v.lang && v.lang.startsWith('en')) || voices[0];
      }
      if (isNarrator) {
        return voices.find(v => /microsoft|david|mark|zira|george|natural/i.test(v.name)) ||
               voices.find(v => v.lang && v.lang.startsWith('en')) || voices[0];
      }
      return null;
    }

    function moveToIndex(idx, shouldFocus = false) {
      if (narrative.length === 0) return;
      const clampedIdx = Math.max(0, Math.min(narrative.length - 1, idx));
      activeIndex = clampedIdx;
      const item = narrative[activeIndex];
      const el = item.element;

      // Select speech announcement formula for the active screen reader
      let textToSpeak = item.spokenText;
      if (isTalkBack) {
        textToSpeak = item.talkBackText || item.spokenText;
      } else if (isNVDA) {
        textToSpeak = item.nvdaText || item.spokenText;
      } else if (isNarrator) {
        textToSpeak = item.narratorText || item.spokenText;
      } else {
        textToSpeak = item.voiceOverText || item.spokenText;
      }

      // Update caption and badges
      const captionEl = document.getElementById('__af_vo_caption_text__');
      const stepCountEl = document.getElementById('__af_vo_step_count__');
      const roleTagEl = document.getElementById('__af_vo_role_tag__');

      if (captionEl) captionEl.textContent = `🗣️ "${textToSpeak}"`;
      if (stepCountEl) stepCountEl.textContent = `[${activeIndex + 1}/${narrative.length}]`;
      if (roleTagEl) roleTagEl.textContent = item.type.toUpperCase();

      // Clear previous highlight
      if (activeHighlightEl && activeHighlightEl.style) {
        activeHighlightEl.style.outline = originalOutline;
        activeHighlightEl.style.outlineOffset = originalOutlineOffset;
        activeHighlightEl.style.boxShadow = originalBoxShadow;
      }

      activeHighlightEl = el;
      if (el && el.style) {
        originalOutline = el.style.outline;
        originalOutlineOffset = el.style.outlineOffset;
        originalBoxShadow = el.style.boxShadow;

        // Apply screen-reader-specific cursor style
        if (isVoiceOver) {
          el.style.outline = '3.5px solid #000000';
          el.style.outlineOffset = '2px';
          el.style.boxShadow = '0 0 0 2px #ffffff, 0 0 16px rgba(168, 85, 247, 0.9)';
        } else if (isTalkBack) {
          el.style.outline = '3.5px solid #0D9FBA';
          el.style.outlineOffset = '2.5px';
          el.style.boxShadow = '0 0 14px rgba(13, 159, 186, 0.85)';
        } else if (isNVDA) {
          el.style.outline = '3.5px dashed #ef4444';
          el.style.outlineOffset = '2.5px';
          el.style.boxShadow = '0 0 12px rgba(239, 68, 68, 0.75)';
        } else {
          el.style.outline = '3.5px solid #0078d4';
          el.style.outlineOffset = '2.5px';
          el.style.boxShadow = '0 0 14px rgba(0, 120, 212, 0.85)';
        }
      }

      // Smoothly scroll element into view
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }

      // Audibly speak announcement
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.rate = 1.2;
        const matchedVoice = pickVoiceForPersona();
        if (matchedVoice) utterance.voice = matchedVoice;
        window.speechSynthesis.speak(utterance);
      }

      // Play authentic earcon
      playSimEarcon(item.earcon || (item.isBarrier ? 'barrier' : 'text'));

      if (shouldFocus && el && typeof el.focus === 'function') {
        try { el.focus({ preventScroll: true }); } catch (e) {}
      }
    }

    /**
     * Activates / taps on the current focused element
     */
    function activateCurrentElement() {
      if (activeIndex < 0 || activeIndex >= narrative.length) return;
      const el = narrative[activeIndex]?.element;
      if (!el) return;

      playSimEarcon('control');

      const tag = el.tagName.toLowerCase();
      if (tag === 'input' && (el.type === 'checkbox' || el.type === 'radio')) {
        el.checked = !el.checked;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (el.getAttribute('role') === 'switch' || el.getAttribute('aria-checked') !== null) {
        const isChecked = el.getAttribute('aria-checked') === 'true';
        el.setAttribute('aria-checked', String(!isChecked));
        el.click();
      } else if (typeof el.click === 'function') {
        el.click();
      } else if (typeof el.focus === 'function') {
        el.focus();
      }

      // Flash feedback
      const captionEl = document.getElementById('__af_vo_caption_text__');
      if (captionEl) {
        const prev = captionEl.textContent;
        captionEl.textContent = `⚡ Activated "${narrative[activeIndex].accessibleName || narrative[activeIndex].type}"`;
        setTimeout(() => { if (captionEl) captionEl.textContent = prev; }, 1400);
      }
    }

    /**
     * Jumps to the next element matching a rotor / quick key category
     */
    function jumpToCategory(cat) {
      if (narrative.length === 0) return;
      let target = -1;
      for (let i = activeIndex + 1; i < narrative.length; i++) {
        if (cat === 'all' || narrative[i].rotorCategory === cat) { target = i; break; }
      }
      if (target === -1) {
        // Wrap around from beginning
        for (let i = 0; i <= activeIndex; i++) {
          if (cat === 'all' || narrative[i].rotorCategory === cat) { target = i; break; }
        }
      }
      if (target !== -1) {
        moveToIndex(target, true);
      }
    }

    /**
     * Cycles through Rotor (VoiceOver) or Granularity (TalkBack)
     */
    function cycleRotorOrGranularity() {
      currentRotorIndex = (currentRotorIndex + 1) % rotorCategories.length;
      const cat = rotorCategories[currentRotorIndex];
      const label = cat.charAt(0).toUpperCase() + cat.slice(1);
      const rotorLabelEl = document.getElementById('__af_sim_rotor_label__');
      if (rotorLabelEl) {
        rotorLabelEl.textContent = isVoiceOver ? `Rotor: ${label}` : `Granularity: ${label}`;
      }
      playSimEarcon('landmark');
      if (cat !== 'all') {
        jumpToCategory(cat);
      }
    }

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        window.__auditforgeStopVoiceOverSimulator();
        return;
      }

      const isEditing = ['input', 'textarea'].includes(document.activeElement?.tagName?.toLowerCase());
      if (isEditing && !e.altKey && !e.ctrlKey && !e.metaKey) return;

      // Swipes & Arrow navigation
      if (e.key === 'ArrowRight' || (e.altKey && e.key === 'ArrowRight')) {
        e.preventDefault();
        moveToIndex(activeIndex + 1);
        return;
      }

      if (e.key === 'ArrowLeft' || (e.altKey && e.key === 'ArrowLeft')) {
        e.preventDefault();
        moveToIndex(activeIndex - 1);
        return;
      }

      // Activation (Space / Enter)
      if ((e.key === 'Enter' || e.key === ' ') && !isEditing) {
        e.preventDefault();
        activateCurrentElement();
        return;
      }

      // Rotor (R) or Granularity (G)
      if ((e.key === 'r' || e.key === 'R') && !isEditing) {
        e.preventDefault();
        cycleRotorOrGranularity();
        return;
      }
      if ((e.key === 'g' || e.key === 'G') && !isEditing) {
        e.preventDefault();
        cycleRotorOrGranularity();
        return;
      }

      // Quick navigation keys
      if (!isEditing && !e.ctrlKey && !e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === 'h') {
          e.preventDefault();
          jumpToCategory('heading');
          return;
        }
        if (k === 'l' || k === 'k') {
          e.preventDefault();
          jumpToCategory('link');
          return;
        }
        if (k === 'f' || k === 'b') {
          e.preventDefault();
          jumpToCategory('control');
          return;
        }
        if (k === 'd') {
          e.preventDefault();
          jumpToCategory('landmark');
          return;
        }
      }

      // Tab navigation between interactive controls
      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          let target = -1;
          for (let i = activeIndex - 1; i >= 0; i--) {
            if (isFocusable(narrative[i].element)) { target = i; break; }
          }
          if (target === -1) {
            for (let i = narrative.length - 1; i > activeIndex; i--) {
              if (isFocusable(narrative[i].element)) { target = i; break; }
            }
          }
          if (target !== -1) moveToIndex(target, true);
        } else {
          let target = -1;
          for (let i = activeIndex + 1; i < narrative.length; i++) {
            if (isFocusable(narrative[i].element)) { target = i; break; }
          }
          if (target === -1) {
            for (let i = 0; i < activeIndex; i++) {
              if (isFocusable(narrative[i].element)) { target = i; break; }
            }
          }
          if (target !== -1) moveToIndex(target, true);
        }
      }
    };

    const onClick = (e) => {
      if (e.target?.closest && e.target.closest('#__auditforge_vo_sim_banner__')) return;
      const matchIdx = narrative.findIndex(it => it.element === e.target || (it.element && it.element.contains(e.target)));
      if (matchIdx !== -1) {
        moveToIndex(matchIdx);
      }
    };

    const onFocusIn = (e) => {
      if (e.target?.closest && e.target.closest('#__auditforge_vo_sim_banner__')) return;
      const matchIdx = narrative.findIndex(it => it.element === e.target);
      if (matchIdx !== -1 && matchIdx !== activeIndex) {
        moveToIndex(matchIdx);
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('focusin', onFocusIn, true);

    // Wire up buttons
    document.getElementById('__af_sim_swipe_prev__')?.addEventListener('click', () => moveToIndex(activeIndex - 1));
    document.getElementById('__af_sim_swipe_next__')?.addEventListener('click', () => moveToIndex(activeIndex + 1));
    document.getElementById('__af_sim_double_tap__')?.addEventListener('click', () => activateCurrentElement());
    document.getElementById('__af_sim_rotor_btn__')?.addEventListener('click', () => cycleRotorOrGranularity());
    document.getElementById('__af_sim_quick_h__')?.addEventListener('click', () => jumpToCategory('heading'));
    document.getElementById('__af_sim_quick_link__')?.addEventListener('click', () => jumpToCategory('link'));
    document.getElementById('__af_sim_quick_ctrl__')?.addEventListener('click', () => jumpToCategory('control'));
    document.getElementById('__af_sim_quick_landmark__')?.addEventListener('click', () => jumpToCategory('landmark'));
    document.getElementById('__af_vo_exit_btn__')?.addEventListener('click', () => window.__auditforgeStopVoiceOverSimulator());

    window.__auditforgeVoiceOverSimCleanup = () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('focusin', onFocusIn, true);
      if (activeHighlightEl && activeHighlightEl.style) {
        activeHighlightEl.style.outline = originalOutline;
        activeHighlightEl.style.outlineOffset = originalOutlineOffset;
        activeHighlightEl.style.boxShadow = originalBoxShadow;
      }
      banner.remove();
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };

    // Begin immediately with first narrative element
    if (narrative.length > 0) {
      moveToIndex(0);
    }

    return { active: true, totalItems: narrative.length, persona: readerConfig.name };
  };

  // Export Mobile Viewport Simulator & Layout functions
  window.__auditforgeStartMobileSimulator = startMobileSimulator;
  window.__auditforgeStopMobileSimulator = stopMobileSimulator;
  window.__auditforgeToggleMobileSimulator = function (options) {
    if (document.getElementById('__auditforge_mobile_sim_root__')) {
      return stopMobileSimulator();
    }
    return startMobileSimulator(options);
  };
  window.__auditforgeEvaluateMobileLayout = evaluateMobileResponsiveLayout;
  window.__auditforgeOpenDeviceWindow = openDeviceWindow;
  window.__auditforgeApplyVisionFilterToMobileSimulator = applyVisionFilterToMobileSimulator;
  window.__auditforgeGetMobileReport = function () {
    return window.__af_last_mobile_report || null;
  };
  window.__auditforgeGetMobileSimulatorState = function () {
    const isSimActive = Boolean(document.getElementById('__auditforge_mobile_sim_root__'));
    return {
      active: isSimActive,
      deviceId: window.__af_active_mobile_device || 'iphone-16-pro',
      report: window.__af_last_mobile_report || null,
    };
  };
  window.__auditforgeSetMobileSimulatorDevice = function (deviceId) {
    const root = document.getElementById('__auditforge_mobile_sim_root__');
    if (!root) return { active: false };
    const select = root.querySelector('#af-mob-device-select');
    if (select && select.value !== deviceId) {
      select.value = deviceId;
      select.dispatchEvent(new Event('change'));
    }
    return {
      active: true,
      deviceId,
      report: window.__af_last_mobile_report || null,
    };
  };

  // Export screen reader simulator aliases
  window.__auditforgeStartScreenReaderSimulator = window.__auditforgeStartVoiceOverSimulator;

  /**
   * Stops the Interactive In-Page Screen Reader Simulator and restores page DOM.
   */
  window.__auditforgeStopVoiceOverSimulator = function () {
    if (typeof window.__auditforgeVoiceOverSimCleanup === 'function') {
      window.__auditforgeVoiceOverSimCleanup();
      window.__auditforgeVoiceOverSimCleanup = null;
    }
    document.getElementById('__auditforge_vo_sim_banner__')?.remove();
    return { active: false };
  };
  window.__auditforgeStopScreenReaderSimulator = window.__auditforgeStopVoiceOverSimulator;

  /**
   * Toggles the interactive visual Tab-Trail overlay on the web page.
   * Renders numbered badges (#1, #2, #3...) on each focusable element
   * and connecting bezier paths illustrating the keyboard focus journey.
   * @param {boolean} [forceState]
   * @returns {{ active: boolean, totalSteps?: number }}
   */
  window.__auditforgeToggleTabTrail = function (forceState) {
    const existing = document.getElementById('__auditforge_tab_trail_root__');
    if (existing) {
      if (forceState === true) return { active: true };
      existing.remove();
      if (typeof window.__auditforgeTabTrailCleanup === 'function') {
        window.__auditforgeTabTrailCleanup();
        window.__auditforgeTabTrailCleanup = null;
      }
      return { active: false };
    }

    if (forceState === false) return { active: false };

    // Run tab order calculation
    const tabData = evaluateTabNavigationOrder();
    if (!lastTabOrderElements || lastTabOrderElements.length === 0) {
      alert('No focusable interactive elements detected on this page.');
      return { active: false };
    }

    const root = document.createElement('div');
    root.id = '__auditforge_tab_trail_root__';
    root.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2147483645;';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = '__auditforge_tab_trail_svg__';
    const docHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, window.innerHeight);
    const docWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, window.innerWidth);
    svg.style.cssText = `position: absolute; top: 0; left: 0; width: ${docWidth}px; height: ${docHeight}px; pointer-events: none; overflow: visible;`;
    
    svg.innerHTML = `
      <defs>
        <!-- Standard Step Arrow (Sleek 9px Chevron, High Contrast, Subtle) -->
        <marker id="__af_arrow_normal__" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="9" markerHeight="9" orient="auto">
          <path d="M 1.5 2 L 8.5 5 L 1.5 8 L 3.5 5 Z" fill="#00E5FF" stroke="#000000" stroke-width="0.8" stroke-linejoin="round"/>
        </marker>
        <!-- Warning Step Arrow (Amber 9px Chevron) -->
        <marker id="__af_arrow_warn__" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="9" markerHeight="9" orient="auto">
          <path d="M 1.5 2 L 8.5 5 L 1.5 8 L 3.5 5 Z" fill="#f59e0b" stroke="#000000" stroke-width="0.8" stroke-linejoin="round"/>
        </marker>
        <!-- Active Focused Step Arrow (Sky Blue, 11px) -->
        <marker id="__af_arrow_active__" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="11" markerHeight="11" orient="auto">
          <path d="M 1.5 1.8 L 9 5 L 1.5 8.2 L 3.8 5 Z" fill="#38bdf8" stroke="#ffffff" stroke-width="0.8" stroke-linejoin="round"/>
        </marker>
        <filter id="__af_glow__" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="2" flood-color="#00E5FF" flood-opacity="0.5"/>
        </filter>
      </defs>
    `;

    const styleTag = document.createElement('style');
    styleTag.id = '__af_tab_trail_styles__';
    styleTag.textContent = `
      .__af_tab_badge__:hover {
        transform: scale(1.2) !important;
        box-shadow: 0 0 12px rgba(0, 229, 255, 0.9) !important;
      }
      #__af_tab_trail_bar__ button:hover {
        filter: brightness(1.18);
      }
      #__af_tab_trail_bar__.is-dragging {
        cursor: grabbing !important;
      }
    `;
    root.appendChild(styleTag);

    const badgesContainer = document.createElement('div');
    badgesContainer.id = '__auditforge_tab_badges__';
    badgesContainer.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;';

    const ctrlBar = document.createElement('div');
    ctrlBar.id = '__auditforge_tab_trail_bar__';
    ctrlBar.style.cssText = `
      position: fixed;
      top: 16px;
      right: 20px;
      z-index: 2147483647;
      background: rgba(0, 0, 0, 0.94);
      border: 1px solid #1b6f7e;
      border-radius: 8px;
      padding: 7px 12px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.85), 0 0 15px rgba(13, 159, 186, 0.2);
      color: #e2ebed;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 10px;
      pointer-events: auto;
      backdrop-filter: blur(10px);
      cursor: grab;
      user-select: none;
      transition: box-shadow 0.15s ease;
    `;
    ctrlBar.innerHTML = `
      <div class="__af_drag_grip__" title="Click and drag to move toolbar anywhere" style="cursor: grab; display: flex; align-items: center; justify-content: center; padding: 2px 3px; color: #00E5FF; opacity: 0.8; font-size: 13px; letter-spacing: -2px; user-select: none;">
        ⋮⋮
      </div>
      <div class="__af_drag_title__" style="display: flex; align-items: center; gap: 7px; cursor: grab;">
        <span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #00E5FF; box-shadow: 0 0 6px #00E5FF;"></span>
        <strong style="color: #e2ebed; font-size: 12px; white-space: nowrap;">Tab Trail</strong>
        <span id="__af_tab_step_count__" style="background: rgba(27, 111, 126, 0.28); color: #00E5FF; border: 1px solid rgba(13, 159, 186, 0.35); padding: 2px 6px; border-radius: 4px; font-size: 11px; white-space: nowrap;">${lastTabOrderElements.length} Steps</span>
        <span id="__af_tab_active_step__" style="display: none; background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); padding: 2px 6px; border-radius: 4px; font-size: 11px; white-space: nowrap;"></span>
      </div>
      <div id="__af_tab_actions_panel__" style="display: flex; align-items: center; gap: 6px;">
        <button id="__af_tab_mode_btn__" type="button" title="Switch arrow style: Clean Direct vs Subtle Curved" style="background: #080f12; border: 1px solid rgba(27, 111, 126, 0.35); color: #00E5FF; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 5px; cursor: pointer; display: flex; align-items: center; gap: 3px;">⚡ Direct</button>
        <button id="__af_tab_refresh_btn__" type="button" title="Recalculate trail for newly opened or moved sections" style="background: #080f12; border: 1px solid rgba(27, 111, 126, 0.35); color: #00E5FF; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 5px; cursor: pointer; display: flex; align-items: center; gap: 3px;">🔄 Refresh</button>
        <button id="__af_tab_focus_first__" type="button" style="background: #080f12; border: 1px solid rgba(27, 111, 126, 0.35); color: #00E5FF; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 5px; cursor: pointer;">Focus #1</button>
        <button id="__af_tab_exit_btn__" type="button" style="background: #ef4444; border: none; color: #fff; font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 5px; cursor: pointer;">✕ Exit</button>
      </div>
      <button id="__af_tab_min_btn__" type="button" title="Collapse / Expand toolbar" style="background: transparent; border: 1px solid rgba(27, 111, 126, 0.35); color: #94a3b8; font-size: 11px; line-height: 1; padding: 3px 5px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center;">—</button>
    `;

    root.appendChild(svg);
    root.appendChild(badgesContainer);
    root.appendChild(ctrlBar);
    (document.documentElement || document.body).appendChild(root);


    let currentCoords = [];
    let trailArrowMode = 'direct'; // 'direct' = clean straight vectors, 'curved' = gentle bounded arc

    function renderTrailGeometry() {
      const oldCasings = svg.querySelectorAll('path.__af_trail_casing__');
      oldCasings.forEach(p => p.remove());
      const oldPaths = svg.querySelectorAll('path.__af_trail_path__');
      oldPaths.forEach(p => p.remove());
      badgesContainer.innerHTML = '';

      const scrollX = window.scrollX;
      const scrollY = window.scrollY;
      const coords = [];

      lastTabOrderElements.forEach((item, idx) => {
        const el = item.element;
        if (!el || !el.isConnected) return;

        // Check if element is currently hidden
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return;

        // Resolve visible interactive target (handles visually hidden inputs and custom labels)
        const targetRes = typeof resolveVisualTarget === 'function' ? resolveVisualTarget(el) : { visualElement: el, rect: el.getBoundingClientRect() };
        const targetEl = item.visualElement || targetRes.visualElement || el;
        const r = targetRes.rect || targetEl.getBoundingClientRect();

        if (r.width === 0 && r.height === 0 && r.top === 0 && r.left === 0) return;

        // Detect if element is fixed (e.g. sticky header or fixed toolbar)
        let isFixed = false;
        let p = el;
        while (p && p !== document.body && p !== document.documentElement) {
          const pos = window.getComputedStyle(p).position;
          if (pos === 'fixed') {
            isFixed = true;
            break;
          }
          p = p.parentElement;
        }

        // Safety clamp so badges and connector lines never fly off-screen
        const rawLeft = r.left >= 0 ? r.left : 12;
        const rawTop = r.top >= 0 ? r.top : 12;
        const pageX = Math.max(12, rawLeft + (isFixed ? 0 : scrollX));
        const pageY = Math.max(12, rawTop + (isFixed ? 0 : scrollY));

        const isWarn = item.tabIndex > 0;
        const isRadioGroup = !!item.isRadioGroupLeader;
        const bg = isWarn ? '#f59e0b' : (isRadioGroup ? 'linear-gradient(135deg, #1b6f7e, #127788)' : '#00E5FF');
        const textColor = isWarn ? '#000000' : (isRadioGroup ? '#e2ebed' : '#000000');
        const glow = isWarn
          ? 'rgba(245,158,11,0.85)'
          : (isRadioGroup ? 'rgba(0,229,255,0.85)' : 'rgba(0,229,255,0.85)');

        const badge = document.createElement('div');
        badge.className = '__af_tab_badge__';
        badge.setAttribute('data-af-step', String(idx + 1));
        badge.style.cssText = `
          position: ${isFixed ? 'fixed' : 'absolute'};
          top: ${pageY - 10}px;
          left: ${pageX - 10}px;
          background: ${bg};
          color: ${textColor};
          font-weight: 800;
          font-size: 11px;
          line-height: 20px;
          height: 20px;
          min-width: 20px;
          padding: 0 5px;
          text-align: center;
          border-radius: 10px;
          border: 1px solid rgba(0, 0, 0, 0.4);
          box-shadow: 0 0 10px ${glow}, 0 2px 4px rgba(0,0,0,0.5);
          pointer-events: auto;
          cursor: pointer;
          z-index: 2147483646;
          user-select: none;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 3px;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        `;

        if (isRadioGroup) {
          badge.title = `Step #${idx + 1}: Radio Group "${item.name}" (${item.radioGroupTotal} choices)\nℹ️ Tab enters group here; subsequent Tab exits to next section.\nUse Arrow keys (↑/↓/←/→) to select within group.`;
          badge.innerHTML = `<span style="font-size: 8px;">🔘</span><span>${idx + 1}</span>`;
        } else {
          badge.title = `Step #${idx + 1}: <${item.tagName}> "${item.name}"\nRole: ${item.role}${item.tabIndex > 0 ? '\n⚠️ Positive tabindex=' + item.tabIndex : ''}`;
          badge.textContent = `${idx + 1}`;
        }

        badge.addEventListener('click', (e) => {
          e.stopPropagation();
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          try {
            el.focus({ preventScroll: true });
          } catch (_) {}
        });

        badgesContainer.appendChild(badge);

        // Calculate exact visual center of badge in document SVG space
        const docBadgeX = isFixed ? (rawLeft + scrollX) : pageX;
        const docBadgeY = isFixed ? (rawTop + scrollY) : pageY;
        const badgeRadius = isRadioGroup ? 18 : (idx >= 99 ? 16 : (idx >= 9 ? 13 : 11));
        const bCenterX = docBadgeX + (isRadioGroup ? 8 : (idx >= 99 ? 6 : (idx >= 9 ? 3 : 0)));
        const bCenterY = docBadgeY;

        coords.push({
          centerX: bCenterX,
          centerY: bCenterY,
          radius: badgeRadius,
          top: pageY,
          left: pageX,
          rawLeft,
          rawTop,
          item,
          el,
          targetEl,
          step: idx + 1,
          isFixed,
          badge
        });
      });

      currentCoords = coords;

      for (let i = 0; i < coords.length - 1; i++) {
        const p1 = coords[i];
        const p2 = coords[i + 1];
        const isWarn = p2.item.tabIndex > 0;
        const isRadioGroup = !!p2.item.isRadioGroupLeader;
        const color = isWarn ? '#f59e0b' : '#00E5FF';
        const marker = isWarn ? 'url(#__af_arrow_warn__)' : 'url(#__af_arrow_normal__)';

        const dx = p2.centerX - p1.centerX;
        const dy = p2.centerY - p1.centerY;
        const dist = Math.hypot(dx, dy);

        let d = '';
        if (dist < 20) {
          // Badges stacked or overlapping: small side loop
          const sX = p1.centerX + 12;
          const sY = p1.centerY - 6;
          const cx = p1.centerX + 32;
          const cy = p1.centerY;
          const eX = p2.centerX + 12;
          const eY = p2.centerY + 6;
          d = `M ${sX} ${sY} Q ${cx} ${cy} ${eX} ${eY}`;
        } else {
          const ux = dx / dist;
          const uy = dy / dist;

          // Arrow starts cleanly outside Badge 1's boundary
          const startX = p1.centerX + ux * (p1.radius + 3);
          const startY = p1.centerY + uy * (p1.radius + 3);

          // Arrowhead tip touches cleanly right outside Badge 2's boundary
          const endX = p2.centerX - ux * (p2.radius + 4);
          const endY = p2.centerY - uy * (p2.radius + 4);

          if (trailArrowMode === 'direct') {
            // Clean, razor-straight direct vector from Badge 1 to Badge 2
            d = `M ${startX.toFixed(1)} ${startY.toFixed(1)} L ${endX.toFixed(1)} ${endY.toFixed(1)}`;
          } else {
            // Smooth, clamped arc with max 22px bow (never wild loops)
            const maxBow = Math.min(22, Math.max(8, dist * 0.08));
            const cx = (startX + endX) / 2 - uy * maxBow;
            const cy = (startY + endY) / 2 + ux * maxBow;
            d = `M ${startX.toFixed(1)} ${startY.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${endX.toFixed(1)} ${endY.toFixed(1)}`;
          }
        }

        // 1. High-contrast subtle dark casing underlay path for legibility
        const casing = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        casing.classList.add('__af_trail_casing__');
        casing.setAttribute('data-af-from', String(p1.step));
        casing.setAttribute('data-af-to', String(p2.step));
        casing.setAttribute('d', d);
        casing.setAttribute('stroke', '#000000');
        casing.setAttribute('stroke-width', '3.5');
        casing.setAttribute('stroke-linecap', 'round');
        casing.setAttribute('fill', 'none');
        casing.setAttribute('opacity', '0.6');
        svg.appendChild(casing);

        // 2. Clean, subtle core arrow path with 9px chevron marker
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.classList.add('__af_trail_path__');
        path.setAttribute('data-af-from', String(p1.step));
        path.setAttribute('data-af-to', String(p2.step));
        path.setAttribute('d', d);
        path.setAttribute('stroke', color);
        path.setAttribute('stroke-width', '1.8');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-dasharray', isWarn ? '5,3' : 'none');
        path.setAttribute('fill', 'none');
        path.setAttribute('opacity', '0.95');
        path.setAttribute('marker-end', marker);
        svg.appendChild(path);
      }
    }


    renderTrailGeometry();

    function refreshTabTrail() {
      if (!document.getElementById('__auditforge_tab_trail_root__')) return;

      // 1. Re-evaluate tab navigation order against the active DOM
      evaluateTabNavigationOrder();

      // 2. Adjust root & SVG bounds to current full document scroll dimensions
      const h = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, window.innerHeight);
      const w = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, window.innerWidth);
      svg.style.width = `${w}px`;
      svg.style.height = `${h}px`;
      root.style.height = `${h}px`;

      // 3. Update control bar counter
      const counter = document.getElementById('__af_tab_step_count__');
      if (counter) {
        counter.textContent = `${lastTabOrderElements.length} Focusable Steps`;
      }

      // 4. Re-render geometry
      renderTrailGeometry();

      // 5. Restore active step highlight if focused
      if (document.activeElement) {
        updateFocusHighlight(document.activeElement);
      }
    }

    let refreshTimer = null;
    function scheduleRefresh(delay = 60) {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTabTrail();
      }, delay);
    }

    // Dynamic Observer 1: MutationObserver to catch accordions, details, modal openings, and DOM changes
    const mutationObserver = new MutationObserver((mutations) => {
      let needsRefresh = false;
      for (const m of mutations) {
        const targetNode = m.target;
        if (targetNode && targetNode.nodeType === 1) {
          const el = /** @type {HTMLElement} */ (targetNode);
          if (el.id === '__auditforge_tab_trail_root__' || el.closest('#__auditforge_tab_trail_root__') || el.closest('#__af_preview_fix_badge__')) {
            continue;
          }
        }
        needsRefresh = true;
        break;
      }
      if (needsRefresh) {
        scheduleRefresh(60);
      }
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'aria-expanded', 'aria-hidden', 'hidden', 'class', 'style'],
    });

    // Dynamic Observer 2: ResizeObserver on document root to catch layout shifts and height expansions
    const resizeObserver = new ResizeObserver(() => {
      scheduleRefresh(50);
    });
    resizeObserver.observe(document.documentElement);

    // Dynamic Listener 3: CSS transition/animation ends on collapsible elements
    const onTransitionEnd = (e) => {
      if (e.target && e.target.closest?.('#__auditforge_tab_trail_root__')) return;
      scheduleRefresh(30);
    };
    document.addEventListener('transitionend', onTransitionEnd, { passive: true });
    document.addEventListener('animationend', onTransitionEnd, { passive: true });

    // Dynamic Listener 4: User clicks on collapsible triggers
    const onCollapsibleClick = (e) => {
      const trigger = e.target.closest('summary, button, [aria-expanded], [data-toggle], [data-bs-toggle], [data-collapse], .accordion-button, .collapsible');
      if (trigger) {
        scheduleRefresh(40);
        setTimeout(() => scheduleRefresh(0), 160);
        setTimeout(() => scheduleRefresh(0), 360);
      }
    };
    document.addEventListener('click', onCollapsibleClick, { passive: true, capture: true });

    // Dynamic Listener 5: Focus tracking with smooth scrolling and visual pulse
    function updateFocusHighlight(focusedEl) {
      const stepIdx = lastTabOrderElements.findIndex(it => it.element === focusedEl || it.visualElement === focusedEl);
      const activeBadge = document.getElementById('__af_tab_active_step__');

      const allBadges = badgesContainer.querySelectorAll('.__af_tab_badge__');
      allBadges.forEach((b, i) => {
        if (i === stepIdx) {
          b.style.transform = 'scale(1.3)';
          b.style.boxShadow = '0 0 16px #38bdf8, 0 0 26px #0D9FBA';
          b.style.border = '2px solid #ffffff';
          b.style.zIndex = '2147483647';
        } else {
          b.style.transform = 'scale(1)';
          b.style.border = 'none';
          b.style.zIndex = '2147483646';
        }
      });

      // Highlight connector path into active element
      const allPaths = svg.querySelectorAll('path.__af_trail_path__');
      allPaths.forEach((p, i) => {
        if (i === stepIdx - 1) {
          p.setAttribute('stroke-width', '2.6');
          p.setAttribute('opacity', '1');
          p.setAttribute('stroke', '#38bdf8');
          p.setAttribute('stroke-dasharray', 'none');
          p.setAttribute('marker-end', 'url(#__af_arrow_active__)');
        } else {
          const nextItem = lastTabOrderElements[i + 1];
          const isWarn = nextItem && nextItem.tabIndex > 0;
          p.setAttribute('stroke-width', '1.8');
          p.setAttribute('opacity', '0.95');
          p.setAttribute('stroke', isWarn ? '#f59e0b' : '#00E5FF');
          p.setAttribute('stroke-dasharray', isWarn ? '5,3' : 'none');
          p.setAttribute('marker-end', isWarn ? 'url(#__af_arrow_warn__)' : 'url(#__af_arrow_normal__)');
        }
      });

      const allCasings = svg.querySelectorAll('path.__af_trail_casing__');
      allCasings.forEach((c, i) => {
        if (i === stepIdx - 1) {
          c.setAttribute('stroke-width', '4.4');
          c.setAttribute('opacity', '0.8');
        } else {
          c.setAttribute('stroke-width', '3.5');
          c.setAttribute('opacity', '0.6');
        }
      });

      if (stepIdx !== -1) {
        if (activeBadge) {
          activeBadge.style.display = 'inline-block';
          activeBadge.textContent = `Active: #${stepIdx + 1}`;
        }
        // Smoothly ensure element is comfortably visible in viewport if tabbed off-screen
        if (focusedEl && typeof focusedEl.getBoundingClientRect === 'function') {
          const rect = focusedEl.getBoundingClientRect();
          if (rect.top < 60 || rect.bottom > window.innerHeight - 60) {
            focusedEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      } else if (activeBadge) {
        activeBadge.style.display = 'none';
      }
    }

    const onFocusIn = (e) => {
      updateFocusHighlight(e.target);
    };
    document.addEventListener('focusin', onFocusIn, true);

    // Dynamic Listener 6: Throttled scroll handling to keep fixed elements synchronized
    let scrollRaf = null;
    const onScroll = () => {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = null;
        currentCoords.forEach(c => {
          if (c.isFixed && c.badge) {
            const curRect = c.targetEl.getBoundingClientRect();
            c.badge.style.top = `${curRect.top - 10}px`;
            c.badge.style.left = `${curRect.left - 10}px`;
          }
        });
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    let resizeTimer = null;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        scheduleRefresh(0);
      }, 100);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        window.__auditforgeToggleTabTrail(false);
      }
    };

    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('keydown', onKeyDown, true);

    // Make Control Bar Draggable
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let barStartX = 0;
    let barStartY = 0;

    const onMouseDown = (e) => {
      if (e.target.closest('button') || e.target.closest('input')) return;
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      const rect = ctrlBar.getBoundingClientRect();
      barStartX = rect.left;
      barStartY = rect.top;
      ctrlBar.classList.add('is-dragging');
      document.body.style.userSelect = 'none';

      document.addEventListener('mousemove', onMouseMove, { capture: true });
      document.addEventListener('mouseup', onMouseUp, { capture: true });
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      e.preventDefault();
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;

      const barWidth = ctrlBar.offsetWidth || 340;
      const barHeight = ctrlBar.offsetHeight || 36;

      const maxLeft = Math.max(6, window.innerWidth - barWidth - 6);
      const maxTop = Math.max(6, window.innerHeight - barHeight - 6);

      const nextLeft = Math.max(6, Math.min(maxLeft, barStartX + dx));
      const nextTop = Math.max(6, Math.min(maxTop, barStartY + dy));

      ctrlBar.style.left = `${nextLeft}px`;
      ctrlBar.style.top = `${nextTop}px`;
      ctrlBar.style.right = 'auto';
      ctrlBar.style.bottom = 'auto';
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      ctrlBar.classList.remove('is-dragging');
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove, { capture: true });
      document.removeEventListener('mouseup', onMouseUp, { capture: true });
    };

    ctrlBar.addEventListener('mousedown', onMouseDown);

    // Touch support for dragging
    const onTouchStart = (e) => {
      if (e.target.closest('button')) return;
      const t = e.touches[0];
      if (!t) return;
      isDragging = true;
      dragStartX = t.clientX;
      dragStartY = t.clientY;
      const rect = ctrlBar.getBoundingClientRect();
      barStartX = rect.left;
      barStartY = rect.top;
      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', onTouchEnd);
    };

    const onTouchMove = (e) => {
      if (!isDragging) return;
      const t = e.touches[0];
      if (!t) return;
      e.preventDefault();
      const dx = t.clientX - dragStartX;
      const dy = t.clientY - dragStartY;
      const barWidth = ctrlBar.offsetWidth || 340;
      const barHeight = ctrlBar.offsetHeight || 36;
      const maxLeft = Math.max(6, window.innerWidth - barWidth - 6);
      const maxTop = Math.max(6, window.innerHeight - barHeight - 6);
      const nextLeft = Math.max(6, Math.min(maxLeft, barStartX + dx));
      const nextTop = Math.max(6, Math.min(maxTop, barStartY + dy));
      ctrlBar.style.left = `${nextLeft}px`;
      ctrlBar.style.top = `${nextTop}px`;
      ctrlBar.style.right = 'auto';
    };

    const onTouchEnd = () => {
      isDragging = false;
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };

    ctrlBar.addEventListener('touchstart', onTouchStart, { passive: true });

    // Minimize / Expand Toolbar Toggle
    let isMinimized = false;
    const minBtn = document.getElementById('__af_tab_min_btn__');
    const actionsPanel = document.getElementById('__af_tab_actions_panel__');

    minBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      isMinimized = !isMinimized;
      if (isMinimized) {
        if (actionsPanel) actionsPanel.style.display = 'none';
        minBtn.textContent = '⛶';
        minBtn.title = 'Expand toolbar';
        ctrlBar.style.padding = '5px 8px';
      } else {
        if (actionsPanel) actionsPanel.style.display = 'flex';
        minBtn.textContent = '—';
        minBtn.title = 'Collapse toolbar';
        ctrlBar.style.padding = '7px 12px';
      }
    });

    document.getElementById('__af_tab_mode_btn__')?.addEventListener('click', () => {
      trailArrowMode = trailArrowMode === 'direct' ? 'curved' : 'direct';
      const btn = document.getElementById('__af_tab_mode_btn__');
      if (btn) {
        btn.innerHTML = trailArrowMode === 'direct' ? '⚡ Direct' : '🌊 Curved';
      }
      renderTrailGeometry();
    });

    document.getElementById('__af_tab_refresh_btn__')?.addEventListener('click', () => {
      refreshTabTrail();
    });

    document.getElementById('__af_tab_focus_first__')?.addEventListener('click', () => {
      if (lastTabOrderElements[0]?.element) {
        lastTabOrderElements[0].element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        lastTabOrderElements[0].element.focus({ preventScroll: true });
      }
    });

    document.getElementById('__af_tab_exit_btn__')?.addEventListener('click', () => {
      window.__auditforgeToggleTabTrail(false);
    });

    window.__auditforgeTabTrailCleanup = () => {
      ctrlBar.removeEventListener('mousedown', onMouseDown);
      ctrlBar.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('mousemove', onMouseMove, true);
      document.removeEventListener('mouseup', onMouseUp, true);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener('transitionend', onTransitionEnd);
      document.removeEventListener('animationend', onTransitionEnd);
      document.removeEventListener('click', onCollapsibleClick, true);
      document.removeEventListener('focusin', onFocusIn, true);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown, true);
    };


    return { active: true, totalSteps: lastTabOrderElements.length };
  };

  /**
   * Applies mathematically accurate Color Vision Deficiency (CVD) and Low Vision filters to the page.
   * Supports Protanopia, Deuteranopia, Tritanopia, Achromatopsia, Cataracts (Blur),
   * Glaucoma (Tunnel Vision), Macular Degeneration (Central Blind Spot), and Photophobia (Inversion).
   * @param {'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia' | 'cataracts' | 'glaucoma' | 'macular' | 'photophobia'} filterType
   * @returns {{ active: boolean, filter: string }}
   */
  window.__auditforgeSetColorFilter = function (filterType) {
    const CVD_FILTER_ID_MAP = {
      protanopia: '__af_cvd_protanopia__',
      deuteranopia: '__af_cvd_deuteranopia__',
      tritanopia: '__af_cvd_tritanopia__',
      achromatopsia: '__af_cvd_achromatopsia__',
    };

    const LABELS = {
      protanopia: 'Color Vision: Protanopia (Red-Blind)',
      deuteranopia: 'Color Vision: Deuteranopia (Green-Blind)',
      tritanopia: 'Color Vision: Tritanopia (Blue-Blind)',
      achromatopsia: 'Color Vision: Achromatopsia (Monochrome)',
      cataracts: 'Low Vision: Cataracts (Blur & Contrast Wash)',
      glaucoma: 'Low Vision: Glaucoma (Tunnel Vision)',
      macular: 'Low Vision: Macular Degeneration (Central Blind Spot)',
      photophobia: 'Low Vision: Photophobia (Inverted Contrast)',
    };

    // Clean up any existing low-vision overlays, listeners, and styles
    document.getElementById('__af_cvd_indicator__')?.remove();
    document.getElementById('__af_tunnel_overlay__')?.remove();
    document.getElementById('__af_macular_overlay__')?.remove();
    document.documentElement.style.removeProperty('filter');
    document.body?.style?.removeProperty('filter');
    if (typeof window.__af_vision_mouse_cleanup === 'function') {
      window.__af_vision_mouse_cleanup();
      window.__af_vision_mouse_cleanup = null;
    }

    window.__af_active_color_filter = filterType || 'none';
    if (typeof applyVisionFilterToMobileSimulator === 'function') {
      applyVisionFilterToMobileSimulator(window.__af_active_color_filter);
    }

    if (!filterType || filterType === 'none') {
      return { active: false, filter: 'none' };
    }

    const mobSimRoot = document.getElementById('__auditforge_mobile_sim_root__');
    const isMobSimOpen = Boolean(mobSimRoot);

    // If mobile simulator HUD is active on the page, the vision filter applies strictly
    // to the simulated mobile device iframe. The outer simulator tool (chassis, header,
    // drawer, issue cards) and outer page remain crystal-clear and unaffected.
    if (!isMobSimOpen && document.body) {
      // 1. Color Vision Deficiency (SVG Matrix Filters)
      if (CVD_FILTER_ID_MAP[filterType]) {
        let defsSvg = document.getElementById('__auditforge_cvd_defs__');
        if (!defsSvg) {
          defsSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          defsSvg.id = '__auditforge_cvd_defs__';
          defsSvg.setAttribute('style', 'position: absolute; height: 0; width: 0; overflow: hidden;');
          defsSvg.setAttribute('aria-hidden', 'true');
          defsSvg.innerHTML = `
            <defs>
              <filter id="__af_cvd_protanopia__">
                <feColorMatrix type="matrix" values="
                  0.567, 0.433, 0.000, 0, 0
                  0.558, 0.442, 0.000, 0, 0
                  0.000, 0.242, 0.758, 0, 0
                  0.000, 0.000, 0.000, 1, 0" />
              </filter>
              <filter id="__af_cvd_deuteranopia__">
                <feColorMatrix type="matrix" values="
                  0.625, 0.375, 0.000, 0, 0
                  0.700, 0.300, 0.000, 0, 0
                  0.000, 0.300, 0.700, 0, 0
                  0.000, 0.000, 0.000, 1, 0" />
              </filter>
              <filter id="__af_cvd_tritanopia__">
                <feColorMatrix type="matrix" values="
                  0.950, 0.050, 0.000, 0, 0
                  0.000, 0.433, 0.567, 0, 0
                  0.000, 0.475, 0.525, 0, 0
                  0.000, 0.000, 0.000, 1, 0" />
              </filter>
              <filter id="__af_cvd_achromatopsia__">
                <feColorMatrix type="matrix" values="
                  0.299, 0.587, 0.114, 0, 0
                  0.299, 0.587, 0.114, 0, 0
                  0.299, 0.587, 0.114, 0, 0
                  0.000, 0.000, 0.000, 1, 0" />
              </filter>
            </defs>
          `;
          (document.documentElement || document.body).appendChild(defsSvg);
        }
        const filterId = CVD_FILTER_ID_MAP[filterType];
        // Apply filter strictly to document.body so all extension popups attached to document.documentElement remain sharp and un-filtered!
        document.body.style.setProperty('filter', `url(#${filterId})`, 'important');
      }

      // 2. Cataracts / Visual Acuity Loss (Gaussian blur & low contrast wash)
      else if (filterType === 'cataracts') {
        document.body.style.setProperty('filter', 'blur(3.5px) contrast(0.82) brightness(1.05)', 'important');
      }

      // 3. Photophobia (Extreme Light Sensitivity / Inverted High Contrast)
      else if (filterType === 'photophobia') {
        document.body.style.setProperty('filter', 'invert(1) hue-rotate(180deg) contrast(1.15)', 'important');
      }

      // 4. Glaucoma (Tunnel Vision / Loss of Peripheral Field)
      else if (filterType === 'glaucoma') {
        const overlay = document.createElement('div');
        overlay.id = '__af_tunnel_overlay__';
        overlay.setAttribute('data-auditforge-ext', 'true');
        overlay.style.cssText = `
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          z-index: 2147483640;
          pointer-events: none;
          background: radial-gradient(circle at 50% 50%, transparent 12%, rgba(10, 15, 29, 0.72) 22%, rgba(10, 15, 29, 0.96) 35%, rgba(10, 15, 29, 0.99) 100%);
          backdrop-filter: blur(1px);
          transition: background 0.04s ease-out;
        `;
        (document.documentElement || document.body).appendChild(overlay);

        const updateTunnel = (e) => {
          const x = Math.round((e.clientX / window.innerWidth) * 100);
          const y = Math.round((e.clientY / window.innerHeight) * 100);
          overlay.style.background = `radial-gradient(circle at ${x}% ${y}%, transparent 12%, rgba(10, 15, 29, 0.72) 22%, rgba(10, 15, 29, 0.96) 35%, rgba(10, 15, 29, 0.99) 100%)`;
        };
        window.addEventListener('mousemove', updateTunnel, { passive: true });
        window.__af_vision_mouse_cleanup = () => {
          window.removeEventListener('mousemove', updateTunnel);
        };
      }

      // 5. Macular Degeneration (Central Blind Spot / Central Scotoma)
      else if (filterType === 'macular') {
        const overlay = document.createElement('div');
        overlay.id = '__af_macular_overlay__';
        overlay.setAttribute('data-auditforge-ext', 'true');
        overlay.style.cssText = `
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          z-index: 2147483640;
          pointer-events: none;
          background: radial-gradient(circle at 50% 50%, rgba(15, 23, 42, 0.97) 0%, rgba(15, 23, 42, 0.88) 12%, rgba(15, 23, 42, 0.4) 22%, transparent 32%);
          transition: background 0.04s ease-out;
        `;
        (document.documentElement || document.body).appendChild(overlay);

        const updateMacular = (e) => {
          const x = Math.round((e.clientX / window.innerWidth) * 100);
          const y = Math.round((e.clientY / window.innerHeight) * 100);
          overlay.style.background = `radial-gradient(circle at ${x}% ${y}%, rgba(15, 23, 42, 0.97) 0%, rgba(15, 23, 42, 0.88) 12%, rgba(15, 23, 42, 0.4) 22%, transparent 32%)`;
        };
        window.addEventListener('mousemove', updateMacular, { passive: true });
        window.__af_vision_mouse_cleanup = () => {
          window.removeEventListener('mousemove', updateMacular);
        };
      }

      // Floating indicator pill
      const isLowVision = ['cataracts', 'glaucoma', 'macular', 'photophobia'].includes(filterType);
      const pill = document.createElement('div');
      pill.id = '__af_cvd_indicator__';
      pill.setAttribute('data-auditforge-ext', 'true');
      pill.style.cssText = `
        position: fixed;
        bottom: 16px;
        left: 16px;
        z-index: 2147483647;
        background: #000000;
        border: 1px solid ${isLowVision ? '#1b6f7e' : '#127788'};
        border-radius: 999px;
        padding: 6px 14px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.85), 0 0 15px rgba(13,159,186,0.3);
        color: #e2ebed;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 11.5px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 10px;
        user-select: none;
        pointer-events: auto;
      `;
      pill.innerHTML = `
        <span style="display: flex; align-items: center; gap: 6px;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0D9FBA" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
          <span><strong style="color: #0D9FBA;">${isLowVision ? 'Low Vision Lens' : 'Color Vision Lens'}:</strong> ${LABELS[filterType] || filterType}</span>
        </span>
        <button id="__af_cvd_reset_btn__" type="button" style="background: #080f12; border: 1px solid rgba(27, 111, 126, 0.4); color: #0D9FBA; font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 12px; cursor: pointer;">Reset Normal</button>
      `;

      pill.querySelector('#__af_cvd_reset_btn__')?.addEventListener('click', () => {
        window.__auditforgeSetColorFilter('none');
      });

      (document.documentElement || document.body).appendChild(pill);
    }

    return { active: true, filter: filterType };
  };
})();

/**
 * Live DOM Preview Fix Engine
 * Allows users to preview accessible fixes (contrast, ARIA, target size, link href) live on the active page.
 */
(() => {
  // Map of Element -> original styles & attributes
  const activeFixes = new Map();

  function removePreviewBadge() {
    const existing = document.getElementById('__af_preview_fix_badge__');
    if (existing) existing.remove();
  }

  function showPreviewBadge(el, labelText, onRevert) {
    removePreviewBadge();
    const badge = document.createElement('div');
    badge.id = '__af_preview_fix_badge__';
    badge.style.cssText = `
      position: fixed;
      bottom: 22px;
      right: 22px;
      z-index: 2147483647;
      background: #060a0c;
      border: 1.5px solid #10b981;
      border-radius: 999px;
      padding: 7px 16px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.85), 0 0 20px rgba(16, 185, 129, 0.45);
      color: #e2ebed;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 11.5px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 12px;
      user-select: none;
      pointer-events: auto;
      transition: all 0.2s ease;
    `;
    badge.innerHTML = `
      <span style="display: flex; align-items: center; gap: 7px;">
        <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 8px #10b981;"></span>
        <span><strong style="color: #34d399;">Previewing Fix:</strong> ${labelText}</span>
      </span>
      <button id="__af_preview_revert_btn__" type="button" style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.45); color: #34d399; font-size: 10.5px; font-weight: 600; padding: 2.5px 10px; border-radius: 12px; cursor: pointer; transition: all 0.15s ease;">↩ Revert</button>
    `;

    badge.querySelector('#__af_preview_revert_btn__')?.addEventListener('click', () => {
      if (typeof onRevert === 'function') onRevert();
    });

    (document.documentElement || document.body).appendChild(badge);
  }

  window.__auditforgePreviewFix = function(selector, fixType, payload = {}) {
    try {
      const el = document.querySelector(selector);
      if (!el) return { success: false, error: 'Element not found in DOM' };

      // 1. If not already saved, backup the original state
      if (!activeFixes.has(el)) {
        activeFixes.set(el, {
          styleColor: el.style.color,
          styleBg: el.style.backgroundColor,
          styleMinWidth: el.style.minWidth,
          styleMinHeight: el.style.minHeight,
          styleDisplay: el.style.display,
          styleAlignItems: el.style.alignItems,
          styleJustifyContent: el.style.justifyContent,
          styleOutline: el.style.outline,
          styleBoxShadow: el.style.boxShadow,
          styleTextDecoration: el.style.textDecoration,
          styleTextUnderlineOffset: el.style.textUnderlineOffset,
          styleTextDecorationThickness: el.style.textDecorationThickness,
          styleFontWeight: el.style.fontWeight,
          ariaLabel: el.getAttribute('aria-label'),
          alt: el.getAttribute('alt'),
          href: el.getAttribute('href'),
          role: el.getAttribute('role'),
          tabindex: el.getAttribute('tabindex'),
          title: el.getAttribute('title'),
          ariaHidden: el.getAttribute('aria-hidden'),
          docLang: (fixType === 'html-lang') ? document.documentElement.getAttribute('lang') : null,
        });
      }

      let labelDesc = 'Accessible Adjustment';

      // 2. Apply fix based on fixType
      if (fixType === 'contrast') {
        const fg = payload.suggestedFg || payload.fgColor;
        const bg = payload.suggestedBg || payload.bgColor;
        if (fg) {
          el.style.setProperty('color', fg, 'important');
        }
        if (bg && bg !== 'transparent') {
          el.style.setProperty('background-color', bg, 'important');
        }
        labelDesc = `Contrast ${payload.suggestedFg ? `Text: ${payload.suggestedFg}` : ''} ${payload.suggestedBg ? `Bg: ${payload.suggestedBg}` : ''} (${payload.suggestedRatio || 'WCAG AA Pass'})`;
      } else if (fixType === 'link-distinguish' || fixType === 'link-in-text-block') {
        el.style.setProperty('text-decoration', 'underline', 'important');
        el.style.setProperty('text-underline-offset', '3px', 'important');
        el.style.setProperty('text-decoration-thickness', '1.5px', 'important');
        labelDesc = 'Distinguishable Link: Underline & 3px offset applied (WCAG 1.4.1)';
      } else if (fixType === 'aria-label' || fixType === 'button-name' || fixType === 'link-name') {
        const label = payload.recommendedLabel || payload.accessibleName || 'Action';
        el.setAttribute('aria-label', label);
        labelDesc = `ARIA Label: "${label}"`;
      } else if (fixType === 'image-alt') {
        const alt = payload.recommendedAlt || payload.accessibleName || 'Descriptive image summary';
        el.setAttribute('alt', alt);
        labelDesc = `Image Alt: "${alt}"`;
      } else if (fixType === 'target-size') {
        el.style.setProperty('min-width', '24px', 'important');
        el.style.setProperty('min-height', '24px', 'important');
        el.style.setProperty('display', 'inline-flex', 'important');
        el.style.setProperty('align-items', 'center', 'important');
        el.style.setProperty('justify-content', 'center', 'important');
        labelDesc = 'Target Size: min 24×24px (WCAG 2.5.8)';
      } else if (fixType === 'frame-title') {
        const title = payload.recommendedTitle || 'Embedded content';
        el.setAttribute('title', title);
        labelDesc = `Frame Title: "${title}" (WCAG 4.1.2)`;
      } else if (fixType === 'html-lang') {
        const lang = payload.lang || 'en';
        document.documentElement.setAttribute('lang', lang);
        labelDesc = `HTML Language: lang="${lang}" (WCAG 3.1.1)`;
      } else if (fixType === 'aria-hidden-focus') {
        el.removeAttribute('aria-hidden');
        labelDesc = 'Removed aria-hidden from interactive element (WCAG 4.1.2)';
      } else if (fixType === 'tabindex') {
        el.setAttribute('tabindex', payload.tabindex || '0');
        labelDesc = 'Keyboard Focus: Restored tabindex="0" (WCAG 2.1.1)';
      } else if (fixType === 'link') {
        if (payload.suggestedUrl) {
          el.setAttribute('href', payload.suggestedUrl);
          labelDesc = `Link Destination: ${payload.suggestedUrl}`;
        } else {
          el.setAttribute('role', 'button');
          if (!el.getAttribute('tabindex')) el.setAttribute('tabindex', '0');
          labelDesc = 'Converted to Accessible Button Role';
        }
      }

      // Visual indicator outline
      el.style.setProperty('outline', '2.5px dashed #10b981', 'important');
      el.style.setProperty('box-shadow', '0 0 14px rgba(16, 185, 129, 0.45)', 'important');

      // Scroll smoothly into view (except for html tag)
      if (el !== document.documentElement && el !== document.body) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }

      // In-page badge
      showPreviewBadge(el, labelDesc, () => {
        window.__auditforgeRevertFix(selector);
      });

      return { success: true, isFixed: true, labelDesc };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  function restoreElement(el, prev) {
    if (!el || !prev) return;
    el.style.color = prev.styleColor;
    el.style.backgroundColor = prev.styleBg;
    el.style.minWidth = prev.styleMinWidth;
    el.style.minHeight = prev.styleMinHeight;
    el.style.display = prev.styleDisplay;
    el.style.alignItems = prev.styleAlignItems;
    el.style.justifyContent = prev.styleJustifyContent;
    el.style.outline = prev.styleOutline;
    el.style.boxShadow = prev.styleBoxShadow;

    if (prev.styleTextDecoration !== undefined) el.style.textDecoration = prev.styleTextDecoration;
    if (prev.styleTextUnderlineOffset !== undefined) el.style.textUnderlineOffset = prev.styleTextUnderlineOffset;
    if (prev.styleTextDecorationThickness !== undefined) el.style.textDecorationThickness = prev.styleTextDecorationThickness;
    if (prev.styleFontWeight !== undefined) el.style.fontWeight = prev.styleFontWeight;

    if (prev.ariaLabel !== null) el.setAttribute('aria-label', prev.ariaLabel);
    else el.removeAttribute('aria-label');

    if (prev.alt !== null) el.setAttribute('alt', prev.alt);
    else el.removeAttribute('alt');

    if (prev.href !== null) el.setAttribute('href', prev.href);
    else el.removeAttribute('href');

    if (prev.role !== null) el.setAttribute('role', prev.role);
    else el.removeAttribute('role');

    if (prev.tabindex !== null) el.setAttribute('tabindex', prev.tabindex);
    else el.removeAttribute('tabindex');

    if (prev.title !== null) el.setAttribute('title', prev.title);
    else el.removeAttribute('title');

    if (prev.ariaHidden !== null) el.setAttribute('aria-hidden', prev.ariaHidden);
    else el.removeAttribute('aria-hidden');

    if (prev.docLang !== undefined && prev.docLang !== null) {
      if (prev.docLang) document.documentElement.setAttribute('lang', prev.docLang);
      else document.documentElement.removeAttribute('lang');
    }
  }

  window.__auditforgeRevertFix = function(selector) {
    try {
      const el = document.querySelector(selector);
      if (!el || !activeFixes.has(el)) {
        if (activeFixes.size === 0) removePreviewBadge();
        return { success: true, isFixed: false };
      }

      const prev = activeFixes.get(el);
      restoreElement(el, prev);
      activeFixes.delete(el);

      if (activeFixes.size === 0) {
        removePreviewBadge();
      }

      return { success: true, isFixed: false };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  window.__auditforgeRevertAllFixes = function() {
    try {
      for (const [el, prev] of activeFixes.entries()) {
        restoreElement(el, prev);
      }
      activeFixes.clear();
      removePreviewBadge();
      return { success: true, isFixed: false };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  window.__auditforgeIsFixActive = function(selector) {
    const el = document.querySelector(selector);
    return Boolean(el && activeFixes.has(el));
  };
})();

