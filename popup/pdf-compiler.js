// @ts-check

/**
 * Non-Branded WCAG 2.2 PDF Audit Report Compiler
 * Generates an executive, objective digital accessibility compliance PDF report
 * entirely client-side using jsPDF.
 */

(function () {
  /**
   * Compiles and triggers download of a non-branded WCAG 2.2 Compliance PDF
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
    const margin = 40;
    const contentWidth = pageWidth - margin * 2;

    // Palette (Dark Navy & Clean Accents)
    const primaryNavy = [15, 23, 42];      // #0F172A
    const accentBlue = [37, 99, 235];      // #2563EB
    const borderGray = [226, 232, 240];    // #E2E8F0
    const cardBg = [248, 250, 252];        // #F8FAFC
    const textDark = [30, 41, 59];         // #1E293B
    const textMuted = [100, 116, 139];     // #64748B
    const codeBg = [15, 23, 42];           // Dark snippet box

    // Severity Colors
    const sevColors = {
      critical: [239, 68, 68],  // #EF4444
      serious: [249, 115, 22],  // #F97316
      moderate: [245, 158, 11], // #F59E0B
      minor: [6, 182, 212],     // #06B6D4
    };

    const riskLevel = auditData.riskLevel || 'Moderate';
    const riskColor = sevColors[riskLevel.toLowerCase()] || sevColors.moderate;

    function getRemediationSnippet(id, html = '') {
      switch (id) {
        case 'color-contrast':
          return `/* Increase contrast to satisfy WCAG AA (minimum 4.5:1 ratio) */\ncolor: #111827;\nbackground-color: #FFFFFF;`;
        case 'color-contrast-hover':
          return `/* Increase hover-state contrast to satisfy WCAG AA (minimum 4.5:1 ratio) */\nbutton:hover, a:hover {\n  background-color: #0F172A;\n  color: #FFFFFF;\n}`;
        case 'screen-reader-alt-quality':
          return `<!-- Provide natural, descriptive alt text without file extensions or redundant 'image of' prefixes (WCAG 1.1.1) -->\n<img src="chart.png" alt="Bar chart showing 24% revenue increase in Q3" />`;
        case 'screen-reader-heading-order':
          return `<!-- Structure headings sequentially without skipping levels so VoiceOver/NVDA users can navigate sections (WCAG 1.3.1 / 2.4.6) -->\n<h1>Primary Page Title</h1>\n<h2>Section Heading</h2>\n<h3>Sub-section Heading</h3>`;
        case 'screen-reader-landmarks':
          return `<!-- Wrap primary content in <main> and uniquely label multiple <nav> landmarks (WCAG 1.3.1 / 2.4.1) -->\n<nav aria-label="Main Navigation">...</nav>\n<main id="main-content">...</main>\n<nav aria-label="Footer Navigation">...</nav>`;
        case 'screen-reader-hidden-focus':
          return `<!-- Do not place focusable elements inside containers with aria-hidden="true" (WCAG 4.1.2) -->\n<div aria-hidden="true">\n  <!-- Ensure all children have inert or tabindex="-1" -->\n</div>`;
        case 'screen-reader-link-purpose':
          return `<!-- Provide descriptive link text or aria-label so screen reader Links List conveys purpose (WCAG 2.4.4 / 2.4.9) -->\n<a href="/pricing" aria-label="View enterprise pricing and plan details">Learn more</a>`;
        case 'aria-label-generic':
          return `<!-- Provide meaningful, descriptive accessible name (WCAG 2.4.6 / 4.1.2) -->\n<button aria-label="Close dialog window"><svg ...></svg></button>`;
        case 'aria-label-redundant-role':
          return `<!-- Remove redundant role word from aria-label -->\n<button aria-label="Submit search query">Search</button>`;
        case 'aria-label-name-mismatch':
          return `<!-- WCAG 2.2 SC 2.5.3 (Label in Name) -->\n<button aria-label="Download audit report as PDF">Download audit report</button>`;
        case 'aria-label-icon-mismatch':
          return `<!-- Align accessible name with visual icon intent -->\n<button aria-label="Search catalog"><svg class="search-icon" ...></svg></button>`;
        case 'aria-label-empty':
          return `<!-- Provide non-empty accessible name -->\n<button aria-label="Toggle navigation menu"><span class="hamburger"></span></button>`;
        case 'image-alt':
          return `<!-- Provide descriptive alt text for informative images -->\n<img src="..." alt="Descriptive summary of this image" />`;
        case 'button-name':
          return `<!-- Provide discernible accessible name for button -->\n<button aria-label="Search website"><svg ...></svg></button>`;
        case 'label':
          return `<!-- Associate input control with a visible label element -->\n<label for="email-input">Email Address</label>\n<input type="email" id="email-input" name="email" required />`;
        case 'link-name':
          return `<!-- Ensure link has discernible text or accessible label -->\n<a href="/checkout" aria-label="Proceed to secure checkout"><span class="icon"></span></a>`;
        default:
          return `<!-- Ensure valid semantic HTML, accessible names, and keyboard navigability (WCAG 2.2 AA) -->`;
      }
    }

    /**
     * Safely executes autoTable without passing doc as first argument to doc.autoTable
     * @param {Object} docInstance
     * @param {Object} tableOptions
     */
    function runAutoTable(docInstance, tableOptions) {
      if (typeof docInstance.autoTable === 'function') {
        docInstance.autoTable(tableOptions);
      } else if (typeof window !== 'undefined' && window.jspdfAutotable && typeof window.jspdfAutotable.default === 'function') {
        window.jspdfAutotable.default(docInstance, tableOptions);
      }
    }

    // =========================================================================
    // PAGE 1: EXECUTIVE COMPLIANCE SUMMARY
    // =========================================================================

    // Top Header Banner
    const headerY = 36;
    const headerH = 68;
    doc.setFillColor(cardBg[0], cardBg[1], cardBg[2]);
    doc.roundedRect(margin, headerY, contentWidth, headerH, 6, 6, 'F');
    doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
    doc.roundedRect(margin, headerY, contentWidth, headerH, 6, 6, 'S');

    // Left accent bar
    doc.setFillColor(accentBlue[0], accentBlue[1], accentBlue[2]);
    doc.roundedRect(margin, headerY, 4, headerH, 2, 2, 'F');

    // Header Text
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    doc.text('WCAG 2.2 Accessibility Compliance Report', margin + 18, headerY + 26);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text('Objective Digital Compliance Audit  •  Evaluation Standard: WCAG 2.2 Level AA / Section 508', margin + 18, headerY + 46);

    // Metadata & Score Section
    let curY = headerY + headerH + 20;

    // Target Website Meta (Left side)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text('TARGET PROPERTY / URL:', margin, curY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(accentBlue[0], accentBlue[1], accentBlue[2]);
    const cleanUrl = auditData.url || 'Web Page';
    doc.text(doc.splitTextToSize(cleanUrl, 330)[0] || cleanUrl, margin, curY + 16);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text('AUDIT DATE:', margin, curY + 36);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text(auditData.formattedDate || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), margin + 65, curY + 36);

    // Score Card Box (Right side)
    const scoreBoxW = 140;
    const scoreBoxH = 68;
    const scoreBoxX = pageWidth - margin - scoreBoxW;
    const scoreBoxY = curY - 6;

    doc.setFillColor(cardBg[0], cardBg[1], cardBg[2]);
    doc.roundedRect(scoreBoxX, scoreBoxY, scoreBoxW, scoreBoxH, 6, 6, 'F');
    doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
    doc.roundedRect(scoreBoxX, scoreBoxY, scoreBoxW, scoreBoxH, 6, 6, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text('COMPLIANCE SCORE', scoreBoxX + scoreBoxW / 2, scoreBoxY + 14, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(riskColor[0], riskColor[1], riskColor[2]);
    doc.text(`${auditData.score !== undefined ? auditData.score : '--'}/100`, scoreBoxX + scoreBoxW / 2, scoreBoxY + 38, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(`GRADE: ${auditData.grade || 'N/A'}  (${riskLevel.toUpperCase()} RISK)`, scoreBoxX + scoreBoxW / 2, scoreBoxY + 54, { align: 'center' });

    curY += 60;

    // Metrics Grid (4 cards across width)
    const gridW = contentWidth;
    const colW = (gridW - 30) / 4;
    const gridH = 50;

    const stats = auditData.stats || {};
    const metrics = [
      { label: 'Critical Barriers', count: stats.criticalCount || 0, color: sevColors.critical },
      { label: 'Serious Barriers', count: stats.seriousCount || 0, color: sevColors.serious },
      { label: 'Moderate Flaws', count: stats.moderateCount || 0, color: sevColors.moderate },
      { label: 'Rules Passed', count: stats.rulesPassedCount || 0, color: [16, 185, 129] },
    ];

    metrics.forEach((m, idx) => {
      const x = margin + idx * (colW + 10);
      doc.setFillColor(cardBg[0], cardBg[1], cardBg[2]);
      doc.roundedRect(x, curY, colW, gridH, 5, 5, 'F');
      doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
      doc.roundedRect(x, curY, colW, gridH, 5, 5, 'S');

      // Top colored border indicator
      doc.setFillColor(m.color[0], m.color[1], m.color[2]);
      doc.roundedRect(x, curY, colW, 3, 2, 2, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(m.color[0], m.color[1], m.color[2]);
      doc.text(String(m.count), x + colW / 2, curY + 24, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
      doc.text(m.label, x + colW / 2, curY + 39, { align: 'center' });
    });

    curY += gridH + 20;

    // Narrative Summary Box (Dynamically sized to prevent overspill)
    const summaryText = auditData.summary || 'Audit evaluation indicates accessibility compliance status under WCAG 2.2 AA benchmarks.';
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const summaryLines = doc.splitTextToSize(summaryText, contentWidth - 28);
    const summaryBoxH = Math.max(46, 22 + summaryLines.length * 11);

    doc.setFillColor(cardBg[0], cardBg[1], cardBg[2]);
    doc.roundedRect(margin, curY, contentWidth, summaryBoxH, 5, 5, 'F');
    doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
    doc.roundedRect(margin, curY, contentWidth, summaryBoxH, 5, 5, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text('AUDIT EVALUATION SUMMARY', margin + 14, curY + 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    let sY = curY + 27;
    summaryLines.forEach((sLine) => {
      doc.text(sLine, margin + 14, sY);
      sY += 11;
    });

    curY += summaryBoxH + 18;

    // WCAG Issues Found Table Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    doc.text('WCAG Issues Summary Table', margin, curY);

    const totalViolationsCount = (auditData.stats && auditData.stats.totalViolations !== undefined)
      ? auditData.stats.totalViolations
      : (auditData.violations ? auditData.violations.length : 0);
    const violationsCount = (auditData.violations || []).length;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text(`Identified ${violationsCount} distinct rules violated across ${totalViolationsCount} DOM elements`, margin, curY + 14);

    curY += 24;

    // Generate Formatted Issues Table using runAutoTable
    const tableBody = (auditData.violations || []).map((v) => [
      v.help || v.id,
      v.wcagRule || 'WCAG 2.2 AA',
      (v.impact || 'moderate').toUpperCase(),
      `${v.affectedCount || 1} ${(v.affectedCount || 1) === 1 ? 'element' : 'elements'}`,
    ]);

    runAutoTable(doc, {
      startY: curY,
      head: [['WCAG Rule & Description', 'Criterion', 'Severity', 'Affected Elements']],
      body: tableBody,
      theme: 'plain',
      margin: { left: margin, right: margin },
      styles: {
        font: 'helvetica',
        fontSize: 8,
        textColor: textDark,
        cellPadding: 6,
        lineColor: borderGray,
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: primaryNavy,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
      },
      columnStyles: {
        0: { cellWidth: 220, fontStyle: 'bold' },
        1: { cellWidth: 120, textColor: textMuted },
        2: { cellWidth: 80, fontStyle: 'bold' },
        3: { cellWidth: 95 },
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

    // =========================================================================
    // SECTION 2: DEVELOPER REMEDIATION BLUEPRINT (Page 2+)
    // =========================================================================
    doc.addPage();
    let secY = 40;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    doc.text('Technical Remediation Blueprint', margin, secY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text('Itemized technical modifications, exact HTML selectors, and copy-paste code fixes to satisfy WCAG 2.2 AA.', margin, secY + 14);

    secY += 32;

    function ensureSpace(needed) {
      if (secY + needed > pageHeight - 40) {
        doc.addPage();
        secY = 40;
      }
    }

    (auditData.violations || []).forEach((v) => {
      const isCriticalOrSerious = v.impact === 'critical' || v.impact === 'serious';
      const sevColor = sevColors[v.impact] || sevColors.moderate;

      // Banner for rule
      const bannerH = 40;
      ensureSpace(bannerH + 12);

      doc.setFillColor(cardBg[0], cardBg[1], cardBg[2]);
      doc.roundedRect(margin, secY, contentWidth, bannerH, 4, 4, 'F');
      doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
      doc.roundedRect(margin, secY, contentWidth, bannerH, 4, 4, 'S');

      // Left bar
      doc.setFillColor(sevColor[0], sevColor[1], sevColor[2]);
      doc.roundedRect(margin, secY, 4, bannerH, 2, 2, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(sevColor[0], sevColor[1], sevColor[2]);
      doc.text(`[${v.impact.toUpperCase()}] ${v.help}`, margin + 14, secY + 16, { maxWidth: contentWidth - 40 });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
      doc.text(`Rule ID: ${v.id}  •  Criterion: ${v.wcagRule}  •  ${v.affectedCount} elements failing`, margin + 14, secY + 29);

      secY += bannerH + 12;

      // Itemize elements (up to 8 per rule in PDF)
      const nodesToShow = (v.nodes || []).slice(0, 8);

      nodesToShow.forEach((node, nIdx) => {
        const cleanTarget = String(node.target || 'DOM Root');
        const cleanHtml = (node.html || '<element />').replace(/\s+/g, ' ').slice(0, 110);

        // Pre-calculate callout box (Screen Reader, ARIA, or Contrast)
        let calloutType = null;
        let calloutLines = [];
        let calloutFixLines = [];
        let calloutAnnouncedLines = [];
        let calloutH = 0;
        const boxInnerWidth = contentWidth - 54;

        if (node.srDetails) {
          calloutType = 'sr';
          const sd = node.srDetails;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          calloutLines = doc.splitTextToSize(`Screen Reader Diagnostic: ${sd.diagnosis || 'Auditory barrier detected.'}`, boxInnerWidth);
          
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          calloutFixLines = doc.splitTextToSize(`Fix: ${sd.recommended || 'Restructure element for screen reader access.'}`, boxInnerWidth);
          
          if (sd.currentText && sd.currentText !== '(Missing <h1>)') {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(7);
            calloutAnnouncedLines = doc.splitTextToSize(`Announced text: "${sd.currentText.slice(0, 80)}"`, boxInnerWidth);
          }
          const totalLines = calloutLines.length + calloutFixLines.length + calloutAnnouncedLines.length;
          calloutH = Math.max(50, 16 + (totalLines - 1) * 11 + 16);
        } else if (node.ariaDetails) {
          calloutType = 'aria';
          const ad = node.ariaDetails;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          calloutLines = doc.splitTextToSize(`ARIA Diagnostic: ${ad.diagnosis || 'Semantic naming issue.'}`, boxInnerWidth);
          
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          const fixText = ad.ariaLabel
            ? `Fix: ${ad.recommendedLabel || ad.recommendedFix || 'Provide accessible name'} (Current: "${ad.ariaLabel}")`
            : `Action: ${ad.recommendedLabel || ad.recommendedFix || 'Provide accessible name'}`;
          calloutFixLines = doc.splitTextToSize(fixText, boxInnerWidth);
          const totalLines = calloutLines.length + calloutFixLines.length;
          calloutH = Math.max(46, 16 + (totalLines - 1) * 11 + 16);
        } else if (node.contrastFix) {
          calloutType = 'contrast';
          const cf = node.contrastFix;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          let ratioText = `Contrast Failure: ${cf.currentRatio} vs ${cf.requiredRatio} required`;
          if (node.hoverDetails) {
            ratioText = `Hover Contrast Failure: ${node.hoverDetails.hoverRatio} vs ${node.hoverDetails.requiredRatio} required (Resting: ${node.hoverDetails.restingRatio})`;
          }
          calloutLines = doc.splitTextToSize(ratioText, boxInnerWidth);
          
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          calloutFixLines = doc.splitTextToSize(`Fix: Set color to ${cf.suggestedFg} (${cf.suggestedRatio} PASS)`, boxInnerWidth);
          const totalLines = calloutLines.length + calloutFixLines.length;
          calloutH = Math.max(46, 16 + (totalLines - 1) * 11 + 16);
        }

        // Pre-calculate code fix box
        const codeSnippet = (v.remediationCode || getRemediationSnippet(v.id, node.html)).trim();
        doc.setFont('courier', 'normal');
        doc.setFontSize(7);
        const rawCodeLines = doc.splitTextToSize(codeSnippet, boxInnerWidth - 8);
        const codeLinesToShow = rawCodeLines.slice(0, 5);
        const codeBoxH = Math.max(44, 20 + codeLinesToShow.length * 10);

        // Dynamically compute total card height to completely envelop all inner boxes with generous padding
        let itemH = 14 + 14 + 14 + 16; // header (14) + location (14) + offending html (14) + spacing (16)
        if (calloutH > 0) {
          itemH += calloutH + 12;
        }
        if (codeBoxH > 0) {
          itemH += codeBoxH + 12;
        }
        itemH += 12; // generous bottom padding

        ensureSpace(itemH + 14);

        // Draw main item card
        doc.setFillColor(cardBg[0], cardBg[1], cardBg[2]);
        doc.roundedRect(margin, secY, contentWidth, itemH, 4, 4, 'F');
        doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
        doc.roundedRect(margin, secY, contentWidth, itemH, 4, 4, 'S');

        let innerY = secY + 14;

        // Element index label
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(accentBlue[0], accentBlue[1], accentBlue[2]);
        doc.text(`Element ${nIdx + 1} of ${v.affectedCount}:`, margin + 12, innerY);

        innerY += 14;

        // Selector tag
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
        doc.text('HTML Location:', margin + 12, innerY);

        doc.setFont('courier', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(textDark[0], textDark[1], textDark[2]);
        doc.text(doc.splitTextToSize(cleanTarget, contentWidth - 105)[0] || cleanTarget, margin + 92, innerY);

        innerY += 14;

        // Offending HTML
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
        doc.text('Offending HTML:', margin + 12, innerY);

        doc.setFont('courier', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(textDark[0], textDark[1], textDark[2]);
        doc.text(doc.splitTextToSize(cleanHtml, contentWidth - 105)[0] || cleanHtml, margin + 92, innerY);

        innerY += 16;

        // Render Callout Box if present
        if (calloutType) {
          const boxX = margin + 12;
          const boxW = contentWidth - 24;

          if (calloutType === 'sr') {
            doc.setFillColor(250, 245, 255);
            doc.roundedRect(boxX, innerY, boxW, calloutH, 4, 4, 'F');
            doc.setDrawColor(233, 213, 255);
            doc.roundedRect(boxX, innerY, boxW, calloutH, 4, 4, 'S');

            let textY = innerY + 14;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(126, 34, 206);
            calloutLines.forEach((l) => {
              doc.text(l, boxX + 12, textY);
              textY += 11;
            });

            if (calloutAnnouncedLines && calloutAnnouncedLines.length > 0) {
              doc.setFont('helvetica', 'italic');
              doc.setFontSize(7);
              doc.setTextColor(100, 116, 139);
              calloutAnnouncedLines.forEach((l) => {
                doc.text(l, boxX + 12, textY);
                textY += 11;
              });
            }

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(4, 120, 87); // Accessible dark emerald green
            calloutFixLines.forEach((l) => {
              doc.text(l, boxX + 12, textY);
              textY += 11;
            });
          } else if (calloutType === 'aria') {
            doc.setFillColor(240, 249, 255);
            doc.roundedRect(boxX, innerY, boxW, calloutH, 4, 4, 'F');
            doc.setDrawColor(186, 230, 253);
            doc.roundedRect(boxX, innerY, boxW, calloutH, 4, 4, 'S');

            let textY = innerY + 14;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(3, 105, 161);
            calloutLines.forEach((l) => {
              doc.text(l, boxX + 12, textY);
              textY += 11;
            });

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(4, 120, 87);
            calloutFixLines.forEach((l) => {
              doc.text(l, boxX + 12, textY);
              textY += 11;
            });
          } else if (calloutType === 'contrast') {
            doc.setFillColor(254, 242, 242);
            doc.roundedRect(boxX, innerY, boxW, calloutH, 4, 4, 'F');
            doc.setDrawColor(254, 202, 202);
            doc.roundedRect(boxX, innerY, boxW, calloutH, 4, 4, 'S');

            let textY = innerY + 14;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(220, 38, 38);
            calloutLines.forEach((l) => {
              doc.text(l, boxX + 12, textY);
              textY += 11;
            });

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(2, 132, 199);
            calloutFixLines.forEach((l) => {
              doc.text(l, boxX + 12, textY);
              textY += 11;
            });
          }

          innerY += calloutH + 12;
        }

        // Render Code Fix Box
        const codeBoxX = margin + 12;
        const codeBoxW = contentWidth - 24;

        doc.setFillColor(codeBg[0], codeBg[1], codeBg[2]);
        doc.roundedRect(codeBoxX, innerY, codeBoxW, codeBoxH, 4, 4, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(148, 163, 184);
        doc.text('RECOMMENDED CODE FIX:', codeBoxX + 12, innerY + 12);

        doc.setFont('courier', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(248, 250, 252);
        let cY = innerY + 23;
        codeLinesToShow.forEach((codeLine) => {
          doc.text(codeLine, codeBoxX + 12, cY);
          cY += 10;
        });

        secY += itemH + 14;
      });
    });

    // =========================================================================
    // SECTION 3: SCREEN READER & VOICEOVER COMPATIBILITY ASSESSMENT
    // =========================================================================
    doc.addPage();
    let srY = 40;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    doc.text('Screen Reader & VoiceOver Compatibility Assessment', margin, srY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text('Auditory usability evaluation assessing sequential reading order, heading rotor structure, and semantic landmarks.', margin, srY + 14);

    srY += 32;

    // Screen Reader Score Box + Pillar Breakdown
    const srBoxW = contentWidth;
    const srBoxH = 74;
    doc.setFillColor(cardBg[0], cardBg[1], cardBg[2]);
    doc.roundedRect(margin, srY, srBoxW, srBoxH, 6, 6, 'F');
    doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
    doc.roundedRect(margin, srY, srBoxW, srBoxH, 6, 6, 'S');

    // Left color bar
    const srScoreVal = auditData.screenReaderScore !== undefined ? auditData.screenReaderScore : 100;
    const srScoreColor = srScoreVal >= 85 ? [16, 185, 129] : (srScoreVal >= 70 ? [245, 158, 11] : [239, 68, 68]);
    doc.setFillColor(srScoreColor[0], srScoreColor[1], srScoreColor[2]);
    doc.roundedRect(margin, srY, 4, srBoxH, 2, 2, 'F');

    // Score Circle/Text
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text('SCREEN READER SCORE', margin + 18, srY + 18);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(srScoreColor[0], srScoreColor[1], srScoreColor[2]);
    doc.text(`${srScoreVal}/100`, margin + 18, srY + 46);

    // 3 Status Columns on Right
    const colStartX = margin + 160;
    const hasHeadingIssue = (auditData.violations || []).some(v => v.id === 'screen-reader-heading-order' || v.id === 'heading-order');
    const hasLandmarkIssue = (auditData.violations || []).some(v => v.id === 'screen-reader-landmarks' || v.id === 'landmark-one-main');
    const hasHiddenFocusIssue = (auditData.violations || []).some(v => v.id === 'screen-reader-hidden-focus');

    // Pillar 1: Heading Rotor
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text('HEADING ROTOR', colStartX, srY + 18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(hasHeadingIssue ? 239 : 16, hasHeadingIssue ? 68 : 185, hasHeadingIssue ? 68 : 129);
    doc.text(hasHeadingIssue ? 'Broken Hierarchy' : 'Sequential Flow', colStartX, srY + 34);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text('WCAG 1.3.1 / 2.4.6', colStartX, srY + 48);

    // Pillar 2: Landmarks
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text('SEMANTIC LANDMARKS', colStartX + 118, srY + 18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(hasLandmarkIssue ? 239 : 16, hasLandmarkIssue ? 68 : 185, hasLandmarkIssue ? 68 : 129);
    doc.text(hasLandmarkIssue ? 'Missing Main / Nav' : 'Landmark Regions', colStartX + 118, srY + 34);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text('WCAG 1.3.1 / 2.4.1', colStartX + 118, srY + 48);

    // Pillar 3: Focus & Speech
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text('AUDITORY FIDELITY', colStartX + 236, srY + 18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(hasHiddenFocusIssue ? 239 : 16, hasHiddenFocusIssue ? 68 : 185, hasHiddenFocusIssue ? 68 : 129);
    doc.text(hasHiddenFocusIssue ? 'Silent Focus Trap' : 'Clean Speech Order', colStartX + 236, srY + 34);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text('WCAG 4.1.2 / 2.4.4', colStartX + 236, srY + 48);

    srY += srBoxH + 22;

    // VoiceOver Announcement Simulation Table
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    doc.text('Simulated VoiceOver / NVDA Sequential Readout Transcript', margin, srY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text('Sequential speech transcript reflecting what screen reader synthesizers announce as users navigate through the page structure.', margin, srY + 13);

    srY += 22;

    const speechSteps = (auditData.speechSequence || []).slice(0, 18);
    const speechTableBody = speechSteps.map((step, idx) => [
      `#${idx + 1}`,
      step.type,
      step.spokenText,
      step.isBarrier ? 'AUDITORY FRICTION' : 'CLEAR',
    ]);

    if (speechTableBody.length > 0) {
      runAutoTable(doc, {
        startY: srY,
        head: [['#', 'Role / Element', 'Announced Speech Output', 'Auditory Usability']],
        body: speechTableBody,
        theme: 'plain',
        margin: { left: margin, right: margin },
        styles: {
          font: 'helvetica',
          fontSize: 7.5,
          textColor: textDark,
          cellPadding: 5,
          lineColor: borderGray,
          lineWidth: 0.5,
        },
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8,
        },
        columnStyles: {
          0: { cellWidth: 30, fontStyle: 'bold', textColor: textMuted },
          1: { cellWidth: 90, fontStyle: 'bold' },
          2: { cellWidth: 280, fontStyle: 'italic' },
          3: { cellWidth: 115, fontStyle: 'bold' },
        },
        didParseCell: function (data) {
          if (data.section === 'body' && data.column.index === 3) {
            const val = String(data.cell.raw);
            if (val.includes('FRICTION')) {
              data.cell.styles.textColor = sevColors.critical;
            } else {
              data.cell.styles.textColor = [16, 185, 129];
            }
          }
        },
      });
    }

    // Add footer to all pages
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
      doc.text('WCAG 2.2 Level AA Accessibility Specification  •  Objective Compliance Audit', margin, pageHeight - 20);
      doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageHeight - 20, { align: 'right' });
    }

    // Save/Download PDF
    const host = cleanUrl.replace(/^https?:\/\//, '').replace(/[^\w.-]/g, '_').slice(0, 30);
    const fileName = `WCAG_2.2_Audit_${host}_${Date.now()}.pdf`;
    doc.save(fileName);
  }

  // Expose to window
  // @ts-ignore
  window.generateWcagPdfReport = generateWcagPdfReport;
})();
