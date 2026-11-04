import { describe, expect, it } from 'vitest';
import { installStep } from '@/lib/install';

describe('installStep', () => {
  it('gives macOS and Linux the shell installer', () => {
    for (const os of ['mac', 'linux']) {
      expect(installStep(os)).toEqual({
        app: 'Terminal',
        command: 'curl -fsSL https://ext.clipsave.link/install.sh | sh',
      });
    }
  });

  it('gives Windows the PowerShell installer', () => {
    expect(installStep('win')).toEqual({
      app: 'PowerShell',
      command: 'irm https://ext.clipsave.link/install.ps1 | iex',
    });
  });

  it('has nothing for systems the helper does not run on', () => {
    expect(installStep('cros')).toBeNull();
    expect(installStep('android')).toBeNull();
  });
});
