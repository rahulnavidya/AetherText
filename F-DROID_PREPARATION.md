# F-Droid preparation status

**Status: not ready for F-Droid submission yet.** AetherText currently ships as a static browser/PWA project. A ZIP of web files is not an Android application package and cannot be submitted directly to the F-Droid app repository.

F-Droid's [Inclusion Policy](https://f-droid.org/docs/Inclusion_Policy/) requires FLOSS licensing, publicly available source, transparent builds, a unique Android application ID, licensed/redistributable assets, and quality/privacy review. The policy also generally expects at least three months of active development unless an exception applies. When a website is wrapped, the app should also offer useful native features rather than only rebranding a website.

## Work still required

1. **Choose and establish the Android packaging path.** Create an Android Studio project for a WebView or another appropriate Android wrapper; document how its assets are copied from this repository. This project does not currently include Gradle files or a native Android module.
2. **Choose a stable application ID** appropriate for the publisher. Do not use a made-up domain-controlled ID until the publisher controls or can legitimately use that namespace.
3. **Add native value.** Evaluate Android-native file picking/saving, app lifecycle and storage recovery, safe local project access, keyboard/back navigation, share intents, and appropriate permission handling.
4. **Review the JavaScript preview security model** in the Android WebView or other rendering engine. Keep author JS opt-in and isolated, document the network behavior, and avoid exposing native bridges to previewed documents.
5. **Verify all asset licenses** including app icons, fonts, and any bundled dependencies. No font files should be added without a redistribution license.
6. **Make builds reproducible from the public source** using a compatible free/open-source toolchain; provide a source tag and release notes that match the Android build recipe.
7. **Test the installed APK** on representative Android versions/devices, including offline launch, import/export, process death, WebView behavior, and data migration.
8. **Submit for review only after** the Android source, license, build recipe, application ID, privacy disclosures, and native value have been checked.

The current MIT license covers this repository's source as authored here, but does not automatically grant rights to third-party fonts or artwork that a maintainer may add later. Review ownership/licensing before the first public tag.
