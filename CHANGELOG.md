# Changelog

All notable changes to **Matt's QA Extension** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.2.2] - 2026-09-18

### 🔗 Link Checker HTTP 405 Workaround & Smart GET Fallback
- **Fixed False-Positive 405 Errors on Valid Links**:
  - Resolved an issue where valid web pages hosted behind CDNs, firewalls, or reverse proxies (e.g. Cloudflare, CloudFront, Nginx) were reported as broken links with `405 Method Not Allowed`.
  - Fixed a silent bug in `verifyUrl` where `catch (headErr)` never triggered on HTTP 405 (since `fetch()` resolves normally on non-200 responses), causing 405 to fall through to the generic broken link branch.
  - Added automatic fallback to a lightweight `GET` request when `HEAD` returns `405 Method Not Allowed`, `501 Not Implemented`, `403 Forbidden`, or `400 Bad Request`.
  - Preserved bandwidth by combining `Range: 'bytes=0-0'` with immediate stream cancellation (`response.body.cancel()`), preventing full-page payload downloads.
  - Reclassified persistent 405 responses (such as POST-only API endpoints) to `warning` with diagnostic status text rather than failing the link audit as hard errors.

## [1.2.1] - 2026-09-18

### 🛡️ Drawer Header Spacing & Overlap Prevention
- **Eliminated Header Text & Badge Collision**:
  - Resolved an issue where subtext in "Link Health...", "Tab Navigation...", and "Screen Reader Speech..." (as well as WCAG Issues and Vision Simulation) could overlap with scoring and validation badges on the right.
  - Added `flex: 1 1 auto` and `min-width: 0` to all drawer title containers and their inner text blocks, allowing text truncation (`ellipsis`) without pushing into status badges.
  - Added a generous `14px` flex gap between title content and badge groups, plus `6px` right-padding on title wrappers for clean visual breathing room.
  - Enforced `flex-shrink: 0`, `margin-left: auto`, and `white-space: nowrap` on all badge groups, status/score badges, and toggle buttons to preserve their layout integrity.
  - Added native `title="..."` tooltip attributes to all drawer subtitles for easy reading on hover when truncated.
  - Added responsive padding adjustments in the `<= 520px` media query.
- **Removed Redundant "Sections" Quickbar**:
  - Removed the duplicate `SECTIONS:` navigation bar and pill buttons, relying on the top Failure KPI cards as the primary section navigation.
  - Preserved `Expand All` and `Collapse All` drawer bulk controls in a compact right-aligned toolbar directly above the drawers.

## [1.2.0] - 2026-09-17

### 🎨 Extension Popup UI & Layout Modernization
- **Consolidated URL Input**:
  - Removed duplicate URL input from the top bar.
  - Consolidated target URL input into an editable field located directly under the **"WCAG and Accessibility Audit"** section card.
  - Renamed *"Full-stack Accessibility & Quality Suite"* section title to **"WCAG and Accessibility Audit"**.
- **Removed Redundant Badges**:
  - Removed the redundant `READY TO AUDIT` pill badge from above the main title to declutter the interface.
- **Executive Overview Banner (Removed Gamified Scoring)**:
  - Replaced the circular 100-point score wheel, grade rating, and generic warning text (*"Significant barriers detected..."*) with a clean, executive summary.
  - Added real-time 4-KPI breakdown:
    1. **WCAG Failures** count
    2. **Link Failures** count
    3. **Tab Order Flow** status
    4. **Screen Reader Barriers** count
  - Integrated interactive drawer jumps: clicking any KPI card instantly scrolls to and expands the corresponding audit section.
- **Unified Section Header Styling**:
  - Fixed an inconsistency where the VoiceOver section header was OLED black while other headers were not.
  - All 5 collapsible modules now share uniform Obsidian Teal dark backgrounds (`#0d171c`), matching borders (`#1b6f7e`), and consistent badge pills.
- **Quick-Jump Navigation Bar**:
  - Added a sticky executive quick-jump bar with one-click navigation to all 5 audit modules, plus global **"Expand All"** and **"Collapse All"** drawer controls.

### 📄 Dark-Mode PDF Audit Report Redesign
- **Dark Mode Document Theme**:
  - Redesigned the compiled PDF into a dark-mode report matching the extension UI (`#070d10` deep canvas, `#0d171c` card containers, `#030709` code/image boxes, `#0d9fba` cyan accents).
- **Executive Title Page (Page 1)**:
  - Dedicated the first page of the PDF as an executive Title Page.
  - Displays the page title, target URL, evaluation timestamp, and a 5-module **"What Was Tested"** scope breakdown with pass/fail KPI summary cards.
  - Eliminated AI-sounding marketing copy, compliance grades, and gamified percentage scores.
- **Detailed Descriptions & Code Fixes (Pages 2+)**:
  - Moved detailed technical breakdowns to start on Page 2.
  - Itemizes every WCAG violation, broken link, tab navigation irregularity, and screen reader barrier with DOM locations, offending HTML, and copy-paste remediation code.
- **Removed Stray `'` Character Glitch**:
  - Fixed an encoding bug where green passing boxes in the PDF displayed a stray leading quote `'` (caused by jsPDF font fallback encoding for Unicode checkmarks). Passing states now display clean text and numerals (e.g., bold green `0`).
- **Visual Screenshots & Failure Locations**:
  - **Page Viewport Overview**: Embedded a visible viewport screenshot at the beginning of Page 2 to provide stakeholders and developers immediate high-level visual context.
  - **Offending Element Thumbnails**: Each violation card now features a cropped screenshot of the failure with a high-visibility `#ef4444` red border drawn around the target element.
  - **DOM Pixel Coordinates**: Added exact on-page coordinates (`Position: X: ...px, Y: ...px | Size: ...x...px`) to every failing element card.
- **Proportional Screenshot Scaling (No Squashing)**:
  - Fixed squashed/stretched screenshot distortion by calculating natural aspect ratios (`width / height`) and scaling images proportionally within page constraints (`maxImgW`, `maxImgH`).

### 🔗 Broken Link & Anchor Health Auditor
- **Automated Link Verification**:
  - Added automated scanning of all `<a>` tags and navigation targets.
  - Identifies broken internal and external HTTP links (404, 500, timeouts) and missing in-page `#hash` anchor targets.
  - Includes in-page spotlight overlays and automatic inclusion in PDF export reports.

### 🧪 Testing & CI Infrastructure
- **Playwright Test Suite**:
  - Created automated test suites (`tests/popup-ui.spec.js` and `tests/link-checker.spec.js`) covering:
    - Popup HTML structure, collapsible drawers, and Quick-Jump bar.
    - Executive Overview banner and dynamic KPI counter updates.
    - Dark-mode PDF generation, title page layout, and image aspect ratio preservation.
    - Link health detection and HTTP status classification.
  - Achieved a 100% pass rate across all 7 tests.
- **Submodule Architecture**:
  - Linked `AuditExtension` as a Git submodule mapped to `mattroburns/AuditExtension`.

---

## [1.1.0] - 2026-09-15

### Added
- **Multi-Platform Screen Reader Emulation Suite**:
  - Added auditory and visual emulation for Apple iOS VoiceOver, Android TalkBack, NVDA (Windows), and Windows Narrator.
  - Supports acoustic earcon profiles, touch gestures (Swipe, Rotor, Granularity), and desktop quick-nav keys.
- **Color Blindness & Low Vision Emulation**:
  - Added SVG filters for Protanopia, Deuteranopia, Tritanopia, Achromatopsia, Cataracts blur, Glaucoma tunnel vision, Macular degeneration, and Photophobia.
- **Tab Navigation Order Audit**:
  - Visual Tab-Trail overlay mapping sequential focus order across interactive controls.
  - Radio button group single-tab-stop flow modeling.

---

## [1.0.0] - 2026-09-15

### Added
- Initial release of **Matt's QA Extension** (Manifest V3).
- WCAG 2.2 AA rules evaluation via axe-core.
- AMOLED dark theme with custom teal palette (`#1b6f7e`, `#127788`, `#0d9fba`).
- Client-side PDF export via jsPDF and AutoTable.
