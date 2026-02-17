use crate::models::{FrpcProcesses, LogMessage, ProcessGuardState, TunnelConfig};
use crate::utils::sanitize_log;
use std::io::{BufRead, BufReader};
use std::process::{Command as StdCommand, Stdio};
use std::thread;
use tauri::{Emitter, Manager, State};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[tauri::command]
pub async fn start_frpc(
    app_handle: tauri::AppHandle,
    config: TunnelConfig,
    processes: State<'_, FrpcProcesses>,
    guard_state: State<'_, ProcessGuardState>,
) -> Result<String, String> {
    let tunnel_id = config.tunnel_id;
    let user_token = config.user_token.clone();

    {
        let procs = processes
            .processes
            .lock()
            .map_err(|e| format!("获取进程锁失败: {}", e))?;
        if procs.contains_key(&tunnel_id) {
            return Err("该隧道已在运行中".to_string());
        }
    }

    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    // 生成配置文件（官方隧道使用 g_ 前缀）
    let config_path = app_dir.join(format!("g_{}.ini", tunnel_id));
    let config_content = generate_frpc_config(&config)?;

    std::fs::write(&config_path, config_content)
        .map_err(|e| format!("写入配置文件失败: {}", e))?;

    let frpc_path = if cfg!(target_os = "windows") {
        app_dir.join("frpc.exe")
    } else {
        app_dir.join("frpc")
    };

    if !frpc_path.exists() {
        return Err("frpc 未找到，请先下载".to_string());
    }

    #[cfg(unix)]
    {
        use std::fs;
        use std::os::unix::fs::PermissionsExt;
        let metadata = fs::metadata(&frpc_path).map_err(|e| e.to_string())?;
        let mut perms = metadata.permissions();
        if perms.mode() & 0o111 == 0 {
            perms.set_mode(0o755);
            fs::set_permissions(&frpc_path, perms).map_err(|e| e.to_string())?;
        }
    }
    let mut cmd = StdCommand::new(&frpc_path);
    cmd.current_dir(&app_dir)
        .arg("-c")
        .arg(&config_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Windows上隐藏控制台窗口
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000);
    }

    let mut child = cmd.spawn().map_err(|e| format!("启动 frpc 失败: {}", e))?;

    let pid = child.id();

    let timestamp = chrono::Local::now().format("%Y/%m/%d %H:%M:%S").to_string();
    let _ = app_handle.emit(
        "frpc-log",
        LogMessage {
            tunnel_id,
            message: format!("[I] [ChmlFrpLauncher] frpc 进程已启动 (PID: {}), 开始连接服务器...", pid),
            timestamp: timestamp.clone(),
        },
    );

    // 捕获 stdout
    if let Some(stdout) = child.stdout.take() {
        let app_handle_clone = app_handle.clone();
        let tunnel_id_clone = tunnel_id;
        let user_token_clone = user_token.clone();
        match thread::Builder::new()
            .name(format!("frpc-stdout-{}", tunnel_id))
            .spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines().flatten() {
                    // 去除 ANSI 颜色代码
                    let clean_line = strip_ansi_escapes::strip_str(&line);

                    // 隐藏用户 token
                    let sanitized_line = sanitize_log(&clean_line, &user_token_clone);

                    let timestamp = chrono::Local::now().format("%Y/%m/%d %H:%M:%S").to_string();

                    // 检查日志是否需要停止守护
                    let guard_state_for_check =
                        app_handle_clone.state::<crate::models::ProcessGuardState>();
                    let _ = tauri::async_runtime::block_on(async {
                        crate::commands::process_guard::check_log_and_stop_guard(
                            app_handle_clone.clone(),
                            tunnel_id_clone,
                            sanitized_line.clone(),
                            guard_state_for_check,
                        )
                        .await
                    });

                    if let Err(_) = app_handle_clone.emit(
                        "frpc-log",
                        LogMessage {
                            tunnel_id: tunnel_id_clone,
                            message: sanitized_line,
                            timestamp,
                        },
                    ) {
                        break;
                    }
                }
            }) {
            Ok(_) => {}
            Err(e) => eprintln!("[错误] 创建 stdout 监听线程失败: {}", e),
        }
    }

    // 捕获 stderr
    if let Some(stderr) = child.stderr.take() {
        let app_handle_clone = app_handle.clone();
        let tunnel_id_clone = tunnel_id;
        let user_token_clone = user_token.clone();
        match thread::Builder::new()
            .name(format!("frpc-stderr-{}", tunnel_id))
            .spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines().flatten() {
                    // 去除 ANSI 颜色代码
                    let clean_line = strip_ansi_escapes::strip_str(&line);

                    // 隐藏用户 token
                    let sanitized_line = sanitize_log(&clean_line, &user_token_clone);

                    let timestamp = chrono::Local::now().format("%Y/%m/%d %H:%M:%S").to_string();

                    // 检查错误日志是否需要停止守护
                    let guard_state_for_check =
                        app_handle_clone.state::<crate::models::ProcessGuardState>();
                    let _ = tauri::async_runtime::block_on(async {
                        crate::commands::process_guard::check_log_and_stop_guard(
                            app_handle_clone.clone(),
                            tunnel_id_clone,
                            sanitized_line.clone(),
                            guard_state_for_check,
                        )
                        .await
                    });

                    if let Err(_) = app_handle_clone.emit(
                        "frpc-log",
                        LogMessage {
                            tunnel_id: tunnel_id_clone,
                            message: format!("[ERR] {}", sanitized_line),
                            timestamp,
                        },
                    ) {
                        break;
                    }
                }
            }) {
            Ok(_) => {}
            Err(e) => eprintln!("[错误] 创建 stderr 监听线程失败: {}", e),
        }
    }

    {
        let mut procs = processes
            .processes
            .lock()
            .map_err(|e| format!("获取进程锁失败: {}", e))?;
        procs.insert(tunnel_id, child);
    }

    let _ = crate::commands::process_guard::add_guarded_process(tunnel_id, config, guard_state)
        .await;

    Ok(format!("frpc 已启动 (PID: {})", pid))
}

#[tauri::command]
pub async fn stop_frpc(
    app_handle: tauri::AppHandle,
    tunnel_id: i32,
    processes: State<'_, FrpcProcesses>,
    guard_state: State<'_, ProcessGuardState>,
) -> Result<String, String> {
    let _ =
        crate::commands::process_guard::remove_guarded_process(tunnel_id, guard_state, true).await;

    let mut procs = processes
        .processes
        .lock()
        .map_err(|e| format!("获取进程锁失败: {}", e))?;

    if let Some(mut child) = procs.remove(&tunnel_id) {
        let result = match child.kill() {
            Ok(_) => {
                let _ = child.wait();
                Ok("frpc 已停止".to_string())
            }
            Err(e) => {
                let _ = child.wait();
                Err(format!("停止进程失败: {}", e))
            }
        };

        // 删除配置文件（官方隧道使用 g_ 前缀）
        let app_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?;
        let config_path = app_dir.join(format!("g_{}.ini", tunnel_id));
        if config_path.exists() {
            let _ = std::fs::remove_file(&config_path);
        }

        result
    } else {
        Err("该隧道未在运行".to_string())
    }
}

#[tauri::command]
pub async fn is_frpc_running(
    tunnel_id: i32,
    processes: State<'_, FrpcProcesses>,
) -> Result<bool, String> {
    let mut procs = processes
        .processes
        .lock()
        .map_err(|e| format!("获取进程锁失败: {}", e))?;

    if let Some(child) = procs.get_mut(&tunnel_id) {
        match child.try_wait() {
            Ok(Some(_)) => {
                procs.remove(&tunnel_id);
                Ok(false)
            }
            Ok(None) => Ok(true),
            Err(_) => {
                procs.remove(&tunnel_id);
                Ok(false)
            }
        }
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub async fn test_log_event(
    app_handle: tauri::AppHandle,
    tunnel_id: i32,
) -> Result<String, String> {
    eprintln!("[测试] 发送测试日志事件");
    let timestamp = chrono::Local::now().format("%Y/%m/%d %H:%M:%S").to_string();

    match app_handle.emit(
        "frpc-log",
        LogMessage {
            tunnel_id,
            message: "这是一条测试日志".to_string(),
            timestamp,
        },
    ) {
        Ok(_) => {
            eprintln!("[测试] 测试日志事件发送成功");
            Ok("测试日志已发送".to_string())
        }
        Err(e) => {
            eprintln!("[测试] 测试日志事件发送失败: {}", e);
            Err(format!("发送失败: {}", e))
        }
    }
}

#[tauri::command]
pub async fn get_running_tunnels(processes: State<'_, FrpcProcesses>) -> Result<Vec<i32>, String> {
    let mut procs = processes
        .processes
        .lock()
        .map_err(|e| format!("获取进程锁失败: {}", e))?;

    let mut running_tunnels = Vec::new();
    let mut stopped_tunnels = Vec::new();

    for (tunnel_id, child) in procs.iter_mut() {
        match child.try_wait() {
            Ok(Some(_)) => {
                stopped_tunnels.push(*tunnel_id);
            }
            Ok(None) => {
                running_tunnels.push(*tunnel_id);
            }
            Err(_) => {
                stopped_tunnels.push(*tunnel_id);
            }
        }
    }

    for tunnel_id in stopped_tunnels {
        procs.remove(&tunnel_id);
    }

    Ok(running_tunnels)
}

#[tauri::command]
pub async fn fix_frpc_ini_tls(app_handle: tauri::AppHandle) -> Result<String, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    let config_path = app_dir.join("frpc.ini");

    if !config_path.exists() {
        return Err("frpc.ini 文件不存在".to_string());
    }

    // 读取配置文件内容
    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("读取配置文件失败: {}", e))?;

    // 将 tls_enable = false 改为 tls_enable = true
    let modified_content = content.replace("tls_enable = false", "tls_enable = true");

    // 如果没有变化，说明文件中没有 tls_enable = false
    if modified_content == content {
        return Err("配置文件中未找到 tls_enable = false".to_string());
    }

    // 写回配置文件
    std::fs::write(&config_path, modified_content)
        .map_err(|e| format!("写入配置文件失败: {}", e))?;

    Ok("已成功将 tls_enable 设置为 true".to_string())
}

#[tauri::command]
pub async fn resolve_domain_to_ip(domain: String) -> Result<Option<String>, String> {
    use std::net::ToSocketAddrs;

    let addr_str = format!("{}:0", domain);
    match addr_str.to_socket_addrs() {
        Ok(addrs) => {
            for addr in addrs {
                let ip = addr.ip().to_string();
                return Ok(Some(ip));
            }
            Ok(None)
        }
        Err(_) => Ok(None),
    }
}

// 生成 frpc 配置文件内容
fn generate_frpc_config(config: &TunnelConfig) -> Result<String, String> {
    let mut content = String::new();

    // [common] 部分
    content.push_str("[common]\n");
    content.push_str(&format!("server_addr = {}\n", config.server_addr));
    content.push_str(&format!("server_port = {}\n", config.server_port));

    // 添加代理配置（如果启用）
    if let Some(ref proxy_url) = config.http_proxy {
        content.push_str(&format!("http_proxy = {}\n", proxy_url));
    }

    // TLS 配置
    content.push_str(&format!("tls_enable = {}\n", config.force_tls));

    // 多路复用配置（强制开启）
    content.push_str("tcp_mux = true\n");

    // 连接池数量
    content.push_str("pool_count = 5\n");

    // KCP 优化（在 pool_count 下方，仅对 TCP/UDP 隧道）
    if config.kcp_optimization && (config.tunnel_type == "tcp" || config.tunnel_type == "udp") {
        content.push_str("protocol = kcp\n");
    }

    content.push_str(&format!("user = {}\n", config.user_token));
    content.push_str(&format!("token = {}\n", config.node_token));
    content.push_str("\n");

    // 隧道配置部分
    content.push_str(&format!("[{}]\n", config.tunnel_name));
    content.push_str(&format!("type = {}\n", config.tunnel_type));
    content.push_str(&format!("local_ip = {}\n", config.local_ip));
    content.push_str(&format!("local_port = {}\n", config.local_port));

    // 根据隧道类型添加不同的配置
    match config.tunnel_type.as_str() {
        "tcp" | "udp" => {
            if let Some(remote_port) = config.remote_port {
                content.push_str(&format!("remote_port = {}\n", remote_port));
            } else {
                return Err("TCP/UDP 隧道缺少 remote_port 参数".to_string());
            }
        }
        "http" | "https" => {
            if let Some(ref custom_domains) = config.custom_domains {
                content.push_str(&format!("custom_domains = {}\n", custom_domains));
            } else {
                return Err("HTTP/HTTPS 隧道缺少 custom_domains 参数".to_string());
            }
        }
        _ => {
            return Err(format!("不支持的隧道类型: {}", config.tunnel_type));
        }
    }

    Ok(content)
}
