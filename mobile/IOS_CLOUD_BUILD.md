# Build iOS app from Windows (EAS Cloud Build)

Use this to build the Aero Drone app for your iPhone when you don’t have a Mac. The build runs in Expo’s cloud; you install the result on your phone.

---

## Prerequisites

- **Expo account** (free): [https://expo.dev/signup](https://expo.dev/signup)
- **Apple ID** (the same one you use on your iPhone)
- **iPhone** with cable or same Wi‑Fi for installing the build

---

## Step 1: Install EAS CLI

In PowerShell (or Command Prompt), from anywhere:

```bash
npm install -g eas-cli
```

Or use it once without installing:

```bash
npx eas-cli
```

---

## Step 2: Log in to Expo

From your project folder:

```bash
cd mobile
eas login
```

Enter your Expo email and password. If you don’t have an account, create one at [expo.dev](https://expo.dev).

---

## Step 3: Configure the project (first time only)

EAS needs to know which Expo account and project to use:

```bash
eas build:configure
```

- Choose **All** (or just **iOS**).
- If asked to create an EAS project, say **Yes**. This links this app to your Expo account.

You already have an `eas.json` in this project. You can keep it as is; it’s set up for iOS with real BLE.

---

## Step 4: Build for iOS

Run:

```bash
eas build --platform ios --profile development
```

- **First time only:** EAS will ask about your **Apple Developer** setup:
  - **Register your Apple Developer account:** choose “Log in with Apple” and sign in with your **Apple ID**. You do **not** need a paid Apple Developer Program membership for internal (ad‑hoc) installs on your own device.
  - **Provisioning:** choose “Let EAS manage your credentials” (recommended).
  - **Device registration:** when prompted, **register your iPhone** (EAS can detect it if the phone is connected, or you can enter its UDID later in the Expo dashboard).

- The build will run in the cloud (often 10–20 minutes). You can close the terminal; you’ll get a link to the build page.

- When the build **succeeds**, EAS shows a **Build details** page with a **QR code** and an **Install** link.

---

## Step 5: Install the app on your iPhone

1. On your **iPhone**, open the **Install** link from the build page (or scan the QR code with the camera and open the link).
2. If you see “Untrusted Developer” or “Cannot verify app”:
   - On the iPhone: **Settings → General → VPN & Device Management** (or **Profiles & Device Management**).
   - Tap the developer profile for the app → **Trust**.
3. Open the **Aero Drone App** on the home screen. It will use **real BLE** (no mocks); you can scan for **DroneBLE** and connect.

---

## Profiles in `eas.json`

- **development** – Dev client, good for testing on your phone with real BLE. Use:  
  `eas build --platform ios --profile development`
- **preview** – Internal (ad‑hoc) build, no dev client. Use:  
  `eas build --platform ios --profile preview`
- **production** – For App Store (requires paid Apple Developer Program). Use:  
  `eas build --platform ios --profile production`

All profiles use real BLE (no mocks).

---

## Troubleshooting

- **“No valid devices”** – Register your iPhone in [Expo Dashboard → Devices](https://expo.dev/accounts/[your-account]/devices) (or when EAS prompts). You may need to enter the UDID (find it in **Settings → General → About** or via iTunes/Finder).
- **“Apple Developer account” errors** – Make sure you’re signed in with the same Apple ID you use on the iPhone. For App Store distribution you need the paid Apple Developer Program.
- **Build fails on “react-native-ble-plx”** – The project is already set up with the BLE plugin in `app.json`. If it still fails, check the build log on the Expo dashboard and ensure `eas.json` and `app.json` are committed.

---

## Quick reference

```bash
cd mobile
eas login
eas build --platform ios --profile development
# Then open the build page link and install on your iPhone.
```
