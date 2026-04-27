# Microsoft Store MSIX Submission

AI Usage should use MSIX for Microsoft Store submission when no trusted code signing certificate is available.

## Why MSIX

- Microsoft Store re-signs MSIX packages after certification.
- A separate commercial code signing certificate is not required for Store-distributed MSIX packages.
- MSIX avoids the MSI/EXE Store policy warning that requires the installer and all PE files to be Authenticode-signed with a certificate chaining to the Microsoft Trusted Root Program.

## Partner Center Values

Use the Partner Center Developer profile values:

- Publisher display name: `Yeoreum`
- Windows publisher ID: `Yeoreum`
- App name: `AI Usage`

The Tauri bundle metadata sets `publisher` to `Yeoreum` so converted installer metadata is easier to identify.

## Recommended Flow

1. Build the Windows app locally:

   ```powershell
   $env:Path="$env:USERPROFILE\.cargo\bin;C:\Program Files\LLVM\bin;$env:Path"
   $env:LIBCLANG_PATH="C:\Program Files\LLVM\bin"
   npm.cmd run tauri -- build
   ```

2. Install Microsoft MSIX Packaging Tool from Microsoft Store.

3. Create a new package from the generated MSI:

   ```text
   src-tauri\target\release\bundle\msi\AI Usage_0.1.0_x64_en-US.msi
   ```

4. In the package information step, use:

   - Package name: `AIUsage`
   - Package display name: `AI Usage`
   - Publisher display name: `Yeoreum`
   - Version: `0.1.0.0`

5. Finish packaging and submit the generated `.msix` or `.msixbundle` in Partner Center.

## Notes For Certification

AI Usage does not install drivers, NT services, browser extensions, or bundled third-party applications. It installs the AI Usage desktop app only.

The app depends on local credentials created by supported third-party AI tools. If those tools are not installed or signed in on the tester's machine, provider cards may show a not-logged-in or unavailable state.

## MSI/EXE Alternative

If MSI/EXE submission is used instead of MSIX, the installer and all included PE files must be signed with a SHA256 or stronger code signing certificate that chains to a CA in the Microsoft Trusted Root Program. Self-signed certificates are not accepted for this path.
