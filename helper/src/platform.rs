//! What differs between macOS, Linux and Windows: program names, starting and stopping yt-dlp, and
//! showing a file.

use std::path::{Path, PathBuf};
use std::process::Command;

/// Browsers started from the Dock or a desktop launcher pass a minimal PATH, so the helper also looks in
/// the usual places.
#[cfg(unix)]
pub const SYSTEM_DIRS: &[&str] = &["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"];
#[cfg(windows)]
pub const SYSTEM_DIRS: &[&str] = &[];

/// A program's file name on this system: `ffmpeg` here, `ffmpeg.exe` on Windows.
pub fn exe(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    }
}

/// Windows paths from `canonicalize` start with `\\?\`, which browsers and Explorer don't accept.
pub fn plain(path: &Path) -> PathBuf {
    let text = path.to_string_lossy();
    match text.strip_prefix(r"\\?\") {
        Some(rest) => PathBuf::from(rest),
        None => path.to_path_buf(),
    }
}

#[cfg(windows)]
mod flags {
    pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    pub const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
}

/// Keeps a helper-started program from opening a console window on Windows.
pub fn hide_window(command: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(flags::CREATE_NO_WINDOW);
    }
    command
}

/// Starts yt-dlp in a group of its own, so stopping it also stops the ffmpeg it starts.
pub fn own_group(command: &mut Command) -> &mut Command {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(flags::CREATE_NO_WINDOW | flags::CREATE_NEW_PROCESS_GROUP);
    }
    command
}

/// Stops a process started with [`own_group`] and everything it started.
pub fn terminate(pid: u32) {
    #[cfg(unix)]
    unsafe {
        libc::kill(-(pid as i32), libc::SIGTERM);
    }
    #[cfg(windows)]
    {
        let _ = hide_window(&mut Command::new("taskkill"))
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .status();
    }
}

/// Shows a saved file in the system's file manager.
pub fn reveal(path: &Path) -> std::io::Result<()> {
    let mut command = if cfg!(target_os = "macos") {
        let mut open = Command::new("open");
        open.arg("-R").arg(path);
        open
    } else if cfg!(windows) {
        let mut explorer = Command::new("explorer");
        explorer.arg(format!("/select,{}", plain(path).display()));
        explorer
    } else {
        let mut open = Command::new("xdg-open");
        open.arg(path.parent().unwrap_or(path));
        open
    };
    // Explorer reports failure even when it opened the folder, so only a failed start counts.
    command.spawn().map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_programs_for_this_system() {
        let expected = if cfg!(windows) {
            "ffmpeg.exe"
        } else {
            "ffmpeg"
        };
        assert_eq!(exe("ffmpeg"), expected);
    }

    #[test]
    fn drops_the_windows_verbatim_prefix() {
        assert_eq!(
            plain(Path::new(r"\\?\C:\Users\a\helper.exe")),
            PathBuf::from(r"C:\Users\a\helper.exe")
        );
        assert_eq!(plain(Path::new("/usr/bin/a")), PathBuf::from("/usr/bin/a"));
    }
}
