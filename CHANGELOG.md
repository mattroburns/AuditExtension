# Changelog

All notable changes to **Mattccessibility Tool** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.4.0] - 2026-10-01

### 📱 Mobile & Responsive Layout Audit Suite & Viewport Simulator HUD
- **Cross-Device Mobile Layout Evaluator Engine**:
  - Automatically simulates 5 popular mobile viewports: **Apple iPhone 16 / 15 Pro** (393px), **iPhone SE Compact Baseline** (375px), **Samsung Galaxy S24** (360px), **Google Pixel 8** (412px), and **Apple iPhone 16 Pro Max** (430px).
  - **Horizontal Viewport Overflows ("Too Wide for Page")**: Detects elements with fixed widths or unconstrained media extending beyond device viewport boundaries (scrollWidth > clientWidth).
  - **Overlapping Elements Detection**: Catches colliding interactive buttons, links, inputs, and text headers using precise 2D geometric bounding box intersections (xOverlap * yOverlap > 36 sq px).
  - **Disjointed Page Steps & Multi-Step Wizard Breakages**: Flags multi-step form progress bars, stepper indicators, wizard tracks, and breadcrumbs suffering from awkward multi-line wrapping, detached connector lines, or colliding step badges.
  - **Touch Target Sizing & Crowding**: Validates WCAG 2.5.8 Target Size Minimum (<24x24px) and ergonomically optimal hit targets (<44x44px), as well as crowded touch targets within 8px of each other.
  - **Sticky / Fixed Element Occlusions**: Flags tall sticky headers, bottom navigation bars, or floating banners that consume >30% of mobile screen height.
  - Computes objective **Mobile Health Score (0–100)**, Grade (A+ to F), and Risk Rating (Low, Moderate, High, Severe).
- **Interactive In-Page Mobile Viewport Simulator HUD**:
  - Click **"📱 Launch Mobile Simulator"** to launch an in-page viewport simulator overlay directly on the target webpage.
  - Features realistic phone chassis with Dynamic Island notch, front lens, portrait/landscape orientation toggle button, live device switcher dropdown, responsive sandboxed iframe, and an interactive issues drawer.
  - Interactive issue cards inside the simulator highlight offending elements and display remediation code snippets.
- **Popup UI Integration**:
  - Added 5th Executive KPI card: **"Mobile Barriers"** in the executive failures grid with instant one-click jump to the mobile drawer.
  - Dedicated collapsible **"Mobile & Responsive Layout Audit"** drawer with device switcher tabs ('iPhone 16 Pro', 'iPhone SE', 'Galaxy S24', 'Pixel 8', '16 Pro Max'), summary metrics strip ('Overlaps', 'Too Wide', 'Disjointed Steps', 'Touch Targets'), and filter tabs ('All', 'Too Wide', 'Overlaps', 'Disjointed Steps', 'Touch Targets').
  - Interactive **"🎯 Locate"** buttons scroll the host tab directly to the offending element with animated neon ring and diagnostic badge.
- **Vector PDF Compliance Report Integration**:
  - Added **"Section 5: Mobile & Responsive Layout Assessment"** to the dark-mode vector PDF export.
  - Includes mobile health score pill, 4-metric summary columns, and AutoTable breakdown of all mobile violations with severity, viewport dimensions, DOM selectors, and remediation guidance.

## [1.3.0] - 2026-09-24

### 👁️ Visual Impairments & Reading Differences Emulation Suite
- **Dyslexia Emulation Engine (`dyslexia`)**:
  - Implements a non-destructive letter scrambling / transposition jitter algorithm based on the Widell cognitive reading model.
  - Transposes internal letters of words (4+ letters) with cognitive homoglyph decoding strain, powered by zero-reflow static letter scrambling, homoglyph confusion (b/d, p/q), and static crowding without artificial growing/shrinking animations to guarantee smooth 60fps scrolling and interaction.
  - Automatically isolates safe visible text nodes using `TreeWalker`, strictly excluding `<input>`, `<textarea>`, `<button>`, `<select>`, `<code>`, `<pre>`, and `<script>` elements.
  - Full reversibility: stores pre-mutation text nodes in a Map, completely restoring 100% of original DOM text and removing typographic stress styles upon reset or filter change.
  - **Dynamic Form & SPA Support**: Employs an active MutationObserver on document.body (childList, subtree) that automatically discovers and scrambles asynchronously populated form sections, multi-step wizards, accordion steps, and dynamic error messages without performance overhead.
- **Expanded Low Vision & Eye Condition Lenses**:
  - **Diabetic Retinopathy (`retinopathy`)**: Simulates patchy vision loss, floaters, and scattered retinal scotomas that drift with subtle mouse/cursor parallax, combined with localized blur.
  - **Reduced Contrast Sensitivity (`contrast-loss`)**: Emulates 40% contrast washout, instantly showing why WCAG 4.5:1 (AA) and 7:1 (AAA) minimum contrast thresholds are vital for real users.
  - **Severe Myopia (`myopia`)**: Simulates severe uncorrected short-sightedness with extreme blur (`5.5px`), testing whether visual hierarchy, large hit targets, and icons can still be distinguished without glasses.
- **Refractive & Perceptual Impairment Lenses**:
  - **Astigmatism / Diplopia (`astigmatism`)**: Accurately simulates corneal curvature refractive error and monocular double vision via SVG `feOffset`, `feGaussianBlur`, and `feMerge` directional ghosting filters.
  - **Visual Snow Syndrome (`visual-snow`)**: Emulates persistent flickering television-static noise across the entire visual field using a high-performance, lightweight canvas noise overlay with zero memory overhead.
- **Modernized 3-Row CVD & Impairment Drawer in Popup UI**:
  - Reorganized into 3 distinct thematic rows: **Color Blindness** (5 lenses), **Low Vision** (7 lenses), and **Reading & Cognitive** (3 lenses) totaling 15 specialized lenses.
  - Dedicated lavender/purple accents (`#a78bfa` / `#c084fc`) for Reading & Cognitive pills and active status badges.
  - Upgraded in-page floating pill with dynamic category badges: `Color Vision Lens`, `Low Vision Lens`, and `Reading / Cognitive Lens` with single-click `Reset Normal`.

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
- Initial release of **Mattccessibility Tool** (Manifest V3).
- WCAG 2.2 AA rules evaluation via axe-core.
- AMOLED dark theme with custom teal palette (`#1b6f7e`, `#127788`, `#0d9fba`).
- Client-side PDF export via jsPDF and AutoTable.
