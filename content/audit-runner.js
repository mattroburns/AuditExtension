// @ts-check

/**
 * WCAG 2.2 Accessibility Compliance Injected Auditor
 * Executes axe-core against WCAG 2.2 AA rules, evaluates interactive :hover contrast,
 * audits ARIA labels for semantic accuracy and WCAG 2.5.3 (Label in Name),
 * and audits Screen Reader & VoiceOver compatibility.
 */

(function () {
  /**
   * Latest WCAG 2.2 AA, 2.1 AA, 2.0 AA tags
   */
  const WCAG_22_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa', 'best-practice'];

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

      // Check 1: Empty or whitespace-only aria-label
      if (el.hasAttribute('aria-label') && !resolvedLabel) {
        emptyNodes.push({
          target: selector,
          html,
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
        return { label: 'banner', spoken: name ? `"${name}", banner landmark` : 'banner landmark', vo: name ? `${name}, banner landmark` : 'banner landmark', nvda: `Banner landmark${name ? `, ${name}` : ''}` };
      }
      if (tag === 'nav' || role === 'navigation') {
        return { label: 'navigation', spoken: name ? `"${name}", navigation landmark` : 'navigation landmark', vo: name ? `${name}, navigation landmark` : 'navigation landmark', nvda: `Navigation landmark${name ? `, ${name}` : ''}` };
      }
      if (tag === 'main' || role === 'main') {
        return { label: 'main content', spoken: name ? `"${name}", main content landmark` : 'main content landmark', vo: name ? `${name}, main content landmark` : 'main content landmark', nvda: `Main landmark${name ? `, ${name}` : ''}` };
      }
      if (tag === 'footer' || role === 'contentinfo') {
        return { label: 'content information', spoken: name ? `"${name}", content information landmark` : 'content information landmark', vo: name ? `${name}, content information landmark` : 'content information landmark', nvda: `Content information landmark${name ? `, ${name}` : ''}` };
      }
      if (tag === 'aside' || role === 'complementary') {
        return { label: 'complementary', spoken: name ? `"${name}", complementary landmark` : 'complementary landmark', vo: name ? `${name}, complementary landmark` : 'complementary landmark', nvda: `Complementary landmark${name ? `, ${name}` : ''}` };
      }
      if (role === 'search') {
        return { label: 'search', spoken: name ? `"${name}", search landmark` : 'search landmark', vo: name ? `${name}, search landmark` : 'search landmark', nvda: `Search landmark${name ? `, ${name}` : ''}` };
      }
      if ((tag === 'section' || tag === 'form' || role === 'region') && name) {
        return { label: 'region', spoken: `"${name}", region landmark`, vo: `${name}, region landmark`, nvda: `Region landmark, ${name}` };
      }
      return null;
    }

    function walk(node) {
      if (results.length >= maxItems) return;
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
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
          nvdaText: lm.nvda,
          narratorText: lm.vo,
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
          if (node.hasAttribute('disabled') || node.getAttribute('aria-disabled') === 'true') states.push('dimmed');
          const stateStr = states.join(', ');

          if (name) {
            const stateSuffix = stateStr ? `, ${stateStr}` : '';
            results.push({
              element: node,
              type: 'Button',
              rotorCategory: 'control',
              spokenText: `"${name}"${stateSuffix}, button`,
              voiceOverText: `${name}${stateSuffix}, button${isExpanded === 'false' ? ', double tap to expand' : ''}`,
              nvdaText: `Button, ${name}${stateSuffix}`,
              narratorText: `${name}${stateSuffix}, button`,
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
              voiceOverText: 'unlabelled button',
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
            const stateSuffix = stateStr ? ` (${stateStr})` : '';
            results.push({
              element: node,
              type: 'Link',
              rotorCategory: 'link',
              spokenText: `"${name}"${stateSuffix}, link`,
              voiceOverText: `${name}${stateSuffix}, link`,
              nvdaText: `Link, ${name}${stateSuffix}`,
              narratorText: `${name}${stateSuffix}, link`,
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
              voiceOverText: 'unlabelled link',
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
          const states = [];
          if (isRequired) states.push('required');
          if (isInvalid) states.push('invalid data');

          let roleLabel = 'edit text';
          let itemType = 'Form Field';

          if (fieldType === 'checkbox' || role === 'checkbox') {
            itemType = 'Checkbox';
            roleLabel = 'checkbox';
            const isChecked = node.checked || node.getAttribute('aria-checked') === 'true';
            states.push(isChecked ? 'checked' : 'unchecked');
          } else if (role === 'switch') {
            itemType = 'Switch';
            roleLabel = 'switch';
            const isChecked = node.getAttribute('aria-checked') === 'true';
            states.push(isChecked ? 'on' : 'off');
          } else if (role === 'tab') {
            itemType = 'Tab';
            roleLabel = 'tab';
            const isSelected = node.getAttribute('aria-selected') === 'true';
            states.push(isSelected ? 'selected' : 'not selected');
          } else if (fieldType === 'radio' || role === 'radio') {
            itemType = 'Radio Button';
            roleLabel = 'radio button';
            states.push(node.checked ? 'selected' : 'not selected');
          }

          const stateStr = states.join(', ');
          if (name) {
            const stateSuffix = stateStr ? `, ${stateStr}` : '';
            results.push({
              element: node,
              type: itemType,
              rotorCategory: 'control',
              spokenText: `"${name}"${stateSuffix}, ${roleLabel}`,
              voiceOverText: `${name}${stateSuffix}, ${roleLabel}`,
              nvdaText: `${roleLabel.charAt(0).toUpperCase() + roleLabel.slice(1)}, ${name}${stateSuffix}`,
              narratorText: `${name}${stateSuffix}, ${roleLabel}`,
              state: stateStr,
              selector: getUniqueSelector(node),
              isBarrier: false,
              earcon: 'control',
            });
          } else {
            results.push({
              element: node,
              type: itemType,
              rotorCategory: 'control',
              spokenText: `unlabelled ${roleLabel}`,
              voiceOverText: `unlabelled ${roleLabel}`,
              nvdaText: `${roleLabel.charAt(0).toUpperCase() + roleLabel.slice(1)}, unlabelled`,
              narratorText: `unlabelled ${roleLabel}`,
              state: stateStr,
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

        altQualityNodes.push({
          target: getUniqueSelector(img),
          html: img.outerHTML.slice(0, 300),
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
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]'));
    const headingNodes = [];
    const h1Elements = headings.filter(h => h.tagName.toLowerCase() === 'h1' || h.getAttribute('aria-level') === '1');

    if (h1Elements.length === 0 && headings.length > 0) {
      headingNodes.push({
        target: getUniqueSelector(headings[0]),
        html: headings[0].outerHTML.slice(0, 300),
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
        headingNodes.push({
          target: getUniqueSelector(h),
          html: h.outerHTML.slice(0, 300),
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
        headingNodes.push({
          target: getUniqueSelector(h),
          html: h.outerHTML.slice(0, 300),
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

    const navs = Array.from(document.querySelectorAll('nav, [role="navigation"]'));
    if (navs.length > 1) {
      const unlabelledNavs = navs.filter(n => !n.getAttribute('aria-label') && !n.getAttribute('aria-labelledby'));
      if (unlabelledNavs.length > 0) {
        unlabelledNavs.forEach(nav => {
          landmarkNodes.push({
            target: getUniqueSelector(nav),
            html: nav.outerHTML.slice(0, 300),
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
      const focusableChildren = container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
      for (const child of Array.from(focusableChildren).slice(0, 3)) {
        hiddenFocusNodes.push({
          target: getUniqueSelector(child),
          html: child.outerHTML.slice(0, 300),
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
      const text = (link.innerText || '').trim().toLowerCase();
      const ariaLabel = (link.getAttribute('aria-label') || '').trim();

      if (vaguePhrases.has(text) && !ariaLabel) {
        ambiguousLinkNodes.push({
          target: getUniqueSelector(link),
          html: link.outerHTML.slice(0, 300),
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

  let lastTabOrderElements = [];

  function evaluateTabNavigationOrder() {
    const candidates = Array.from(document.querySelectorAll(
      'a[href], button, input, select, textarea, [tabindex], summary, iframe, [contenteditable], audio[controls], video[controls], area[href]'
    ));

    const rawFocusable = [];

    for (const el of candidates) {
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
   * Main audit execution entry point
   * @returns {Promise<Object>} Complete audit report
   */
  window.__runWcagAudit = async function () {
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
      const severity = v.impact || 'moderate';
      if (violationsBySeverity[severity] !== undefined) {
        violationsBySeverity[severity] += v.nodes.length;
      }

      const sampleNodes = [];
      for (const node of v.nodes.slice(0, 25)) {
        const targetSelector = Array.isArray(node.target) ? node.target.join(' ') : String(node.target);
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

        sampleNodes.push({
          target: targetSelector,
          html: node.html ? node.html.trim().slice(0, 300) : '',
          failureSummary: node.failureSummary || v.help,
          contrastFix,
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
        {
          key: 'redundantRoleNodes',
          id: 'aria-label-redundant-role',
          impact: 'minor',
          help: 'Accessible label should not redundantly repeat the element role',
          description: 'Accessible labels should not include the element role name (e.g. "Submit button" on a <button>) because screen readers announce the role natively.',
          wcagRule: 'WCAG Best Practice / 4.1.2',
          tags: ['best-practice', 'wcag412'],
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
          key: 'headingNodes',
          id: 'screen-reader-heading-order',
          impact: 'serious',
          help: 'Heading levels are missing, empty, or skipped, breaking rotor navigation',
          description: 'Headings must start with an <h1> and progress sequentially without skipping levels (e.g. h1 directly to h3/h4) to support screen reader heading rotor navigation.',
          wcagRule: 'WCAG 2.2 AA 1.3.1 / 2.4.6',
          tags: ['wcag2aa', 'wcag131', 'wcag246'],
        },
        {
          key: 'landmarkNodes',
          id: 'screen-reader-landmarks',
          impact: 'serious',
          help: 'Page lacks primary <main> landmark or has duplicate unlabelled landmarks',
          description: 'Pages must include a semantic <main> landmark to allow blind users to bypass headers, and multiple <nav> landmarks must have distinguishing aria-labels.',
          wcagRule: 'WCAG 2.2 AA 1.3.1 / 2.4.1',
          tags: ['wcag2aa', 'wcag131', 'wcag241'],
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

    function safeEscape(str) {
      return String(str || '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      }[c]));
    }

    function findElement(target) {
      if (!target) return null;
      if (typeof Element !== 'undefined' && target instanceof Element) return target;

      // Handle array of selectors (e.g. iframe traversal from axe-core)
      if (Array.isArray(target)) {
        if (target.length === 1) return findElement(target[0]);
        let currentDoc = document;
        let foundEl = null;
        for (let i = 0; i < target.length; i++) {
          const sel = target[i];
          if (!currentDoc) break;
          try {
            foundEl = currentDoc.querySelector(sel);
            if (foundEl && (foundEl.tagName === 'IFRAME' || foundEl.tagName === 'FRAME')) {
              try {
                // @ts-ignore
                currentDoc = foundEl.contentDocument || foundEl.contentWindow?.document;
              } catch (_) {
                return foundEl; // Return iframe if cross-origin access blocked
              }
            }
          } catch (_) {
            break;
          }
        }
        if (foundEl) return foundEl;
      }

      const selectorStr = typeof target === 'string' ? target.trim() : String(target).trim();
      if (!selectorStr) return null;

      // Root document scope checks
      if (selectorStr === 'html' || selectorStr === ':root') return document.documentElement;
      if (selectorStr === 'body') return document.body;

      // 1. Direct querySelector
      try {
        const el = document.querySelector(selectorStr);
        if (el) return el;
      } catch (_) {}

      // 2. Direct ID lookup if selector contains #id
      if (selectorStr.startsWith('#') && !selectorStr.includes(' ') && !selectorStr.includes('>') && !selectorStr.includes(':')) {
        try {
          const el = document.getElementById(selectorStr.slice(1));
          if (el) return el;
        } catch (_) {}
      }

      // 3. Escape CSS identifiers (colons, dots, slashes in Tailwind / React / Vue classes)
      try {
        const escaped = selectorStr.replace(/#([^\s>+~.:[\]]+)/g, (_, id) => `#${CSS.escape(id)}`);
        const el = document.querySelector(escaped);
        if (el) return el;
      } catch (_) {}

      // 4. Terminal segment fallback (rightmost component)
      const parts = selectorStr.split(/\s*>\s*|\s+/).filter(Boolean);
      if (parts.length > 1) {
        for (let i = parts.length - 1; i >= 0; i--) {
          try {
            const seg = parts[i];
            const el = document.querySelector(seg);
            if (el) return el;
          } catch (_) {}
        }
      }

      // 5. HTML snippet matching fallback
      if (meta && meta.html) {
        try {
          const tagMatch = meta.html.match(/^<([a-z0-9-]+)/i);
          if (tagMatch) {
            const tag = tagMatch[1];
            const candidates = Array.from(document.querySelectorAll(tag));
            const snippet = meta.html.slice(0, 45);
            const matched = candidates.find((c) => c.outerHTML && c.outerHTML.includes(snippet));
            if (matched) return matched;
          }
        } catch (_) {}
      }

      // 6. Match by text content in interactive elements
      if (meta && (meta.text || meta.target)) {
        const queryText = (meta.text || '').trim().toLowerCase();
        if (queryText) {
          const interactives = Array.from(document.querySelectorAll('button, a, input, select, textarea, [role="button"], [role="link"], h1, h2, h3, h4, img'));
          const matched = interactives.find((el) => ((el.innerText || el.textContent || '')).trim().toLowerCase().includes(queryText));
          if (matched) return matched;
        }
      }

      return null;
    }

    const targetEl = findElement(targetSelector);
    const selectorString = Array.isArray(targetSelector) ? targetSelector.join(' ') : String(targetSelector);
    const isDocumentScope = !targetEl || targetEl === document.documentElement || targetEl === document.body || selectorString === 'html' || selectorString === 'body';

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
          background: rgba(15, 23, 42, 0.96);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-top: 3.5px solid var(--af-border);
          border-radius: 10px;
          box-shadow: 0 20px 45px rgba(0, 0, 0, 0.85), 0 0 25px var(--af-glow);
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
          color: #ffffff;
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
          color: #f8fafc;
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .__af_btn_close {
          background: rgba(255, 255, 255, 0.1);
          border: none;
          color: #94a3b8;
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
          background: rgba(239, 68, 68, 0.4);
          color: #ffffff;
        }
        .__af_desc {
          font-size: 11px;
          line-height: 1.45;
          color: #cbd5e1;
          margin-bottom: 8px;
        }
        .__af_meta_row {
          font-size: 10px;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 5px;
          padding: 5px 8px;
          margin-bottom: 6px;
          word-break: break-all;
          font-family: monospace;
          color: #38bdf8;
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
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }
        .__af_btn_action {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #e2e8f0;
          padding: 4px 10px;
          border-radius: 5px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .__af_btn_action:hover {
          background: rgba(56, 189, 248, 0.2);
          border-color: #38bdf8;
          color: #ffffff;
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
    if (!isDocumentScope && targetEl) {
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

    const descText = meta.description || (isDocumentScope
      ? 'This is a page-wide architectural finding (e.g. missing landmark or heading hierarchy) applicable to the whole document structure.'
      : 'Review the element highlighted in the spotlight on the site.');

    const recenterBtnHtml = !isDocumentScope
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
    document.body.appendChild(root);

    // Scroll to element smoothly
    if (!isDocumentScope && targetEl) {
      try {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      } catch (_) {
        try { targetEl.scrollIntoView(true); } catch (_) {}
      }
    }

    function updateSpotlight() {
      if (isDocumentScope || !targetEl || !spotlight) {
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
   * Starts the Interactive In-Page VoiceOver Simulator.
   * Enables full document reading order navigation via Arrow keys (➔ / ⬅ / VO+Arrow),
   * Tab for interactive controls, and click-to-speak on any element.
   * Speaks exact screen reader announcements aloud with an Apple VoiceOver-style caption pill.
   */
  window.__auditforgeStartVoiceOverSimulator = function (persona = 'voiceover') {
    window.__auditforgeStopVoiceOverSimulator();

    const narrative = extractScreenReaderNarrative(document.body, 300);
    let activeIndex = -1;

    const banner = document.createElement('div');
    banner.id = '__auditforge_vo_sim_banner__';
    banner.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      background: rgba(10, 15, 29, 0.95);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1.5px solid #a855f7;
      border-radius: 30px;
      box-shadow: 0 10px 35px rgba(0, 0, 0, 0.75), 0 0 20px rgba(168, 85, 247, 0.35);
      padding: 8px 18px;
      display: flex;
      align-items: center;
      gap: 10px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #ffffff;
      font-size: 12px;
      user-select: none;
      pointer-events: auto;
      animation: __af_sim_pop 0.25s ease-out;
      max-width: 92vw;
    `;

    const personaLabel = persona === 'nvda' ? 'NVDA' : persona === 'narrator' ? 'Narrator' : 'VoiceOver';

    banner.innerHTML = `
      <style>
        @keyframes __af_sim_pop { from { opacity: 0; transform: translate(-50%, 15px) scale(0.95); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }
        .__af_vo_badge { background: #a855f7; color: #fff; font-weight: 800; font-size: 10px; padding: 2px 8px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; }
        .__af_vo_step_badge { background: rgba(255, 255, 255, 0.12); color: #c084fc; font-weight: 700; font-size: 10px; padding: 2px 6px; border-radius: 8px; white-space: nowrap; }
        .__af_vo_role_tag { background: rgba(56, 189, 248, 0.2); color: #38bdf8; font-weight: 700; font-size: 10px; padding: 2px 7px; border-radius: 8px; text-transform: uppercase; white-space: nowrap; }
        .__af_vo_caption { color: #f1f5f9; font-weight: 500; font-style: italic; max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .__af_vo_nav_btn { background: rgba(255, 255, 255, 0.12); border: 1px solid rgba(255, 255, 255, 0.2); color: #e2e8f0; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 12px; cursor: pointer; transition: all 0.15s; }
        .__af_vo_nav_btn:hover { background: rgba(168, 85, 247, 0.4); border-color: #a855f7; color: #fff; }
        .__af_vo_btn_exit { background: rgba(255, 255, 255, 0.12); border: 1px solid rgba(255, 255, 255, 0.2); color: #e2e8f0; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 14px; cursor: pointer; transition: all 0.15s; }
        .__af_vo_btn_exit:hover { background: rgba(239, 68, 68, 0.4); border-color: #ef4444; color: #fff; }
        .__af_vo_hint { color: #94a3b8; font-size: 10.5px; margin-left: 2px; white-space: nowrap; }
      </style>
      <span class="__af_vo_badge">🎙️ ${personaLabel} Mode</span>
      <span id="__af_vo_step_count__" class="__af_vo_step_badge">[0/${narrative.length}]</span>
      <span id="__af_vo_role_tag__" class="__af_vo_role_tag">PAGE</span>
      <button type="button" class="__af_vo_nav_btn" id="__af_vo_prev_btn__" title="Previous item (Left Arrow / Shift+Tab)">⏮</button>
      <button type="button" class="__af_vo_nav_btn" id="__af_vo_next_btn__" title="Next item (Right Arrow / Tab)">⏭</button>
      <span id="__af_vo_caption_text__" class="__af_vo_caption">Press ➔ to start VoiceOver reading flow...</span>
      <span class="__af_vo_hint">(➔/⬅ navigate, Tab controls, Esc exit)</span>
      <button type="button" class="__af_vo_btn_exit" id="__af_vo_exit_btn__">Exit ✕</button>
    `;

    document.body.appendChild(banner);

    let activeHighlightEl = null;
    let originalOutline = '';
    let originalOutlineOffset = '';

    function isFocusable(el) {
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      if (['button', 'select', 'textarea'].includes(tag)) return !el.disabled;
      if (tag === 'input') return el.type !== 'hidden' && !el.disabled;
      if (tag === 'a' && el.hasAttribute('href')) return true;
      if (el.hasAttribute('tabindex') && parseInt(el.getAttribute('tabindex'), 10) >= 0) return true;
      return false;
    }

    function playSimEarcon(type) {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        const now = ctx.currentTime;
        if (type === 'landmark') {
          osc.frequency.setValueAtTime(320, now);
          osc.frequency.exponentialRampToValueAtTime(640, now + 0.1);
        } else if (type === 'link') {
          osc.frequency.setValueAtTime(580, now);
          osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
        } else if (type === 'control') {
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.setValueAtTime(520, now + 0.05);
        } else if (type === 'barrier') {
          osc.frequency.setValueAtTime(220, now);
          osc.frequency.setValueAtTime(180, now + 0.08);
        } else {
          osc.frequency.setValueAtTime(380, now);
        }
        gain.gain.setValueAtTime(0.03, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } catch (e) {}
    }

    function moveToIndex(idx, shouldFocus = false) {
      if (narrative.length === 0) return;
      const clampedIdx = Math.max(0, Math.min(narrative.length - 1, idx));
      activeIndex = clampedIdx;
      const item = narrative[activeIndex];
      const el = item.element;

      // Format spoken announcement for persona
      let textToSpeak = item.voiceOverText || item.spokenText;
      if (persona === 'nvda') {
        textToSpeak = item.nvdaText || item.spokenText;
      } else if (persona === 'narrator') {
        textToSpeak = item.narratorText || item.spokenText;
      }

      // Update caption bar and badges
      const captionEl = document.getElementById('__af_vo_caption_text__');
      const stepCountEl = document.getElementById('__af_vo_step_count__');
      const roleTagEl = document.getElementById('__af_vo_role_tag__');

      if (captionEl) captionEl.textContent = `🗣️ "${textToSpeak}"`;
      if (stepCountEl) stepCountEl.textContent = `[${activeIndex + 1}/${narrative.length}]`;
      if (roleTagEl) roleTagEl.textContent = item.type.toUpperCase();

      // Highlight target with glowing purple focus ring
      if (activeHighlightEl && activeHighlightEl.style) {
        activeHighlightEl.style.outline = originalOutline;
        activeHighlightEl.style.outlineOffset = originalOutlineOffset;
      }
      activeHighlightEl = el;
      if (el && el.style) {
        originalOutline = el.style.outline;
        originalOutlineOffset = el.style.outlineOffset;
        el.style.outline = '3.5px solid #a855f7';
        el.style.outlineOffset = '3px';
      }

      // Smoothly scroll element into view if needed
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }

      // Audibly speak announcement
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.rate = 1.15;
        window.speechSynthesis.speak(utterance);
      }

      // Sound cue
      playSimEarcon(item.earcon || (item.isBarrier ? 'barrier' : 'text'));

      if (shouldFocus && el && typeof el.focus === 'function') {
        try { el.focus({ preventScroll: true }); } catch (e) {}
      }
    }

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        window.__auditforgeStopVoiceOverSimulator();
        return;
      }

      // Arrow navigation across ALL narrative elements (headings, text, controls)
      if (e.key === 'ArrowRight' || (e.altKey && e.key === 'ArrowRight')) {
        const isEditing = ['input', 'textarea'].includes(document.activeElement?.tagName?.toLowerCase());
        if (!isEditing || e.altKey || e.ctrlKey || e.metaKey) {
          e.preventDefault();
          moveToIndex(activeIndex + 1);
        }
        return;
      }

      if (e.key === 'ArrowLeft' || (e.altKey && e.key === 'ArrowLeft')) {
        const isEditing = ['input', 'textarea'].includes(document.activeElement?.tagName?.toLowerCase());
        if (!isEditing || e.altKey || e.ctrlKey || e.metaKey) {
          e.preventDefault();
          moveToIndex(activeIndex - 1);
        }
        return;
      }

      // Tab navigation between interactive controls
      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          // Find previous focusable control
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
          // Find next focusable control
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
      // Click on any perceptible element to jump VoiceOver cursor to it
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

    document.getElementById('__af_vo_prev_btn__')?.addEventListener('click', () => moveToIndex(activeIndex - 1));
    document.getElementById('__af_vo_next_btn__')?.addEventListener('click', () => moveToIndex(activeIndex + 1));
    document.getElementById('__af_vo_exit_btn__')?.addEventListener('click', () => window.__auditforgeStopVoiceOverSimulator());

    window.__auditforgeVoiceOverSimCleanup = () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('focusin', onFocusIn, true);
      if (activeHighlightEl && activeHighlightEl.style) {
        activeHighlightEl.style.outline = originalOutline;
        activeHighlightEl.style.outlineOffset = originalOutlineOffset;
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

    return { active: true, totalItems: narrative.length };
  };

  /**
   * Stops the Interactive In-Page VoiceOver Simulator and restores page DOM.
   */
  window.__auditforgeStopVoiceOverSimulator = function () {
    if (typeof window.__auditforgeVoiceOverSimCleanup === 'function') {
      window.__auditforgeVoiceOverSimCleanup();
      window.__auditforgeVoiceOverSimCleanup = null;
    }
    document.getElementById('__auditforge_vo_sim_banner__')?.remove();
    return { active: false };
  };

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
        <marker id="__af_arrow_normal__" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#009ED4" />
        </marker>
        <marker id="__af_arrow_warn__" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#f59e0b" />
        </marker>
        <filter id="__af_glow__" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#009ED4" flood-opacity="0.6"/>
        </filter>
      </defs>
    `;

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
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 10px 16px;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.6);
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 14px;
      pointer-events: auto;
      backdrop-filter: blur(8px);
    `;
    ctrlBar.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #009ED4; box-shadow: 0 0 8px #009ED4;"></span>
        <strong style="color: #fff; font-size: 13px;">Matt's Accessibility Tool — Tab Trail</strong>
        <span style="background: rgba(255,255,255,0.1); padding: 2px 7px; border-radius: 4px; font-size: 11px;">${lastTabOrderElements.length} Focusable Steps</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <button id="__af_tab_focus_first__" type="button" style="background: #1e293b; border: 1px solid #475569; color: #38bdf8; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 5px; cursor: pointer;">Focus #1</button>
        <button id="__af_tab_exit_btn__" type="button" style="background: #ef4444; border: none; color: #fff; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 5px; cursor: pointer;">✕ Exit (Esc)</button>
      </div>
    `;

    root.appendChild(svg);
    root.appendChild(badgesContainer);
    root.appendChild(ctrlBar);
    document.body.appendChild(root);

    function renderTrailGeometry() {
      const oldPaths = svg.querySelectorAll('path.__af_trail_path__');
      oldPaths.forEach(p => p.remove());
      badgesContainer.innerHTML = '';

      const scrollX = window.scrollX;
      const scrollY = window.scrollY;
      const coords = [];

      lastTabOrderElements.forEach((item, idx) => {
        const el = item.element;
        if (!el || !el.isConnected) return;

        // Resolve visible interactive target (handles visually hidden inputs and custom labels)
        const targetRes = typeof resolveVisualTarget === 'function' ? resolveVisualTarget(el) : { visualElement: el, rect: el.getBoundingClientRect() };
        const targetEl = item.visualElement || targetRes.visualElement || el;
        const r = targetRes.rect || targetEl.getBoundingClientRect();

        // Safety clamp so badges and connector lines never fly off-screen
        const pageX = Math.max(16, (r.left >= 0 ? r.left : 16) + scrollX);
        const pageY = Math.max(16, (r.top >= 0 ? r.top : 16) + scrollY);
        const centerX = pageX + Math.max(10, (r.width > 0 ? r.width / 2 : 12));
        const centerY = pageY + Math.max(10, (r.height > 0 ? r.height / 2 : 12));

        coords.push({ x: centerX, y: centerY, top: pageY, left: pageX, item, el, targetEl, step: idx + 1 });

        const badge = document.createElement('div');
        const isWarn = item.tabIndex > 0;
        const isRadioGroup = !!item.isRadioGroupLeader;
        const bg = isWarn ? '#f59e0b' : (isRadioGroup ? '#8b5cf6' : '#009ED4');
        const glow = isWarn
          ? 'rgba(245,158,11,0.8)'
          : (isRadioGroup ? 'rgba(139,92,246,0.8)' : 'rgba(0,158,212,0.8)');

        badge.style.cssText = `
          position: absolute;
          top: ${pageY - 10}px;
          left: ${pageX - 10}px;
          background: ${bg};
          color: #ffffff;
          font-weight: 800;
          font-size: 11px;
          line-height: 20px;
          height: 20px;
          min-width: 20px;
          padding: 0 5px;
          text-align: center;
          border-radius: 10px;
          box-shadow: 0 0 10px ${glow};
          pointer-events: auto;
          cursor: pointer;
          z-index: 2147483646;
          user-select: none;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 3px;
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
      });

      for (let i = 0; i < coords.length - 1; i++) {
        const p1 = coords[i];
        const p2 = coords[i + 1];
        const isWarn = p2.item.tabIndex > 0;
        const isRadioGroup = !!p2.item.isRadioGroupLeader;
        const color = isWarn ? '#f59e0b' : (isRadioGroup ? '#a78bfa' : '#009ED4');
        const marker = isWarn ? 'url(#__af_arrow_warn__)' : 'url(#__af_arrow_normal__)';

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const cx = (p1.x + p2.x) / 2 - dy * 0.12;
        const cy = (p1.y + p2.y) / 2 + dx * 0.12;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.classList.add('__af_trail_path__');
        path.setAttribute('d', `M ${p1.x} ${p1.y} Q ${cx} ${cy} ${p2.x} ${p2.y}`);
        path.setAttribute('stroke', color);
        path.setAttribute('stroke-width', '2.5');
        path.setAttribute('stroke-dasharray', isWarn ? '5,3' : (isRadioGroup ? '6,3' : '6,4'));
        path.setAttribute('fill', 'none');
        path.setAttribute('opacity', '0.85');
        path.setAttribute('marker-end', marker);
        svg.appendChild(path);
      }
    }

    renderTrailGeometry();

    let resizeTimer = null;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const h = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, window.innerHeight);
        const w = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, window.innerWidth);
        svg.style.width = `${w}px`;
        svg.style.height = `${h}px`;
        renderTrailGeometry();
      }, 150);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        window.__auditforgeToggleTabTrail(false);
      }
    };

    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('keydown', onKeyDown, true);

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
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown, true);
    };

    return { active: true, totalSteps: lastTabOrderElements.length };
  };

  /**
   * Applies mathematically accurate Color Vision Deficiency (CVD) SVG filter matrix to the page.
   * Supports Protanopia, Deuteranopia, Tritanopia, and Achromatopsia.
   * @param {'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia'} filterType
   * @returns {{ active: boolean, filter: string }}
   */
  window.__auditforgeSetColorFilter = function (filterType) {
    const FILTER_ID_MAP = {
      protanopia: '__af_cvd_protanopia__',
      deuteranopia: '__af_cvd_deuteranopia__',
      tritanopia: '__af_cvd_tritanopia__',
      achromatopsia: '__af_cvd_achromatopsia__',
    };

    const LABELS = {
      protanopia: 'Protanopia (Red-Blind)',
      deuteranopia: 'Deuteranopia (Green-Blind)',
      tritanopia: 'Tritanopia (Blue-Blind)',
      achromatopsia: 'Achromatopsia (Monochrome)',
    };

    document.getElementById('__af_cvd_indicator__')?.remove();

    if (!filterType || filterType === 'none' || !FILTER_ID_MAP[filterType]) {
      document.documentElement.style.removeProperty('filter');
      return { active: false, filter: 'none' };
    }

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
      document.documentElement.appendChild(defsSvg);
    }

    const filterId = FILTER_ID_MAP[filterType];
    document.documentElement.style.setProperty('filter', `url(#${filterId})`, 'important');

    const pill = document.createElement('div');
    pill.id = '__af_cvd_indicator__';
    pill.style.cssText = `
      position: fixed;
      bottom: 16px;
      left: 16px;
      z-index: 2147483647;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 999px;
      padding: 6px 14px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      color: #f8fafc;
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
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
        <span><strong>Color Vision Lens:</strong> ${LABELS[filterType] || filterType}</span>
      </span>
      <button id="__af_cvd_reset_btn__" type="button" style="background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.2); color: #fff; font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 12px; cursor: pointer;">Reset Normal</button>
    `;

    pill.querySelector('#__af_cvd_reset_btn__')?.addEventListener('click', () => {
      window.__auditforgeSetColorFilter('none');
    });

    document.body.appendChild(pill);

    return { active: true, filter: filterType };
  };
})();
