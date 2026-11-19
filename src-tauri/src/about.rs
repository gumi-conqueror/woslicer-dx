//! Only the About dialog's project and credit links can open an external browser.

const CREDIT_LINKS: &str = include_str!("../../src/platform/about-links.json");

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum AboutLink {
    Project,
    Woslicer,
    Bmhelper,
    #[serde(rename = "waveformPlaylist")]
    WaveformPlaylist,
    #[serde(rename = "codecParser")]
    CodecParser,
}

fn link_url(link: AboutLink) -> Result<String, String> {
    let (json, key) = match link {
        AboutLink::Project => (
            include_str!(concat!(env!("OUT_DIR"), "/build-info.json")),
            "repositoryUrl",
        ),
        AboutLink::Woslicer => (CREDIT_LINKS, "woslicer"),
        AboutLink::Bmhelper => (CREDIT_LINKS, "bmhelper"),
        AboutLink::WaveformPlaylist => (CREDIT_LINKS, "waveformPlaylist"),
        AboutLink::CodecParser => (CREDIT_LINKS, "codecParser"),
    };
    let data: serde_json::Value = serde_json::from_str(json).map_err(|error| error.to_string())?;
    data[key]
        .as_str()
        .map(str::to_owned)
        .ok_or_else(|| "This build does not include this link".into())
}

#[tauri::command]
pub(crate) fn open_about_link(link: AboutLink) -> Result<(), String> {
    tauri_plugin_opener::open_url(link_url(link)?, None::<&str>).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renderer_cannot_supply_urls_paths_or_programs() {
        for input in [
            r#""https://example.org""#,
            r#""file:///C:/private.txt""#,
            r#""cmd.exe""#,
            r#"{"url":"https://example.org"}"#,
        ] {
            assert!(serde_json::from_str::<AboutLink>(input).is_err(), "{input}");
        }
    }

    #[test]
    fn credit_links_resolve_to_the_bundled_https_sites() -> Result<(), Box<dyn std::error::Error>> {
        let links: std::collections::BTreeMap<String, String> = serde_json::from_str(CREDIT_LINKS)?;
        for (id, expected) in links {
            let admitted: AboutLink =
                serde_json::from_value(serde_json::Value::String(id.clone()))?;
            let actual = link_url(admitted)?;
            assert_eq!(actual, expected, "credit link {id}");
            let url: tauri::Url = actual.parse()?;
            assert_eq!(url.scheme(), "https");
            assert!(url.username().is_empty());
            assert!(url.password().is_none());
        }
        Ok(())
    }
}
