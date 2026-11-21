//! Read-only access to the captured YuanCon joystick profile.

use hidapi::{DeviceInfo, HidApi};
use serde::Serialize;
use std::{
    collections::HashMap,
    ffi::CString,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread::{self, JoinHandle},
    time::Instant,
};
use tauri::{Manager, ipc::Channel};

const READ_TIMEOUT_MS: i32 = 25;

#[derive(Debug, Serialize)]
pub struct DeviceChoice {
    id: String,
    name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum InputEvent {
    Report {
        sequence: u64,
        time_ms: f64,
        report_id: u8,
        data: Vec<u8>,
    },
    Disconnected {
        message: Option<String>,
    },
}

#[derive(Debug, Default)]
struct Reports {
    previous: Vec<u8>,
    sequence: u64,
}
impl Reports {
    fn accept(&mut self, bytes: &[u8], time_ms: f64) -> Option<InputEvent> {
        let (&report_id, data) = bytes.split_first()?;
        if bytes == self.previous {
            return None;
        }
        self.previous.clear();
        self.previous.extend_from_slice(bytes);
        self.sequence += 1;
        Some(InputEvent::Report {
            sequence: self.sequence,
            time_ms,
            report_id,
            data: data.to_vec(),
        })
    }
}

#[derive(Debug)]
struct Reader {
    id: String,
    stop: Arc<AtomicBool>,
    thread: JoinHandle<()>,
}
impl Reader {
    fn close(self) -> Result<(), String> {
        self.stop.store(true, Ordering::Release);
        self.thread
            .join()
            .map_err(|_| "HID reader stopped unexpectedly".to_owned())
    }
}

#[derive(Debug)]
pub struct NativeInput {
    clock: Instant,
    choices: Mutex<HashMap<String, CString>>,
    reader: Mutex<Option<Reader>>,
}
impl Default for NativeInput {
    fn default() -> Self {
        Self {
            clock: Instant::now(),
            choices: Mutex::default(),
            reader: Mutex::default(),
        }
    }
}
impl NativeInput {
    pub fn reset(&self) {
        if let Ok(mut reader) = self.reader.lock()
            && let Some(reader) = reader.take()
        {
            let _ = reader.close();
        }
        if let Ok(mut choices) = self.choices.lock() {
            choices.clear();
        }
    }
    fn devices(&self) -> Result<Vec<DeviceChoice>, String> {
        let api = HidApi::new().map_err(|error| error.to_string())?;
        let mut choices = self.choices.lock().map_err(|error| error.to_string())?;
        choices.clear();
        Ok(api
            .device_list()
            .filter(|info| supported(info))
            .enumerate()
            .map(|(index, info)| {
                let id = uuid::Uuid::new_v4().to_string();
                choices.insert(id.clone(), info.path().to_owned());
                DeviceChoice {
                    id,
                    name: format!(
                        "{} ({})",
                        info.product_string().unwrap_or("YuanCon"),
                        index + 1
                    ),
                }
            })
            .collect())
    }
    fn connect(&self, id: &str, events: Channel<InputEvent>) -> Result<String, String> {
        let path = self
            .choices
            .lock()
            .map_err(|error| error.to_string())?
            .get(id)
            .cloned()
            .ok_or("Select a listed YuanCon controller")?;
        let mut slot = self.reader.lock().map_err(|error| error.to_string())?;
        if let Some(reader) = slot.take() {
            reader.close()?;
        }
        let api = HidApi::new().map_err(|error| error.to_string())?;
        let info = api
            .device_list()
            .find(|info| supported(info) && info.path() == path.as_c_str())
            .ok_or("The selected YuanCon controller is no longer connected")?;
        let device = info.open_device(&api).map_err(|error| error.to_string())?;
        let id = uuid::Uuid::new_v4().to_string();
        let stop = Arc::new(AtomicBool::new(false));
        let stopped = Arc::clone(&stop);
        let clock = self.clock;
        let thread = thread::Builder::new()
            .name("yuancon-input".to_owned())
            .spawn(move || {
                let mut buffer = [0_u8; 4096];
                let mut reports = Reports::default();
                let mut failure = None;
                while !stopped.load(Ordering::Acquire) {
                    match device.read_timeout(&mut buffer, READ_TIMEOUT_MS) {
                        Ok(0) => {}
                        Ok(length) => {
                            let time_ms = clock.elapsed().as_secs_f64() * 1000.0;
                            if let Some(event) = reports.accept(&buffer[..length], time_ms)
                                && events.send(event).is_err()
                            {
                                return;
                            }
                        }
                        Err(error) => {
                            failure = Some(error.to_string());
                            break;
                        }
                    }
                }
                let _ = events.send(InputEvent::Disconnected { message: failure });
            })
            .map_err(|error| error.to_string())?;
        *slot = Some(Reader {
            id: id.clone(),
            stop,
            thread,
        });
        Ok(id)
    }
    fn disconnect(&self, id: &str) -> Result<(), String> {
        let mut slot = self.reader.lock().map_err(|error| error.to_string())?;
        if slot.as_ref().is_some_and(|reader| reader.id == id)
            && let Some(reader) = slot.take()
        {
            reader.close()?;
        }
        Ok(())
    }
}
impl Drop for NativeInput {
    fn drop(&mut self) {
        // Explicit disconnect joins the reader. Destruction only signals it.
        if let Ok(slot) = self.reader.get_mut()
            && let Some(reader) = slot.take()
        {
            reader.stop.store(true, Ordering::Release);
        }
    }
}
fn supported(info: &DeviceInfo) -> bool {
    info.vendor_id() == 0x1ccf
        && info.product_id() == 0x8048
        && info.usage_page() == 1
        && info.usage() == 4
}

#[tauri::command]
pub fn input_clock(input: tauri::State<'_, NativeInput>) -> f64 {
    input.clock.elapsed().as_secs_f64() * 1000.0
}
#[tauri::command]
pub async fn yuancon_devices(app: tauri::AppHandle) -> Result<Vec<DeviceChoice>, String> {
    tauri::async_runtime::spawn_blocking(move || app.state::<NativeInput>().devices())
        .await
        .map_err(|error| error.to_string())?
}
#[tauri::command]
pub async fn yuancon_connect(
    app: tauri::AppHandle,
    id: String,
    events: Channel<InputEvent>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || app.state::<NativeInput>().connect(&id, events))
        .await
        .map_err(|error| error.to_string())?
}
#[tauri::command]
pub async fn yuancon_disconnect(app: tauri::AppHandle, id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || app.state::<NativeInput>().disconnect(&id))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recorded_state_changes_preserve_all_keys_and_turntable_runs()
    -> Result<(), Box<dyn std::error::Error>> {
        #[derive(serde::Deserialize)]
        struct Capture {
            reports: Vec<(u64, u8, i16)>,
        }
        let capture: Capture = serde_json::from_str(include_str!(
            "../../tests/fixtures/input/yuancon-capture.json"
        ))?;
        let mut reports = Reports::default();
        let mut previous_keys = 0_u8;
        let mut previous_direction = 0_i16;
        let mut presses = 0;
        let mut releases = 0;
        let mut turns = 0;
        for (time, keys, direction) in capture.reports {
            let mut bytes = [0_u8; 16];
            bytes[0] = 6;
            bytes[1] = keys;
            bytes[5..7].copy_from_slice(&direction.to_le_bytes());
            assert!(
                reports
                    .accept(
                        &bytes,
                        std::time::Duration::from_micros(time).as_secs_f64() * 1000.0
                    )
                    .is_some()
            );
            presses += (keys & !previous_keys).count_ones();
            releases += (previous_keys & !keys).count_ones();
            if direction != 0 && direction != previous_direction {
                turns += 1;
            }
            previous_keys = keys;
            previous_direction = direction;
        }
        assert_eq!(
            (reports.sequence, presses, releases, turns),
            (1481, 795, 795, 31)
        );
        Ok(())
    }
    #[test]
    fn duplicate_reports_do_not_hide_short_presses_or_direct_reversals()
    -> Result<(), Box<dyn std::error::Error>> {
        let mut reports = Reports::default();
        let mut bytes = [0_u8; 16];
        bytes[0] = 6;
        assert!(reports.accept(&bytes, 0.0).is_some());
        assert!(reports.accept(&bytes, 2.0).is_none());
        bytes[1] = 1;
        let press = serde_json::to_value(reports.accept(&bytes, 4.0))?;
        assert_eq!(press["reportId"], 6);
        assert_eq!(press["data"].as_array().map(Vec::len), Some(15));
        assert_eq!(press["data"][0], 1);
        assert_eq!(press["timeMs"], 4.0);
        bytes[1] = 0;
        assert!(reports.accept(&bytes, 14.0).is_some());
        for value in [32767_i16, -32767, 32767, 0] {
            bytes[5..7].copy_from_slice(&value.to_le_bytes());
            assert!(reports.accept(&bytes, 20.0).is_some());
            assert!(reports.accept(&bytes, 22.0).is_none());
        }
        assert_eq!(reports.sequence, 7);
        Ok(())
    }
    #[test]
    fn an_unlisted_device_cannot_be_opened() {
        let input = NativeInput::default();
        assert!(
            input
                .connect("arbitrary device path", Channel::new(|_| Ok(())))
                .is_err()
        );
        assert!(input.disconnect("old session").is_ok());
    }
}
