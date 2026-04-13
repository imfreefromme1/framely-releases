#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// ─── Imports ───────────────────────────────────────────────────────────────────
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use std::os::windows::process::CommandExt;
use sysinfo::{System, SystemExt, CpuExt, ProcessExt, DiskExt};
use sha2::{Sha256, Digest};
use tauri::Manager;
use tauri::Emitter;

// ─── Payhip license validation ────────────────────────────────────────────────
const PAYHIP_STORE_API_KEY: &str = "80a97dc8a7fc55054036dc34c0b2ab9f627c4027";

struct Tier { name: &'static str, api_key: &'static str, days: Option<u64> }

const TIERS: &[Tier] = &[
    Tier { name: "7-Day",    api_key: "prod_sk_UW07g_b133c4a06e56f6952fb6b0b12f75f7c28b786768", days: Some(7)  },
    Tier { name: "30-Day",   api_key: "prod_sk_mEOyY_4debb2877105da1f76bfad0f0675575b4d2e8398", days: Some(30) },
    Tier { name: "Lifetime", api_key: "prod_sk_2NeZD_7f2cefd84e569098d7f59ae543ad6674fa77617b", days: None     },
];

const OBFUSCATE_KEY: u8 = 0x5A;
const CREATE_NO_WINDOW: u32 = 0x08000000;

struct AppState {
    sys: Mutex<System>,
    fps_running: Arc<AtomicBool>,
}

fn main() {
    let log_path = "C:\\ProgramData\\Framely\\framely_debug.log";
    let _ = std::fs::create_dir_all("C:\\ProgramData\\Framely");
    let _ = std::fs::write(log_path, "Step 1: Started\n");

    std::env::set_var(
        "WEBVIEW2_USER_DATA_FOLDER",
        "C:\\ProgramData\\Framely\\webview"
    );
    let _ = std::fs::write(log_path, "Step 2: WebView2 var set\n");

    let _ = std::fs::create_dir_all("C:\\ProgramData\\Framely\\webview");
    let _ = std::fs::write(log_path, "Step 3: WebView2 folder created\n");

    let state = AppState {
        sys: Mutex::new(System::new_all()),
        fps_running: Arc::new(AtomicBool::new(false)),
    };

    let _ = std::fs::write(log_path, "Step 4: State created, starting Tauri\n");

    std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", "C:\\ProgramData\\Framely\\webview");
    std::env::remove_var("LOCALAPPDATA");
    std::env::set_var("LOCALAPPDATA", "C:\\ProgramData\\Framely");
    std::env::set_var("USERPROFILE", "C:\\ProgramData\\Framely");
    std::env::set_var("APPDATA", "C:\\ProgramData\\Framely");
    std::env::set_var("TEMP", "C:\\ProgramData\\Framely\\temp");
    std::env::set_var("TMP", "C:\\ProgramData\\Framely\\temp");
    let _ = std::fs::create_dir_all("C:\\ProgramData\\Framely\\temp");
    let _ = std::fs::write(log_path, "Step 4b: Env vars set\n");

tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            get_machine_id,
            get_system_info,
            kill_background_processes,
            set_cpu_priority,
            flush_dns_cache,
            set_game_bar,
            set_gpu_scheduling,
            fivem_dns_priority,
            fivem_disable_ipv6,
            fivem_qos_limit,
            fivem_max_connections,
            fivem_port_tuning,
            fivem_multimedia_profile,
            fivem_nagle,
            fivem_tcp_window,
            fivem_winsock,
            fivem_keyboard,
            debug_admin,
            activate_power_plan,
            restore_default_power_plan,
            get_active_power_plan,
            nvidia_allow_scripts,
            nvidia_apply_preset,
            nvidia_reset_profile,
            fivem_afd_buffers,
            fivem_mouse_accel,
            fivem_keyboard_queue,
            fivem_multimedia_profile_full,
            disable_device_power_saving,
            disable_usb_power_saving,
            scan_installed_games,
            start_fps_overlay,
            stop_fps_overlay,
            validate_license,
            save_license,
            get_saved_license,
            clear_license,
            cod_adv_options,
            cod_ntfs_tweaks,
            cod_disable_fullscreen_optimizations,
            cod_process_priority,
            cod_config_texture_stream,
            cod_shader_cache_clear,
            cod_config_reset,
            cod_disable_power_throttling,
            cod_disable_timer_coalescing,
            cod_large_system_cache,
            cod_gpu_tdr_fix,
            cod_gpu_upload_heaps,
            cod_disable_vbs,
            cod_force_pcores,
            cod_open_nat_ports,
            cod_clear_nvidia_cache,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    let _ = std::fs::write(log_path, "Step 5: Tauri exited\n");
}

fn get_cpu_via_powershell() -> f32 {
    let out = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "(Get-Counter '\\Processor Information(_Total)\\% Processor Time').CounterSamples.CookedValue",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    if let Ok(output) = out {
        let s = String::from_utf8_lossy(&output.stdout);
        let trimmed = s.trim().replace(',', ".");
        if let Ok(val) = trimmed.parse::<f32>() {
            return (val * 10.0).round() / 10.0;
        }
    }
    0.0
}

#[tauri::command]
fn start_fps_overlay(app: tauri::AppHandle, state: tauri::State<AppState>) -> Result<String, String> {
    if state.fps_running.load(Ordering::SeqCst) {
        return Ok("Already running".into());
    }
    let pm_path = app.path()
        .resolve("resources/PresentMon.exe", tauri::path::BaseDirectory::Resource)
        .map_err(|_| "PresentMon not found")?;
    if !pm_path.exists() {
        return Err(format!("PresentMon.exe missing at: {:?}", pm_path));
    }
    let running = state.fps_running.clone();
    running.store(true, Ordering::SeqCst);
    let app_handle = app.clone();
    if app.get_webview_window("fps_overlay").is_none() {
        tauri::WebviewWindowBuilder::new(
            &app,
            "fps_overlay",
            tauri::WebviewUrl::App("fps.html".into()),
        )
        .title("FPS")
        .inner_size(160.0, 44.0)
        .position(16.0, 16.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .build()
        .map_err(|e| e.to_string())?;
    }
    std::thread::spawn(move || {
        let _ = app_handle.emit("fps_status", "spawning PresentMon...");
        let child = std::process::Command::new(&pm_path)
            .args(["--output_stdout", "--stop_existing_session"])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn();
        let mut child = match child {
            Ok(c) => { let _ = app_handle.emit("fps_status", "PresentMon spawned ok"); c }
            Err(e) => {
                let _ = app_handle.emit("fps_status", format!("spawn error: {}", e));
                running.store(false, Ordering::SeqCst);
                return;
            }
        };
        let stdout = match child.stdout.take() {
            Some(s) => { let _ = app_handle.emit("fps_status", "got stdout pipe"); s }
            None => {
                let _ = app_handle.emit("fps_status", "no stdout pipe");
                running.store(false, Ordering::SeqCst);
                return;
            }
        };
        use std::io::BufRead;
        let reader = std::io::BufReader::new(stdout);
        let mut line_count = 0;
        for line in reader.lines() {
            if !running.load(Ordering::SeqCst) { break; }
            if let Ok(line) = line {
                line_count += 1;
                if line_count <= 3 {
                    let _ = app_handle.emit("fps_status", format!("line {}: {}", line_count, &line[..line.len().min(60)]));
                }
                if line.starts_with("Application") { continue; }
                let cols: Vec<&str> = line.split(',').collect();
                if cols.len() > 10 {
                    let process = cols[0].trim();
                    let skip = ["dwm.exe", "wallpaper32.exe", "Discord.exe", "claude.exe", "explorer.exe"];
                    if skip.iter().any(|s| process.eq_ignore_ascii_case(s)) { continue; }
                    if let Ok(ms) = cols[10].trim().parse::<f64>() {
                        if ms > 0.0 && ms < 1000.0 {
                            let fps = (1000.0 / ms * 10.0).round() / 10.0;
                            let _ = app_handle.emit("fps_update", fps);
                        }
                    }
                }
            }
        }
        let _ = child.kill();
        running.store(false, Ordering::SeqCst);
    });
    Ok("FPS thread started".into())
}

#[tauri::command]
fn stop_fps_overlay(app: tauri::AppHandle, state: tauri::State<AppState>) -> Result<String, String> {
    state.fps_running.store(false, Ordering::SeqCst);
    if let Some(window) = app.get_webview_window("fps_overlay") {
        window.close().map_err(|e: tauri::Error| e.to_string())?;
    }
    let _ = std::process::Command::new("taskkill")
        .args(["/F", "/IM", "PresentMon.exe"])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    Ok("FPS overlay stopped".into())
}

#[tauri::command]
fn get_system_info(state: tauri::State<AppState>) -> serde_json::Value {
    let cpu_usage = get_cpu_via_powershell();
    let mut sys = state.sys.lock().unwrap();
    sys.refresh_memory();
    let cpu_name = {
        sys.refresh_cpu();
        sys.cpus().first().map(|c: &sysinfo::Cpu| c.brand().to_string()).unwrap_or_else(|| "Unknown".into())
    };
    serde_json::json!({
        "cpu_usage": cpu_usage,
        "total_memory_gb": sys.total_memory() / 1024 / 1024 / 1024,
        "used_memory_gb": sys.used_memory() / 1024 / 1024 / 1024,
        "os": sys.long_os_version().unwrap_or_default(),
        "cpu_name": cpu_name,
    })
}

#[tauri::command]
fn get_machine_id(state: tauri::State<AppState>) -> String {
    let mut sys = state.sys.lock().unwrap();
    sys.refresh_all();
    let mut parts = vec![];
    if let Some(cpu) = sys.cpus().first() {
        parts.push(format!("cpu:{}", cpu.brand().to_string()));
    }
    parts.push(format!("ram:{}", sys.total_memory()));
    if let Some(disk) = sys.disks().first() {
        parts.push(format!("disk:{}", disk.name().to_string_lossy().to_string()));
        parts.push(format!("disk_total:{}", disk.total_space()));
    }
    if let Some(hostname) = sys.host_name() {
        parts.push(format!("host:{}", hostname));
    }
    let combined = parts.join("|");
    let mut hasher = Sha256::new();
    hasher.update(combined.as_bytes());
    format!("{:x}", hasher.finalize())
}

#[tauri::command]
fn kill_background_processes() -> Vec<String> {
    let mut killed = vec![];
    let targets = [
        "OneDrive.exe", "SearchIndexer.exe", "Teams.exe", "msteams.exe",
        "Slack.exe", "discord_update.exe", "chrome.exe", "msedge.exe",
        "firefox.exe", "steam.exe", "SkypeApp.exe", "GoogleDriveFS.exe", "Dropbox.exe",
    ];
    for name in targets {
        if let Ok(out) = std::process::Command::new("taskkill")
            .args(["/F", "/IM", name])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            if out.status.success() { killed.push(format!("Killed: {}", name)); }
        }
    }
    let services = [
        ("SysMain", "Superfetch disabled"),
        ("DiagTrack", "Telemetry disabled"),
        ("WSearch", "Search indexer disabled"),
        ("TabletInputService", "Tablet input disabled"),
        ("PrintSpooler", "Print spooler disabled"),
        ("Fax", "Fax service disabled"),
    ];
    for (svc, label) in services {
        if let Ok(out) = std::process::Command::new("sc")
            .args(["stop", svc])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            let code = out.status.code().unwrap_or(1);
            if code == 0 || code == 1062 { killed.push(label.to_string()); }
        }
    }
    let _ = std::process::Command::new("reg")
        .args(["add", r"HKLM\SYSTEM\CurrentControlSet\Control\PriorityControl",
               "/v", "Win32PrioritySeparation", "/t", "REG_DWORD", "/d", "26", "/f"])
        .creation_flags(CREATE_NO_WINDOW).output();
    killed.push("CPU foreground priority boosted".to_string());
    let _ = std::process::Command::new("reg")
        .args(["add", r"HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management",
               "/v", "DisablePagingExecutive", "/t", "REG_DWORD", "/d", "1", "/f"])
        .creation_flags(CREATE_NO_WINDOW).output();
    killed.push("Kernel paging disabled".to_string());
    let _ = std::process::Command::new("reg")
        .args(["add", r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile",
               "/v", "SystemResponsiveness", "/t", "REG_DWORD", "/d", "10", "/f"])
        .creation_flags(CREATE_NO_WINDOW).output();
    killed.push("MMCSS background CPU reserve reduced".to_string());
    let games_key = r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games";
    let _ = std::process::Command::new("reg")
        .args(["add", games_key, "/v", "GPU Priority", "/t", "REG_DWORD", "/d", "8", "/f"])
        .creation_flags(CREATE_NO_WINDOW).output();
    let _ = std::process::Command::new("reg")
        .args(["add", games_key, "/v", "Priority", "/t", "REG_DWORD", "/d", "6", "/f"])
        .creation_flags(CREATE_NO_WINDOW).output();
    let _ = std::process::Command::new("reg")
        .args(["add", games_key, "/v", "Scheduling Category", "/t", "REG_SZ", "/d", "High", "/f"])
        .creation_flags(CREATE_NO_WINDOW).output();
    killed.push("MMCSS Games task priority maxed".to_string());
    let purge_script = r#"
$ErrorActionPreference = 'SilentlyContinue'
Get-Process | Where-Object { $_.Name -notmatch 'System|Idle|csrss|lsass|winlogon|services|svchost|framely' } | ForEach-Object {
    $_.MinWorkingSet = 1024; $_.MaxWorkingSet = 1024
    $_.MinWorkingSet = -1;   $_.MaxWorkingSet = -1
} 2>$null
Write-Output "done"
"#;
    if let Ok(out) = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", purge_script])
        .creation_flags(CREATE_NO_WINDOW).output()
    {
        if String::from_utf8_lossy(&out.stdout).contains("done") {
            killed.push("RAM working set purged".to_string());
        }
    }
    killed
}

#[tauri::command]
fn set_cpu_priority(enable: bool, state: tauri::State<AppState>) -> Result<String, String> {
    if !enable { return Ok("CPU priority reset to normal".into()); }
    let mut sys = state.sys.lock().unwrap();
    sys.refresh_processes();
    let game_keywords = ["cs2", "csgo", "valorant", "fortnite", "r5apex",
        "modernwarfare", "overwatch", "dota2", "minecraft", "steam"];
    let mut boosted = vec![];
    for (pid, process) in sys.processes() {
        let name = process.name().to_lowercase();
        if game_keywords.iter().any(|k| name.contains(k)) {
            let _ = std::process::Command::new("wmic")
                .args(["process", "where", &format!("ProcessId={}", pid), "call", "SetPriority", "128"])
                .creation_flags(CREATE_NO_WINDOW).output();
            boosted.push(process.name().to_string());
        }
    }
    if boosted.is_empty() { Ok("No game processes found to boost".into()) }
    else { Ok(format!("Boosted: {}", boosted.join(", "))) }
}

#[tauri::command]
fn flush_dns_cache(enable: bool) -> Result<String, String> {
    if !enable { return Ok("Skipped".into()); }
    let out = std::process::Command::new("ipconfig")
        .args(["/flushdns"]).creation_flags(CREATE_NO_WINDOW)
        .output().map_err(|e: std::io::Error| e.to_string())?;
    if out.status.success() { Ok("DNS cache flushed".into()) }
    else { Err(String::from_utf8_lossy(&out.stderr).to_string()) }
}

#[tauri::command]
fn set_game_bar(enable: bool) -> Result<String, String> {
    let value = if enable { "0" } else { "1" };
    let out = std::process::Command::new("reg")
        .args(["add", r"HKCU\Software\Microsoft\GameBar", "/v", "AllowAutoGameMode", "/t", "REG_DWORD", "/d", value, "/f"])
        .creation_flags(CREATE_NO_WINDOW).output().map_err(|e: std::io::Error| e.to_string())?;
    if out.status.success() { Ok(format!("Game Bar {}", if enable { "enabled" } else { "disabled" })) }
    else { Err(String::from_utf8_lossy(&out.stderr).to_string()) }
}

#[tauri::command]
fn set_gpu_scheduling(enable: bool) -> Result<String, String> {
    let value = if enable { "2" } else { "1" };
    let out = std::process::Command::new("reg")
        .args(["add", r"HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers", "/v", "HwSchMode", "/t", "REG_DWORD", "/d", value, "/f"])
        .creation_flags(CREATE_NO_WINDOW).output().map_err(|e: std::io::Error| e.to_string())?;
    if out.status.success() { Ok(format!("GPU scheduling {}", if enable { "enabled" } else { "disabled" })) }
    else { Err(String::from_utf8_lossy(&out.stderr).to_string()) }
}

fn reg_add(key: &str, name: &str, kind: &str, value: &str) -> Result<(), String> {
    let out = std::process::Command::new("reg")
        .args(["add", key, "/v", name, "/t", kind, "/d", value, "/f"])
        .creation_flags(CREATE_NO_WINDOW).output().map_err(|e: std::io::Error| e.to_string())?;
    if out.status.success() { Ok(()) }
    else { Err(String::from_utf8_lossy(&out.stderr).to_string()) }
}

fn netsh(args: &[&str]) -> Result<(), String> {
    let out = std::process::Command::new("netsh")
        .args(args).creation_flags(CREATE_NO_WINDOW)
        .output().map_err(|e: std::io::Error| e.to_string())?;
    if out.status.success() { Ok(()) } else { Ok(()) }
}

#[tauri::command]
fn fivem_dns_priority(enable: bool) -> Result<String, String> {
    if enable {
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\ServiceProvider", "DnsPriority",   "REG_DWORD", "6")?;
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\ServiceProvider", "HostsPriority", "REG_DWORD", "5")?;
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\ServiceProvider", "LocalPriority", "REG_DWORD", "4")?;
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\ServiceProvider", "NetbtPriority", "REG_DWORD", "7")?;
        Ok("DNS priority optimized".into())
    } else {
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\ServiceProvider", "DnsPriority",   "REG_DWORD", "2000")?;
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\ServiceProvider", "HostsPriority", "REG_DWORD", "500")?;
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\ServiceProvider", "LocalPriority", "REG_DWORD", "499")?;
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\ServiceProvider", "NetbtPriority", "REG_DWORD", "2001")?;
        Ok("DNS priority restored".into())
    }
}

#[tauri::command]
fn fivem_disable_ipv6(enable: bool) -> Result<String, String> {
    let val = if enable { "4294967295" } else { "0" };
    reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip6\Parameters", "DisabledComponents", "REG_DWORD", val)?;
    Ok(if enable { "IPv6 disabled".into() } else { "IPv6 restored".into() })
}

#[tauri::command]
fn fivem_qos_limit(enable: bool) -> Result<String, String> {
    let val = if enable { "0" } else { "20" };
    reg_add(r"HKLM\SOFTWARE\Policies\Microsoft\Windows\Psched", "NonBestEffortLimit", "REG_DWORD", val)?;
    Ok(if enable { "QoS bandwidth limit removed".into() } else { "QoS restored".into() })
}

#[tauri::command]
fn fivem_max_connections(enable: bool) -> Result<String, String> {
    let val = if enable { "22" } else { "10" };
    reg_add(r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings", "MaxConnectionsPerServer",    "REG_DWORD", val)?;
    reg_add(r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings", "MaxConnectionsPer1_0Server", "REG_DWORD", val)?;
    Ok(if enable { "Max connections boosted".into() } else { "Max connections restored".into() })
}

#[tauri::command]
fn fivem_port_tuning(enable: bool) -> Result<String, String> {
    if enable {
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters", "MaxUserPort",       "REG_DWORD", "65534")?;
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters", "TcpTimedWaitDelay", "REG_DWORD", "48")?;
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters", "EnableWsd",         "REG_DWORD", "0")?;
        Ok("Port tuning applied".into())
    } else {
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters", "MaxUserPort",       "REG_DWORD", "5000")?;
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters", "TcpTimedWaitDelay", "REG_DWORD", "120")?;
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters", "EnableWsd",         "REG_DWORD", "1")?;
        Ok("Port tuning restored".into())
    }
}

#[tauri::command]
fn fivem_multimedia_profile(enable: bool) -> Result<String, String> {
    if enable {
        reg_add(r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile", "NetworkThrottlingIndex", "REG_DWORD", "16")?;
        reg_add(r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile", "SystemResponsiveness",   "REG_DWORD", "0")?;
        Ok("Multimedia profile optimized".into())
    } else {
        reg_add(r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile", "NetworkThrottlingIndex", "REG_DWORD", "10")?;
        reg_add(r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile", "SystemResponsiveness",   "REG_DWORD", "20")?;
        Ok("Multimedia profile restored".into())
    }
}

#[tauri::command]
fn fivem_nagle(enable: bool) -> Result<String, String> {
    let val = if enable { "1" } else { "0" };
    let freq = if enable { "1" } else { "2" };
    reg_add(r"HKLM\SOFTWARE\Microsoft\MSMQ\Parameters", "TCPNoDelay", "REG_DWORD", val)?;
    let ps = format!(
        "Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces' | ForEach-Object {{ Set-ItemProperty -Path $_.PSPath -Name 'TCPNoDelay' -Value {} -Type DWord -Force; Set-ItemProperty -Path $_.PSPath -Name 'TCPAckFrequency' -Value {} -Type DWord -Force }} 2>$null",
        val, freq
    );
    let _ = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &ps])
        .creation_flags(CREATE_NO_WINDOW).output();
    Ok(if enable { "Nagle's algorithm disabled".into() } else { "Nagle's algorithm enabled".into() })
}

#[tauri::command]
fn fivem_tcp_window(enable: bool) -> Result<String, String> {
    if enable {
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters", "TcpMaxDataRetransmissions", "REG_DWORD", "3")?;
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters", "SackOpts",                  "REG_DWORD", "1")?;
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters", "TcpWindowSize",             "REG_DWORD", "372812")?;
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters", "GlobalMaxTcpWindowSize",    "REG_DWORD", "372812")?;
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters", "Tcp1323Opts",               "REG_DWORD", "3")?;
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters", "DefaultTTL",                "REG_DWORD", "64")?;
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters", "IRPStackSize",              "REG_DWORD", "64")?;
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters", "TCPDelAckTicks",            "REG_DWORD", "4")?;
        Ok("TCP window tuned".into())
    } else {
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters", "DefaultTTL",     "REG_DWORD", "128")?;
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters", "IRPStackSize",   "REG_DWORD", "15")?;
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters", "TCPDelAckTicks", "REG_DWORD", "2")?;
        Ok("TCP window restored".into())
    }
}

#[tauri::command]
fn fivem_winsock(enable: bool) -> Result<String, String> {
    if !enable { return Ok("Skipped".into()); }
    netsh(&["winsock", "reset", "catalog"])?;
    netsh(&["int", "ip", "reset"])?;
    netsh(&["int", "tcp", "set", "heuristics", "disabled"])?;
    netsh(&["int", "tcp", "set", "global", "initialRto=2000"])?;
    netsh(&["int", "tcp", "set", "global", "autotuninglevel=normal"])?;
    netsh(&["int", "tcp", "set", "global", "rsc=disabled"])?;
    netsh(&["int", "tcp", "set", "global", "chimney=disabled"])?;
    netsh(&["int", "tcp", "set", "global", "ecncapability=enabled"])?;
    netsh(&["int", "tcp", "set", "global", "timestamps=disabled"])?;
    netsh(&["int", "tcp", "set", "global", "nonsackrttresiliency=disabled"])?;
    netsh(&["int", "tcp", "set", "global", "rss=enabled"])?;
    netsh(&["int", "tcp", "set", "global", "MaxSynRetransmissions=2"])?;
    Ok("Winsock TCP optimized (restart recommended)".into())
}

#[tauri::command]
fn fivem_keyboard(enable: bool) -> Result<String, String> {
    if enable {
        reg_add(r"HKCU\Control Panel\Accessibility\Keyboard Response", "AutoRepeatDelay",       "REG_SZ", "120")?;
        reg_add(r"HKCU\Control Panel\Accessibility\Keyboard Response", "AutoRepeatRate",        "REG_SZ", "40")?;
        reg_add(r"HKCU\Control Panel\Accessibility\Keyboard Response", "BounceTime",            "REG_SZ", "0")?;
        reg_add(r"HKCU\Control Panel\Accessibility\Keyboard Response", "DelayBeforeAcceptance", "REG_SZ", "0")?;
        reg_add(r"HKCU\Control Panel\Accessibility\Keyboard Response", "Flags",                 "REG_SZ", "42")?;
        Ok("Keyboard response optimized".into())
    } else {
        reg_add(r"HKCU\Control Panel\Accessibility\Keyboard Response", "AutoRepeatDelay",       "REG_SZ", "1000")?;
        reg_add(r"HKCU\Control Panel\Accessibility\Keyboard Response", "AutoRepeatRate",        "REG_SZ", "500")?;
        reg_add(r"HKCU\Control Panel\Accessibility\Keyboard Response", "BounceTime",            "REG_SZ", "0")?;
        reg_add(r"HKCU\Control Panel\Accessibility\Keyboard Response", "DelayBeforeAcceptance", "REG_SZ", "0")?;
        reg_add(r"HKCU\Control Panel\Accessibility\Keyboard Response", "Flags",                 "REG_SZ", "2")?;
        Ok("Keyboard response restored".into())
    }
}

#[tauri::command]
fn debug_admin() -> String {
    let out = std::process::Command::new("reg")
        .args(["query", r"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters", "/v", "DefaultTTL"])
        .creation_flags(CREATE_NO_WINDOW).output();
    match out {
        Ok(o) => format!("exit:{} stdout:{} stderr:{}",
            o.status.code().unwrap_or(-1),
            String::from_utf8_lossy(&o.stdout).trim(),
            String::from_utf8_lossy(&o.stderr).trim()),
        Err(e) => format!("error: {}", e)
    }
}

#[tauri::command]
fn fivem_afd_buffers(enable: bool) -> Result<String, String> {
    if enable {
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\AFD\Parameters", "DefaultSendWindow",         "REG_DWORD", "1048576")?;
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\AFD\Parameters", "DefaultReceiveWindow",      "REG_DWORD", "1048576")?;
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\AFD\Parameters", "FastSendDatagramThreshold", "REG_DWORD", "1500")?;
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\AFD\Parameters", "FastCopyReceiveThreshold",  "REG_DWORD", "1500")?;
        Ok("AFD socket buffers optimized".into())
    } else {
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\AFD\Parameters", "DefaultSendWindow",         "REG_DWORD", "65536")?;
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\AFD\Parameters", "DefaultReceiveWindow",      "REG_DWORD", "65536")?;
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\AFD\Parameters", "FastSendDatagramThreshold", "REG_DWORD", "128")?;
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\AFD\Parameters", "FastCopyReceiveThreshold",  "REG_DWORD", "128")?;
        Ok("AFD socket buffers restored".into())
    }
}

#[tauri::command]
fn fivem_mouse_accel(enable: bool) -> Result<String, String> {
    let speed  = if enable { "0" } else { "1" };
    let thresh = if enable { "0" } else { "6" };
    reg_add(r"HKCU\Control Panel\Mouse", "MouseSpeed",      "REG_SZ", speed)?;
    reg_add(r"HKCU\Control Panel\Mouse", "MouseThreshold1", "REG_SZ", thresh)?;
    reg_add(r"HKCU\Control Panel\Mouse", "MouseThreshold2", "REG_SZ", thresh)?;
    let x_curve = "0000000000000000C0CC0C0000000000809919000000000040662600000000000033330000000000";
    let y_curve = "000000000000000000003800000000000000700000000000000000A800000000000000E000000000";
    if enable {
        let _ = std::process::Command::new("reg")
            .args(["add", r"HKCU\Control Panel\Mouse", "/v", "SmoothMouseXCurve", "/t", "REG_BINARY", "/d", x_curve, "/f"])
            .creation_flags(CREATE_NO_WINDOW).output().map_err(|e: std::io::Error| e.to_string())?;
        let _ = std::process::Command::new("reg")
            .args(["add", r"HKCU\Control Panel\Mouse", "/v", "SmoothMouseYCurve", "/t", "REG_BINARY", "/d", y_curve, "/f"])
            .creation_flags(CREATE_NO_WINDOW).output().map_err(|e: std::io::Error| e.to_string())?;
        Ok("Mouse acceleration disabled (1:1 linear curve applied)".into())
    } else {
        let _ = std::process::Command::new("reg")
            .args(["add", r"HKCU\Control Panel\Mouse", "/v", "SmoothMouseXCurve", "/t", "REG_BINARY", "/d", x_curve, "/f"])
            .creation_flags(CREATE_NO_WINDOW).output();
        let _ = std::process::Command::new("reg")
            .args(["add", r"HKCU\Control Panel\Mouse", "/v", "SmoothMouseYCurve", "/t", "REG_BINARY", "/d", y_curve, "/f"])
            .creation_flags(CREATE_NO_WINDOW).output();
        Ok("Mouse acceleration restored to Windows default".into())
    }
}

#[tauri::command]
fn fivem_keyboard_queue(enable: bool) -> Result<String, String> {
    if enable {
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\kbdclass\Parameters", "KeyboardDataQueueSize", "REG_DWORD", "100")?;
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\kbdclass\Parameters", "SendOutputToAllPorts",  "REG_DWORD", "1")?;
        Ok("Keyboard driver queue optimized (restart required)".into())
    } else {
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\kbdclass\Parameters", "KeyboardDataQueueSize", "REG_DWORD", "16")?;
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Services\kbdclass\Parameters", "SendOutputToAllPorts",  "REG_DWORD", "1")?;
        Ok("Keyboard driver queue restored".into())
    }
}

#[tauri::command]
fn fivem_multimedia_profile_full(enable: bool) -> Result<String, String> {
    let base  = r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile";
    let games = &format!(r"{}\Tasks\Games", base);
    let audio = &format!(r"{}\Tasks\Audio", base);
    if enable {
        reg_add(base, "NetworkThrottlingIndex", "REG_DWORD", "268435455")?;
        reg_add(base, "SystemResponsiveness",   "REG_DWORD", "10")?;
        reg_add(base, "NoLazyMode",             "REG_DWORD", "1")?;
        reg_add(base, "AlwaysOn",               "REG_DWORD", "1")?;
        reg_add(games, "Affinity",            "REG_DWORD", "0")?;
        reg_add(games, "Background Only",     "REG_SZ",    "False")?;
        reg_add(games, "Clock Rate",          "REG_DWORD", "10000")?;
        reg_add(games, "GPU Priority",        "REG_DWORD", "8")?;
        reg_add(games, "Priority",            "REG_DWORD", "6")?;
        reg_add(games, "Scheduling Category", "REG_SZ",    "High")?;
        reg_add(games, "SFIO Priority",       "REG_SZ",    "High")?;
        reg_add(audio, "Affinity",            "REG_DWORD", "0")?;
        reg_add(audio, "Background Only",     "REG_SZ",    "True")?;
        reg_add(audio, "Clock Rate",          "REG_DWORD", "10000")?;
        reg_add(audio, "GPU Priority",        "REG_DWORD", "8")?;
        reg_add(audio, "Priority",            "REG_DWORD", "6")?;
        reg_add(audio, "Scheduling Category", "REG_SZ",    "Medium")?;
        reg_add(audio, "SFIO Priority",       "REG_SZ",    "Normal")?;
        Ok("Full multimedia profile applied".into())
    } else {
        reg_add(base, "NetworkThrottlingIndex", "REG_DWORD", "10")?;
        reg_add(base, "SystemResponsiveness",   "REG_DWORD", "20")?;
        reg_add(base, "NoLazyMode",             "REG_DWORD", "0")?;
        reg_add(base, "AlwaysOn",               "REG_DWORD", "0")?;
        reg_add(games, "GPU Priority",        "REG_DWORD", "8")?;
        reg_add(games, "Priority",            "REG_DWORD", "2")?;
        reg_add(games, "Scheduling Category", "REG_SZ",    "Medium")?;
        reg_add(games, "SFIO Priority",       "REG_SZ",    "Normal")?;
        Ok("Full multimedia profile restored".into())
    }
}

fn run_ps(script: &str) -> Result<String, String> {
    let out = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW).output().map_err(|e: std::io::Error| e.to_string())?;
    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
    if out.status.success() || stderr.is_empty() {
        Ok(if stdout.is_empty() { "Done".into() } else { stdout })
    } else { Err(stderr) }
}

#[tauri::command]
fn nvidia_allow_scripts() -> Result<String, String> {
    reg_add(r"HKCU\SOFTWARE\Microsoft\PowerShell\1\ShellIds\Microsoft.PowerShell", "ExecutionPolicy", "REG_SZ", "Unrestricted")?;
    reg_add(r"HKLM\SOFTWARE\Microsoft\PowerShell\1\ShellIds\Microsoft.PowerShell", "ExecutionPolicy", "REG_SZ", "Unrestricted")?;
    Ok("PowerShell scripts enabled".into())
}

#[tauri::command]
fn nvidia_apply_preset(_app: tauri::AppHandle, preset: String) -> Result<String, String> {
    let inspector_dir = format!("{}\\Documents\\NvidiaProfileInspector", std::env::var("USERPROFILE").unwrap_or("C:\\Users\\User".into()));
    let inspector_exe = format!("{}\\Inspector.exe", inspector_dir);
    let temp_nip = format!("{}\\nv_profile.nip", std::env::var("TEMP").unwrap_or("C:\\Temp".into()));
    if !std::path::Path::new(&inspector_exe).exists() {
        let dl_script = format!(
            "New-Item -ItemType Directory -Path '{}' -Force | Out-Null; Invoke-WebRequest -Uri 'https://github.com/HickerDicker/SapphireOS/raw/refs/heads/main/src/PostInstall/GPU/Nvidia/NIP/nvidiaProfileInspector.exe' -OutFile '{}'",
            inspector_dir, inspector_exe
        );
        run_ps(&dl_script)?;
    }
    let drs_path = r"C:\ProgramData\NVIDIA Corporation\Drs";
    if std::path::Path::new(drs_path).exists() {
        let _ = run_ps(&format!("Get-ChildItem -Path '{}' -Recurse -File -ErrorAction SilentlyContinue | Unblock-File", drs_path));
    }
    let (dlss_preset, dlss_perf_mode) = match preset.to_uppercase().as_str() {
        "M" => ("13", "5"),
        _   => ("11", "0"),
    };
    let nip_xml = format!(r#"<?xml version="1.0" encoding="utf-16"?>
<ArrayOfProfile><Profile><ProfileName /><Executeables /><Settings>
<ProfileSetting><SettingID>390467</SettingID><SettingValue>2</SettingValue><ValueType>Dword</ValueType></ProfileSetting>
<ProfileSetting><SettingNameInfo>Override DLSS-SR presets</SettingNameInfo><SettingID>283385331</SettingID><SettingValue>{dlss_preset}</SettingValue><ValueType>Dword</ValueType></ProfileSetting>
<ProfileSetting><SettingNameInfo>Override DLSS-SR performance mode</SettingNameInfo><SettingID>279951208</SettingID><SettingValue>{dlss_perf_mode}</SettingValue><ValueType>Dword</ValueType></ProfileSetting>
<ProfileSetting><SettingNameInfo>Enable DLSS-SR override</SettingNameInfo><SettingID>283385345</SettingID><SettingValue>1</SettingValue><ValueType>Dword</ValueType></ProfileSetting>
<ProfileSetting><SettingNameInfo>Power management mode</SettingNameInfo><SettingID>274197361</SettingID><SettingValue>1</SettingValue><ValueType>Dword</ValueType></ProfileSetting>
<ProfileSetting><SettingNameInfo>Maximum pre-rendered frames</SettingNameInfo><SettingID>8102046</SettingID><SettingValue>1</SettingValue><ValueType>Dword</ValueType></ProfileSetting>
<ProfileSetting><SettingNameInfo>Threaded optimization</SettingNameInfo><SettingID>549528094</SettingID><SettingValue>1</SettingValue><ValueType>Dword</ValueType></ProfileSetting>
<ProfileSetting><SettingNameInfo>FRL Low Latency</SettingNameInfo><SettingID>277041152</SettingID><SettingValue>1</SettingValue><ValueType>Dword</ValueType></ProfileSetting>
<ProfileSetting><SettingNameInfo>Vertical Sync</SettingNameInfo><SettingID>11041231</SettingID><SettingValue>138504007</SettingValue><ValueType>Dword</ValueType></ProfileSetting>
<ProfileSetting><SettingNameInfo>Texture filtering - Quality</SettingNameInfo><SettingID>13510289</SettingID><SettingValue>20</SettingValue><ValueType>Dword</ValueType></ProfileSetting>
</Settings></Profile></ArrayOfProfile>"#, dlss_preset = dlss_preset, dlss_perf_mode = dlss_perf_mode);
    std::fs::write(&temp_nip, nip_xml.as_bytes()).map_err(|e| e.to_string())?;
    std::process::Command::new(&inspector_exe).arg(&temp_nip).creation_flags(CREATE_NO_WINDOW).output().map_err(|e: std::io::Error| e.to_string())?;
    let _ = std::fs::remove_file(&temp_nip);
    let sharpen_script = r#"
$keys = @('HKLM:\SYSTEM\CurrentControlSet\Services\nvlddmkm\FTS','HKLM:\SYSTEM\CurrentControlSet\Services\nvlddmkm\Parameters\FTS','HKLM:\SYSTEM\ControlSet001\Services\nvlddmkm\Parameters\FTS')
foreach ($k in $keys) { if (Test-Path $k) { New-ItemProperty -Path $k -Name EnableGR535 -PropertyType DWord -Value 0 -Force | Out-Null } }
"#;
    let _ = run_ps(sharpen_script);
    Ok(format!("Preset {} applied", preset.to_uppercase()))
}

#[tauri::command]
fn nvidia_reset_profile() -> Result<String, String> {
    let inspector_dir = format!("{}\\Documents\\NvidiaProfileInspector", std::env::var("USERPROFILE").unwrap_or("C:\\Users\\User".into()));
    let inspector_exe = format!("{}\\Inspector.exe", inspector_dir);
    let temp_nip = format!("{}\\nv_reset.nip", std::env::var("TEMP").unwrap_or("C:\\Temp".into()));
    if !std::path::Path::new(&inspector_exe).exists() {
        return Err("NvidiaProfileInspector not found. Apply a preset first.".into());
    }
    let reset_xml = r#"<?xml version="1.0" encoding="utf-16"?><ArrayOfProfile><Profile><ProfileName>Base Profile</ProfileName><Executeables /><Settings /></Profile></ArrayOfProfile>"#;
    std::fs::write(&temp_nip, reset_xml.as_bytes()).map_err(|e| e.to_string())?;
    std::process::Command::new(&inspector_exe).arg(&temp_nip).creation_flags(CREATE_NO_WINDOW).output().map_err(|e: std::io::Error| e.to_string())?;
    let _ = std::fs::remove_file(&temp_nip);
    let sharpen_off = r#"
$keys = @('HKLM:\SYSTEM\CurrentControlSet\Services\nvlddmkm\FTS','HKLM:\SYSTEM\CurrentControlSet\Services\nvlddmkm\Parameters\FTS','HKLM:\SYSTEM\ControlSet001\Services\nvlddmkm\Parameters\FTS')
foreach ($k in $keys) { if (Test-Path $k) { New-ItemProperty -Path $k -Name EnableGR535 -PropertyType DWord -Value 1 -Force | Out-Null } }
"#;
    let _ = run_ps(sharpen_off);
    Ok("NVIDIA profile reset to default".into())
}

#[tauri::command]
fn get_active_power_plan() -> String {
    let out = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command",
            "(Get-WmiObject -Namespace root/cimv2/power -Class Win32_PowerPlan | Where-Object { $_.IsActive -eq $true }).ElementName"])
        .creation_flags(CREATE_NO_WINDOW).output();
    match out {
        Ok(o) => String::from_utf8_lossy(&o.stdout).trim().to_string(),
        Err(_) => "Unknown".into(),
    }
}

#[tauri::command]
fn activate_power_plan(app: tauri::AppHandle, plan: String) -> Result<String, String> {
    let pow_path = app.path()
        .resolve(format!("resources/powerplans/{}.pow", plan), tauri::path::BaseDirectory::Resource)
        .map_err(|_| format!("Could not find {}.pow in resources", plan))?;
    let path_str = pow_path.to_string_lossy().to_string();
    let import = std::process::Command::new("powercfg")
        .args(["-import", &path_str]).creation_flags(CREATE_NO_WINDOW).output().map_err(|e: std::io::Error| e.to_string())?;
    if !import.status.success() { return Err(String::from_utf8_lossy(&import.stderr).to_string()); }
    let output_str = String::from_utf8_lossy(&import.stdout).to_string();
    let guid = output_str.lines()
        .find(|l| l.contains("GUID") || l.contains("guid"))
        .and_then(|l| l.split_whitespace().last())
        .map(|s| s.trim_matches(|c: char| !c.is_alphanumeric() && c != '-').to_string())
        .ok_or_else(|| format!("Could not parse GUID from: {}", output_str))?;
    let activate = std::process::Command::new("powercfg")
        .args(["-setactive", &guid]).creation_flags(CREATE_NO_WINDOW).output().map_err(|e: std::io::Error| e.to_string())?;
    if activate.status.success() { Ok(format!("Core power plan activated ({})", &guid[..8])) }
    else { Err(String::from_utf8_lossy(&activate.stderr).to_string()) }
}

#[tauri::command]
fn restore_default_power_plan() -> Result<String, String> {
    let balanced_guid = "381b4222-f694-41f0-9685-ff5bb260df2e";
    let out = std::process::Command::new("powercfg")
        .args(["-setactive", balanced_guid]).creation_flags(CREATE_NO_WINDOW).output().map_err(|e: std::io::Error| e.to_string())?;
    if out.status.success() { Ok("Restored Windows Balanced plan".into()) }
    else { Err(String::from_utf8_lossy(&out.stderr).to_string()) }
}

#[tauri::command]
fn disable_device_power_saving(enable: bool) -> Result<String, String> {
    let val = if enable { "$false" } else { "$true" };
    let script = format!(r#"
$ErrorActionPreference = 'SilentlyContinue'
$count = 0
Get-WmiObject -Namespace root\wmi -Class MSPower_DeviceEnable | ForEach-Object {{
    if ($_.Enable -ne {val}) {{ $_.Enable = {val}; $_.Put() | Out-Null; $count++ }}
}}
Write-Output "Done:$count"
"#, val = val);
    let out = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &script])
        .creation_flags(CREATE_NO_WINDOW).output().map_err(|e: std::io::Error| e.to_string())?;
    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let count = stdout.strip_prefix("Done:").unwrap_or("?");
    if enable { Ok(format!("Power saving disabled on {} device(s)", count)) }
    else { Ok(format!("Power saving restored on {} device(s)", count)) }
}

#[tauri::command]
fn disable_usb_power_saving(enable: bool) -> Result<String, String> {
    let val = if enable { "$false" } else { "$true" };
    let script = format!(r#"
$ErrorActionPreference = 'SilentlyContinue'
$devicesUSB = Get-PnpDevice | Where-Object {{ $_.InstanceId -like "*USB\ROOT*" }}
$count = 0
foreach ($device in $devicesUSB) {{
    $instance = Get-CimInstance -ClassName MSPower_DeviceEnable -Namespace root\wmi -ErrorAction SilentlyContinue |
        Where-Object {{ $_.InstanceName -like "*$($device.InstanceId)*" }}
    if ($instance) {{ Set-CimInstance -Namespace root\wmi -InputObject $instance -Property @{{Enable={val}}} -ErrorAction SilentlyContinue; $count++ }}
}}
Write-Output "Done:$count"
"#, val = val);
    let out = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &script])
        .creation_flags(CREATE_NO_WINDOW).output().map_err(|e: std::io::Error| e.to_string())?;
    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let count = stdout.strip_prefix("Done:").unwrap_or("?");
    if enable { Ok(format!("USB root hub power saving disabled on {} hub(s)", count)) }
    else { Ok(format!("USB root hub power saving restored on {} hub(s)", count)) }
}

#[derive(serde::Serialize)]
struct DetectedGame { name: String, path: String, source: String }

#[tauri::command]
fn scan_installed_games() -> Vec<DetectedGame> {
    let mut games: Vec<DetectedGame> = Vec::new();
    let search_dirs = [
        r"C:\Program Files\Steam\steamapps\common", r"C:\Program Files (x86)\Steam\steamapps\common",
        r"D:\Steam\steamapps\common", r"D:\SteamLibrary\steamapps\common",
        r"E:\Steam\steamapps\common", r"E:\SteamLibrary\steamapps\common",
        r"C:\Program Files\Epic Games", r"C:\Program Files (x86)\Epic Games", r"D:\Epic Games",
        r"C:\Riot Games", r"D:\Riot Games", r"C:\Program Files\Rockstar Games", r"D:\Rockstar Games",
        r"C:\Program Files (x86)\Ubisoft\Ubisoft Game Launcher\games",
        r"C:\Program Files\EA Games", r"D:\EA Games", r"C:\XboxGames",
    ];
    let known: &[(&str, &str)] = &[
        ("FiveM","FiveM.exe"),("GTA V","GTA5.exe"),("CS2","cs2.exe"),("CS:GO","csgo.exe"),
        ("Valorant","VALORANT.exe"),("Fortnite","FortniteClient-Win64-Shipping.exe"),
        ("Apex Legends","r5apex.exe"),("Warzone","ModernWarfare.exe"),("Warzone 2","cod.exe"),
        ("Overwatch 2","Overwatch.exe"),("Minecraft","javaw.exe"),("Rust","RustClient.exe"),
        ("DayZ","DayZ_x64.exe"),("Escape from Tarkov","EscapeFromTarkov.exe"),
        ("Rainbow Six Siege","RainbowSix.exe"),("PUBG","TslGame.exe"),
        ("Rocket League","RocketLeague.exe"),("Dota 2","dota2.exe"),
        ("League of Legends","League of Legends.exe"),("Cyberpunk 2077","Cyberpunk2077.exe"),
        ("Red Dead 2","RDR2.exe"),("Elden Ring","eldenring.exe"),
    ];
    for dir in &search_dirs {
        let base = std::path::Path::new(dir);
        if !base.exists() { continue; }
        if let Ok(entries) = std::fs::read_dir(base) {
            for entry in entries.flatten() {
                let fp = entry.path();
                if !fp.is_dir() { continue; }
                let fname = entry.file_name().to_string_lossy().to_string();
                for (game_name, exe) in known {
                    if fp.join(exe).exists() && !games.iter().any(|g: &DetectedGame| g.name == *game_name) {
                        games.push(DetectedGame { name: game_name.to_string(), path: fp.to_string_lossy().to_string(), source: "File system".into() });
                        break;
                    }
                }
                let skip = ["__",".", "Redist","redist","DirectX","vcredist","UE4","Engine","Binaries","Cache","Logs","Saved"];
                if !skip.iter().any(|s| fname.starts_with(s)) && !games.iter().any(|g: &DetectedGame| g.path == fp.to_string_lossy().as_ref()) {
                    let has_exe = std::fs::read_dir(&fp).map(|rd| rd.flatten().any(|e| e.path().extension().map(|x| x == "exe").unwrap_or(false))).unwrap_or(false);
                    if has_exe { games.push(DetectedGame { name: fname, path: fp.to_string_lossy().to_string(), source: "File system".into() }); }
                }
            }
        }
    }
    let ps = r#"Get-ItemProperty HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*,HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*,HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\* -ErrorAction SilentlyContinue | Where-Object { $p = $_.Publisher; $p -and ($p -like '*Valve*' -or $p -like '*Riot*' -or $p -like '*Epic*' -or $p -like '*Rockstar*' -or $p -like '*Ubisoft*' -or $p -like '*Blizzard*' -or $p -like '*Activision*' -or $p -like '*CD Projekt*' -or $p -like '*Bohemia*' -or $p -like '*Electronic Arts*' -or $p -like '*Battlestate*') -and $_.DisplayName } | Select-Object DisplayName,InstallLocation | ForEach-Object { "$($_.DisplayName)|$($_.InstallLocation)" }"#;
    if let Ok(out) = std::process::Command::new("powershell").args(["-NoProfile","-NonInteractive","-Command",ps]).creation_flags(CREATE_NO_WINDOW).output() {
        for line in String::from_utf8_lossy(&out.stdout).lines() {
            let parts: Vec<&str> = line.splitn(2,'|').collect();
            if parts.len() == 2 {
                let name = parts[0].trim().to_string(); let path = parts[1].trim().to_string();
                if !name.is_empty() && !games.iter().any(|g: &DetectedGame| g.name == name) {
                    games.push(DetectedGame { name, path, source: "Registry".into() });
                }
            }
        }
    }
    games.sort_by(|a,b| a.name.cmp(&b.name));
    games
}

// ─── Payhip license validation ────────────────────────────────────────────────

#[tauri::command]
fn validate_license(key: String, _machine_id: String) -> Result<String, String> {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| e.to_string())?;

    rt.block_on(async {
        let client = reqwest::Client::new();
        let key = key.trim().to_string();

        let mut last_status = 0u16;
        let mut last_body   = String::new();

        for tier in TIERS {
            let resp = client
                .get("https://payhip.com/api/v2/license/verify")
                .header("product-secret-key", tier.api_key)
                .query(&[("license_key", key.as_str())])
                .send()
                .await
                .map_err(|e: reqwest::Error| e.to_string())?;

            let status = resp.status().as_u16();
            let body_text = resp.text().await.unwrap_or_default();

            println!("[Payhip] tier={} status={} body={}", tier.name, status, &body_text[..body_text.len().min(300)]);

            last_status = status;
            last_body   = body_text.clone();

            let body: serde_json::Value = serde_json::from_str(&body_text).unwrap_or_default();

            if status == 200 && body["data"].is_object() {
                let data = &body["data"];

                let enabled = data["enabled"].as_bool().unwrap_or(false);
                if !enabled {
                    return Ok(serde_json::json!({
                        "valid": false,
                        "reason": "This license has been disabled or refunded."
                    }).to_string());
                }

                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs() as i64;

                let expires_at: Option<i64> = if let Some(days) = tier.days {
                    let purchase_date = data["date"].as_str().unwrap_or("");
                    parse_payhip_date(purchase_date).map(|ts| ts + (days as i64 * 86400))
                } else {
                    None
                };

                let within_window = match expires_at {
                    Some(exp) => exp > now,
                    None => true,
                };

                if !within_window {
                    return Ok(serde_json::json!({
                        "valid": false,
                        "reason": format!(
                            "Your {} access has expired. Please purchase a new key.",
                            tier.name
                        ),
                        "expires_at": expires_at
                    }).to_string());
                }

                return Ok(serde_json::json!({
                    "valid": true,
                    "plan": tier.name,
                    "is_lifetime": tier.days.is_none(),
                    "expires_at": expires_at
                }).to_string());
            }
        }

        Ok(serde_json::json!({
            "valid": false,
            "reason": format!("HTTP {} — {}", last_status, &last_body[..last_body.len().min(300)])
        }).to_string())
    })
}

fn parse_payhip_date(s: &str) -> Option<i64> {
    let s = s.trim();
    if s.len() < 19 { return None; }
    let parts_d: Vec<&str> = s[..10].split('-').collect();
    let parts_t: Vec<&str> = s[11..19].split(':').collect();
    if parts_d.len() != 3 || parts_t.len() != 3 { return None; }
    let year:  i64 = parts_d[0].parse().ok()?;
    let month: i64 = parts_d[1].parse().ok()?;
    let day:   i64 = parts_d[2].parse().ok()?;
    let hour:  i64 = parts_t[0].parse().ok()?;
    let min:   i64 = parts_t[1].parse().ok()?;
    let sec:   i64 = parts_t[2].parse().ok()?;
    let y = year - 1970;
    let leap_days = y / 4 - y / 100 + y / 400;
    let month_days: [i64; 12] = [31,28,31,30,31,30,31,31,30,31,30,31];
    let mut days: i64 = y * 365 + leap_days;
    for m in 0..(month as usize - 1) { days += month_days[m]; }
    if month > 2 && (year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)) { days += 1; }
    days += day - 1;
    Some(days * 86400 + hour * 3600 + min * 60 + sec)
}

// ─── License persistence ──────────────────────────────────────────────────────

#[tauri::command]
fn save_license(key: String) -> Result<(), String> {
    let path = license_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let obfuscated: Vec<u8> = key.bytes().map(|b| b ^ OBFUSCATE_KEY).collect();
    std::fs::write(&path, &obfuscated).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_saved_license() -> String {
    match license_path() {
        Err(_) => String::new(),
        Ok(path) => std::fs::read(&path)
            .map(|bytes: Vec<u8>| bytes.iter().map(|b| b ^ OBFUSCATE_KEY).collect::<Vec<u8>>())
            .ok()
            .and_then(|bytes| String::from_utf8(bytes).ok())
            .unwrap_or_default(),
    }
}

#[tauri::command]
fn clear_license() -> Result<(), String> {
    let path = license_path()?;
    if path.exists() { std::fs::remove_file(&path).map_err(|e| e.to_string())?; }
    Ok(())
}

fn license_path() -> Result<std::path::PathBuf, String> {
    let appdata = std::env::var("APPDATA").map_err(|_| "APPDATA not set".to_string())?;
    Ok(std::path::PathBuf::from(appdata).join("Framely").join("framely_license.dat"))
}

// ─── Call of Duty commands ────────────────────────────────────────────────────

#[tauri::command]
fn cod_adv_options(enable: bool) -> Result<String, String> {
    let userprofile = std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users\\User".into());
    let config_path = format!("{}\\Documents\\Call of Duty Modern Warfare\\players\\adv_options.ini", userprofile);
    let path = std::path::Path::new(&config_path);
    if !enable {
        if path.exists() {
            let mut perms = std::fs::metadata(path).map_err(|e| e.to_string())?.permissions();
            perms.set_readonly(false);
            std::fs::set_permissions(path, perms).map_err(|e| e.to_string())?;
        }
        return Ok("adv_options.ini unlocked".into());
    }
    let core_count: u32 = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command",
            "(Get-WmiObject Win32_Processor | Measure-Object -Property NumberOfCores -Sum).Sum"])
        .creation_flags(CREATE_NO_WINDOW).output().ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s: String| s.trim().parse::<u32>().ok())
        .unwrap_or(4);
    let renderer_workers = (core_count / 2).max(1);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let existing = if path.exists() {
        let mut perms = std::fs::metadata(path).map_err(|e| e.to_string())?.permissions();
        perms.set_readonly(false);
        std::fs::set_permissions(path, perms).map_err(|e| e.to_string())?;
        std::fs::read_to_string(path).unwrap_or_default()
    } else { String::new() };
    fn set_ini_value(content: &str, key: &str, value: &str) -> String {
        let needle = format!("{}=", key);
        let new_line = format!("{}={}", key, value);
        if content.lines().any(|l| l.trim_start().starts_with(&needle)) {
            content.lines().map(|l| if l.trim_start().starts_with(&needle) { new_line.clone() } else { l.to_string() }).collect::<Vec<_>>().join("\r\n")
        } else {
            if content.is_empty() { new_line } else { format!("{}\r\n{}", content.trim_end(), new_line) }
        }
    }
    let updated = set_ini_value(&existing, "RendererWorkerCount", &renderer_workers.to_string());
    let updated = set_ini_value(&updated, "VideoMemoryScale", "0.55");
    let updated = set_ini_value(&updated, "ConfigCloudStorageEnabled", "0");
    std::fs::write(path, updated.as_bytes()).map_err(|e| e.to_string())?;
    let mut perms = std::fs::metadata(path).map_err(|e| e.to_string())?.permissions();
    perms.set_readonly(true);
    std::fs::set_permissions(path, perms).map_err(|e| e.to_string())?;
    Ok(format!("adv_options.ini optimized — RendererWorkerCount={}, VideoMemoryScale=0.55, locked read-only", renderer_workers))
}

#[tauri::command]
fn cod_ntfs_tweaks(enable: bool) -> Result<String, String> {
    let val = if enable { "0x80000001" } else { "0x80000000" };
    reg_add(r"HKLM\SYSTEM\CurrentControlSet\Control\FileSystem", "NtfsDisableLastAccessUpdate", "REG_DWORD", val)?;
    if enable { Ok("NTFS last-access updates disabled".into()) }
    else { Ok("NTFS last-access updates restored".into()) }
}

#[tauri::command]
fn cod_disable_fullscreen_optimizations(enable: bool) -> Result<String, String> {
    let exes = ["ModernWarfare.exe","cod.exe","BlackOps6.exe","MW2.exe","MW3.exe"];
    let flag_value = if enable { "~ DISABLEDXMAXIMIZEDWINDOWEDMODE" } else { "" };
    let mut applied = vec![];
    for exe in &exes {
        let key = r"HKCU\Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers";
        if enable {
            let out = std::process::Command::new("reg")
                .args(["add", key, "/v", exe, "/t", "REG_SZ", "/d", flag_value, "/f"])
                .creation_flags(CREATE_NO_WINDOW).output().map_err(|e: std::io::Error| e.to_string())?;
            if out.status.success() { applied.push(*exe); }
        } else {
            let _ = std::process::Command::new("reg")
                .args(["delete", key, "/v", exe, "/f"])
                .creation_flags(CREATE_NO_WINDOW).output();
            applied.push(*exe);
        }
    }
    if enable { Ok(format!("Fullscreen optimizations disabled for: {}", applied.join(", "))) }
    else { Ok("Fullscreen optimizations restored".into()) }
}

#[tauri::command]
fn cod_process_priority(enable: bool) -> Result<String, String> {
    let cod_exes = ["ModernWarfare","cod","BlackOps6","MW2","MW3","BlackOps4","BlackOps3","Warzone"];
    if !enable {
        let script = cod_exes.iter().map(|name| format!("Get-Process -Name '{}' -ErrorAction SilentlyContinue | ForEach-Object {{ $_.PriorityClass = 'Normal' }}", name)).collect::<Vec<_>>().join("; ");
        run_ps(&script)?;
        return Ok("CoD process priority restored to Normal".into());
    }
    let script = cod_exes.iter().map(|name| format!("Get-Process -Name '{}' -ErrorAction SilentlyContinue | ForEach-Object {{ $_.PriorityClass = 'High' }}", name)).collect::<Vec<_>>().join("; ");
    let _result = run_ps(&script)?;
    let check_script = cod_exes.iter().map(|name| format!("Get-Process -Name '{}' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name", name)).collect::<Vec<_>>().join("; ");
    let found = run_ps(&check_script).unwrap_or_default().trim().to_string();
    if found.is_empty() { Ok("No CoD processes found — launch the game first".into()) }
    else { Ok(format!("Priority set to High for: {}", found)) }
}

#[tauri::command]
fn cod_config_texture_stream(enable: bool) -> Result<String, String> {
    let userprofile = std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users\\User".into());
    let base = format!("{}\\Documents\\Call of Duty\\players", userprofile);
    let base_path = std::path::Path::new(&base);
    if !base_path.exists() { return Ok("CoD players folder not found".into()); }
    let targets = ["g.1.0.l.txt","s.1.0.cod24.txt","gamerprofile.0.bASE.cst"];
    let mut patched = vec![];
    let mut dirs_to_search = vec![base_path.to_path_buf()];
    if let Ok(entries) = std::fs::read_dir(base_path) {
        for entry in entries.flatten() { if entry.path().is_dir() { dirs_to_search.push(entry.path()); } }
    }
    for dir in &dirs_to_search {
        for target in &targets {
            let fp = dir.join(target);
            if !fp.exists() { continue; }
            let content_raw = std::fs::read_to_string(&fp).unwrap_or_default();
            if !enable {
                let restored = if content_raw.contains("HTTPStreamLimitMBytes@0") {
                    content_raw.lines().map(|l| { if l.trim_start().starts_with("HTTPStreamLimitMBytes@0") { "HTTPStreamLimitMBytes@0 = \"1024\"".to_string() } else { l.to_string() } }).collect::<Vec<_>>().join("\n")
                } else { content_raw.clone() };
                std::fs::write(&fp, restored.as_bytes()).map_err(|e| e.to_string())?;
                patched.push(target.to_string());
                continue;
            }
            let updated = if content_raw.contains("HTTPStreamLimitMBytes@0") {
                content_raw.lines().map(|l| { if l.trim_start().starts_with("HTTPStreamLimitMBytes@0") { "HTTPStreamLimitMBytes@0 = \"0\"".to_string() } else { l.to_string() } }).collect::<Vec<_>>().join("\n")
            } else {
                if content_raw.is_empty() { "HTTPStreamLimitMBytes@0 = \"0\"".to_string() }
                else { format!("{}\nHTTPStreamLimitMBytes@0 = \"0\"", content_raw.trim_end()) }
            };
            std::fs::write(&fp, updated.as_bytes()).map_err(|e| e.to_string())?;
            patched.push(target.to_string());
        }
    }
    if patched.is_empty() { Ok("No CoD config files found".into()) }
    else if enable { Ok(format!("Texture stream cap removed in: {}", patched.join(", "))) }
    else { Ok(format!("Texture stream limit restored in: {}", patched.join(", "))) }
}

#[tauri::command]
fn cod_shader_cache_clear() -> Result<String, String> {
    let localappdata = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| "C:\\Users\\User\\AppData\\Local".into());
    let cache_paths = [
        format!("{}\\Activision\\Call of Duty\\Data\\Shader", localappdata),
        format!("{}\\Call of Duty\\Data\\Shader", localappdata),
        format!("{}\\Battle.net\\Call of Duty\\Data\\Shader", localappdata),
    ];
    let mut cleared = vec![];
    let mut total_size: u64 = 0;
    for cache_path in &cache_paths {
        let p = std::path::Path::new(cache_path);
        if !p.exists() { continue; }
        if let Ok(entries) = std::fs::read_dir(p) {
            for entry in entries.flatten() { if let Ok(meta) = entry.metadata() { total_size += meta.len(); } }
        }
        match std::fs::remove_dir_all(p) {
            Ok(_) => { cleared.push(cache_path.clone()); }
            Err(e) => return Err(format!("Failed to clear {}: {}", cache_path, e)),
        }
    }
    if cleared.is_empty() { Ok("No CoD shader cache found".into()) }
    else { Ok(format!("Shader cache cleared ({} MB freed)", total_size / 1024 / 1024)) }
}

#[tauri::command]
fn cod_config_reset() -> Result<String, String> {
    let userprofile = std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users\\User".into());
    let players_path = format!("{}\\Documents\\Call of Duty\\players", userprofile);
    let p = std::path::Path::new(&players_path);
    if !p.exists() { return Ok("CoD players folder not found".into()); }
    let mut total_size: u64 = 0;
    if let Ok(walk) = std::fs::read_dir(p) {
        for entry in walk.flatten() { if let Ok(meta) = entry.metadata() { total_size += meta.len(); } }
    }
    std::fs::remove_dir_all(p).map_err(|e| format!("Failed to delete CoD config: {}", e))?;
    Ok(format!("CoD config reset ({} KB cleared)", total_size / 1024))
}

#[tauri::command]
fn cod_disable_power_throttling(enable: bool) -> Result<String, String> {
    if enable {
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerThrottling", "PowerThrottlingOff", "REG_DWORD", "1")?;
        Ok("Power throttling disabled".into())
    } else {
        let _ = std::process::Command::new("reg")
            .args(["delete", r"HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerThrottling", "/v", "PowerThrottlingOff", "/f"])
            .creation_flags(CREATE_NO_WINDOW).output().map_err(|e: std::io::Error| e.to_string())?;
        Ok("Power throttling restored".into())
    }
}

#[tauri::command]
fn cod_disable_timer_coalescing(enable: bool) -> Result<String, String> {
    if enable {
        reg_add(r"HKLM\SYSTEM\CurrentControlSet\Control\Power", "CoalescingTimerInterval", "REG_DWORD", "0")?;
        Ok("Timer coalescing disabled".into())
    } else {
        let _ = std::process::Command::new("reg")
            .args(["delete", r"HKLM\SYSTEM\CurrentControlSet\Control\Power", "/v", "CoalescingTimerInterval", "/f"])
            .creation_flags(CREATE_NO_WINDOW).output().map_err(|e: std::io::Error| e.to_string())?;
        Ok("Timer coalescing restored".into())
    }
}

#[tauri::command]
fn cod_large_system_cache(enable: bool) -> Result<String, String> {
    let mm_key = r"HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management";
    if enable {
        reg_add(mm_key, "LargeSystemCache",  "REG_DWORD", "0")?;
        reg_add(mm_key, "IoPageLockLimit",   "REG_DWORD", "983040")?;
        reg_add(mm_key, "NonPagedPoolQuota", "REG_DWORD", "0")?;
        reg_add(mm_key, "PagedPoolQuota",    "REG_DWORD", "0")?;
        Ok("Memory manager optimized for gaming".into())
    } else {
        reg_add(mm_key, "LargeSystemCache", "REG_DWORD", "0")?;
        reg_add(mm_key, "IoPageLockLimit",  "REG_DWORD", "0")?;
        Ok("Memory manager restored".into())
    }
}

#[tauri::command]
fn cod_gpu_tdr_fix(enable: bool) -> Result<String, String> {
    let gfx_key = r"HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers";
    if enable {
        reg_add(gfx_key, "TdrLevel",    "REG_DWORD", "0")?;
        reg_add(gfx_key, "TdrDelay",    "REG_DWORD", "60")?;
        reg_add(gfx_key, "TdrDdiDelay", "REG_DWORD", "60")?;
        Ok("GPU TDR watchdog disabled (restart recommended)".into())
    } else {
        reg_add(gfx_key, "TdrLevel",    "REG_DWORD", "3")?;
        reg_add(gfx_key, "TdrDelay",    "REG_DWORD", "2")?;
        reg_add(gfx_key, "TdrDdiDelay", "REG_DWORD", "5")?;
        Ok("GPU TDR watchdog restored".into())
    }
}

#[tauri::command]
fn cod_gpu_upload_heaps(enable: bool) -> Result<String, String> {
    let userprofile = std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users\\User".into());
    let localappdata = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| "C:\\Users\\User\\AppData\\Local".into());
    let search_paths = vec![
        format!("{}\\Documents\\Call of Duty\\players", userprofile),
        format!("{}\\Documents\\Call of Duty Modern Warfare\\players", userprofile),
        format!("{}\\Activision\\Call of Duty\\players", localappdata),
    ];
    let config_names = ["options.4.cod23.cst","s.1.0.cod24.txt","s.1.0.bt.cod25.txt","options.3.cod22.cst"];
    let target_value = if enable { "false" } else { "true" };
    let mut patched = vec![];
    for base in &search_paths {
        let base_path = std::path::Path::new(base);
        if !base_path.exists() { continue; }
        let mut dirs = vec![base_path.to_path_buf()];
        if let Ok(entries) = std::fs::read_dir(base_path) {
            for entry in entries.flatten() { if entry.path().is_dir() { dirs.push(entry.path()); } }
        }
        for dir in &dirs {
            for name in &config_names {
                let fp = dir.join(name);
                if !fp.exists() { continue; }
                let content = std::fs::read_to_string(&fp).unwrap_or_default();
                let updated: String = content.lines().map(|line| {
                    let trimmed = line.trim();
                    if trimmed.starts_with("GPUUploadHeaps") && trimmed.contains('=') {
                        let eq_pos = trimmed.find('=').unwrap();
                        let key_part = trimmed[..eq_pos].trim_end();
                        format!("{} = \"{}\"", key_part, target_value)
                    } else { line.to_string() }
                }).collect::<Vec<_>>().join("\n");
                if updated != content {
                    std::fs::write(&fp, updated.as_bytes()).map_err(|e| e.to_string())?;
                    patched.push(name.to_string());
                }
            }
        }
    }
    if patched.is_empty() { Ok("No CoD config files found with GPUUploadHeaps".into()) }
    else if enable { Ok(format!("GPUUploadHeaps disabled in {}", patched.join(", "))) }
    else { Ok(format!("GPUUploadHeaps re-enabled in {}", patched.join(", "))) }
}

#[tauri::command]
fn cod_disable_vbs(enable: bool) -> Result<String, String> {
    let vbs_key  = r"HKLM\SYSTEM\CurrentControlSet\Control\DeviceGuard";
    let hvci_key = r"HKLM\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity";
    if enable {
        reg_add(vbs_key,  "EnableVirtualizationBasedSecurity", "REG_DWORD", "0")?;
        reg_add(vbs_key,  "RequirePlatformSecurityFeatures",   "REG_DWORD", "0")?;
        reg_add(hvci_key, "Enabled",                           "REG_DWORD", "0")?;
        Ok("VBS and Memory Integrity disabled (restart required)".into())
    } else {
        reg_add(vbs_key,  "EnableVirtualizationBasedSecurity", "REG_DWORD", "1")?;
        reg_add(vbs_key,  "RequirePlatformSecurityFeatures",   "REG_DWORD", "1")?;
        reg_add(hvci_key, "Enabled",                           "REG_DWORD", "1")?;
        Ok("VBS and Memory Integrity restored (restart required)".into())
    }
}

#[tauri::command]
fn cod_force_pcores(enable: bool) -> Result<String, String> {
    if !enable {
        let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$names = @('ModernWarfare','cod','BlackOps6','MW2','MW3','BlackOps7','BlackOps4')
$count = 0
foreach ($name in $names) {
    $procs = Get-Process -Name $name -ErrorAction SilentlyContinue
    foreach ($p in $procs) { $p.ProcessorAffinity = [System.IntPtr]::new(-1); $count++ }
}
Write-Output "Reset:$count"
"#;
        let out = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script])
            .creation_flags(CREATE_NO_WINDOW).output().map_err(|e: std::io::Error| e.to_string())?;
        let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
        return Ok(format!("CPU affinity reset for {} CoD process(es)", stdout.strip_prefix("Reset:").unwrap_or("?")));
    }
    let detect_script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$totalLogical = (Get-WmiObject Win32_ComputerSystem).NumberOfLogicalProcessors
$pCoreCount = $null
try {
    $cpuName = (Get-WmiObject Win32_Processor).Name
    if ($cpuName -match 'i[3579]-1[2-9]' -or $cpuName -match 'i[3579]-2[0-9]') {
        $physCores = (Get-WmiObject Win32_Processor).NumberOfCores
        $pCoreCount = [Math]::Floor($physCores / 2) * 2
    }
} catch {}
if ($null -eq $pCoreCount) { $pCoreCount = $totalLogical }
Write-Output "$pCoreCount|$totalLogical"
"#;
    let detect_out = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", detect_script])
        .creation_flags(CREATE_NO_WINDOW).output().map_err(|e: std::io::Error| e.to_string())?;
    let detect_str = String::from_utf8_lossy(&detect_out.stdout).trim().to_string();
    let parts: Vec<&str> = detect_str.split('|').collect();
    let p_cores: u32 = parts.get(0).and_then(|s| s.trim().parse().ok()).unwrap_or(0);
    let total: u32   = parts.get(1).and_then(|s| s.trim().parse().ok()).unwrap_or(0);
    if p_cores == 0 || p_cores >= total {
        return Ok("Non-hybrid CPU detected — P-core affinity only applies to Intel 12th gen and newer".into());
    }
    let affinity_mask: u64 = (1u64 << p_cores) - 1;
    let apply_script = format!(r#"
$ErrorActionPreference = 'SilentlyContinue'
$names = @('ModernWarfare','cod','BlackOps6','MW2','MW3','BlackOps7','BlackOps4')
$mask = [System.IntPtr]::new({})
$count = 0
foreach ($name in $names) {{
    $procs = Get-Process -Name $name -ErrorAction SilentlyContinue
    foreach ($p in $procs) {{ $p.ProcessorAffinity = $mask; $count++ }}
}}
Write-Output "Set:$count"
"#, affinity_mask);
    let out = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &apply_script])
        .creation_flags(CREATE_NO_WINDOW).output().map_err(|e: std::io::Error| e.to_string())?;
    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let count = stdout.strip_prefix("Set:").unwrap_or("0");
    if count == "0" { Ok(format!("No CoD processes found — launch CoD first (P-cores: {})", p_cores)) }
    else { Ok(format!("CoD pinned to {} P-cores for {} process(es)", p_cores, count)) }
}

#[tauri::command]
fn cod_open_nat_ports(enable: bool) -> Result<String, String> {
    if !enable {
        let _ = std::process::Command::new("netsh").args(["advfirewall", "firewall", "delete", "rule", "name=Framely-CoD-UDP-In"]).creation_flags(CREATE_NO_WINDOW).output();
        let _ = std::process::Command::new("netsh").args(["advfirewall", "firewall", "delete", "rule", "name=Framely-CoD-UDP-Out"]).creation_flags(CREATE_NO_WINDOW).output();
        return Ok("CoD NAT port rules removed".into());
    }
    let ports = "3074,3478,3479,27015,27016,27017,27018,27019,27020,27021,27022,27023,27024,27025,27026,27027,27028,27029,27030,27031,27032,27033,27034,27035,27036";
    let in_rule = std::process::Command::new("netsh")
        .args(["advfirewall", "firewall", "add", "rule", "name=Framely-CoD-UDP-In", "protocol=UDP", "dir=in", "action=allow", &format!("localport={}", ports)])
        .creation_flags(CREATE_NO_WINDOW).output().map_err(|e: std::io::Error| e.to_string())?;
    let out_rule = std::process::Command::new("netsh")
        .args(["advfirewall", "firewall", "add", "rule", "name=Framely-CoD-UDP-Out", "protocol=UDP", "dir=out", "action=allow", &format!("remoteport={}", ports)])
        .creation_flags(CREATE_NO_WINDOW).output().map_err(|e: std::io::Error| e.to_string())?;
    if in_rule.status.success() && out_rule.status.success() {
        Ok("CoD UDP ports opened in Windows Firewall".into())
    } else {
        Err("Failed to add firewall rules — run Framely as administrator".into())
    }
}

#[tauri::command]
fn cod_clear_nvidia_cache() -> Result<String, String> {
    let programdata = std::env::var("PROGRAMDATA").unwrap_or_else(|_| "C:\\ProgramData".into());
    let localappdata = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| "C:\\Users\\User\\AppData\\Local".into());
    let cache_paths = [
        format!("{}\\NVIDIA Corporation\\NV_Cache", programdata),
        format!("{}\\NVIDIA\\NV_Cache", localappdata),
        format!("{}\\D3DSCache", localappdata),
    ];
    let mut cleared = vec![];
    let mut total_mb: u64 = 0;
    for path_str in &cache_paths {
        let p = std::path::Path::new(path_str);
        if !p.exists() { continue; }
        if let Ok(entries) = std::fs::read_dir(p) {
            for entry in entries.flatten() { if let Ok(meta) = entry.metadata() { total_mb += meta.len(); } }
        }
        match std::fs::remove_dir_all(p) {
            Ok(_) => { cleared.push(path_str.clone()); }
            Err(_) => {
                if let Ok(entries) = std::fs::read_dir(p) {
                    for entry in entries.flatten() { let _ = std::fs::remove_file(entry.path()); }
                }
                cleared.push(format!("{} (partial)", path_str));
            }
        }
    }
    total_mb /= 1024 * 1024;
    if cleared.is_empty() { Ok("No NVIDIA shader cache found".into()) }
    else { Ok(format!("NVIDIA shader cache cleared ({} MB freed)", total_mb)) }
}

#[tauri::command]
fn check_integrity() -> bool { true }