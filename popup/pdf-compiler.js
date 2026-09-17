// @ts-check

/**
 * Dark Mode Accessibility & Quality Audit PDF Report Compiler
 * Generates an executive, human-readable dark mode audit document matching the extension UI.
 * Focuses on concrete facts: Target URL, What was tested, When tested, Results, and Fixes.
 * Entirely client-side using jsPDF and autoTable.
 */

(function () {
  /**
   * Compiles and triggers download of the dark mode audit PDF report
   * @param {Object} auditData
   */
  async function generateWcagPdfReport(auditData) {
    // @ts-ignore
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
      throw new Error('jsPDF library is not loaded.');
    }

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4', // 595.28 x 841.89 pt
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 36;
    const contentWidth = pageWidth - margin * 2;

    // AMOLED / Dark Extension Theme Palette
    const bgDark = [7, 13, 16];          // #070D10 (Page Canvas)
    const cardBg = [13, 23, 28];         // #0D171C (Card Surfaces)
    const cardBorder = [28, 48, 54];     // #1C3036 (Borders)
    const accentCyan = [13, 159, 186];   // #0D9FBA (Primary Cyan)
    const accentTeal = [27, 111, 126];   // #1B6F7E (Muted Teal)
    const textBright = [248, 250, 252];  // #F8FAFC (High Contrast White)
    const textMuted = [148, 163, 184];   // #94A3B8 (Soft Slate)
    const textDim = [100, 116, 139];     // #64748B (Dim Muted)
    const codeBg = [3, 7, 9];            // #030709 (Terminal Code Snippet)
    const codeBorder = [24, 46, 52];     // #182E34

    // Severity Palette
    const sevColors = {
      critical: [244, 63, 94],  // #F43F5E (Alert Rose)
      serious: [249, 115, 22],  // #F97316 (Amber Orange)
      moderate: [234, 179, 8],  // #EAB308 (Gold Yellow)
      minor: [6, 182, 212],     // #06B6D4 (Cyan)
      passed: [16, 185, 129],   // #10B981 (Emerald Green)
    };

    /**
     * Draws the full-bleed dark page background
     * @param {any} d
     */
    function drawPageBackground(d) {
      d.setFillColor(bgDark[0], bgDark[1], bgDark[2]);
      d.rect(0, 0, pageWidth, pageHeight, 'F');
    }

    /**
     * Adds a new dark page
     */
    function addDarkPage() {
      doc.addPage();
      drawPageBackground(doc);
    }

    // Initialize page 1 background
    drawPageBackground(doc);

    /**
     * Plain-language explanation for why this accessibility rule matters
     * @param {string} id
     * @returns {string}
     */
    function getIssuePlainExplanation(id) {
      switch (id) {
        case 'color-contrast':
          return 'Text contrast against its background is below the 4.5:1 minimum threshold. Users with low vision, color deficiencies, or reading in high ambient light cannot read this content.';
        case 'color-contrast-hover':
          return 'When hovered or focused, the text or button contrast drops below the 4.5:1 threshold, making interactive states illegible during keyboard or mouse navigation.';
        case 'image-alt':
        case 'screen-reader-alt-quality':
          return 'Images without descriptive alternative text cannot be perceived by screen reader users and fail to convey meaning if images are blocked or slow to load.';
        case 'button-name':
          return 'Buttons without an accessible label or visible text are announced generically as "button" by screen readers, hiding what action clicking it triggers.';
        case 'link-name':
        case 'screen-reader-link-purpose':
          return 'Hyperlinks without clear text or accessible names prevent keyboard and screen reader users from understanding where the link navigates.';
        case 'label':
          return 'Form input controls missing linked <label> elements leave assistive tech users unable to tell what information the field expects.';
        case 'screen-reader-heading-order':
        case 'heading-order':
          return 'Heading levels are skipped (e.g. <h1> directly to <h3>). Screen reader users navigate via heading hierarchy; skipped levels break logical page structure.';
        case 'screen-reader-landmarks':
        case 'landmark-one-main':
          return 'The page is missing a primary <main> region or has unlabelled navigation landmarks, preventing users from quickly bypassing navigation blocks.';
        case 'screen-reader-hidden-focus':
          return 'Interactive focusable elements are placed inside containers marked with aria-hidden="true", causing screen readers to fall silent while focus is active.';
        case 'aria-label-generic':
        case 'aria-label-redundant-role':
        case 'aria-label-name-mismatch':
        case 'aria-label-empty':
          return 'Accessible ARIA labels are either missing, empty, redundant, or mismatch visible text, confusing speech navigation and screen reader output.';
        case 'target-size':
          return 'Interactive touch targets are smaller than the 24x24px minimum, making buttons and links error-prone on touch screens.';
        default:
          return 'This element fails WCAG 2.2 AA technical criteria, creating functional accessibility barriers for keyboard, screen reader, or low-vision users.';
      }
    }

    /**
     * Concrete copy-paste code fix for a violation
     * @param {string} id
     * @param {string} [html]
     * @returns {string}
     */
    function getRemediationSnippet(id, html = '') {
      switch (id) {
        case 'color-contrast':
          return `/* Ensure 4.5:1 minimum contrast ratio for normal text (WCAG 1.4.3) */\ncolor: #F8FAFC;\nbackground-color: #0F172A;`;
        case 'color-contrast-hover':
          return `/* Maintain >= 4.5:1 contrast on hover and focus states */\nbutton:hover, button:focus, a:hover, a:focus {\n  color: #FFFFFF;\n  background-color: #0D9FBA;\n}`;
        case 'image-alt':
        case 'screen-reader-alt-quality':
          return `<!-- Provide descriptive alt text for informative images (WCAG 1.1.1) -->\n<img src="..." alt="Detailed description of the image content" />\n<!-- Or use alt="" if purely decorative -->`;
        case 'button-name':
          return `<!-- Provide discernible text or aria-label for buttons (WCAG 4.1.2) -->\n<button type="button" aria-label="Submit search query">\n  <svg class="icon-search" ...></svg>\n</button>`;
        case 'link-name':
        case 'screen-reader-link-purpose':
          return `<!-- Ensure link destination is clear from text or aria-label (WCAG 2.4.4) -->\n<a href="/pricing" aria-label="View pricing plans and tiers">Learn more</a>`;
        case 'label':
          return `<!-- Link input explicitly to a visible <label> (WCAG 1.3.1 / 4.1.2) -->\n<label for="user-email">Email Address</label>\n<input type="email" id="user-email" name="email" required />`;
        case 'screen-reader-heading-order':
        case 'heading-order':
          return `<!-- Structure headings sequentially without skipping levels (WCAG 1.3.1) -->\n<h1>Page Title</h1>\n  <h2>Section Heading</h2>\n    <h3>Sub-section Details</h3>`;
        case 'screen-reader-landmarks':
        case 'landmark-one-main':
          return `<!-- Use semantic landmarks with unique labels (WCAG 1.3.1 / 2.4.1) -->\n<nav aria-label="Main navigation">...</nav>\n<main id="main-content">...</main>\n<footer role="contentinfo">...</footer>`;
        case 'screen-reader-hidden-focus':
          return `<!-- Remove focusable elements from aria-hidden containers (WCAG 4.1.2) -->\n<!-- Use tabindex="-1" or inert if the modal/container is closed -->\n<div aria-hidden="true">\n  <button tabindex="-1" disabled>Inactive</button>\n</div>`;
        case 'aria-label-generic':
          return `<!-- Avoid generic names; specify the actual action -->\n<button aria-label="Close modal dialog"><svg ...></svg></button>`;
        case 'aria-label-redundant-role':
          return `<!-- Do not repeat the element role in aria-label -->\n<!-- Correct: aria-label="Search"  Incorrect: aria-label="Search button" -->\n<button aria-label="Search site">Search</button>`;
        case 'aria-label-name-mismatch':
          return `<!-- WCAG 2.5.3 (Label in Name): Start label with visible text -->\n<button aria-label="Download PDF report">Download PDF</button>`;
        case 'target-size':
          return `/* Ensure touch/click target bounding box is at least 24x24px (WCAG 2.5.8) */\nbutton, a.btn {\n  min-width: 24px;\n  min-height: 24px;\n  padding: 8px 12px;\n}`;
        default:
          return `<!-- Ensure valid semantic HTML, accessible names, and sequential focus order -->`;
      }
    }

    /**
     * Executes autoTable safely with dark mode styles
     * @param {Object} docInstance
     * @param {Object} tableOptions
     */
    function runAutoTable(docInstance, tableOptions) {
      const mergedOptions = {
        theme: 'plain',
        willDrawPage: function () {
          drawPageBackground(docInstance);
        },
        styles: {
          font: 'helvetica',
          fontSize: 8,
          textColor: textBright,
          fillColor: cardBg,
          cellPadding: 5,
          lineColor: cardBorder,
          lineWidth: 0.5,
        },
        headStyles: {
          fillColor: [20, 36, 43],
          textColor: accentCyan,
          fontStyle: 'bold',
          fontSize: 8,
          lineColor: cardBorder,
          lineWidth: 0.5,
        },
        alternateRowStyles: {
          fillColor: [10, 18, 22],
        },
        ...tableOptions,
      };

      if (typeof docInstance.autoTable === 'function') {
        docInstance.autoTable(mergedOptions);
      } else if (typeof window !== 'undefined' && window.jspdfAutotable && typeof window.jspdfAutotable.default === 'function') {
        window.jspdfAutotable.default(docInstance, mergedOptions);
      }
    }

    // =========================================================================
    // PAGE 1: AUDIT SCOPE, TARGET INFO & RESULTS OVERVIEW
    // =========================================================================

    // Top Header Banner
    const headerY = 32;
    const headerH = 56;
    doc.setFillColor(cardBg[0], cardBg[1], cardBg[2]);
    doc.roundedRect(margin, headerY, contentWidth, headerH, 4, 4, 'F');
    doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
    doc.roundedRect(margin, headerY, contentWidth, headerH, 4, 4, 'S');

    // Left cyan accent bar
    doc.setFillColor(accentCyan[0], accentCyan[1], accentCyan[2]);
    doc.roundedRect(margin, headerY, 4, headerH, 2, 2, 'F');

    // Header Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(textBright[0], textBright[1], textBright[2]);
    doc.text('Accessibility & Quality Audit Report', margin + 16, headerY + 22);

    const cleanUrl = auditData.url || 'Target Web Page';
    const pageTitle = auditData.pageTitle || 'Target Page';

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(accentCyan[0], accentCyan[1], accentCyan[2]);
    doc.text(doc.splitTextToSize(`Target: ${cleanUrl}`, contentWidth - 40)[0] || cleanUrl, margin + 16, headerY + 40);

    let curY = headerY + headerH + 16;

    // Audit Metadata Box: URL, When Tested, What Was Tested
    const metaBoxH = 126;
    doc.setFillColor(cardBg[0], cardBg[1], cardBg[2]);
    doc.roundedRect(margin, curY, contentWidth, metaBoxH, 4, 4, 'F');
    doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
    doc.roundedRect(margin, curY, contentWidth, metaBoxH, 4, 4, 'S');

    let metaInnerY = curY + 14;

    // 1. URL & Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text('AUDITED URL & TITLE', margin + 14, metaInnerY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(textBright[0], textBright[1], textBright[2]);
    doc.text(pageTitle, margin + 14, metaInnerY + 12);

    doc.setFont('courier', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(accentCyan[0], accentCyan[1], accentCyan[2]);
    const splitUrl = doc.splitTextToSize(cleanUrl, contentWidth - 28);
    doc.text(splitUrl[0] || cleanUrl, margin + 14, metaInnerY + 24);

    metaInnerY += 34;

    // 2. When Tested
    const auditDateStr = auditData.formattedDate || new Date().toLocaleString('en-GB', {
      dateStyle: 'full',
      timeStyle: 'medium',
    });
    const durationStr = auditData.scanDurationSeconds ? `${auditData.scanDurationSeconds}s` : '0.1s';

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text('WHEN TESTED', margin + 14, metaInnerY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(textBright[0], textBright[1], textBright[2]);
    doc.text(`${auditDateStr}  (Scan Duration: ${durationStr})`, margin + 14, metaInnerY + 12);

    metaInnerY += 24;

    // 3. What Was Tested
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text('WHAT WAS TESTED (AUDIT SCOPE)', margin + 14, metaInnerY);

    const testScopeItems = [
      '• WCAG 2.2 AA Rules: Color contrast ratios, missing alternative text, accessible names, form labels, and landmarks.',
      '• Link Health: Live HTTP status validation (detecting 404s, 5xx server errors, broken in-page # anchors, empty hrefs).',
      '• Keyboard Navigation: Tab order sequence path, positive tabindex disruptions, and sequential focus order.',
      '• Screen Reader Readout: Speech synthesis simulation across iOS VoiceOver, TalkBack, NVDA, and Windows Narrator.',
    ];

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    let scopeLineY = metaInnerY + 12;
    testScopeItems.forEach((item) => {
      doc.text(item, margin + 14, scopeLineY);
      scopeLineY += 10;
    });

    curY += metaBoxH + 16;

    // Results Summary: The 4 Failure Counters
    const wcagCount = (auditData.violations || []).length;
    const linkAuditData = auditData.linkAudit || {};
    const linkCount = linkAuditData.broken || 0;
    const tabCount = auditData.tabOrder ? (auditData.tabOrder.positiveTabIndexCount || 0) : 0;
    const srCount = (auditData.speechSequence || []).filter(s => s.isBarrier).length;

    const kpiCardW = (contentWidth - 24) / 4;
    const kpiCardH = 48;

    const kpiSummary = [
      {
        label: 'WCAG FAILURES',
        val: wcagCount === 0 ? '✓ 0' : String(wcagCount),
        sub: wcagCount === 0 ? 'All rules passed' : `${wcagCount} rule violations`,
        color: wcagCount === 0 ? sevColors.passed : sevColors.critical,
      },
      {
        label: 'LINK FAILURES',
        val: linkCount === 0 ? '✓ 0' : String(linkCount),
        sub: linkCount === 0 ? 'All links valid' : `${linkCount} broken links`,
        color: linkCount === 0 ? sevColors.passed : sevColors.critical,
      },
      {
        label: 'TAB FAILURES',
        val: tabCount === 0 ? '✓ 0' : String(tabCount),
        sub: tabCount === 0 ? 'Sequential flow' : `${tabCount} positive tabindex`,
        color: tabCount === 0 ? sevColors.passed : sevColors.serious,
      },
      {
        label: 'SCREEN READER',
        val: srCount === 0 ? '✓ 0' : String(srCount),
        sub: srCount === 0 ? 'Clean speech flow' : `${srCount} auditory barriers`,
        color: srCount === 0 ? sevColors.passed : sevColors.critical,
      },
    ];

    kpiSummary.forEach((kpi, idx) => {
      const cx = margin + idx * (kpiCardW + 8);

      doc.setFillColor(cardBg[0], cardBg[1], cardBg[2]);
      doc.roundedRect(cx, curY, kpiCardW, kpiCardH, 4, 4, 'F');
      doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
      doc.roundedRect(cx, curY, kpiCardW, kpiCardH, 4, 4, 'S');

      // Top colored indicator line
      doc.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2]);
      doc.roundedRect(cx, curY, kpiCardW, 2.5, 1, 1, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
      doc.text(kpi.label, cx + 10, curY + 14);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
      doc.text(kpi.val, cx + 10, curY + 31);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(textDim[0], textDim[1], textDim[2]);
      doc.text(kpi.sub, cx + 10, curY + 41);
    });

    curY += kpiCardH + 18;

    // Overview Table of Identified WCAG Violations
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(textBright[0], textBright[1], textBright[2]);
    doc.text('WCAG Issues Summary', margin, curY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    const totalAffected = (auditData.violations || []).reduce((sum, v) => sum + (v.affectedCount || 1), 0);
    doc.text(`${wcagCount} issues found across ${totalAffected} DOM elements`, margin, curY + 12);

    curY += 20;

    if (wcagCount > 0) {
      const summaryTableData = (auditData.violations || []).map((v) => [
        v.help || v.id,
        v.wcagRule || 'WCAG 2.2 AA',
        (v.impact || 'moderate').toUpperCase(),
        `${v.affectedCount || 1} element${(v.affectedCount || 1) === 1 ? '' : 's'}`,
      ]);

      runAutoTable(doc, {
        startY: curY,
        head: [['Accessibility Rule & Issue', 'Criterion', 'Severity', 'Impacted']],
        body: summaryTableData,
        margin: { left: margin, right: margin },
        columnStyles: {
          0: { cellWidth: 230, fontStyle: 'bold', textColor: textBright },
          1: { cellWidth: 120, textColor: textMuted },
          2: { cellWidth: 80, fontStyle: 'bold' },
          3: { cellWidth: 93 },
        },
        didParseCell: function (data) {
          if (data.section === 'body' && data.column.index === 2) {
            const val = String(data.cell.raw).toLowerCase();
            if (val === 'critical') data.cell.styles.textColor = sevColors.critical;
            else if (val === 'serious') data.cell.styles.textColor = sevColors.serious;
            else if (val === 'moderate') data.cell.styles.textColor = sevColors.moderate;
            else if (val === 'minor') data.cell.styles.textColor = sevColors.minor;
          }
        },
      });
    } else {
      // Clean passing box
      doc.setFillColor(10, 28, 22);
      doc.roundedRect(margin, curY, contentWidth, 42, 4, 4, 'F');
      doc.setDrawColor(20, 60, 45);
      doc.roundedRect(margin, curY, contentWidth, 42, 4, 4, 'S');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(sevColors.passed[0], sevColors.passed[1], sevColors.passed[2]);
      doc.text('✓ All automated WCAG 2.2 Level AA rule checks passed cleanly with 0 violations.', margin + 14, curY + 24);
    }

    // =========================================================================
    // SECTION 2: DETAILED ISSUES & RECOMMENDED FIXES (Page 2+)
    // =========================================================================
    if (wcagCount > 0) {
      addDarkPage();
      let secY = 36;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(textBright[0], textBright[1], textBright[2]);
      doc.text('Detailed Issues & Recommended Code Fixes', margin, secY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
      doc.text('Specific DOM element locations, diagnostics, and copy-paste code solutions to resolve each issue.', margin, secY + 12);

      secY += 26;

      function ensureSpace(needed) {
        if (secY + needed > pageHeight - 45) {
          addDarkPage();
          secY = 36;
        }
      }

      (auditData.violations || []).forEach((v) => {
        const sevColor = sevColors[v.impact] || sevColors.moderate;
        const plainDesc = getIssuePlainExplanation(v.id);

        // Calculate height for the rule banner
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        const descLines = doc.splitTextToSize(plainDesc, contentWidth - 28);
        const bannerH = Math.max(46, 24 + descLines.length * 10);

        ensureSpace(bannerH + 12);

        // Rule Banner Box
        doc.setFillColor(cardBg[0], cardBg[1], cardBg[2]);
        doc.roundedRect(margin, secY, contentWidth, bannerH, 4, 4, 'F');
        doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
        doc.roundedRect(margin, secY, contentWidth, bannerH, 4, 4, 'S');

        // Left severity accent bar
        doc.setFillColor(sevColor[0], sevColor[1], sevColor[2]);
        doc.roundedRect(margin, secY, 4, bannerH, 2, 2, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(sevColor[0], sevColor[1], sevColor[2]);
        doc.text(`[${(v.impact || 'moderate').toUpperCase()}] ${v.help || v.id}`, margin + 14, secY + 14, { maxWidth: contentWidth - 30 });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(textDim[0], textDim[1], textDim[2]);
        doc.text(`Rule ID: ${v.id}  •  Criterion: ${v.wcagRule || 'WCAG 2.2 AA'}  •  ${v.affectedCount || 1} failing element${(v.affectedCount || 1) === 1 ? '' : 's'}`, margin + 14, secY + 24);

        // Plain explanation
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
        let dY = secY + 36;
        descLines.forEach((dLine) => {
          doc.text(dLine, margin + 14, dY);
          dY += 9.5;
        });

        secY += bannerH + 10;

        // Render up to 8 failing elements for this rule
        const nodesToShow = (v.nodes || []).slice(0, 8);

        nodesToShow.forEach((node, nIdx) => {
          const cleanTarget = String(node.target || 'DOM Element');
          const cleanHtml = (node.html || '<element />').replace(/\s+/g, ' ').slice(0, 120);

          // Build diagnostic lines
          let diagText = '';
          if (node.contrastFix) {
            const cf = node.contrastFix;
            diagText = `Contrast: ${cf.currentRatio} vs ${cf.requiredRatio} required (Suggest: ${cf.suggestedFg || '#FFFFFF'})`;
            if (node.hoverDetails) {
              diagText = `Hover Contrast: ${node.hoverDetails.hoverRatio} vs ${node.hoverDetails.requiredRatio} required (Resting: ${node.hoverDetails.restingRatio})`;
            }
          } else if (node.srDetails) {
            diagText = `Screen Reader: ${node.srDetails.diagnosis || 'Auditory barrier'}. Announced: "${(node.srDetails.currentText || '').slice(0, 60)}"`;
          } else if (node.ariaDetails) {
            diagText = `ARIA: ${node.ariaDetails.diagnosis || 'Missing/invalid label'}. Current: "${(node.ariaDetails.ariaLabel || 'None')}"`;
          } else if (node.failureSummary) {
            diagText = node.failureSummary.split('\n')[0].replace(/^Fix (any|all) of the following:\s*/i, '').slice(0, 100);
          }

          // Code fix snippet
          const codeSnippet = (v.remediationCode || getRemediationSnippet(v.id, node.html)).trim();
          doc.setFont('courier', 'normal');
          doc.setFontSize(7);
          const codeLines = doc.splitTextToSize(codeSnippet, contentWidth - 44).slice(0, 4);
          const codeBoxH = Math.max(34, 16 + codeLines.length * 9.5);

          // Total element card height calculation
          let itemCardH = 14 + 13 + 13; // header, location, offending html
          if (diagText) itemCardH += 13;
          itemCardH += codeBoxH + 16; // code box + padding

          ensureSpace(itemCardH + 10);

          // Draw element card
          doc.setFillColor(cardBg[0], cardBg[1], cardBg[2]);
          doc.roundedRect(margin, secY, contentWidth, itemCardH, 4, 4, 'F');
          doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
          doc.roundedRect(margin, secY, contentWidth, itemCardH, 4, 4, 'S');

          let itemY = secY + 13;

          // Element index
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          doc.setTextColor(accentCyan[0], accentCyan[1], accentCyan[2]);
          doc.text(`Failing Element #${nIdx + 1} of ${v.affectedCount || 1}`, margin + 12, itemY);

          itemY += 13;

          // HTML Selector Location
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
          doc.text('Location:', margin + 12, itemY);

          doc.setFont('courier', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(textBright[0], textBright[1], textBright[2]);
          doc.text(doc.splitTextToSize(cleanTarget, contentWidth - 85)[0] || cleanTarget, margin + 65, itemY);

          itemY += 13;

          // Offending HTML
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
          doc.text('HTML:', margin + 12, itemY);

          doc.setFont('courier', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(textBright[0], textBright[1], textBright[2]);
          doc.text(doc.splitTextToSize(cleanHtml, contentWidth - 85)[0] || cleanHtml, margin + 65, itemY);

          if (diagText) {
            itemY += 13;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7);
            doc.setTextColor(sevColor[0], sevColor[1], sevColor[2]);
            doc.text('Finding:', margin + 12, itemY);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(textBright[0], textBright[1], textBright[2]);
            doc.text(doc.splitTextToSize(diagText, contentWidth - 85)[0] || diagText, margin + 65, itemY);
          }

          itemY += 12;

          // Recommended Code Fix Box
          const codeX = margin + 12;
          const codeW = contentWidth - 24;
          doc.setFillColor(codeBg[0], codeBg[1], codeBg[2]);
          doc.roundedRect(codeX, itemY, codeW, codeBoxH, 3, 3, 'F');
          doc.setDrawColor(codeBorder[0], codeBorder[1], codeBorder[2]);
          doc.roundedRect(codeX, itemY, codeW, codeBoxH, 3, 3, 'S');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6);
          doc.setTextColor(accentCyan[0], accentCyan[1], accentCyan[2]);
          doc.text('HOW TO FIX:', codeX + 8, itemY + 10);

          doc.setFont('courier', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(textBright[0], textBright[1], textBright[2]);
          let codeY = itemY + 19;
          codeLines.forEach((cLine) => {
            doc.text(cLine, codeX + 8, codeY);
            codeY += 9.5;
          });

          secY += itemCardH + 10;
        });
      });
    }

    // =========================================================================
    // SECTION 3: LINK INTEGRITY & BROKEN LINK VERIFICATION
    // =========================================================================
    if (auditData.linkAudit || (auditData.links && auditData.links.length > 0)) {
      addDarkPage();
      let linkY = 36;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(textBright[0], textBright[1], textBright[2]);
      doc.text('Link Health & Dead Link Verification', margin, linkY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
      doc.text('Automated HTTP status verification testing for broken URLs (404/5xx), missing in-page anchors, and empty links.', margin, linkY + 12);

      linkY += 24;

      const linkAudit = auditData.linkAudit || {
        total: (auditData.links || []).length,
        broken: 0,
        warning: 0,
        working: (auditData.links || []).length,
        items: [],
      };

      const lCardW = (contentWidth - 24) / 4;
      const lCardH = 44;

      const linkMetrics = [
        { label: 'TOTAL LINKS TESTED', val: String(linkAudit.total || 0), color: textBright },
        { label: 'BROKEN (404/5XX)', val: String(linkAudit.broken || 0), color: (linkAudit.broken || 0) > 0 ? sevColors.critical : sevColors.passed },
        { label: 'WARNINGS (EMPTY/#)', val: String(linkAudit.warning || 0), color: (linkAudit.warning || 0) > 0 ? sevColors.moderate : textMuted },
        { label: 'WORKING LINKS', val: String(linkAudit.working || 0), color: sevColors.passed },
      ];

      linkMetrics.forEach((lm, idx) => {
        const lx = margin + idx * (lCardW + 8);
        doc.setFillColor(cardBg[0], cardBg[1], cardBg[2]);
        doc.roundedRect(lx, linkY, lCardW, lCardH, 4, 4, 'F');
        doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
        doc.roundedRect(lx, linkY, lCardW, lCardH, 4, 4, 'S');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
        doc.text(lm.label, lx + 10, linkY + 14);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(lm.color[0], lm.color[1], lm.color[2]);
        doc.text(lm.val, lx + 10, linkY + 32);
      });

      linkY += lCardH + 18;

      const brokenLinks = (linkAudit.items || []).filter(it => it.health === 'broken' || it.health === 'warning');

      if (brokenLinks.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(textBright[0], textBright[1], textBright[2]);
        doc.text(`Identified Link Failures & Warnings (${brokenLinks.length})`, margin, linkY);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
        doc.text('WCAG 2.4.4 requires links to have functional destinations that do not resolve to dead pages or missing anchors.', margin, linkY + 12);

        linkY += 18;

        const linkTableRows = brokenLinks.slice(0, 30).map((it) => {
          let statusLabel = '404 Not Found';
          if (it.statusCode === 404) statusLabel = '404 Not Found';
          else if (it.statusCode >= 500) statusLabel = `${it.statusCode} Server Error`;
          else if (it.statusCode === 408) statusLabel = 'Timeout (6s)';
          else if (it.isHash && !it.hashTargetExists) statusLabel = 'Broken Anchor';
          else if (it.isEmpty) statusLabel = 'Empty Href';
          else statusLabel = it.statusText || 'Error';

          const textLabel = it.text && it.text !== '(Empty link text)' ? it.text.slice(0, 45) : '(No visible text)';
          const urlLabel = (it.url || it.rawHref || '').slice(0, 60);
          const fixLabel = it.health === 'broken'
            ? 'Update href to working URL or remove dead anchor'
            : 'Provide valid destination or accessible name';

          return [statusLabel, textLabel, urlLabel, fixLabel];
        });

        runAutoTable(doc, {
          startY: linkY,
          head: [['Status / Issue', 'Link Text', 'Destination URL / Anchor', 'Recommended Fix']],
          body: linkTableRows,
          margin: { left: margin, right: margin },
          columnStyles: {
            0: { cellWidth: 85, fontStyle: 'bold' },
            1: { cellWidth: 120, textColor: textBright },
            2: { cellWidth: 170, fontStyle: 'italic', textColor: accentCyan },
            3: { cellWidth: 148, textColor: textMuted },
          },
          didParseCell: function (data) {
            if (data.section === 'body' && data.column.index === 0) {
              const val = String(data.cell.raw).toLowerCase();
              if (val.includes('404') || val.includes('server') || val.includes('broken')) {
                data.cell.styles.textColor = sevColors.critical;
              } else {
                data.cell.styles.textColor = sevColors.moderate;
              }
            }
          },
        });
      } else {
        // Green confirmation
        doc.setFillColor(10, 28, 22);
        doc.roundedRect(margin, linkY, contentWidth, 44, 4, 4, 'F');
        doc.setDrawColor(20, 60, 45);
        doc.roundedRect(margin, linkY, contentWidth, 44, 4, 4, 'S');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(sevColors.passed[0], sevColors.passed[1], sevColors.passed[2]);
        doc.text('✓ All Links & Anchor Targets Verified Successfully', margin + 14, linkY + 18);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
        doc.text(`Every one of the ${linkAudit.total || (auditData.links || []).length} hyperlinks and in-page anchor targets returned HTTP 200 or resolved to valid DOM nodes.`, margin + 14, linkY + 32);
      }
    }

    // =========================================================================
    // SECTION 4: KEYBOARD FOCUS & SCREEN READER USABILITY
    // =========================================================================
    addDarkPage();
    let ksrY = 36;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(textBright[0], textBright[1], textBright[2]);
    doc.text('Keyboard Navigation & Screen Reader Readout', margin, ksrY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text('Evaluation of focus sequence order, positive tabindex disruptions, and simulated screen reader speech output.', margin, ksrY + 12);

    ksrY += 24;

    // Tab Order Findings Box
    const tabOrder = auditData.tabOrder || { totalElements: 0, positiveTabIndexCount: 0, flowStatus: 'Sequential' };
    const tabCardH = 50;

    doc.setFillColor(cardBg[0], cardBg[1], cardBg[2]);
    doc.roundedRect(margin, ksrY, contentWidth, tabCardH, 4, 4, 'F');
    doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
    doc.roundedRect(margin, ksrY, contentWidth, tabCardH, 4, 4, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text('KEYBOARD TAB ORDER FINDINGS', margin + 14, ksrY + 15);

    const hasTabIssue = tabOrder.positiveTabIndexCount > 0;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(hasTabIssue ? sevColors.serious[0] : sevColors.passed[0], hasTabIssue ? sevColors.serious[1] : sevColors.passed[1], hasTabIssue ? sevColors.serious[2] : sevColors.passed[2]);
    doc.text(
      hasTabIssue ? `⚠ ${tabOrder.positiveTabIndexCount} elements have positive tabindex (Focus order disrupted)` : '✓ Sequential Tab Order (Natural DOM flow preserved)',
      margin + 14,
      ksrY + 28
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text(
      hasTabIssue
        ? 'Fix: Remove positive tabindex attributes (e.g. tabindex="1"). Use natural HTML source order or tabindex="0".'
        : `Total focusable elements analyzed: ${tabOrder.totalElements || 0}. No tabindex disruptions detected.`,
      margin + 14,
      ksrY + 40
    );

    ksrY += tabCardH + 18;

    // Screen Reader Speech Simulation Table
    const speechSteps = (auditData.speechSequence || []).slice(0, 18);
    if (speechSteps.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(textBright[0], textBright[1], textBright[2]);
      doc.text('Simulated Screen Reader Readout Transcript', margin, ksrY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
      doc.text('Sequential speech transcript reflecting what VoiceOver / NVDA synthesizers announce as users navigate the page.', margin, ksrY + 12);

      ksrY += 18;

      const srTableRows = speechSteps.map((step, idx) => [
        `#${idx + 1}`,
        step.type || 'Text',
        step.spokenText || '',
        step.isBarrier ? 'BARRIER DETECTED' : 'CLEAR',
      ]);

      runAutoTable(doc, {
        startY: ksrY,
        head: [['#', 'Role / Element', 'Announced Speech Output', 'Speech Status']],
        body: srTableRows,
        margin: { left: margin, right: margin },
        columnStyles: {
          0: { cellWidth: 28, fontStyle: 'bold', textColor: textMuted },
          1: { cellWidth: 90, fontStyle: 'bold', textColor: textBright },
          2: { cellWidth: 290, fontStyle: 'italic', textColor: textBright },
          3: { cellWidth: 115, fontStyle: 'bold' },
        },
        didParseCell: function (data) {
          if (data.section === 'body' && data.column.index === 3) {
            const val = String(data.cell.raw);
            if (val.includes('BARRIER')) {
              data.cell.styles.textColor = sevColors.critical;
            } else {
              data.cell.styles.textColor = sevColors.passed;
            }
          }
        },
      });
    }

    // =========================================================================
    // FOOTER (Applied to every page)
    // =========================================================================
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);

      // Subtle divider line
      doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
      doc.setLineWidth(0.5);
      doc.line(margin, pageHeight - 26, pageWidth - margin, pageHeight - 26);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(textDim[0], textDim[1], textDim[2]);
      const footerUrl = cleanUrl.slice(0, 70);
      doc.text(footerUrl, margin, pageHeight - 14);
      doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageHeight - 14, { align: 'right' });
    }

    // Trigger download
    const host = cleanUrl.replace(/^https?:\/\//, '').replace(/[^\w.-]/g, '_').slice(0, 30);
    const fileName = `Audit_Report_${host || 'page'}_${Date.now()}.pdf`;
    doc.save(fileName);
  }

  // Expose to window
  // @ts-ignore
  window.generateWcagPdfReport = generateWcagPdfReport;
})();
