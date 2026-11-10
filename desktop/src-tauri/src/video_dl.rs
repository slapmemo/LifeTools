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
fn selected_ids(items: &[String]) -> Result<Vec<String>, String> { if items.is_empty() || items.len() > 500 { return Err("Geçersiz video seçimi".into()); } let mut seen = std::collections::HashSet::new(); let mut result = Vec::new(); for id in items { if id.len() != 11 || !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-') { return Err("Geçersiz video kimliği".into()); } if seen.insert(id.clone()) { result.push(id.clone()); } } Ok(result) }
fn sanitize_folder(name: &str) -> String { let cleaned: String = name.chars().filter(|c| !c.is_control() && !"<>:\"/\\|?*%".contains(*c)).collect(); let shortened: String = cleaned.trim_matches(|c| c == ' ' || c == '.').chars().take(100).collect(); let result = shortened.trim_matches(|c| c == ' ' || c == '.'); if result.is_empty() { "YouTube seçimi".into() } else { result.into() } }
fn selected_args(url: &str, mode: &str, dir: &Path, output: &Path, items: &[String], folder_name: &str) -> Result<Vec<String>, String> { let ids = selected_ids(items)?; let single = mode.strip_prefix("selected:").ok_or("Geçersiz indirme modu")?; if !matches!(single, "video_best" | "video_720" | "audio_mp3") { return Err("Geçersiz indirme modu".into()); } let mut a = args(url, single, dir, output)?; let pos = a.iter().position(|x| x == "-o").unwrap(); a[pos + 1] = output.join(sanitize_folder(folder_name)).join("%(autonumber)03d - %(title).150B [%(id)s].%(ext)s").to_string_lossy().into_owned(); a.truncate(a.len() - 2); a.extend(["--ignore-errors".into(), "--autonumber-start".into(), "1".into(), "--".into()]); a.extend(ids.iter().map(|id| format!("https://www.youtube.com/watch?v={id}"))); Ok(a) }
fn args(url: &str, mode: &str, dir: &Path, output: &Path) -> Result<Vec<String>, String> {
    validate(url)?;
    let playlist = matches!(mode, "playlist:video_best" | "playlist:video_720" | "playlist:audio_mp3");
    if playlist {
        let u = tauri::Url::parse(url).map_err(|_| "Geçersiz URL")?;
        if u.scheme() != "https" || !matches!(u.host_str(), Some("www.youtube.com" | "youtube.com" | "m.youtube.com")) || !u.query_pairs().any(|(k, v)| k == "list" && !v.is_empty()) { return Err("Geçersiz oynatma listesi URL'si".into()); }
    }
    let mut a = vec!["--ffmpeg-location".into(), dir.to_string_lossy().into_owned(), "--no-quiet".into(), if playlist { "--yes-playlist" } else { "--no-playlist" }.into(), "--newline".into(), "--progress-template".into(), if playlist { "download:LT_PROGRESS:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(info.playlist_index)s/%(info.n_entries)s" } else { "download:LT_PROGRESS:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s" }.into(), "--print".into(), "after_move:LT_FILE:%(filepath)s".into(), "--merge-output-format".into(), "mp4".into(), "-o".into(), output.join(if playlist { "%(playlist_title).100B/%(playlist_index)03d - %(title).150B [%(id)s].%(ext)s" } else { "%(title).150B [%(id)s].%(ext)s" }).to_string_lossy().into_owned()];
    if playlist { a.push("--ignore-errors".into()); }
    let selected = if playlist { mode.strip_prefix("playlist:").unwrap() } else { mode };
    match selected { "video_best" | "video_1080" | "video_720" => { a.push("-f".into()); a.push(match selected { "video_best" => "bv*+ba/b", "video_1080" => "bv*[height<=1080]+ba/b[height<=1080]", _ => "bv*[height<=720]+ba/b[height<=720]" }.into()); }, "audio_mp3" => a.extend(["-f", "bestaudio/best", "-x", "--audio-format", "mp3", "--audio-quality", "0", "--embed-thumbnail", "--add-metadata"].map(String::from)), _ => { let raw = selected.strip_prefix("height:").ok_or("Geçersiz indirme modu")?; if raw.is_empty() || !raw.bytes().all(|b| b.is_ascii_digit()) { return Err("Geçersiz indirme modu".into()); } let height: u32 = raw.parse().map_err(|_| "Geçersiz indirme modu")?; if !(144..=4320).contains(&height) { return Err("Geçersiz indirme modu".into()); } a.extend(["-f".into(), format!("bv*[height={height}]+ba/b[height={height}]/bv*[height<={height}]+ba/b[height<={height}]")]); } }; a.extend(["--".into(), url.into()]); Ok(a)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SizeEstimate { size_bytes: Option<u64>, approx: bool }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VideoFormat { height: u64, fps: Option<f64>, label: String, size_bytes: Option<u64>, approx: bool }
#[derive(Serialize)]
pub struct VideoFormats { formats: Vec<VideoFormat>, audio: SizeEstimate, title: Option<String>, duration: Option<f64> }

fn estimate(format: &serde_json::Value, duration: Option<f64>) -> SizeEstimate {
    if let Some(n) = format.get("filesize").and_then(|v| v.as_u64()) { return SizeEstimate { size_bytes: Some(n), approx: false }; }
    if let Some(n) = format.get("filesize_approx").and_then(|v| v.as_u64()) { return SizeEstimate { size_bytes: Some(n), approx: true }; }
    let size = format.get("tbr").and_then(|v| v.as_f64()).zip(duration)
        .map(|(rate, seconds)| rate * 1000.0 * seconds / 8.0)
        .filter(|n| n.is_finite() && *n >= 0.0 && *n < u64::MAX as f64).map(|n| n.round() as u64);
    SizeEstimate { size_bytes: size, approx: size.is_some() }
}
fn parse_formats(info: &serde_json::Value) -> VideoFormats {
    let duration = info.get("duration").and_then(|v| v.as_f64());
    let entries = info.get("formats").and_then(|v| v.as_array()).map(Vec::as_slice).unwrap_or(&[]);
    let audio = entries.iter().filter(|f| f.get("acodec").and_then(|v| v.as_str()).is_some_and(|c| c != "none") && f.get("vcodec").and_then(|v| v.as_str()) == Some("none"))
        .max_by(|a, b| a.get("abr").and_then(|v| v.as_f64()).unwrap_or(0.0).total_cmp(&b.get("abr").and_then(|v| v.as_f64()).unwrap_or(0.0)));
    let audio_size = audio.map(|f| estimate(f, duration)).unwrap_or(SizeEstimate { size_bytes: None, approx: false });
    let mut best = std::collections::BTreeMap::new();
    for f in entries.iter().filter(|f| f.get("vcodec").and_then(|v| v.as_str()).is_some_and(|c| c != "none")) {
        if let Some(height) = f.get("height").and_then(|v| v.as_u64()).filter(|h| *h > 0) {
            let rate = f.get("tbr").and_then(|v| v.as_f64()).unwrap_or(0.0);
            if best.get(&height).map_or(true, |(r, _): &(f64, &serde_json::Value)| rate > *r) { best.insert(height, (rate, f)); }
        }
    }
    let formats = best.into_iter().rev().map(|(height, (_, f))| {
        let fps = f.get("fps").and_then(|v| v.as_f64());
        let label = if fps.is_some_and(|n| n >= 50.0) { format!("{height}p{}", fps.unwrap().round() as u64) } else { format!("{height}p") };
        let video = estimate(f, duration);
        let size_bytes = video.size_bytes.zip(audio_size.size_bytes).and_then(|(v, a)| v.checked_add(a));
        VideoFormat { height, fps, label, size_bytes, approx: video.approx || audio_size.approx }
    }).collect();
    VideoFormats { formats, audio: audio_size, title: info.get("title").and_then(|v| v.as_str()).map(str::to_owned), duration }
}
pub fn formats(url: &str) -> Result<VideoFormats, String> {
    validate(url)?;
    let exe = tools()?.join("yt-dlp.exe");
    if !exe.is_file() { return Err("TOOLS_MISSING: İndirme araçları kurulu değil".into()); }
    let mut child = Command::new(exe).args(["-J", "--no-playlist", "--no-warnings", "--", url]).creation_flags(SPAWN_FLAGS)
        .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e| format!("İşlem başlatılamadı: {e}"))?;
    let mut stdout = child.stdout.take().unwrap();
    let mut stderr = child.stderr.take().unwrap();
    let out = std::thread::spawn(move || { let mut b = Vec::new(); stdout.read_to_end(&mut b).map(|_| b) });
    let err = std::thread::spawn(move || { let mut b = Vec::new(); stderr.read_to_end(&mut b).map(|_| b) });
    let start = std::time::Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if start.elapsed() < std::time::Duration::from_secs(45) => std::thread::sleep(std::time::Duration::from_millis(50)),
            Ok(None) => { let _ = child.kill(); let _ = child.wait(); return Err("Video bilgileri alınırken zaman aşımına uğradı".into()); },
            Err(e) => { let _ = child.kill(); let _ = child.wait(); return Err(format!("İşlem beklenemedi: {e}")); }
        }
    };
    let stdout = out.join().map_err(|_| "Çıktı okunamadı")?.map_err(|e| e.to_string())?;
    let stderr = err.join().map_err(|_| "Hata çıktısı okunamadı")?.map_err(|e| e.to_string())?;
    if !status.success() { return Err(format!("Video bilgileri alınamadı: {}", String::from_utf8_lossy(&stderr))); }
    let info = serde_json::from_slice(&stdout).map_err(|e| format!("Video bilgileri geçersiz: {e}"))?;
    Ok(parse_formats(&info))
}
#[derive(Serialize, Deserialize)] pub struct Job { pub id: String, url: String, mode: String, pid: u32, started_at: u64, output_dir: String, #[serde(default)] cancelled: bool, #[serde(default)] item_count: Option<usize> }
#[derive(Serialize)] pub struct JobStatus { #[serde(flatten)] job: Job, state: String, percent: Option<String>, speed: Option<String>, eta: Option<String>, #[serde(skip_serializing_if = "Option::is_none")] item: Option<String>, file: Option<String>, error: Option<String> }
fn job_path(id: &str) -> Result<PathBuf, String> { if id.is_empty() || !id.bytes().all(|b| b.is_ascii_digit() || b == b'-') { return Err("Geçersiz iş kimliği".into()); } Ok(jobs()?.join(format!("{id}.json"))) }
pub fn start(url: &str, mode: &str, requested_dir: Option<&str>) -> Result<String, String> { start_with_selection(url, mode, requested_dir, None, None) }
pub fn start_with_selection(url: &str, mode: &str, requested_dir: Option<&str>, items: Option<&[String]>, folder_name: Option<&str>) -> Result<String, String> { let dir = tools()?; let output = match requested_dir { Some(p) => validate_dir(Path::new(p))?, None => selected_dir()? }; let item_count = if mode.starts_with("selected:") { Some(selected_ids(items.ok_or("Geçersiz video seçimi")?)?.len()) } else { None }; let a = if item_count.is_some() { selected_args(url, mode, &dir, &output, items.unwrap(), folder_name.unwrap_or(""))? } else { args(url, mode, &dir, &output)? }; if !status()?.ytdlp.installed || !status()?.ffmpeg { return Err("TOOLS_MISSING: İndirme araçları kurulu değil".into()); } fs::create_dir_all(&output).map_err(|e| e.to_string())?; let jd = jobs()?; fs::create_dir_all(&jd).map_err(|e| e.to_string())?; let id = format!("{}-{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos(), std::process::id()); let log = fs::File::create(jd.join(format!("{id}.log"))).map_err(|e| e.to_string())?; let child = spawn(Command::new(dir.join("yt-dlp.exe")).args(a).stdin(Stdio::null()).stdout(Stdio::from(log.try_clone().map_err(|e| e.to_string())?)).stderr(Stdio::from(log)), true).map_err(|e| format!("İndirme başlatılamadı: {e}"))?; let job = Job { id: id.clone(), url: url.into(), mode: mode.into(), pid: child.id(), started_at: now(), output_dir: output.to_string_lossy().into_owned(), cancelled: false, item_count }; fs::write(job_path(&id)?, serde_json::to_vec(&job).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?; write_settings(&settings_path()?, &output)?; Ok(id) }
fn progress(line: &str) -> Option<(String, String, String, Option<String>)> { let mut p = line.strip_prefix("LT_PROGRESS:")?.split('|'); Some((p.next()?.trim().into(), p.next()?.trim().into(), p.next()?.trim().into(), p.next().map(str::trim).filter(|s| !s.is_empty()).map(str::to_owned))) }
fn final_path(line: &str) -> Option<String> { line.strip_prefix("LT_FILE:").map(|s| s.trim().to_string()).filter(|s| !s.is_empty()) }
pub fn job_status(id: &str) -> Result<JobStatus, String> { let job: Job = serde_json::from_slice(&fs::read(job_path(id)?).map_err(|e| format!("İş bulunamadı: {e}"))?).map_err(|e| e.to_string())?; let mut s = JobStatus { job, state: "running".into(), percent: None, speed: None, eta: None, item: None, file: None, error: None }; if let Ok(mut f) = fs::File::open(jobs()?.join(format!("{id}.log"))) { let len = f.metadata().map(|m| m.len()).unwrap_or(0); if s.job.item_count.is_none() { let _ = f.seek(SeekFrom::Start(len.saturating_sub(256 * 1024))); } let mut data = Vec::new(); let _ = f.read_to_end(&mut data); let mut files = 0; for line in String::from_utf8_lossy(&data).lines() { if let Some((p, speed, eta, item)) = progress(line) { s.percent = Some(p); s.speed = Some(speed); s.eta = Some(eta); s.item = item; } if let Some(path) = final_path(line) { files += 1; s.file = Some(path); } if line.starts_with("ERROR:") { s.error = Some(line.to_string()); } } if let Some(total) = s.job.item_count { s.item = Some(format!("{}/{}", (files + 1).min(total), total)); } } if s.job.cancelled { s.state = "cancelled".into(); } else if !running(s.job.pid) { s.state = if s.file.is_some() && (s.error.is_none() || s.job.mode.starts_with("playlist:") || s.job.mode.starts_with("selected:")) { "done" } else { "error" }.into(); if s.state == "error" && s.error.is_none() { s.error = Some("İndirme tamamlanamadı".into()); } } Ok(s) }
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

#[cfg(test)] mod format_tests {
    use super::*;
    #[test] fn grouping_and_estimates() {
        let info: serde_json::Value = serde_json::from_str(r#"{"title":"Test","duration":10,"formats":[
            {"height":720,"fps":30,"vcodec":"avc1","tbr":100,"filesize":1000},
            {"height":720,"fps":60,"vcodec":"vp9","tbr":200,"filesize_approx":2000},
            {"height":1080,"fps":30,"vcodec":"avc1","tbr":800},
            {"height":480,"vcodec":"avc1"},
            {"vcodec":"none","acodec":"aac","abr":128,"filesize":500},
            {"vcodec":"none","acodec":"aac","abr":64,"filesize":100}
        ]}"#).unwrap();
        let result = serde_json::to_value(parse_formats(&info)).unwrap();
        assert_eq!(result["audio"], serde_json::json!({"sizeBytes":500,"approx":false}));
        assert_eq!(result["formats"][0]["sizeBytes"], 1000500);
        assert_eq!(result["formats"][0]["approx"], true);
        assert_eq!(result["formats"][1]["label"], "720p60");
        assert_eq!(result["formats"][1]["sizeBytes"], 2500);
        assert_eq!(result["formats"][1]["approx"], true);
        assert_eq!(result["formats"][2]["sizeBytes"], serde_json::Value::Null);
        assert_eq!(result["formats"].as_array().unwrap().len(), 3);
    }
    #[test] fn height_mode() {
        let build = |mode| args("https://example.com", mode, Path::new("tools"), Path::new("out"));
        let a = build("height:720").unwrap();
        let index = a.iter().position(|x| x == "-f").unwrap();
        assert_eq!(a[index + 1], "bv*[height=720]+ba/b[height=720]/bv*[height<=720]+ba/b[height<=720]");
        for mode in ["height:abc", "height:99999", "height:720;x", "height:143", "height:+720"] { assert!(build(mode).is_err()); }
    }
}

#[cfg(test)] mod playlist_tests {
    use super::*;
    #[test] fn mp3_quality_for_all_modes() {
        let url = "https://www.youtube.com/playlist?list=abc";
        let dir = Path::new("tools"); let out = Path::new("out");
        let ids = vec!["abcdefghijk".to_string()];
        let cases = [args(url, "audio_mp3", dir, out).unwrap(), args(url, "playlist:audio_mp3", dir, out).unwrap(), selected_args(url, "selected:audio_mp3", dir, out, &ids, "Liste").unwrap()];
        for a in cases {
            assert!(a.windows(2).any(|pair| pair == ["-f", "bestaudio/best"]));
            assert!(a.windows(2).any(|pair| pair == ["--audio-quality", "0"]));
            assert!(a.iter().any(|x| x == "--embed-thumbnail"));
            assert!(a.iter().any(|x| x == "--add-metadata"));
        }
    }
    #[test] fn selected_arguments_and_validation() {
        let ids = vec!["abcdefghijk".to_string(), "12345678901".to_string(), "abcdefghijk".to_string()];
        for mode in ["selected:video_best", "selected:video_720", "selected:audio_mp3"] { let a = selected_args("https://www.youtube.com/playlist?list=x", mode, Path::new("tools"), Path::new("out"), &ids, "Liste").unwrap(); assert!(a.contains(&"--no-playlist".to_string())); assert!(a.contains(&"--ignore-errors".to_string())); assert!(a.iter().any(|x| x.contains("%(autonumber)03d"))); let p = a.iter().position(|x| x == "--").unwrap(); assert_eq!(&a[p + 1..], ["https://www.youtube.com/watch?v=abcdefghijk", "https://www.youtube.com/watch?v=12345678901"]); }
        assert!(selected_ids(&["bad".into()]).is_err()); assert!(selected_ids(&vec!["abcdefghijk".into(); 501]).is_err()); assert_eq!(sanitize_folder(" .a<>:b? . "), "ab"); assert_eq!(sanitize_folder("..."), "YouTube seçimi"); assert_eq!(sanitize_folder(&"a".repeat(101)).chars().count(), 100);
    }
    #[test] fn playlist_arguments_and_validation() {
        for mode in ["playlist:video_best", "playlist:video_720", "playlist:audio_mp3"] {
            let a = args("https://www.youtube.com/playlist?list=abc", mode, Path::new("tools"), Path::new("out")).unwrap();
            assert!(a.iter().any(|x| x == "--yes-playlist"));
            assert!(!a.iter().any(|x| x == "--no-playlist"));
            assert!(a.iter().any(|x| x == "--ignore-errors"));
            assert!(a.iter().any(|x| x.contains("%(playlist_index)03d")));
            assert!(args("https://example.com/playlist?list=abc", mode, Path::new("tools"), Path::new("out")).is_err());
            assert!(args("https://www.youtube.com/watch?v=abc", mode, Path::new("tools"), Path::new("out")).is_err());
        }
    }
    #[test] fn playlist_progress() {
        assert_eq!(progress("LT_PROGRESS: 45% | 1MiB/s | 2s | 3/24").unwrap().3.as_deref(), Some("3/24"));
        assert_eq!(progress("LT_PROGRESS: 45% | 1MiB/s | 2s").unwrap().3, None);
    }
}
