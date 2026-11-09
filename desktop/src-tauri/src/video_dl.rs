use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, io::{Read, Seek, SeekFrom}, os::windows::process::CommandExt, path::{Path, PathBuf}, process::{Command, Stdio}, time::{SystemTime, UNIX_EPOCH}};
use windows::Win32::{Foundation::CloseHandle, System::Threading::{OpenProcess, GetExitCodeProcess, PROCESS_QUERY_LIMITED_INFORMATION}};

const SPAWN_FLAGS: u32 = 0x08000000 | 0x00000200;
const BREAKAWAY: u32 = 0x01000000;
const YT: &str = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/";
const FF: &str = "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/";
const ZIP: &str = "ffmpeg-master-latest-win64-gpl.zip";

fn base() -> Result<PathBuf, String> { Ok(PathBuf::from(std::env::var_os("APPDATA").ok_or("APPDATA bulunamadı")?).join("LifeTools")) }
fn tools() -> Result<PathBuf, String> { Ok(base()?.join("tools")) }
fn jobs() -> Result<PathBuf, String> { Ok(base()?.join("jobs")) }
pub fn folder() -> Result<PathBuf, String> { Ok(PathBuf::from(std::env::var_os("USERPROFILE").ok_or("Kullanıcı klasörü bulunamadı")?).join("Downloads").join("LifeTools")) }
#[derive(Default, Serialize, Deserialize)]
struct Settings { #[serde(rename = "lastDir")] last_dir: Option<String> }
fn read_settings(path: &Path) -> Settings { fs::read(path).ok().and_then(|v| serde_json::from_slice(&v).ok()).unwrap_or_default() }
fn write_settings(path: &Path, dir: &Path) -> Result<(), String> { fs::create_dir_all(path.parent().ok_or("Ayar klasörü bulunamadı")?).map_err(|e| e.to_string())?; fs::write(path, serde_json::to_vec(&Settings { last_dir: Some(dir.to_string_lossy().into_owned()) }).map_err(|e| e.to_string())?).map_err(|e| e.to_string()) }
fn settings_path() -> Result<PathBuf, String> { Ok(base()?.join("video-settings.json")) }
fn validate_dir(path: &Path) -> Result<PathBuf, String> { if !path.is_absolute() { return Err("Klasör yolu mutlak olmalı".into()); } let p = fs::canonicalize(path).map_err(|e| format!("Klasör bulunamadı: {e}"))?; if !p.is_dir() { return Err("Yol bir klasör değil".into()); } Ok(p) }
pub fn settings() -> Result<(Option<String>, String), String> { Ok((read_settings(&settings_path()?).last_dir, folder()?.to_string_lossy().into_owned())) }
fn selected_dir() -> Result<PathBuf, String> { if let Some(dir) = read_settings(&settings_path()?).last_dir { if let Ok(p) = validate_dir(Path::new(&dir)) { return Ok(p); } } let dir = folder()?; fs::create_dir_all(&dir).map_err(|e| e.to_string())?; validate_dir(&dir) }
fn spawn(cmd: &mut Command, breakaway: bool) -> std::io::Result<std::process::Child> { if breakaway { match cmd.creation_flags(SPAWN_FLAGS | BREAKAWAY).spawn() { Ok(child) => return Ok(child), Err(_) => {} } } cmd.creation_flags(SPAWN_FLAGS).spawn() }
pub fn pick_folder(initial: Option<&str>) -> Result<Option<String>, String> {
    use windows::{core::{w, PCWSTR}, Win32::{System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED}, UI::{Shell::{FileOpenDialog, IFileOpenDialog, IShellItem, SHCreateItemFromParsingName, FOS_PICKFOLDERS, FOS_FORCEFILESYSTEM, SIGDN_FILESYSPATH}, WindowsAndMessaging::{CreateWindowExW, DestroyWindow, WS_EX_TOPMOST, WS_POPUP}}}};
    use std::os::windows::ffi::OsStrExt;
    unsafe {
        CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok().map_err(|e| e.to_string())?;
        let result = (|| -> Result<Option<String>, String> {
            let dialog: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER).map_err(|e| e.to_string())?;
            dialog.SetOptions(dialog.GetOptions().map_err(|e| e.to_string())? | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM).map_err(|e| e.to_string())?;
            dialog.SetTitle(w!("İndirme klasörünü seç")).map_err(|e| e.to_string())?;
            let initial_path = initial.and_then(|p| validate_dir(Path::new(p)).ok()).or_else(|| selected_dir().ok());
            if let Some(path) = initial_path { let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect(); if let Ok(item) = SHCreateItemFromParsingName::<_, _, IShellItem>(PCWSTR(wide.as_ptr()), None) { let _ = dialog.SetFolder(&item); } }
            let owner = CreateWindowExW(WS_EX_TOPMOST, w!("STATIC"), w!(""), WS_POPUP, 0, 0, 0, 0, None, None, None, None).map_err(|e| e.to_string())?;
            let shown = dialog.Show(Some(owner));
            let _ = DestroyWindow(owner);
            if let Err(e) = shown { if e.code().0 as u32 == 0x800704c7 { return Ok(None); } return Err(e.to_string()); }
            let item = dialog.GetResult().map_err(|e| e.to_string())?;
            let raw = item.GetDisplayName(SIGDN_FILESYSPATH).map_err(|e| e.to_string())?;
            let value = raw.to_string().map_err(|e| e.to_string()); CoTaskMemFree(Some(raw.0.cast()));
            let path = validate_dir(Path::new(&value?))?; write_settings(&settings_path()?, &path)?; Ok(Some(path.to_string_lossy().into_owned()))
        })(); CoUninitialize(); result
    }
}
fn system(name: &str) -> Result<PathBuf, String> { Ok(PathBuf::from(std::env::var_os("SystemRoot").ok_or("SystemRoot bulunamadı")?).join("System32").join(name)) }
fn now() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() }
fn running(pid: u32) -> bool { unsafe { if let Ok(h) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) { let mut code = 0; let ok = GetExitCodeProcess(h, &mut code).is_ok() && code == 259; let _ = CloseHandle(h); ok } else { false } } }
fn run(cmd: &mut Command) -> Result<(), String> { let output = cmd.creation_flags(SPAWN_FLAGS).output().map_err(|e| format!("İşlem başlatılamadı: {e}"))?; if output.status.success() { Ok(()) } else { Err(format!("İşlem başarısız: {}", String::from_utf8_lossy(&output.stderr))) } }
fn download(url: &str, path: &Path) -> Result<(), String> { run(Command::new(system("curl.exe")?).args(["-fL", "--retry", "2", "-o"]).arg(path).arg(url)) }
fn checksum(lines: &str, name: &str) -> Option<String> { lines.lines().find_map(|line| { let mut p = line.split_whitespace(); let hash = p.next()?; let file = p.next()?.trim_start_matches('*').trim_start_matches("./"); if file == name && hash.len() == 64 && hash.bytes().all(|b| b.is_ascii_hexdigit()) { Some(hash.to_ascii_lowercase()) } else { None } }) }
fn verified(url: &str, sums_url: &str, name: &str, part: &Path) -> Result<(), String> {
    let sums = part.with_extension("sums.part");
    let result = (|| { download(url, part)?; download(sums_url, &sums)?; let expected = checksum(&fs::read_to_string(&sums).map_err(|e| e.to_string())?, name).ok_or("Sağlama toplamı bulunamadı")?; let mut file = fs::File::open(part).map_err(|e| e.to_string())?; let mut hash = Sha256::new(); std::io::copy(&mut file, &mut hash).map_err(|e| e.to_string())?; if format!("{:x}", hash.finalize()) != expected { return Err("Dosya sağlama toplamı eşleşmiyor".into()); } Ok(()) })();
    let _ = fs::remove_file(&sums); if result.is_err() { let _ = fs::remove_file(part); } result
}
fn install() -> Result<(), String> {
    let dir = tools()?; fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    if !dir.join("yt-dlp.exe").is_file() { let part = dir.join("yt-dlp.exe.part"); verified(&format!("{YT}yt-dlp.exe"), &format!("{YT}SHA2-256SUMS"), "yt-dlp.exe", &part)?; fs::rename(&part, dir.join("yt-dlp.exe")).map_err(|e| { let _ = fs::remove_file(&part); e.to_string() })?; }
    if !dir.join("ffmpeg.exe").is_file() || !dir.join("ffprobe.exe").is_file() {
        let part = dir.join(format!("{ZIP}.part")); let temp = dir.join(format!("extract-{}", now()));
        let result: Result<(), String> = (|| { verified(&format!("{FF}{ZIP}"), &format!("{FF}checksums.sha256"), ZIP, &part)?; fs::create_dir_all(&temp).map_err(|e| e.to_string())?; run(Command::new(system("tar.exe")?).arg("-xf").arg(&part).arg("-C").arg(&temp))?;
            let root = fs::read_dir(&temp).map_err(|e| e.to_string())?.filter_map(Result::ok).map(|e| e.path()).find(|p| p.join("bin").join("ffmpeg.exe").is_file()).ok_or("FFmpeg arşivi geçersiz")?;
            for name in ["ffmpeg.exe", "ffprobe.exe"] { let target = dir.join(name); let staged = dir.join(format!("{name}.part")); fs::copy(root.join("bin").join(name), &staged).map_err(|e| e.to_string())?; if target.exists() { fs::remove_file(&target).map_err(|e| e.to_string())?; } fs::rename(staged, target).map_err(|e| e.to_string())?; } Ok(()) })();
        let _ = fs::remove_file(&part); let _ = fs::remove_dir_all(&temp); for name in ["ffmpeg.exe.part", "ffprobe.exe.part"] { let _ = fs::remove_file(dir.join(name)); } result?;
    } Ok(())
}
#[derive(Serialize)] pub struct ToolStatus { ytdlp: ToolInfo, ffmpeg: bool, installing: bool, folder: String, error: Option<String> }
#[derive(Serialize)] struct ToolInfo { installed: bool, version: Option<String> }
pub fn status() -> Result<ToolStatus, String> { let dir = tools()?; let exe = dir.join("yt-dlp.exe"); let installed = exe.is_file(); let version = if installed { Command::new(exe).arg("--version").creation_flags(SPAWN_FLAGS).output().ok().filter(|o| o.status.success()).map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()) } else { None }; let lock = dir.join("install.lock"); let installing = fs::read_to_string(&lock).ok().and_then(|s| s.parse().ok()).map(running).unwrap_or(false); Ok(ToolStatus { ytdlp: ToolInfo { installed, version }, ffmpeg: dir.join("ffmpeg.exe").is_file() && dir.join("ffprobe.exe").is_file(), installing, folder: folder()?.to_string_lossy().into_owned(), error: fs::read_to_string(dir.join("install-error.txt")).ok() }) }
pub fn begin_install() -> Result<(), String> { let dir = tools()?; fs::create_dir_all(&dir).map_err(|e| e.to_string())?; let lock = dir.join("install.lock"); if status()?.installing { return Ok(()); } let _ = fs::remove_file(&lock); let mut guard = fs::OpenOptions::new().write(true).create_new(true).open(&lock).map_err(|e| format!("Kurulum başlatılamadı: {e}"))?; use std::io::Write; write!(guard, "{}", std::process::id()).map_err(|e| e.to_string())?; let _ = fs::remove_file(dir.join("install-error.txt")); if let Err(e) = spawn(Command::new(std::env::current_exe().map_err(|e| e.to_string())?).arg("--install-video-tools").stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()), true) { let _ = fs::remove_file(lock); return Err(format!("Kurulum başlatılamadı: {e}")); } Ok(()) }
pub fn install_helper() { if let Ok(dir) = tools() { let _ = fs::write(dir.join("install.lock"), std::process::id().to_string()); } let result = install(); if let Ok(dir) = tools() { if let Err(e) = result { let _ = fs::write(dir.join("install-error.txt"), format!("Kurulum başarısız: {e}")); } let _ = fs::remove_file(dir.join("install.lock")); } }
pub fn update() -> Result<(), String> { install()?; run(Command::new(tools()?.join("yt-dlp.exe")).arg("-U")) }
fn validate(url: &str) -> Result<(), String> { if url.len() > 2048 || url.chars().any(|c| c.is_whitespace() || c.is_control()) { return Err("Geçersiz URL".into()); } let u = tauri::Url::parse(url).map_err(|_| "Geçersiz URL")?; if !matches!(u.scheme(), "http" | "https") || u.host_str().is_none() { return Err("Yalnızca HTTP veya HTTPS adresleri desteklenir".into()); } Ok(()) }
fn args(url: &str, mode: &str, dir: &Path, output: &Path) -> Result<Vec<String>, String> { validate(url)?; let mut a = vec!["--ffmpeg-location".into(), dir.to_string_lossy().into_owned(), "--no-quiet".into(), "--no-playlist".into(), "--newline".into(), "--progress-template".into(), "download:LT_PROGRESS:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s".into(), "--print".into(), "after_move:LT_FILE:%(filepath)s".into(), "--merge-output-format".into(), "mp4".into(), "-o".into(), output.join("%(title).150B [%(id)s].%(ext)s").to_string_lossy().into_owned()]; match mode { "video_best" | "video_1080" | "video_720" => { a.push("-f".into()); a.push(match mode { "video_best" => "bv*+ba/b", "video_1080" => "bv*[height<=1080]+ba/b[height<=1080]", _ => "bv*[height<=720]+ba/b[height<=720]" }.into()); }, "audio_mp3" => a.extend(["-x".into(), "--audio-format".into(), "mp3".into()]), _ => return Err("Geçersiz indirme modu".into()) }; a.extend(["--".into(), url.into()]); Ok(a) }
#[derive(Serialize, Deserialize)] pub struct Job { pub id: String, url: String, mode: String, pid: u32, started_at: u64, output_dir: String, #[serde(default)] cancelled: bool }
#[derive(Serialize)] pub struct JobStatus { #[serde(flatten)] job: Job, state: String, percent: Option<String>, speed: Option<String>, eta: Option<String>, file: Option<String>, error: Option<String> }
fn job_path(id: &str) -> Result<PathBuf, String> { if id.is_empty() || !id.bytes().all(|b| b.is_ascii_digit() || b == b'-') { return Err("Geçersiz iş kimliği".into()); } Ok(jobs()?.join(format!("{id}.json"))) }
pub fn start(url: &str, mode: &str, requested_dir: Option<&str>) -> Result<String, String> { let dir = tools()?; let output = match requested_dir { Some(p) => validate_dir(Path::new(p))?, None => selected_dir()? }; let a = args(url, mode, &dir, &output)?; if !status()?.ytdlp.installed || !status()?.ffmpeg { return Err("TOOLS_MISSING: İndirme araçları kurulu değil".into()); } fs::create_dir_all(&output).map_err(|e| e.to_string())?; let jd = jobs()?; fs::create_dir_all(&jd).map_err(|e| e.to_string())?; let id = format!("{}-{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos(), std::process::id()); let log = fs::File::create(jd.join(format!("{id}.log"))).map_err(|e| e.to_string())?; let child = spawn(Command::new(dir.join("yt-dlp.exe")).args(a).stdin(Stdio::null()).stdout(Stdio::from(log.try_clone().map_err(|e| e.to_string())?)).stderr(Stdio::from(log)), true).map_err(|e| format!("İndirme başlatılamadı: {e}"))?; let job = Job { id: id.clone(), url: url.into(), mode: mode.into(), pid: child.id(), started_at: now(), output_dir: output.to_string_lossy().into_owned(), cancelled: false }; fs::write(job_path(&id)?, serde_json::to_vec(&job).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?; write_settings(&settings_path()?, &output)?; Ok(id) }
fn progress(line: &str) -> Option<(String, String, String)> { let mut p = line.strip_prefix("LT_PROGRESS:")?.split('|'); Some((p.next()?.trim().into(), p.next()?.trim().into(), p.next()?.trim().into())) }
fn final_path(line: &str) -> Option<String> { line.strip_prefix("LT_FILE:").map(|s| s.trim().to_string()).filter(|s| !s.is_empty()) }
pub fn job_status(id: &str) -> Result<JobStatus, String> { let job: Job = serde_json::from_slice(&fs::read(job_path(id)?).map_err(|e| format!("İş bulunamadı: {e}"))?).map_err(|e| e.to_string())?; let mut s = JobStatus { job, state: "running".into(), percent: None, speed: None, eta: None, file: None, error: None }; if let Ok(mut f) = fs::File::open(jobs()?.join(format!("{id}.log"))) { let len = f.metadata().map(|m| m.len()).unwrap_or(0); let _ = f.seek(SeekFrom::Start(len.saturating_sub(256 * 1024))); let mut data = Vec::new(); let _ = f.read_to_end(&mut data); for line in String::from_utf8_lossy(&data).lines() { if let Some((p, speed, eta)) = progress(line) { s.percent = Some(p); s.speed = Some(speed); s.eta = Some(eta); } if let Some(path) = final_path(line) { s.file = Some(path); } if line.starts_with("ERROR:") { s.error = Some(line.to_string()); } } } if s.job.cancelled { s.state = "cancelled".into(); } else if !running(s.job.pid) { s.state = if s.file.is_some() && s.error.is_none() { "done" } else { "error" }.into(); if s.state == "error" && s.error.is_none() { s.error = Some("İndirme tamamlanamadı".into()); } } Ok(s) }
pub fn list() -> Result<Vec<JobStatus>, String> { let dir = jobs()?; fs::create_dir_all(&dir).map_err(|e| e.to_string())?; let mut found = Vec::new(); for e in fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() { let p = e.path(); if p.extension().and_then(|x| x.to_str()) != Some("json") { continue; } if let Some(id) = p.file_stem().and_then(|x| x.to_str()) { if let Ok(s) = job_status(id) { if now().saturating_sub(s.job.started_at) > 7 * 86400 && s.state != "running" { let _ = fs::remove_file(&p); let _ = fs::remove_file(dir.join(format!("{id}.log"))); } else { found.push(s); } } } } found.sort_by(|a,b| b.job.started_at.cmp(&a.job.started_at)); found.truncate(20); Ok(found) }
pub fn cancel(id: &str) -> Result<(), String> { let path = job_path(id)?; let mut job: Job = serde_json::from_slice(&fs::read(&path).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?; if running(job.pid) { run(Command::new(system("taskkill.exe")?).args(["/PID", &job.pid.to_string(), "/T", "/F"]))?; job.cancelled = true; fs::write(path, serde_json::to_vec(&job).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?; } Ok(()) }
pub fn open_folder() -> Result<(), String> { let dir = selected_dir()?; Command::new(PathBuf::from(std::env::var_os("SystemRoot").ok_or("SystemRoot bulunamadı")?).join("explorer.exe")).arg(dir).creation_flags(SPAWN_FLAGS).spawn().map_err(|e| e.to_string())?; Ok(()) }

#[cfg(test)] mod tests { use super::*; #[test] fn validation_and_args() { for u in ["-o x", "file://x", "https://a b", &format!("https://x/{}", "a".repeat(2048))] { assert!(validate(u).is_err()); } for m in ["video_best", "video_1080", "video_720", "audio_mp3"] { let a = args("https://example.com", m, Path::new("tools"), Path::new("out")).unwrap(); assert_eq!(&a[a.len()-2..], ["--", "https://example.com"]); } } #[test] fn parsing() { let hash = "a".repeat(64); assert_eq!(checksum(&format!("{hash} *yt-dlp.exe"), "yt-dlp.exe"), Some(hash)); assert_eq!(progress("LT_PROGRESS: 12% | 1MiB/s | 2s").unwrap().0, "12%"); assert_eq!(final_path("LT_FILE:C:\\a.mp4"), Some("C:\\a.mp4".into())); } }

#[cfg(test)] mod directory_tests {
    use super::*;
    #[test] fn settings_and_validation() {
        let root = std::env::temp_dir().join(format!("lifetools-video-test-{}-{}", std::process::id(), SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
        fs::create_dir_all(&root).unwrap();
        let settings = root.join("settings.json");
        assert!(read_settings(&settings).last_dir.is_none());
        assert!(validate_dir(Path::new("relative")).is_err());
        assert!(validate_dir(&root.join("missing")).is_err());
        fs::write(root.join("file"), b"x").unwrap();
        assert!(validate_dir(&root.join("file")).is_err());
        let canonical = validate_dir(&root).unwrap();
        write_settings(&settings, &canonical).unwrap();
        assert_eq!(read_settings(&settings).last_dir, Some(canonical.to_string_lossy().into_owned()));
        fs::remove_dir_all(root).unwrap();
    }
    #[test] fn no_detached_process() { assert_eq!(SPAWN_FLAGS & 0x00000008, 0); }
}
