# Matt's Accessibility Tool (Chrome Extension)

A standalone Google Chrome Extension (Manifest V3) that evaluates any web page against the latest **WCAG 2.2 Level AA** standards, performs interactive **:hover state color contrast verification**, lints **ARIA accessible labels**, analyzes **logical tab navigation order** with an interactive **visual Tab-Trail overlay**, emulates **Color Blindness** (Protanopia, Deuteranopia, Tritanopia, Achromatopsia), and generates **vector PDF compliance reports**.

---

## Key Features

1. **Toolbar Quick-Audit**:
   - Click the extension icon from Chrome's toolbar.
   - Pre-fills the active tab's URL automatically.
   - Enter any custom URL and click **"Go"** to audit.

2. **Strictly Non-Branded & Score-Based**:
   - Zero vendor branding, user names, outreach proposals, or commercial pricing.
   - Objective 0–100 compliance scoring formula based on WCAG violation severities.
   - Grade (A+, A, B, C, D, F) and Risk Rating (Low, Moderate, High, Severe).

3. **Latest WCAG 2.2 Standards**:
   - Evaluates WCAG 2.2 AA rules (including Target Size Minimum, Focus Appearance, and Accessible Authentication).
   - Simulates interactive **:hover states** on buttons and links to catch contrast drops when background changes.
   - Lints ARIA attributes for **WCAG 2.5.3 (Label in Name)**, generic labels, and icon contradictions.

4. **Screen Reader & VoiceOver Compatibility Assessment & Live Speech Engine**:
   - **Audible Speech Synthesis Engine**: Actually speaks what screen readers announce aloud using the native Web Speech API—no external VoiceOver or NVDA software required!
   - **Playback Controls Bar**: "▶ Read All" sequential walkthrough with Play, Pause, Resume, Stop, Next, Previous, and Speed controls (1.0x, 1.25x, 1.5x, 2.0x).
   - **Screen Reader Persona Switcher**: Toggle between **Apple VoiceOver (macOS)** format (*[Name], [State], [Role], [Hint]*), **NVDA / JAWS (Windows)** format (*[Role], [Name], [State]*), and **Windows Narrator**.
   - **Screen Reader Rotor Modes**: Filter and jump through the page using VoiceOver Rotor / NVDA Elements List modes: Sequential Flow, Headings Rotor (H-Key), Landmarks Rotor (D-Key), Links Rotor (U-Key), and Controls Rotor.
   - **Interactive On-Page Simulator**: Click "🚀 On-Page Simulator" to navigate the live webpage with `Tab` and `Shift+Tab`; elements receive glowing focus rings while announcements are spoken aloud with an on-screen VoiceOver caption banner.
   - **Synthesized Earcons (Sound Cues)**: Web Audio API harmonic cues for links, landmarks, buttons, and friction barriers.
   - **Dedicated Screen Reader Score (0–100)**: Quantifies auditory ease-of-access for users navigating via assistive speech technologies.
   - **Rotor & Landmark Navigation Checks**: Audits sequential heading hierarchy (detects missing `<h1>`, skipped heading levels `h1`➔`h4`, and empty headings) and ARIA landmark regions (flags missing `<main>` and unlabelled duplicate `<nav>`).
   - **Silent Focus Trap Detection**: Flags focusable interactive controls buried inside `aria-hidden="true"` containers where screen readers remain silent while keyboard focus is active.
   - **Auditory Friction Detection**: Flags raw file names in alt text (`.png`, `.jpg`), unlabelled images, repetitive "image of" prefixes, and ambiguous links (`"click here"`, `"learn more"`).

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

8. **Color Blindness (CVD) Emulation Lens**:
   - **One-Click Live Emulation**: Switch between vision profiles directly from the extension bar:
     - **Protanopia** (Red-blind / L-cone deficiency)
     - **Deuteranopia** (Green-blind / M-cone deficiency, ~5% of males)
     - **Tritanopia** (Blue/Yellow-blind / S-cone deficiency)
     - **Achromatopsia** (Monochromacy / Complete color blindness)
   - **Mathematically Accurate SVG Matrices**: Uses calibrated color transformation matrices applied live to the page DOM.
   - **Persistent Floating Reset Pill**: Displays active simulation state on the webpage with a one-click **"Reset Normal"** button.

---

## Installation Instructions (Developer Mode)

To install and use this extension in Google Chrome:

1. Open **Google Chrome**.
2. Navigate to: `chrome://extensions/`
3. Toggle on **"Developer mode"** (switch in the top-right corner).
4. Click the **"Load unpacked"** button in the top-left corner.
5. Select this folder:
   ```
   c:\Users\mattr\Documents\AuditExtension
   ```
6. The extension **"Matt's Accessibility Tool"** will now appear in your extensions list.
7. Click the **Extensions puzzle piece icon (🧩)** in Chrome's top toolbar, find the extension, and click the **Pin (📌)** icon to keep it visible on your toolbar.

---

## How to Run an Audit

1. Navigate to any website you want to test (e.g. `https://example.com` or `https://news.ycombinator.com`).
2. Click the **🛡️ WCAG Auditor** icon in the toolbar.
3. The current page's URL will automatically appear in the input field.
4. Click **"⚡ Go"**:
   - The extension will inject the WCAG 2.2 engine into the page.
   - Within 2–4 seconds, the full audit scorecard, key metrics, and issues table will render.
5. **Locate & Highlight Issues on the Page**:
   - Click **"🎯 Locate"** on any violation card header to jump directly to the first affected element on the page.
   - Expand **"▼ Details"** and click any element card or the **"🎯 Highlight"** button to smoothly scroll the browser directly to that specific element and display the pulsing highlight ring and diagnostic badge.
   - In the **Screen Reader Speech & Rotor Simulation** drawer, click any readout card or **"🎯 Locate"** to highlight that auditory element in page context.
   - Press **Escape** or click **"✕"** on the floating badge to dismiss the highlight ring.
6. Click **"📄 Download PDF Report"** to immediately save the complete compliance report as a vector PDF.
