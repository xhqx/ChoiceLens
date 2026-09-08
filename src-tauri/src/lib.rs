use serde::{Deserialize, Serialize};
use std::ffi::OsString;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

struct AppState {
    startup_packet_path: Option<PathBuf>,
    log_path: PathBuf,
}

fn startup_packet_path_from<I>(args: I) -> Option<PathBuf>
where
    I: IntoIterator<Item = OsString>,
{
    args.into_iter().skip(1).find_map(|argument| {
        let path = PathBuf::from(argument);
        let is_json = path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("json"));
        is_json.then_some(path)
    })
}

fn append_log(log_path: &Path, event: &str, detail: serde_json::Value) {
    let timestamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    let entry = serde_json::json!({
        "timestampMs": timestamp_ms,
        "pid": std::process::id(),
        "event": event,
        "detail": detail,
    });
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) {
        let line = format!("{entry}\n");
        let _ = file.write_all(line.as_bytes());
    }
}

/// ChoiceLens packet schema v1. Codex writes a plain JSON object with these
/// fields; the validator below is the single source of truth for required data.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DecisionPacket {
    pub schema_version: u8,
    pub title: String,
    #[serde(default)]
    pub subtitle: Option<String>,
    #[serde(default)]
    pub context: Option<String>,
    pub chapters: Vec<DecisionChapter>,
    pub active_decision: ActiveDecision,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DecisionChapter {
    pub id: String,
    pub title: String,
    pub summary: String,
    #[serde(default)]
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ActiveDecision {
    pub id: String,
    pub title: String,
    pub prompt: String,
    #[serde(default)]
    pub context: Option<String>,
    pub options: Vec<DecisionOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DecisionOption {
    pub id: String,
    pub title: String,
    pub summary: String,
    pub tradeoffs: Vec<Tradeoff>,
    #[serde(default)]
    pub details: Option<String>,
    #[serde(default)]
    pub recommended: bool,
    #[serde(default)]
    pub recommendation_reason: Option<String>,
    #[serde(default)]
    pub comparison: Option<Comparison>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Tradeoff {
    pub label: String,
    #[serde(default)]
    pub kind: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Comparison {
    pub exact: bool,
    pub before: String,
    pub after: String,
    #[serde(default)]
    pub before_label: Option<String>,
    #[serde(default)]
    pub after_label: Option<String>,
    #[serde(default)]
    pub before_code: Option<String>,
    #[serde(default)]
    pub after_code: Option<String>,
}

/// The response written beside a packet after an explicit selection.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Answer {
    pub schema_version: u8,
    pub packet_title: String,
    pub decision_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected_option_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_answer: Option<String>,
    pub submitted_at: String,
}

fn required(value: &str, field: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        Err(format!("{field} must not be empty"))
    } else {
        Ok(())
    }
}

fn validate_packet(packet: &DecisionPacket) -> Result<(), String> {
    if packet.schema_version != 1 {
        return Err("unsupported packet schemaVersion; expected 1".into());
    }
    required(&packet.title, "title")?;
    if packet.chapters.is_empty() {
        return Err("chapters must contain at least one chapter".into());
    }

    let mut chapter_ids = std::collections::HashSet::new();
    for chapter in &packet.chapters {
        required(&chapter.id, "chapter id")?;
        required(&chapter.title, "chapter title")?;
        required(&chapter.summary, "chapter summary")?;
        if !chapter_ids.insert(&chapter.id) {
            return Err(format!("duplicate chapter id: {}", chapter.id));
        }
    }

    let decision = &packet.active_decision;
    required(&decision.id, "activeDecision.id")?;
    required(&decision.title, "activeDecision.title")?;
    required(&decision.prompt, "activeDecision.prompt")?;
    if !(2..=3).contains(&decision.options.len()) {
        return Err("activeDecision.options must contain 2 or 3 options".into());
    }

    let mut option_ids = std::collections::HashSet::new();
    let mut recommended_count = 0;
    for option in &decision.options {
        required(&option.id, "option id")?;
        required(&option.title, "option title")?;
        required(&option.summary, "option summary")?;
        if option.id == "custom" {
            return Err("option id 'custom' is reserved for the custom-answer card".into());
        }
        if !option_ids.insert(&option.id) {
            return Err(format!("duplicate option id: {}", option.id));
        }
        if option.tradeoffs.is_empty() {
            return Err(format!(
                "option '{}' must include at least one tradeoff",
                option.id
            ));
        }
        for tradeoff in &option.tradeoffs {
            required(&tradeoff.label, "tradeoff label")?;
            if let Some(kind) = &tradeoff.kind {
                if !["gain", "cost", "risk", "neutral"].contains(&kind.as_str()) {
                    return Err(format!("unsupported tradeoff kind: {kind}"));
                }
            }
        }
        if option.recommended {
            recommended_count += 1;
            required(
                option.recommendation_reason.as_deref().unwrap_or_default(),
                "recommendationReason",
            )?;
        }
        if let Some(comparison) = &option.comparison {
            required(&comparison.before, "comparison.before")?;
            required(&comparison.after, "comparison.after")?;
        }
    }
    if recommended_count != 1 {
        return Err("activeDecision.options must mark exactly one option as recommended".into());
    }

    Ok(())
}

fn read_packet(path: &Path) -> Result<DecisionPacket, String> {
    let metadata = fs::metadata(path).map_err(|error| format!("cannot read packet: {error}"))?;
    if !metadata.is_file() {
        return Err("packet path must point to a JSON file".into());
    }
    if metadata.len() > 1_048_576 {
        return Err("packet JSON must be 1 MiB or smaller".into());
    }
    let contents =
        fs::read_to_string(path).map_err(|error| format!("cannot read packet: {error}"))?;
    let packet: DecisionPacket =
        serde_json::from_str(&contents).map_err(|error| format!("invalid packet JSON: {error}"))?;
    validate_packet(&packet)?;
    Ok(packet)
}

fn validate_answer(packet: &DecisionPacket, answer: &Answer) -> Result<(), String> {
    if answer.schema_version != 1 {
        return Err("unsupported answer schemaVersion; expected 1".into());
    }
    if answer.decision_id != packet.active_decision.id {
        return Err("answer decisionId does not match the packet".into());
    }
    if answer.packet_title != packet.title {
        return Err("answer packetTitle does not match the packet".into());
    }
    match (&answer.selected_option_id, &answer.custom_answer) {
        (Some(id), None)
            if packet
                .active_decision
                .options
                .iter()
                .any(|option| option.id == *id) =>
        {
            Ok(())
        }
        (None, Some(text)) if !text.trim().is_empty() => Ok(()),
        (Some(_), Some(_)) => {
            Err("answer must contain either an option or a custom answer, not both".into())
        }
        (Some(_), None) => Err("answer selectedOptionId is not a packet option".into()),
        (None, Some(_)) => Err("custom answer must not be empty".into()),
        (None, None) => Err("answer must contain a selection".into()),
    }
}

fn answer_path(packet_path: &Path) -> Result<PathBuf, String> {
    let parent = packet_path
        .parent()
        .ok_or_else(|| "packet has no parent directory".to_string())?;
    let stem = packet_path
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "packet filename is invalid".to_string())?;
    Ok(parent.join(format!("{stem}.answer.json")))
}

/// Load and validate only the user-selected packet path. No directory listing
/// or arbitrary filesystem capability is exposed to the frontend.
#[tauri::command]
fn get_startup_packet_path(state: tauri::State<'_, AppState>) -> Option<String> {
    state
        .startup_packet_path
        .as_ref()
        .map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
fn load_packet(path: String, state: tauri::State<'_, AppState>) -> Result<DecisionPacket, String> {
    let result = read_packet(Path::new(&path));
    append_log(
        &state.log_path,
        if result.is_ok() {
            "packet_loaded"
        } else {
            "packet_load_failed"
        },
        serde_json::json!({ "path": path, "error": result.as_ref().err() }),
    );
    result
}

/// Re-validates the packet before writing its answer beside it. This keeps the
/// write target deterministic and limits the command to one sibling file.
#[tauri::command]
fn save_answer(
    packet_path: String,
    answer: Answer,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let packet_path = Path::new(&packet_path);
    let result = save_answer_file(packet_path, &answer);
    append_log(
        &state.log_path,
        if result.is_ok() {
            "answer_saved"
        } else {
            "answer_save_failed"
        },
        serde_json::json!({
            "packetPath": packet_path,
            "decisionId": answer.decision_id,
            "answerPath": result.as_ref().ok(),
            "error": result.as_ref().err(),
        }),
    );
    result
}

fn save_answer_file(packet_path: &Path, answer: &Answer) -> Result<String, String> {
    let packet = read_packet(packet_path)?;
    validate_answer(&packet, answer)?;
    let output_path = answer_path(packet_path)?;
    if output_path.exists() {
        let existing_contents = fs::read_to_string(&output_path)
            .map_err(|error| format!("cannot read existing answer: {error}"))?;
        let existing: Answer = serde_json::from_str(&existing_contents)
            .map_err(|error| format!("existing answer JSON is invalid: {error}"))?;
        let same_selection = existing.decision_id == answer.decision_id
            && existing.selected_option_id == answer.selected_option_id
            && existing.custom_answer == answer.custom_answer;
        return if same_selection {
            Ok(output_path.to_string_lossy().into_owned())
        } else {
            Err("this decision was already submitted; create a new packet to ask it again".into())
        };
    }
    let contents = serde_json::to_string_pretty(answer)
        .map_err(|error| format!("cannot encode answer: {error}"))?;
    fs::write(&output_path, format!("{contents}\n"))
        .map_err(|error| format!("cannot save answer: {error}"))?;
    Ok(output_path.to_string_lossy().into_owned())
}

pub fn run() {
    let startup_packet_path = startup_packet_path_from(std::env::args_os());
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            let log_directory = app.path().app_log_dir()?;
            fs::create_dir_all(&log_directory)?;
            let log_path = log_directory.join("ChoiceLens.log");
            append_log(
                &log_path,
                "app_started",
                serde_json::json!({
                    "version": env!("CARGO_PKG_VERSION"),
                    "startupPacketPath": startup_packet_path,
                }),
            );
            app.manage(AppState {
                startup_packet_path: startup_packet_path.clone(),
                log_path,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_startup_packet_path,
            load_packet,
            save_answer
        ])
        .build(tauri::generate_context!())
        .expect("error while building ChoiceLens");

    app.run(|app_handle, event| {
        let state = app_handle.state::<AppState>();
        match event {
            tauri::RunEvent::WindowEvent {
                label,
                event: tauri::WindowEvent::CloseRequested { .. },
                ..
            } => append_log(
                &state.log_path,
                "window_close_requested",
                serde_json::json!({ "window": label }),
            ),
            tauri::RunEvent::ExitRequested { code, .. } => append_log(
                &state.log_path,
                "app_exit_requested",
                serde_json::json!({ "code": code }),
            ),
            tauri::RunEvent::Exit => {
                append_log(&state.log_path, "app_exited", serde_json::json!({}))
            }
            _ => {}
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn packet() -> DecisionPacket {
        DecisionPacket {
            schema_version: 1,
            title: "Test packet".into(),
            subtitle: None,
            context: None,
            chapters: vec![DecisionChapter {
                id: "one".into(),
                title: "One".into(),
                summary: "Summary".into(),
                status: None,
            }],
            active_decision: ActiveDecision {
                id: "decision".into(),
                title: "Pick".into(),
                prompt: "Pick one".into(),
                context: None,
                options: vec![
                    DecisionOption {
                        id: "a".into(),
                        title: "A".into(),
                        summary: "A summary".into(),
                        tradeoffs: vec![Tradeoff {
                            label: "Fast".into(),
                            kind: Some("gain".into()),
                        }],
                        details: None,
                        recommended: true,
                        recommendation_reason: Some("Smallest safe change.".into()),
                        comparison: None,
                    },
                    DecisionOption {
                        id: "b".into(),
                        title: "B".into(),
                        summary: "B summary".into(),
                        tradeoffs: vec![Tradeoff {
                            label: "Flexible".into(),
                            kind: Some("gain".into()),
                        }],
                        details: None,
                        recommended: false,
                        recommendation_reason: None,
                        comparison: None,
                    },
                ],
            },
        }
    }

    fn temp_packet_path() -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!("choicelens-test-{nonce}.json"))
    }

    #[test]
    fn finds_json_packet_in_launch_arguments() {
        let packet = startup_packet_path_from([
            OsString::from("choicelens"),
            OsString::from("-psn_0_12345"),
            OsString::from("/tmp/current-decision.json"),
        ]);
        assert_eq!(packet, Some(PathBuf::from("/tmp/current-decision.json")));
    }

    #[test]
    fn validates_a_well_formed_packet() {
        assert!(validate_packet(&packet()).is_ok());
    }

    #[test]
    fn rejects_packets_without_exactly_one_recommendation() {
        let mut invalid = packet();
        invalid.active_decision.options[0].recommended = false;
        assert!(validate_packet(&invalid)
            .unwrap_err()
            .contains("exactly one"));
    }

    #[test]
    fn writes_a_response_beside_the_packet() {
        let path = temp_packet_path();
        fs::write(
            &path,
            serde_json::to_string(&packet()).expect("packet JSON"),
        )
        .expect("write packet");
        let answer = Answer {
            schema_version: 1,
            packet_title: "Test packet".into(),
            decision_id: "decision".into(),
            selected_option_id: Some("a".into()),
            custom_answer: None,
            submitted_at: "2026-01-01T00:00:00Z".into(),
        };
        let saved = save_answer_file(&path, &answer).expect("save answer");
        let saved_path = PathBuf::from(saved);
        let saved_contents = fs::read_to_string(&saved_path).expect("read answer");
        assert!(saved_contents.contains("selectedOptionId"));
        let second_saved = save_answer_file(&path, &answer).expect("save idempotently");
        let second_saved_path = PathBuf::from(second_saved);
        assert_eq!(saved_path, second_saved_path);
        let changed_answer = Answer {
            selected_option_id: Some("b".into()),
            submitted_at: "2026-01-01T00:01:00Z".into(),
            ..answer
        };
        assert!(save_answer_file(&path, &changed_answer)
            .unwrap_err()
            .contains("already submitted"));
        let _ = fs::remove_file(path);
        let _ = fs::remove_file(saved_path);
    }
}
