/**
 * Where people get the helper: the website's short addresses, which serve the newest release's install.sh and
 * install.ps1 from GitHub on every request (and count each run). The same scripts are attached to every release.
 */
const INSTALLERS = 'https://ext.clipsave.link';

export const HELP_PAGE =
  'https://github.com/sahedulislamrony/ClipSave-Extensions/blob/main/docs/install.md#install-the-helper';

export interface InstallStep {
  /** The app to paste the command into. */
  app: 'Terminal' | 'PowerShell';
  command: string;
}

/** The one command that installs the helper, for an `os` from `runtime.getPlatformInfo()`. */
export function installStep(os: string): InstallStep | null {
  switch (os) {
    case 'mac':
    case 'linux':
      return { app: 'Terminal', command: `curl -fsSL ${INSTALLERS}/install.sh | sh` };
    case 'win':
      return { app: 'PowerShell', command: `irm ${INSTALLERS}/install.ps1 | iex` };
    default:
      return null;
  }
}
