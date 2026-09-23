use std::path::{Path, PathBuf};

use tauri::{ipc::Response, State};

const MAX_FILE_BYTES: u64 = 30 * 1024 * 1024;
const SUPPORTED_EXTENSIONS: &[&str] = &[
    "csv", "tsv", "txt", "xlsx", "xls", "xlsm", "xlsb", "ods", "cell",
];

struct StartupFile(Option<PathBuf>);

fn supported_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            SUPPORTED_EXTENSIONS
                .iter()
                .any(|item| extension.eq_ignore_ascii_case(item))
        })
}

#[tauri::command]
fn startup_file_name(state: State<'_, StartupFile>) -> Option<String> {
    state
        .0
        .as_ref()?
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
}

#[tauri::command(async)]
fn read_startup_file(state: State<'_, StartupFile>) -> Result<Response, String> {
    let path = state.0.as_ref().ok_or("No file was passed to the app")?;
    let size = std::fs::metadata(path)
        .map_err(|error| error.to_string())?
        .len();
    if size > MAX_FILE_BYTES {
        return Err("The file exceeds the 30 MB limit".into());
    }
    let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
    Ok(Response::new(bytes))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let startup_file = std::env::args_os()
        .skip(1)
        .map(PathBuf::from)
        .find(|path| supported_file(path));
    tauri::Builder::default()
        .manage(StartupFile(startup_file))
        .invoke_handler(tauri::generate_handler![
            startup_file_name,
            read_startup_file
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Sheetview");
}
