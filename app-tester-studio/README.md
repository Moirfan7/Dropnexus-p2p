# 📱 AppForge Studio — In-Browser App Emulator & Bug Testing Hub

A complete web platform where you can upload mobile applications (both **Android `.apk`** and **Web/PWA `.zip`**), run and interact with them in a virtual mobile phone emulator directly in your browser, capture and debug errors ("kamiyan"), and iteratively re-upload newer builds to test if bugs are solved.

---

## 🌟 Key Features

1. **Dual App Support**:
   - **Web / PWA Apps (`.zip`)**: Instant in-browser execution with isolated iframe sandbox and automatic touch gesture emulation.
   - **Android APKs (`.apk`)**: Deep package inspection (`package name`, `target SDK`, `permissions`, `activities`) + Local ADB bridge auto-install on connected Android device/emulator.

2. **Realistic Smartphone Emulator**:
   - Device skins: **Apple iPhone 15 Pro** (with Dynamic Island), **Google Pixel 8 Pro**, **Samsung Galaxy S24**, and **Tablet View (10")**.
   - Hardware controls: Screen rotation (Portrait $\leftrightarrow$ Landscape), Soft navigation bar (Back, Home, Reload), Zoom scaling (75%, 85%, 100%).

3. **Real-time Live Debug Console (Logcat style)**:
   - Intercepts all `console.log`, `console.warn`, `console.error`, and uncaught JavaScript exceptions from the running app in real-time.
   - Filter logs by level: All, Errors, Warnings, Logs.

4. **"Kami" / Bug Tracker & Retest Cycle**:
   - **1-Click Bug Logging**: Automatically captures error messages and stack traces.
   - **Status Toggle**: Mark issues as `🔴 Open (Kami Hai)` or `✅ Solved (Theek ho gaya)`.
   - **Version History**: Easily switch between `v1.0.0` (buggy) and `v1.0.1` (fixed) to verify bug fixes!

---

## 🚀 How to Run

1. Open a terminal in this folder:
   ```bash
   cd app-tester-studio
   node server.js
   ```
   *Or simply double-click `run-studio.bat`!*

2. Open your browser:
   **[http://localhost:4000](http://localhost:4000)**

---

## ⚡ Try the Built-in Demo

The studio comes pre-loaded with a demo food delivery app (**SwiftBite**):
1. Select **v1.0.0 (Buggy)** from the sidebar.
2. Inside the emulator, click **"+ Add"** on any item, then click **"💳 Proceed to Checkout"**.
3. Notice the intentional null-pointer exception caught in the **Live Console** and the bug notification banner!
4. Click **"Log This Kami"** to save it in the bug tracker.
5. Now switch to **v1.0.1 (Fixed)**: click checkout again — the order succeeds!
6. In the bug tracker, toggle the bug to **"✅ Solved"**!
