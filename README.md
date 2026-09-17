# Matt's QA Extension (Chrome Extension)

A standalone Google Chrome Extension (Manifest V3) styled in an ultra-comfortable **AMOLED Dark Mode** that evaluates any web page against the latest **WCAG 2.2 Level AA** standards, performs interactive **:hover state color contrast verification**, lints **ARIA accessible labels**, analyzes **logical tab navigation order** with an interactive **visual Tab-Trail overlay**, emulates **Color Blindness & Low Vision** (Protanopia, Deuteranopia, Tritanopia, Achromatopsia, Cataracts, Glaucoma, Macular Degeneration, Photophobia), provides a **live Screen Reader & VoiceOver speech synthesizer**, and generates **vector PDF compliance reports**.

---

## Key Features

1. **Toolbar Quick-Audit**:
   - Click the extension icon from Chrome's toolbar.
   - Pre-fills the active tab's URL automatically.
   - Enter any custom URL and click **"Run Audit"** to audit.

2. **Strictly Non-Branded & Score-Based**:
   - Zero vendor branding, user names, outreach proposals, or commercial pricing.
   - Objective 0–100 compliance scoring formula based on WCAG violation severities.
   - Grade (A+, A, B, C, D, F) and Risk Rating (Low, Moderate, High, Severe).

3. **Latest WCAG 2.2 Standards**:
   - Evaluates WCAG 2.2 AA rules (including Target Size Minimum, Focus Appearance, and Accessible Authentication).
   - Simulates interactive **:hover states** on buttons and links to catch contrast drops when background changes.
   - Lints ARIA attributes for **WCAG 2.5.3 (Label in Name)**, generic labels, and icon contradictions.

4. **Multi-Platform Screen Reader Emulation Suite (iOS VoiceOver, Android TalkBack, NVDA, Windows Narrator)**:
   - **Zero Physical Devices Required**: Test and experience the exact auditory announcements, earcon sound profiles, reading order formulas, and gesture/keyboard navigation of all 4 major assistive technologies directly in Chrome!
   - **1. Apple iOS VoiceOver**:
     - Announcement Syntax: `[Name], [State], [Role], [Interaction Hint]` (e.g. `"Submit, button, double-tap to activate"`, `"Features, heading level 2"`).
     - Touch Navigation: Swipe Left (`⬅`), Swipe Right (`➔`), Double-Tap (`👆`), and virtual **Rotor** (`🔄` / `R` key) to cycle categories and jump between Headings, Links, Controls, and Landmarks.
     - Acoustic Profile: Harmonic crystalline dual-sine bell chime (E5 & C6) and iconic black/purple VoiceOver cursor.
   - **2. Android TalkBack**:
     - Announcement Syntax: `[Name], [Role], [State], [Hint]` (e.g. `"Submit, Button, double-tap to activate"`, `"Features, Heading 2"`, `"Remember me, Check box, checked, double-tap to toggle"`).
     - Touch Navigation: Swipe Left (`⬅`), Swipe Right (`➔`), Double-Tap (`👆`), and **Reading Granularity** (`🔠` / `G` key) selector.
     - Acoustic Profile: Resonant fluid bubble bloop (frequency drop 460Hz ➔ 280Hz) and TalkBack high-visibility cyan rectangular focus box.
   - **3. NVDA (NonVisual Desktop Access - Windows)**:
     - Announcement Syntax: `[Role], [Name], [State]` with role announced first! (e.g. `"Heading level 2, Features"`, `"Button, Submit"`, `"Link, Terms"`).
     - Desktop Navigation: Virtual Buffer browse mode (`↓ / ↑`), Quick Navigation single-letter keys (`H` for Headings, `K` for Links, `F` for Form fields, `D` for Landmarks), and Enter to activate.
     - Acoustic Profile: Synthesized crisp square-wave tone chirp (440Hz ➔ 660Hz) and NVDA red focus outline.
   - **4. Windows Narrator**:
     - Announcement Syntax: `[Name], [Role], [State], [Scan Position]` (e.g. `"Submit, button"`, `"Features, heading level 2"`, `"Dark mode, toggle switch, on"`).
     - Desktop Navigation: Scan Mode navigation (`➔ / ⬅`), Quick Keys (`H` Heading, `L` Link, `B` Button, `D` Landmark), and Enter to activate.
     - Acoustic Profile: Fluent two-tone melodic chime (D5 & A5 soft sine chord) and Windows high-contrast blue focus ring.
   - **Side-by-Side 4-Reader Comparison Matrix**: Click **"Compare All 4"** to reveal a live cross-platform readout matrix for every element with individual "▶ Listen" speech preview buttons.
   - **Interactive In-Page Screen Reader HUD**: Click **"Launch On-Page Sim"** to project an interactive glassmorphism HUD bar onto the live website, complete with on-screen gesture touch buttons (`Swipe ⬅`, `Swipe ➔`, `Double-Tap 👆`, `Rotor 🔄` / `Granularity 🔠`), keyboard shortcuts, focus cursor rings, and Web Speech API announcements.
   - **Dedicated Screen Reader Score (0–100)**: Quantifies auditory ease-of-access, sequential heading hierarchy, ARIA landmarks, silent focus traps, and auditory friction barriers.

5. **Interactive In-Page Issue Navigation & Neon Highlight Ring**:
   - **One-Click Navigation**: Click any reported issue card or specific element row to immediately scroll your active browser tab directly to the offending element.
   - **Animated Neon Highlight Ring**: Draws a pulsing, high-visibility highlight ring around the element with color coded severity (Red for Critical, Orange for Serious, Amber for Moderate, Cyan for Minor).
   - **Floating Diagnostic Badge**: Displays the violation rule, severity tag, and selector directly above the element in the target page, with an "✕" dismiss button (or press `Escape`).
   - **Screen Reader Timeline Navigation**: Click any VoiceOver / Screen Reader simulation step to highlight that sequential element on the page.

6. **Client-Side PDF Reports**:
   - Click **"Download PDF Report"** to export an executive, multi-page vector PDF deliverable directly from your browser.
   - Includes the **"Screen Reader & VoiceOver Compatibility Assessment"** section with score, hierarchy checks, and sequential readout table.
   - Fully standalone: requires no backend server, node processes, or external network requests.

7. **Logical Tab Navigation Order & Visual Tab-Trail Overlay**:
   - **Tab Order Audit**: Inspects the exact sequential HTML5 keyboard tab order, calculates flow status (Sequential, Needs Review, Disrupted), and flags `tabindex > 0` anti-patterns.
   - **Visual Flow Anomaly Detection**: Flags focus stops that contradict top-to-bottom reading order (e.g. unexpected upward focus jumps) and verifies "Skip to main content" links.
   - **In-Page Tab-Trail Overlay**: Click **"🗺️ Show Tab-Trail Overlay"** to project numbered glowing badges (`#1, #2, #3...`) directly onto each interactive element on the target page, connected by curved directional SVG paths.
   - **Interactive Tab Sequence Cards**: Browse each focusable stop in the extension panel, view element roles/labels/selectors, and click **"🎯 Locate"** to highlight that element.

8. **Vision Simulation Suite (Color Blindness & Low Vision)**:
   - **Color Vision Deficiency (CVD) Lenses**:
     - **Protanopia** (Red-blind / L-cone deficiency)
     - **Deuteranopia** (Green-blind / M-cone deficiency, ~5% of males)
     - **Tritanopia** (Blue/Yellow-blind / S-cone deficiency)
     - **Achromatopsia** (Monochromacy / Complete color blindness)
   - **Low Vision & Eye Condition Lenses**:
     - **Cataracts (Blur)**: Simulates cloudy lenses, visual acuity reduction, and washed-out contrast to test readability of typography and controls without sharp focus.
     - **Glaucoma (Tunnel Vision)**: Simulates peripheral vision loss with an interactive central visual cone that tracks cursor movements across the page.
     - **Macular Degeneration (Central Scotoma)**: Simulates central field vision loss, placing a blind spot in the direct line of sight.
     - **Photophobia (Inverted Contrast)**: Simulates high-contrast inverted dark mode for individuals with severe glare and light sensitivity.
   - **Persistent Floating Reset Pill**: Displays the active simulation state on the webpage with a one-click **"Reset Normal"** button.

---

## Installation Instructions (Chrome / Edge / Brave)

1. **Clone or Download** this repository:
   ```bash
   git clone https://github.com/mattroburns/AuditExtension.git
   ```
   *(Or click **Code** > **Download ZIP** on GitHub and extract the archive).*

2. Open **Google Chrome** (or any Chromium browser such as Microsoft Edge, Brave, or Opera).
3. Navigate to: `chrome://extensions/` (or `edge://extensions/`).
4. Toggle on **"Developer mode"** (toggle switch in the top-right corner).
5. Click the **"Load unpacked"** button in the top-left corner.
6. Select the downloaded or cloned **`AuditExtension`** folder (the folder containing `manifest.json`).
7. **Matt's QA Extension** is now installed! Click the **Extensions puzzle piece icon (🧩)** in your browser toolbar, find the extension, and click the **Pin (📌)** icon to keep it visible on your toolbar.

---

## How to Run an Audit

1. Navigate to any website you want to test (e.g. `https://example.com` or `https://news.ycombinator.com`).
2. Click the **Matt's QA Extension** icon in the browser toolbar.
3. The current page's URL will automatically appear in the input field.
4. Click **"⚡ Run Audit"** (or press Enter):
   - The extension will inject the WCAG 2.2 engine into the page.
   - Within 2–4 seconds, the full audit scorecard, key metrics, and issues table will render.
5. **Locate & Highlight Issues on the Page**:
   - Click **"🎯 Locate"** on any violation card header to jump directly to the first affected element on the page.
   - Expand **"▼ Details"** and click any element card or the **"🎯 Highlight"** button to smoothly scroll the browser directly to that specific element and display the pulsing highlight ring and diagnostic badge.
   - In the **Screen Reader Speech & Rotor Simulation** drawer, click any readout card or **"🎯 Locate"** to highlight that auditory element in page context.
   - Press **Escape** or click **"✕"** on the floating badge to dismiss the highlight ring.
6. Click **"📄 Download PDF Report"** to immediately save the complete compliance report as a vector PDF.

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a detailed history of recent updates, UI modernizations, and report enhancements.
