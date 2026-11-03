/** Where people get the helper. The installers always fetch the newest release. */
const RELEASES = 'https://github.com/sahedulislamrony/ClipSave-Extensions/releases/latest/download';

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
      return { app: 'Terminal', command: `curl -fsSL ${RELEASES}/install.sh | sh` };
    case 'win':
      return { app: 'PowerShell', command: `irm ${RELEASES}/install.ps1 | iex` };
    default:
      return null;
  }
}
